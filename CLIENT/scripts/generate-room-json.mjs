import fs from 'node:fs/promises';
import path from 'node:path';

function parseWorldCoordsXY(value) {
  // Example: [(-5.591, -21.033), (-1.902, -21.033), ...]
  const matches = value.match(/-?\d+(?:\.\d+)?/g);
  if (!matches || matches.length < 6) return [];

  const numbers = matches.map((n) => Number(n)).filter((n) => Number.isFinite(n));
  const points = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    points.push({ x: numbers[i], y: numbers[i + 1] });
  }
  return points;
}

function parseVertexIndices(value) {
  const matches = value.match(/\d+/g);
  if (!matches || matches.length === 0) return undefined;
  const indices = matches
    .map((n) => Number.parseInt(n, 10))
    .filter((n) => Number.isFinite(n));
  return indices.length > 0 ? indices : undefined;
}

function parseAreaM2(value) {
  const cleaned = String(value ?? '').trim().replace(',', '.');
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function parseBoolLoose(value) {
  const t = String(value ?? '').trim().toLowerCase();
  if (!t) return undefined;
  if (t === '1' || t === 'true' || t === 'yes' || t === 'y' || t === 'да') return true;
  if (t === '0' || t === 'false' || t === 'no' || t === 'n' || t === 'нет') return false;
  return undefined;
}

function splitSemicolon(line) {
  // CSV here doesn't seem to use quotes; keep it minimal and robust.
  return line.split(';').map((s) => s.trim());
}

function normalizeLettersToLatin(value) {
  const map = {
    А: 'A',
    В: 'B',
    Е: 'E',
    К: 'K',
    М: 'M',
    Н: 'H',
    О: 'O',
    Р: 'P',
    С: 'C',
    Т: 'T',
    У: 'Y',
    Х: 'X',
  };
  return value
    .toUpperCase()
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('');
}

function normalizeRoomNo(value) {
  return normalizeLettersToLatin(String(value ?? '').replace(/\s+/g, '').replace(/^№/u, ''));
}

function digitsOnly(value) {
  return String(value ?? '').replace(/\D+/g, '');
}

function parseCabinet(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const match = text.match(/(\d+)\s*-\s*([0-9A-Za-zА-Яа-я]+)/u);
  if (!match) return null;
  const buildNumber = Number.parseInt(match[1], 10);
  if (!Number.isFinite(buildNumber)) return null;
  const roomNo = String(match[2] ?? '').trim();
  if (!roomNo) return null;

  const firstDigit = roomNo.match(/^\d/u)?.[0] ?? null;
  const floorId = firstDigit ? `floor${firstDigit}` : null;

  return {
    buildId: `build${buildNumber}`,
    roomNo,
    floorId,
    normalizedRoomNo: normalizeRoomNo(roomNo),
    roomDigits: digitsOnly(roomNo),
  };
}

function makeOfficeNode(id, type, name, cabinet, link) {
  const parsedCabinet = parseCabinet(cabinet);
  return {
    id,
    type,
    name: String(name ?? '').trim(),
    cabinet: String(cabinet ?? '').trim(),
    link: String(link ?? '').trim(),
    parsedCabinet,
    location: null,
    children: [],
  };
}

function parseOfficesHierarchy(csvText) {
  const lines = String(csvText ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length <= 1) {
    return { institutes: [], indexedByBuild: new Map(), allNodes: [] };
  }

  const rows = lines.slice(1);
  const institutes = [];
  const allNodes = [];
  const indexedByBuild = new Map();

  let currentInstitute = null;
  let currentFaculty = null;
  let nodeSeq = 1;

  const registerNode = (node) => {
    allNodes.push(node);
    const cabinet = node.parsedCabinet;
    if (!cabinet) return;

    const existing = indexedByBuild.get(cabinet.buildId) ?? { exact: new Map(), byDigits: new Map() };

    const exactList = existing.exact.get(cabinet.normalizedRoomNo) ?? [];
    exactList.push(node);
    existing.exact.set(cabinet.normalizedRoomNo, exactList);

    if (cabinet.roomDigits.length > 0) {
      const digitsList = existing.byDigits.get(cabinet.roomDigits) ?? [];
      digitsList.push(node);
      existing.byDigits.set(cabinet.roomDigits, digitsList);
    }

    indexedByBuild.set(cabinet.buildId, existing);
  };

  for (const raw of rows) {
    const cols = splitSemicolon(raw);
    const instituteName = cols[0] ?? '';
    const facultyName = cols[1] ?? '';
    const departmentName = cols[2] ?? '';
    const cabinet = cols[3] ?? '';
    const link = cols[4] ?? '';

    if (instituteName.length > 0) {
      currentInstitute = makeOfficeNode(`office-${nodeSeq++}`, 'institute', instituteName, cabinet, link);
      currentFaculty = null;
      institutes.push(currentInstitute);
      registerNode(currentInstitute);
      continue;
    }

    if (facultyName.length > 0) {
      const faculty = makeOfficeNode(`office-${nodeSeq++}`, 'faculty', facultyName, cabinet, link);
      if (currentInstitute) {
        currentInstitute.children.push(faculty);
      } else {
        institutes.push(faculty);
      }
      currentFaculty = faculty;
      registerNode(faculty);
      continue;
    }

    if (departmentName.length > 0) {
      const department = makeOfficeNode(`office-${nodeSeq++}`, 'department', departmentName, cabinet, link);
      if (currentFaculty) {
        currentFaculty.children.push(department);
      } else if (currentInstitute) {
        currentInstitute.children.push(department);
      } else {
        institutes.push(department);
      }
      registerNode(department);
    }
  }

  return { institutes, indexedByBuild, allNodes };
}

const WALL_ROOM_ID = 100;
const LABEL_ROOM_ID = 200;
const HIDDEN_ROOM_IDS = new Set([300, 301]);
const CORRIDOR_ROOM_ID = 1;

function round3(value) {
  return Number(value.toFixed(3));
}

function segmentOverlapInfo(a, b, c, d, eps = 1e-5) {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const vx = d.x - c.x;
  const vy = d.y - c.y;

  const crossUV = ux * vy - uy * vx;
  if (Math.abs(crossUV) > eps) return { length: 0, midpoint: null };

  const crossACU = (c.x - a.x) * uy - (c.y - a.y) * ux;
  if (Math.abs(crossACU) > eps) return { length: 0, midpoint: null };

  const lenSq = ux * ux + uy * uy;
  if (lenSq <= eps) return { length: 0, midpoint: null };

  const tC = ((c.x - a.x) * ux + (c.y - a.y) * uy) / lenSq;
  const tD = ((d.x - a.x) * ux + (d.y - a.y) * uy) / lenSq;

  const left = Math.max(0, Math.min(tC, tD));
  const right = Math.min(1, Math.max(tC, tD));
  const tOverlap = right - left;
  if (tOverlap <= 0) return { length: 0, midpoint: null };

  const tMid = left + tOverlap / 2;
  return {
    length: Math.sqrt(lenSq) * tOverlap,
    midpoint: { x: a.x + ux * tMid, y: a.y + uy * tMid },
  };
}

function polygonSegments(points) {
  const out = [];
  if (!Array.isArray(points) || points.length < 2) return out;
  for (let i = 0; i < points.length; i++) {
    out.push([points[i], points[(i + 1) % points.length]]);
  }
  return out;
}

function polygonCentroid(points) {
  if (!Array.isArray(points) || points.length < 3) return { x: 0, y: 0 };

  let area2 = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const cross = p1.x * p2.y - p2.x * p1.y;
    area2 += cross;
    cx += (p1.x + p2.x) * cross;
    cy += (p1.y + p2.y) * cross;
  }

  if (Math.abs(area2) < 1e-8) {
    const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / points.length, y: sum.y / points.length };
  }

  const factor = 1 / (3 * area2);
  return {
    x: cx * factor,
    y: cy * factor,
  };
}

