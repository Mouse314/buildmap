import ROOM_CATEGORIES from './roomCategories';
import type { Room, RoomId } from './Room';

export type RoomPolygon = {
  roomID: RoomId;
  roomNo?: string;
  category?: string;
  description?: string;
  points: Array<{ x: number; y: number }>;
};

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
  // Example: [12, 48, 38, 14]
  const matches = value.match(/\d+/g);
  if (!matches || matches.length === 0) return undefined;
  const indices = matches.map((n) => Number.parseInt(n, 10)).filter((n) => Number.isFinite(n));
  return indices.length > 0 ? indices : undefined;
}

function parseAreaM2(value: string): number | undefined {
  // CSV uses comma as decimal separator sometimes.
  const cleaned = value.trim().replace(',', '.');
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function splitSemicolon(line: string): string[] {
  // CSV here doesn't seem to use quotes; keep it minimal and robust.
  return line.split(';').map((s) => s.trim());
}

function getCategoryByRoomId(roomID: number): string | undefined {
  const c = ROOM_CATEGORIES[roomID];
  const t = (c ?? '').trim();
  return t.length > 0 ? t : undefined;
}

function makeRoomKey(args: {
  idx: number;
  blenderID?: number;
  roomID: number;
  roomNo?: string;
  vertexIndices?: number[];
}): string {
  if (typeof args.blenderID === 'number' && Number.isFinite(args.blenderID)) {
    return `bl:${args.blenderID}`;
  }
  const roomNo = (args.roomNo ?? '').trim();
  const vi = args.vertexIndices && args.vertexIndices.length > 0 ? args.vertexIndices.join(',') : '';
  if (roomNo.length > 0) return vi.length > 0 ? `no:${roomNo}|v:${vi}` : `no:${roomNo}`;
  if (vi.length > 0) return `id:${args.roomID}|v:${vi}`;
  return `id:${args.roomID}|i:${args.idx}`;
}

export function roomsToPolygons(rooms: Room[]): RoomPolygon[] {
  return rooms.map((room) => ({
    roomID: room.roomID,
    roomNo: room.roomNo,
    category: room.category,
    description: room.description,
    points: room.points,
  }));
}

export async function loadRoomsFromPublicCsv(path = '/room_data.csv'): Promise<Room[]> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
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
  const areaIndex = indexOf('Area (m2)');
  const vertexIndex = indexOf('Vertex_Indices');
  const worldCoordsIndex = indexOf('World_Coords_XY');

  if (roomIdIndex < 0 || worldCoordsIndex < 0) {
    throw new Error(
      `CSV headers must include roomID and World_Coords_XY. Found: ${headers.join(', ')}`,
    );
  }

  const rooms: Room[] = [];
  const dataLines = lines.slice(1);

  for (let idx = 0; idx < dataLines.length; idx++) {
    const cols = splitSemicolon(dataLines[idx]);
    const blenderID =
      blenderIdIndex >= 0 ? Number.parseInt(cols[blenderIdIndex] ?? '', 10) : undefined;
    const roomID = Number.parseInt(cols[roomIdIndex] ?? '', 10);
    if (!Number.isFinite(roomID)) continue;

    const points = parseWorldCoordsXY(cols[worldCoordsIndex] ?? '');
    if (points.length < 3) continue;

    const roomNo = roomNoIndex >= 0 ? (cols[roomNoIndex] || undefined) : undefined;
    const description = descriptionIndex >= 0 ? (cols[descriptionIndex] || undefined) : undefined;
    // Room numbers must be taken strictly from CSV column roomNo.
    const areaM2 = areaIndex >= 0 ? parseAreaM2(cols[areaIndex] ?? '') : undefined;
    const vertexIndices = vertexIndex >= 0 ? parseVertexIndices(cols[vertexIndex] ?? '') : undefined;
    const worldCoordsXYRaw = cols[worldCoordsIndex] ?? undefined;

    const key = makeRoomKey({ idx, blenderID, roomID, roomNo, vertexIndices });
    const categoryFinal = getCategoryByRoomId(roomID);

    rooms.push({
      key,
      blenderID: Number.isFinite(blenderID as number) ? (blenderID as number) : undefined,
      roomID,
      roomNo,
      category: categoryFinal,
      description,
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

export async function loadRoomsFromPublicJson(path = '/room_data.json'): Promise<Room[]> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}: ${response.status} ${response.statusText}`);
  }

  const data: unknown = await response.json();
  if (!Array.isArray(data)) {
    throw new Error(`Invalid JSON format in ${path}: expected an array`);
  }

  const rooms: Room[] = [];

  for (let idx = 0; idx < data.length; idx++) {
    const item = data[idx];
    if (!item || typeof item !== 'object') continue;
    const anyItem = item as Record<string, unknown>;

    const roomID = Number(anyItem.roomID);
    if (!Number.isFinite(roomID)) continue;

    const blenderID =
      typeof anyItem.blenderID === 'number' && Number.isFinite(anyItem.blenderID)
        ? anyItem.blenderID
        : undefined;

    // Reject legacy aggregated schema to avoid incorrect roomNo propagation.
    if (Array.isArray(anyItem.shapes)) {
      throw new Error(
        `Unsupported room_data.json schema (contains 'shapes'). Re-generate JSON from CSV via npm run generate:rooms.`,
      );
    }

    const points = anyItem.points as unknown;
    if (!Array.isArray(points) || points.length < 3) continue;
    const parsedPoints: Array<{ x: number; y: number }> = [];
    for (const p of points) {
      if (!p || typeof p !== 'object') continue;
      const anyP = p as Record<string, unknown>;
      const x = Number(anyP.x);
      const y = Number(anyP.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      parsedPoints.push({ x, y });
    }
    if (parsedPoints.length < 3) continue;

    const roomNo = typeof anyItem.roomNo === 'string' ? anyItem.roomNo : undefined;
    const description = typeof anyItem.description === 'string' ? anyItem.description : undefined;
    const category = getCategoryByRoomId(roomID);

    const areaM2 = typeof anyItem.areaM2 === 'number' && Number.isFinite(anyItem.areaM2) ? anyItem.areaM2 : undefined;
    const vertexIndices = Array.isArray(anyItem.vertexIndices)
      ? (anyItem.vertexIndices.map((n) => Number(n)).filter((n) => Number.isFinite(n)) as number[])
      : undefined;
    const worldCoordsXYRaw = typeof anyItem.worldCoordsXYRaw === 'string' ? anyItem.worldCoordsXYRaw : undefined;
    const build = typeof anyItem.build === 'string' ? anyItem.build : null;
    const floor = typeof anyItem.floor === 'string' ? anyItem.floor : null;

    const keyFromJson = typeof anyItem.key === 'string' ? anyItem.key : undefined;
    const key = keyFromJson ?? makeRoomKey({ idx, blenderID, roomID, roomNo, vertexIndices });

    rooms.push({
      key,
      blenderID,
      roomID,
      roomNo,
      category,
      description,
      areaM2,
      vertexIndices,
      worldCoordsXYRaw,
      points: parsedPoints,
      build,
      floor,
    });
  }

  return rooms;
}

export async function loadRoomsFromPublic(
  opts: { jsonPath?: string; csvPath?: string } = {},
): Promise<Room[]> {
  const jsonPath = opts.jsonPath ?? '/room_data.json';
  const csvPath = opts.csvPath ?? '/room_data.csv';

  try {
    return await loadRoomsFromPublicJson(jsonPath);
  } catch {
    return await loadRoomsFromPublicCsv(csvPath);
  }
}

export function computeBounds(polygons: RoomPolygon[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const poly of polygons) {
    for (const p of poly.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }

  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  return { minX, minY, maxX, maxY };
}
