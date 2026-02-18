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
      const rn = String(args.roomNo ?? '').trim();
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
    `[generate-room-json] Wrote ${totalRooms} rooms across ${fileCount} floor files; manifest -> public/room_data_manifest.json`,
  );
}

main().catch((e: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[generate-room-json] Failed:', e);
  process.exit(1);
});
