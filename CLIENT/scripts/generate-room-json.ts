import fs from 'node:fs/promises';
import path from 'node:path';

function parseWorldCoordsXY(value: string): Array<{ x: number; y: number }> {
  // Example: [(-5.591, -21.033), (-1.902, -21.033), ...]
  const matches = value.match(/-?\d+(?:\.\d+)?/g);
  if (!matches || matches.length < 6) return [];

  const numbers = matches.map((n) => Number(n)).filter((n) => Number.isFinite(n));
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    points.push({ x: numbers[i], y: numbers[i + 1] });
  }
  return points;
}

function parseVertexIndices(value: string): number[] | undefined {
  const matches = value.match(/\d+/g);
  if (!matches || matches.length === 0) return undefined;
  const indices = matches
    .map((n) => Number.parseInt(n, 10))
    .filter((n) => Number.isFinite(n));
  return indices.length > 0 ? indices : undefined;
}

function parseAreaM2(value: string): number | undefined {
  const cleaned = String(value ?? '').trim().replace(',', '.');
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function parseBoolLoose(value: string): boolean | undefined {
  const t = String(value ?? '').trim().toLowerCase();
  if (t.length === 0) return undefined;
  if (t === '1' || t === 'true' || t === 'yes' || t === 'y' || t === 'да') return true;
  if (t === '0' || t === 'false' || t === 'no' || t === 'n' || t === 'нет') return false;
  return undefined;
}

function splitSemicolon(line: string): string[] {
  // CSV here doesn't seem to use quotes; keep it minimal and robust.
  return line.split(';').map((s) => s.trim());
}

const WALL_ROOM_ID = 100;
const LABEL_ROOM_ID = 200;
const HIDDEN_ROOM_IDS = new Set<number>([300, 301]);

function round3(value: number): number {
  return Number(value.toFixed(3));
}

function segmentOverlapLength(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
  eps = 1e-5,
): number {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const vx = d.x - c.x;
  const vy = d.y - c.y;

  const crossUV = ux * vy - uy * vx;
  if (Math.abs(crossUV) > eps) return 0;

  const crossACU = (c.x - a.x) * uy - (c.y - a.y) * ux;
  if (Math.abs(crossACU) > eps) return 0;

  const lenSq = ux * ux + uy * uy;
  if (lenSq <= eps) return 0;

  const tC = ((c.x - a.x) * ux + (c.y - a.y) * uy) / lenSq;
  const tD = ((d.x - a.x) * ux + (d.y - a.y) * uy) / lenSq;

  const left = Math.max(0, Math.min(tC, tD));
  const right = Math.min(1, Math.max(tC, tD));
  const tOverlap = right - left;
  if (tOverlap <= 0) return 0;

  return Math.sqrt(lenSq) * tOverlap;
}

function polygonSegments(points: Array<{ x: number; y: number }>): Array<[{ x: number; y: number }, { x: number; y: number }]> {
  const out: Array<[{ x: number; y: number }, { x: number; y: number }]> = [];
  if (!Array.isArray(points) || points.length < 2) return out;
  for (let i = 0; i < points.length; i++) {
    out.push([points[i], points[(i + 1) % points.length]]);
  }
  return out;
}

function polygonCentroid(points: Array<{ x: number; y: number }>): { x: number; y: number } {
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

function arePolygonsAdjacent(
  a: { points: Array<{ x: number; y: number }>; vertexIndices?: number[] },
  b: { points: Array<{ x: number; y: number }>; vertexIndices?: number[] },
): boolean {
  const sharedVertices = sharedVertexCount(a.vertexIndices, b.vertexIndices);
  if (sharedVertices >= 2) return true;

  const aSegments = polygonSegments(a.points);
  const bSegments = polygonSegments(b.points);

  let maxSharedBoundary = 0;
  for (const [a1, a2] of aSegments) {
    for (const [b1, b2] of bSegments) {
      const overlap = segmentOverlapLength(a1, a2, b1, b2);
      if (overlap > maxSharedBoundary) maxSharedBoundary = overlap;
      if (maxSharedBoundary >= 0.2) return true;
    }
  }

  if (maxSharedBoundary >= 0.05) return true;

  return false;
}

function sharedVertexCount(aIndices?: number[], bIndices?: number[]): number {
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

type RoomGraph = {
  version: number;
  generatedAt: string;
  nodes: Array<{ key: string; roomID: number; roomNo: string | null; x: number; y: number }>;
  edges: Array<{ from: string; to: string }>;
  adjacency: Record<string, string[]>;
};

function buildRoomGraph(rooms: RoomJson[]): RoomGraph {
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
      x: round3(center.x),
      y: round3(center.y),
    };
  });

  const edges: RoomGraph['edges'] = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const left = candidates[i];
      const right = candidates[j];
      if (!arePolygonsAdjacent(left, right)) continue;

      edges.push({
        from: left.key,
        to: right.key,
      });
    }
  }

  const adjacency: Record<string, string[]> = Object.fromEntries(nodes.map((n) => [n.key, []]));
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