function sharedVertexCount(aIndices, bIndices) {
  if (!Array.isArray(aIndices) || !Array.isArray(bIndices)) return 0;
  if (aIndices.length === 0 || bIndices.length === 0) return 0;

  const aSet = new Set(aIndices);
  let count = 0;
  for (const value of bIndices) {
    if (aSet.has(value)) {
      count += 1;
      if (count >= 2) return count;
    }
  }
  return count;
}

function computeSharedBoundaryPortal(a, b) {
  const sharedVertices = sharedVertexCount(a.vertexIndices, b.vertexIndices);

  const aSegments = polygonSegments(a.points);
  const bSegments = polygonSegments(b.points);

  let maxSharedBoundary = 0;
  let bestMidpoint = null;

  for (const [a1, a2] of aSegments) {
    for (const [b1, b2] of bSegments) {
      const overlap = segmentOverlapInfo(a1, a2, b1, b2);
      if (overlap.length > maxSharedBoundary) {
        maxSharedBoundary = overlap.length;
        bestMidpoint = overlap.midpoint;
      }
    }
  }

  if (maxSharedBoundary >= 0.05 && bestMidpoint) {
    return {
      adjacent: true,
      via: {
        x: round3(bestMidpoint.x),
        y: round3(bestMidpoint.y),
      },
      sharedBoundary: maxSharedBoundary,
    };
  }

  if (sharedVertices >= 2) {
    return {
      adjacent: true,
      via: null,
      sharedBoundary: 0,
    };
  }

  return { adjacent: false, via: null, sharedBoundary: 0 };
}

