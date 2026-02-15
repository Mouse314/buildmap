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

function splitSemicolon(line) {
  // CSV here doesn't seem to use quotes; keep it minimal and robust.
  return line.split(';').map((s) => s.trim());
}

async function main() {
  const rootDir = process.cwd();
  const csvPath = path.join(rootDir, 'public', 'room_data.csv');
  const jsonPath = path.join(rootDir, 'public', 'room_data.json');

  const text = await fs.readFile(csvPath, 'utf8');
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    await fs.writeFile(jsonPath, '[]\n', 'utf8');
    return;
  }

  const headers = splitSemicolon(lines[0]);
  const indexOf = (name) => headers.findIndex((h) => h === name);

  const blenderIdIndex = indexOf('ID');
  const roomIdIndex = indexOf('roomID');
  const roomNoIndex = indexOf('roomNo');
  const descriptionIndex = indexOf('Description');
  const areaIndex = indexOf('Area (m2)');
  const vertexIndex = indexOf('Vertex_Indices');
  const worldCoordsIndex = indexOf('World_Coords_XY');

  if (roomIdIndex < 0 || worldCoordsIndex < 0) {
    throw new Error(
      `CSV headers must include roomID and World_Coords_XY. Found: ${headers.join(', ')}`,
    );
  }

  const rooms = [];

  const makeRoomKey = ({ idx, blenderID, roomID, roomNo, vertexIndices }) => {
    if (Number.isFinite(blenderID)) return `bl:${blenderID}`;
    const rn = String(roomNo ?? '').trim();
    const vi = Array.isArray(vertexIndices) && vertexIndices.length > 0 ? vertexIndices.join(',') : '';
    if (rn.length > 0) return vi.length > 0 ? `no:${rn}|v:${vi}` : `no:${rn}`;
    if (vi.length > 0) return `id:${roomID}|v:${vi}`;
    return `id:${roomID}|i:${idx}`;
  };

  const dataLines = lines.slice(1);
  for (let idx = 0; idx < dataLines.length; idx++) {
    const line = dataLines[idx];
    const cols = splitSemicolon(line);
    const blenderID = blenderIdIndex >= 0 ? Number.parseInt(cols[blenderIdIndex] ?? '', 10) : undefined;
    const roomID = Number.parseInt(cols[roomIdIndex] ?? '', 10);
    if (!Number.isFinite(roomID)) continue;

    const points = parseWorldCoordsXY(cols[worldCoordsIndex] ?? '');
    if (points.length < 3) continue;

    const roomNo = roomNoIndex >= 0 ? cols[roomNoIndex] || undefined : undefined;
    const description = descriptionIndex >= 0 ? cols[descriptionIndex] || undefined : undefined;

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
      areaM2,
      vertexIndices,
      worldCoordsXYRaw,
      points,
      build: null,
      floor: null,
    });
  }

  await fs.writeFile(jsonPath, JSON.stringify(rooms, null, 2) + '\n', 'utf8');
  console.log(`[generate-room-json] Wrote ${rooms.length} rooms -> public/room_data.json`);
}

main().catch((e) => {
  console.error('[generate-room-json] Failed:', e);
  process.exit(1);
});