type RoomJson = {
  key: string;
  blenderID?: number;
  roomID: number;
  roomNo?: string;
  description?: string;
  areClosed?: boolean;
  areaM2?: number;
  vertexIndices?: number[];
  worldCoordsXYRaw?: string;
  points: Array<{ x: number; y: number }>;
  build: null;
  floor: null;
};

async function main() {
  const rootDir = process.cwd();
  const publicDir = path.join(rootDir, 'public');

  async function* walk(dir: string): AsyncGenerator<string> {
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

  function parseCsvToRooms(text: string): RoomJson[] {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) return [];

    const headers = splitSemicolon(lines[0]);
    const indexOf = (name: string) => headers.findIndex((h) => h === name);

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

    const makeRoomKey = (args: {
      idx: number;
      blenderID?: number;
      roomID: number;
      roomNo?: string;
      vertexIndices?: number[];
    }): string => {
      if (typeof args.blenderID === 'number' && Number.isFinite(args.blenderID)) {
        return `bl:${args.blenderID}`;
      }
      const rn = String(args.roomNo ?? '').trim().toLocaleLowerCase('ru-RU');
      const vi =
        Array.isArray(args.vertexIndices) && args.vertexIndices.length > 0
          ? args.vertexIndices.join(',')
          : '';
      if (rn.length > 0) return vi.length > 0 ? `no:${rn}|v:${vi}` : `no:${rn}`;
      if (vi.length > 0) return `id:${args.roomID}|v:${vi}`;
      return `id:${args.roomID}|i:${args.idx}`;
    };

    const rooms: RoomJson[] = [];
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
        blenderID: typeof blenderID === 'number' && Number.isFinite(blenderID) ? blenderID : undefined,
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

  const buildToFloors = new Map<string, Set<string>>();
  let totalRooms = 0;
  let fileCount = 0;

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
    const outJsonPath = path.join(path.dirname(file), 'room_data.json');
    await fs.writeFile(outJsonPath, JSON.stringify(rooms, null, 2) + '\n', 'utf8');
    const graph = buildRoomGraph(rooms);
    const graphPath = path.join(path.dirname(file), 'room_graph.json');
    await fs.writeFile(graphPath, JSON.stringify(graph, null, 2) + '\n', 'utf8');

    totalRooms += rooms.length;
    fileCount += 1;

    const existing = buildToFloors.get(buildId) ?? new Set<string>();
    existing.add(floorId);
    buildToFloors.set(buildId, existing);
  }

  const manifest = {
    builds: Array.from(buildToFloors.keys())
      .sort((a, b) => a.localeCompare(b))
      .map((b) => ({
        id: b,
        floors: Array.from(buildToFloors.get(b) ?? []).sort((a, c) => a.localeCompare(c)),
      })),
  };

  const manifestPath = path.join(publicDir, 'room_data_manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  // eslint-disable-next-line no-console
  console.log(
    `[generate-room-json] Wrote ${totalRooms} rooms and room_graph.json across ${fileCount} floor files; manifest -> public/room_data_manifest.json`,
  );
}

main().catch((e: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[generate-room-json] Failed:', e);
  process.exit(1);
});