function vectorLength(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

function normalizeVector(v) {
  const len = vectorLength(v);
  if (len < 1e-8) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

function addStreetNodeForCorridor(room, boundaryMid, outwardVector) {
  const outward = normalizeVector(outwardVector);
  const shift = 0.9;
  return {
    key: `street:${room.key}`,
    roomID: null,
    roomNo: null,
    kind: 'street',
    label: 'на улицу',
    x: round3(boundaryMid.x + outward.x * shift),
    y: round3(boundaryMid.y + outward.y * shift),
  };
}

function findCorridorExteriorSegment(room, others) {
  const segments = polygonSegments(room.points);
  const ownCenter = polygonCentroid(room.points);

  let best = null;

  for (const [a1, a2] of segments) {
    const segLength = vectorLength({ x: a2.x - a1.x, y: a2.y - a1.y });
    if (segLength < 0.7) continue;

    let maxOverlap = 0;
    for (const other of others) {
      if (other.key === room.key) continue;
      const otherSegments = polygonSegments(other.points);
      for (const [b1, b2] of otherSegments) {
        const overlap = segmentOverlapInfo(a1, a2, b1, b2).length;
        if (overlap > maxOverlap) maxOverlap = overlap;
      }
    }

    const uncoveredLength = segLength - maxOverlap;
    if (uncoveredLength < 0.7) continue;

    const mid = { x: (a1.x + a2.x) / 2, y: (a1.y + a2.y) / 2 };
    const outward = { x: mid.x - ownCenter.x, y: mid.y - ownCenter.y };

    if (!best || uncoveredLength > best.uncoveredLength) {
      best = {
        boundaryMid: mid,
        outward,
        uncoveredLength,
      };
    }
  }

  return best;
}

function buildRoomGraph(rooms) {
  const candidates = rooms.filter((room) => {
    if (!room || !Array.isArray(room.points) || room.points.length < 3) return false;
    if (room.roomID === WALL_ROOM_ID || room.roomID === LABEL_ROOM_ID) return false;
    if (HIDDEN_ROOM_IDS.has(room.roomID)) return false;
    return true;
  });

  const nodes = candidates.map((room) => {
    const center = polygonCentroid(room.points);
    return {
      key: room.key,
      roomID: room.roomID,
      roomNo: room.roomNo ?? null,
      kind: 'room',
      x: round3(center.x),
      y: round3(center.y),
    };
  });

  const nodeCenterByKey = new Map(nodes.map((n) => [n.key, { x: n.x, y: n.y }]));

  const edges = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const left = candidates[i];
      const right = candidates[j];
      const adjacencyInfo = computeSharedBoundaryPortal(left, right);
      if (!adjacencyInfo.adjacent) continue;

      edges.push({
        from: left.key,
        to: right.key,
        via: adjacencyInfo.via,
      });
    }
  }

  const corridors = candidates.filter((room) => room.roomID === CORRIDOR_ROOM_ID);
  for (const corridor of corridors) {
    const exterior = findCorridorExteriorSegment(corridor, candidates);
    if (!exterior) continue;

    const streetNode = addStreetNodeForCorridor(corridor, exterior.boundaryMid, exterior.outward);

    if (!nodeCenterByKey.has(streetNode.key)) {
      nodes.push(streetNode);
      nodeCenterByKey.set(streetNode.key, { x: streetNode.x, y: streetNode.y });
    }

    edges.push({
      from: corridor.key,
      to: streetNode.key,
      via: {
        x: round3(exterior.boundaryMid.x),
        y: round3(exterior.boundaryMid.y),
      },
    });
  }

  const adjacency = Object.fromEntries(nodes.map((n) => [n.key, []]));
  for (const edge of edges) {
    adjacency[edge.from].push(edge.to);
    adjacency[edge.to].push(edge.from);
  }

  for (const node of nodes) {
    adjacency[node.key].sort((a, b) => a.localeCompare(b));
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    nodes,
    edges,
    adjacency,
  };
}

async function main() {
  const rootDir = process.cwd();

  const publicDir = path.join(rootDir, 'public');
  const officesCsvPath = path.join(publicDir, 'offices.csv');
  let officesCsvText = '';
  try {
    officesCsvText = await fs.readFile(officesCsvPath, 'utf8');
  } catch {
    officesCsvText = '';
  }

  const officesTree = parseOfficesHierarchy(officesCsvText);

  async function* walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        yield* walk(full);
      } else {
        yield full;
      }
    }
  }

  function parseCsvToRooms(text) {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) return [];

    const headers = splitSemicolon(lines[0]);
    const indexOf = (name) => headers.findIndex((h) => h === name);

    const blenderIdIndex = indexOf('ID');
    const roomIdIndex = indexOf('roomID');
    const roomNoIndex = indexOf('roomNo');
    const descriptionIndex = indexOf('Description');
    const areClosedIndex = indexOf('areClosed');
    const areaIndex = indexOf('Area (m2)');
    const vertexIndex = indexOf('Vertex_Indices');
    const worldCoordsIndex = indexOf('World_Coords_XY');

    if (roomIdIndex < 0 || worldCoordsIndex < 0) {
      throw new Error(
        `CSV headers must include roomID and World_Coords_XY. Found: ${headers.join(', ')}`,
      );
    }

    const makeRoomKey = ({ idx, blenderID, roomID, roomNo, vertexIndices }) => {
      if (Number.isFinite(blenderID)) return `bl:${blenderID}`;
      const rn = String(roomNo ?? '').trim();
      const vi =
        Array.isArray(vertexIndices) && vertexIndices.length > 0 ? vertexIndices.join(',') : '';
      if (rn.length > 0) return vi.length > 0 ? `no:${rn}|v:${vi}` : `no:${rn}`;
      if (vi.length > 0) return `id:${roomID}|v:${vi}`;
      return `id:${roomID}|i:${idx}`;
    };

    const rooms = [];
    const dataLines = lines.slice(1);
    for (let idx = 0; idx < dataLines.length; idx++) {
      const cols = splitSemicolon(dataLines[idx]);
      const blenderID =
        blenderIdIndex >= 0 ? Number.parseInt(cols[blenderIdIndex] ?? '', 10) : undefined;
      const roomID = Number.parseInt(cols[roomIdIndex] ?? '', 10);
      if (!Number.isFinite(roomID)) continue;

      const points = parseWorldCoordsXY(cols[worldCoordsIndex] ?? '');
      if (points.length < 3) continue;

      const roomNo = roomNoIndex >= 0 ? cols[roomNoIndex] || undefined : undefined;
      const description = descriptionIndex >= 0 ? cols[descriptionIndex] || undefined : undefined;
      const areClosed = areClosedIndex >= 0 ? parseBoolLoose(cols[areClosedIndex] ?? '') : undefined;
      const areaM2 = areaIndex >= 0 ? parseAreaM2(cols[areaIndex] ?? '') : undefined;
      const vertexIndices = vertexIndex >= 0 ? parseVertexIndices(cols[vertexIndex] ?? '') : undefined;
      const worldCoordsXYRaw = cols[worldCoordsIndex] ?? undefined;

      const key = makeRoomKey({ idx, blenderID, roomID, roomNo, vertexIndices });

      rooms.push({
        key,
        blenderID: Number.isFinite(blenderID) ? blenderID : undefined,
        roomID,
        roomNo,
        description,
        areClosed,
        areaM2,
        vertexIndices,
        worldCoordsXYRaw,
        points,
        build: null,
        floor: null,
      });
    }
    return rooms;
  }

  const manifest = { builds: [] };
  const buildToFloors = new Map();
  let totalRooms = 0;
  let fileCount = 0;
  let annotatedRooms = 0;
  let locatedOfficeNodes = 0;

  for await (const file of walk(publicDir)) {
    if (path.basename(file) !== 'room_data.csv') continue;

    const rel = path.relative(publicDir, file).split(path.sep).join('/');
    // Expected: buildXX/floorY/room_data.csv
    const parts = rel.split('/');
    if (parts.length < 3) continue;
    const buildId = parts[0];
    const floorId = parts[1];
    if (!buildId.startsWith('build') || !floorId.startsWith('floor')) continue;

    const text = await fs.readFile(file, 'utf8');
    const rooms = parseCsvToRooms(text);

    const buildIndex = officesTree.indexedByBuild.get(buildId) ?? null;
    if (buildIndex) {
      for (const room of rooms) {
        const rawRoomNo = String(room.roomNo ?? '').trim();
        if (!rawRoomNo) continue;

        const normalized = normalizeRoomNo(rawRoomNo);
        const digits = digitsOnly(rawRoomNo);
        const candidates = [];

        for (const node of buildIndex.exact.get(normalized) ?? []) {
          candidates.push(node);
        }

        if (digits.length > 0) {
          for (const node of buildIndex.byDigits.get(digits) ?? []) {
            if (!candidates.includes(node)) candidates.push(node);
          }
        }

        const matchedNodes = [];
        for (const node of candidates) {
          if (node.location) continue;

          const nodeCabinet = node.parsedCabinet;
          if (!nodeCabinet) continue;

          if (nodeCabinet.floorId && nodeCabinet.floorId !== floorId) {
            continue;
          }

          node.location = {
            buildId,
            floorId,
            roomKey: room.key,
            roomNo: rawRoomNo,
          };
          matchedNodes.push(node);
          locatedOfficeNodes += 1;
        }

        if (matchedNodes.length === 0) continue;

        const names = matchedNodes.map((node) => node.name).filter((name) => name.length > 0);
        if (names.length > 0) {
          room.description = names.join(' | ');
        }

        const hasDepartment = matchedNodes.some((node) => node.type === 'department');
        room.category = hasDepartment ? 'преподавательская' : 'администрация';
        annotatedRooms += 1;
      }
    }

    const jsonPath = path.join(path.dirname(file), 'room_data.json');
    await fs.writeFile(jsonPath, JSON.stringify(rooms, null, 2) + '\n', 'utf8');
    const graph = buildRoomGraph(rooms);
    const graphPath = path.join(path.dirname(file), 'room_graph.json');
    await fs.writeFile(graphPath, JSON.stringify(graph, null, 2) + '\n', 'utf8');

    totalRooms += rooms.length;
    fileCount += 1;

    const existing = buildToFloors.get(buildId) ?? new Set();
    existing.add(floorId);
    buildToFloors.set(buildId, existing);
  }

  const builds = Array.from(buildToFloors.keys()).sort((a, b) => a.localeCompare(b));
  for (const b of builds) {
    const floors = Array.from(buildToFloors.get(b) ?? []).sort((a, c) => a.localeCompare(c));
    manifest.builds.push({ id: b, floors });
  }

  const manifestPath = path.join(publicDir, 'room_data_manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  const officesOut = {
    generatedAt: new Date().toISOString(),
    stats: {
      totalRows: officesTree.allNodes.length,
      mappedRows: officesTree.allNodes.filter((node) => Boolean(node.location)).length,
      unmappedRows: officesTree.allNodes.filter((node) => !node.location).length,
    },
    institutes: officesTree.institutes,
  };

  const officesJsonPath = path.join(publicDir, 'offices_hierarchy.json');
  await fs.writeFile(officesJsonPath, JSON.stringify(officesOut, null, 2) + '\n', 'utf8');

  console.log(
    `[generate-room-json] Wrote ${totalRooms} rooms and room_graph.json across ${fileCount} floor files; annotated rooms: ${annotatedRooms}; mapped offices: ${locatedOfficeNodes}; manifest -> public/room_data_manifest.json; offices -> public/offices_hierarchy.json`,
  );
}

main().catch((e) => {
  console.error('[generate-room-json] Failed:', e);
  process.exit(1);
});
