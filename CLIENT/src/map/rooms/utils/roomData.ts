import ROOM_CATEGORIES from './roomCategories';
import type { Room, RoomId } from './Room';

export type RoomPolygon = {
  roomID: RoomId;
  roomNo?: string;
  category?: string;
  description?: string;
  areaM2?: number;
  points: Array<{ x: number; y: number }>;
};

export function publicAssetUrl(path: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base}${path.replace(/^\/+/, '')}`;
}

function normalizedApiBaseUrl(): string {
  const raw = typeof import.meta.env.VITE_API_BASE_URL === 'string'
    ? import.meta.env.VITE_API_BASE_URL.trim()
    : '';
  return raw.length > 0 ? raw.replace(/\/+$/, '') : '';
}

export function plansApiUrl(path: string): string {
  const normalizedPath = `/${path.replace(/^\/+/, '')}`;
  const base = normalizedApiBaseUrl();
  return base.length > 0 ? `${base}${normalizedPath}` : normalizedPath;
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value.replace(/^\/+/, '').replace(/\/+$/, '').trim());
}

function isServerApiPath(path: string): boolean {
  const value = path.trim().toLowerCase();
  return value.startsWith('/api/') || value.includes('/api/');
}

export type RoomDataManifest = {
  builds: Array<{
    id: string;
    floors: string[];
  }>;
};

export async function loadRoomDataManifest(
  path = publicAssetUrl('room_data_manifest.json'),
): Promise<RoomDataManifest | null> {
  const fallbackPath = publicAssetUrl('room_data_manifest.json');
  const tryPaths = [path, fallbackPath].filter(
    (value, index, array) => !isServerApiPath(value) && array.indexOf(value) === index,
  );

  for (const tryPath of tryPaths) {
    try {
      const response = await fetch(tryPath);
      if (!response.ok) continue;
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object') continue;
      const anyData = data as Record<string, unknown>;
      if (!Array.isArray(anyData.builds)) continue;
      const builds: RoomDataManifest['builds'] = [];
      for (const b of anyData.builds) {
        if (!b || typeof b !== 'object') continue;
        const anyB = b as Record<string, unknown>;
        const id = typeof anyB.id === 'string' ? anyB.id : '';
        const floorsRaw = anyB.floors;
        const floors = Array.isArray(floorsRaw)
          ? floorsRaw.map((f) => String(f)).filter((f) => f.length > 0)
          : [];
        if (id.length === 0) continue;
        builds.push({ id, floors });
      }
      return { builds };
    } catch {
      // Пробуем следующий вариант пути.
    }
  }

  return null;
}

export function roomDataPaths(buildId: string, floorId: string): { jsonPath: string; csvPath: string } {
  const safeBuildId = encodePathSegment(buildId);
  const safeFloorId = encodePathSegment(floorId);
  return {
    jsonPath: publicAssetUrl(`${safeBuildId}/${safeFloorId}/room_data.json`),
    csvPath: publicAssetUrl(`${safeBuildId}/${safeFloorId}/room_data.csv`),
  };
}

export function roomPublicDataPaths(buildId: string, floorId: string): { jsonPath: string; csvPath: string } {
  const safeBuildId = encodePathSegment(buildId);
  const safeFloorId = encodePathSegment(floorId);
  return {
    jsonPath: publicAssetUrl(`${safeBuildId}/${safeFloorId}/room_data.json`),
    csvPath: publicAssetUrl(`${safeBuildId}/${safeFloorId}/room_data.csv`),
  };
}

export type RoomOverridePatch = {
  roomID?: number | null;
  roomNo?: string | null;
  category?: string | null;
  description?: string | null;
  areClosed?: boolean | null;
  areaM2?: number | null;
  build?: string | null;
  floor?: string | null;
};

type RoomOverridesByFloor = Record<string, Record<string, RoomOverridePatch>>;

export function roomOverridesPath(buildId: string): string {
  const safeBuildId = encodePathSegment(buildId);
  return publicAssetUrl(`${safeBuildId}/room_overrides.json`);
}

export function roomPublicOverridesPath(buildId: string): string {
  const safeBuildId = encodePathSegment(buildId);
  return publicAssetUrl(`${safeBuildId}/room_overrides.json`);
}

export type RoomGraphNode = {
  key: string;
  roomID: number | null;
  roomNo: string | null;
  kind?: 'room' | 'street';
  label?: string | null;
  x: number;
  y: number;
};

export type RoomGraphEdge = {
  from: string;
  to: string;
  via?: { x: number; y: number } | null;
};

export type RoomGraph = {
  version: number;
  generatedAt: string;
  nodes: RoomGraphNode[];
  edges: RoomGraphEdge[];
  adjacency: Record<string, string[]>;
};

export function roomGraphPath(buildId: string, floorId: string): string {
  const safeBuildId = encodePathSegment(buildId);
  const safeFloorId = encodePathSegment(floorId);
  return publicAssetUrl(`${safeBuildId}/${safeFloorId}/room_graph.json`);
}

export function roomPublicGraphPath(buildId: string, floorId: string): string {
  const safeBuildId = encodePathSegment(buildId);
  const safeFloorId = encodePathSegment(floorId);
  return publicAssetUrl(`${safeBuildId}/${safeFloorId}/room_graph.json`);
}

export async function loadRoomGraphFromPublic(
  opts: { buildId?: string; floorId?: string; path?: string } = {},
): Promise<RoomGraph | null> {
  const fromBuildFloor =
    typeof opts.buildId === 'string' &&
    opts.buildId.length > 0 &&
    typeof opts.floorId === 'string' &&
    opts.floorId.length > 0
      ? roomGraphPath(opts.buildId, opts.floorId)
      : null;

  const fromBuildFloorPublic =
    typeof opts.buildId === 'string' &&
    opts.buildId.length > 0 &&
    typeof opts.floorId === 'string' &&
    opts.floorId.length > 0
      ? roomPublicGraphPath(opts.buildId, opts.floorId)
      : null;

  const graphPath = opts.path ?? fromBuildFloor ?? publicAssetUrl('room_graph.json');
  const fallbackGraphPath = opts.path ? null : fromBuildFloorPublic ?? publicAssetUrl('room_graph.json');

  const tryLoadGraph = async (path: string): Promise<RoomGraph | null> => {
    if (isServerApiPath(path)) return null;
    try {
      const response = await fetch(path);
      if (!response.ok) return null;
      const raw: unknown = await response.json();
      if (!raw || typeof raw !== 'object') return null;

      const data = raw as Record<string, unknown>;
      const nodesRaw = Array.isArray(data.nodes) ? data.nodes : null;
      const edgesRaw = Array.isArray(data.edges) ? data.edges : null;
      if (!nodesRaw || !edgesRaw) return null;

      const nodes: RoomGraphNode[] = [];
      for (const n of nodesRaw) {
        if (!n || typeof n !== 'object') continue;
        const anyN = n as Record<string, unknown>;
        const key = typeof anyN.key === 'string' ? anyN.key : '';
        const roomIDRaw = anyN.roomID;
        const roomID = roomIDRaw == null ? null : Number(roomIDRaw);
        const x = Number(anyN.x);
        const y = Number(anyN.y);
        const roomNo = typeof anyN.roomNo === 'string' ? anyN.roomNo : null;
        const kind = anyN.kind === 'street' ? 'street' : 'room';
        const label = typeof anyN.label === 'string' ? anyN.label : null;
        if (key.length === 0 || !Number.isFinite(x) || !Number.isFinite(y)) {
          continue;
        }
        if (kind === 'room' && !Number.isFinite(Number(roomID))) {
          continue;
        }
        nodes.push({ key, roomID: kind === 'street' ? null : Number(roomID), roomNo, kind, label, x, y });
      }

      const edges: RoomGraphEdge[] = [];
      for (const e of edgesRaw) {
        if (!e || typeof e !== 'object') continue;
        const anyE = e as Record<string, unknown>;
        const from = typeof anyE.from === 'string' ? anyE.from : '';
        const to = typeof anyE.to === 'string' ? anyE.to : '';
        if (from.length === 0 || to.length === 0) continue;
        const viaRaw = anyE.via;
        let via: { x: number; y: number } | null | undefined = undefined;
        if (viaRaw && typeof viaRaw === 'object') {
          const anyVia = viaRaw as Record<string, unknown>;
          const vx = Number(anyVia.x);
          const vy = Number(anyVia.y);
          if (Number.isFinite(vx) && Number.isFinite(vy)) {
            via = { x: vx, y: vy };
          }
        }
        edges.push({ from, to, via });
      }

      const adjacencyRaw = data.adjacency;
      const adjacency: Record<string, string[]> = {};
      if (adjacencyRaw && typeof adjacencyRaw === 'object') {
        const anyAdj = adjacencyRaw as Record<string, unknown>;
        for (const [k, v] of Object.entries(anyAdj)) {
          if (!Array.isArray(v)) continue;
          adjacency[k] = v.map((x) => String(x));
        }
      }

      return {
        version: Number.isFinite(Number(data.version)) ? Number(data.version) : 1,
        generatedAt: typeof data.generatedAt === 'string' ? data.generatedAt : '',
        nodes,
        edges,
        adjacency,
      };
    } catch {
      return null;
    }
  };

  const primaryGraph = await tryLoadGraph(graphPath);
  if (primaryGraph) return primaryGraph;

  if (fallbackGraphPath && fallbackGraphPath !== graphPath) {
    return await tryLoadGraph(fallbackGraphPath);
  }

  return null;
}

function parseWorldCoordsXY(value: string): Array<{ x: number; y: number }> {
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
  const indices = matches.map((n) => Number.parseInt(n, 10)).filter((n) => Number.isFinite(n));
  return indices.length > 0 ? indices : undefined;
}

function parseAreaM2(value: string): number | undefined {
  const cleaned = value.trim().replace(',', '.');
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function parseBoolLoose(value: string): boolean | undefined {
  const t = value.trim().toLowerCase();
  if (t.length === 0) return undefined;
  if (t === '1' || t === 'true' || t === 'yes' || t === 'y' || t === 'да') return true;
  if (t === '0' || t === 'false' || t === 'no' || t === 'n' || t === 'нет') return false;
  return undefined;
}

function parseUnknownBool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return parseBoolLoose(value);
  if (typeof value === 'number' && Number.isFinite(value)) return value !== 0;
  return undefined;
}

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseRoomOverridePatch(raw: unknown): RoomOverridePatch {
  if (!raw || typeof raw !== 'object') return {};
  const anyRaw = raw as Record<string, unknown>;
  const patch: RoomOverridePatch = {};

  if (Object.prototype.hasOwnProperty.call(anyRaw, 'roomID')) {
    const value = anyRaw.roomID;
    if (value === null || (typeof value === 'number' && Number.isFinite(value))) patch.roomID = value;
  }

  if (Object.prototype.hasOwnProperty.call(anyRaw, 'roomNo')) {
    const value = anyRaw.roomNo;
    if (value === null || typeof value === 'string') patch.roomNo = value;
  }

  if (Object.prototype.hasOwnProperty.call(anyRaw, 'category')) {
    const value = anyRaw.category;
    if (value === null || typeof value === 'string') patch.category = value;
  }

  if (Object.prototype.hasOwnProperty.call(anyRaw, 'description')) {
    const value = anyRaw.description;
    if (value === null || typeof value === 'string') patch.description = value;
  }

  if (Object.prototype.hasOwnProperty.call(anyRaw, 'areClosed')) {
    const value = anyRaw.areClosed;
    if (value === null || typeof value === 'boolean') patch.areClosed = value;
  }

  if (Object.prototype.hasOwnProperty.call(anyRaw, 'areaM2')) {
    const value = anyRaw.areaM2;
    if (value === null || (typeof value === 'number' && Number.isFinite(value))) patch.areaM2 = value;
  }

  if (Object.prototype.hasOwnProperty.call(anyRaw, 'build')) {
    const value = anyRaw.build;
    if (value === null || typeof value === 'string') patch.build = value;
  }

  if (Object.prototype.hasOwnProperty.call(anyRaw, 'floor')) {
    const value = anyRaw.floor;
    if (value === null || typeof value === 'string') patch.floor = value;
  }

  return patch;
}

function parseRoomOverridesByFloor(raw: unknown): RoomOverridesByFloor {
  if (!raw || typeof raw !== 'object') return {};
  const anyRaw = raw as Record<string, unknown>;
  const floorsRaw = anyRaw.floors;
  if (!floorsRaw || typeof floorsRaw !== 'object') return {};

  const result: RoomOverridesByFloor = {};
  const anyFloors = floorsRaw as Record<string, unknown>;

  for (const [floorId, roomMapRaw] of Object.entries(anyFloors)) {
    if (!roomMapRaw || typeof roomMapRaw !== 'object') continue;

    const roomMap = roomMapRaw as Record<string, unknown>;
    const parsedRoomMap: Record<string, RoomOverridePatch> = {};

    for (const [roomKey, patchRaw] of Object.entries(roomMap)) {
      const normalizedRoomKey = roomKey.trim();
      if (normalizedRoomKey.length === 0) continue;
      parsedRoomMap[normalizedRoomKey] = parseRoomOverridePatch(patchRaw);
    }

    if (Object.keys(parsedRoomMap).length > 0) {
      result[floorId] = parsedRoomMap;
    }
  }

  return result;
}

async function loadRoomOverridesFromPublic(buildId: string): Promise<RoomOverridesByFloor> {
  const primaryPath = roomOverridesPath(buildId);
  const fallbackPath = roomPublicOverridesPath(buildId);
  const tryPaths = [primaryPath, fallbackPath].filter(
    (v, i, arr): v is string => typeof v === 'string' && arr.indexOf(v) === i && !isServerApiPath(v),
  );

  for (const tryPath of tryPaths) {
    try {
      const response = await fetch(tryPath);
      if (!response.ok) continue;
      const data: unknown = await response.json();
      return parseRoomOverridesByFloor(data);
    } catch {
      // Пробуем следующий вариант пути.
    }
  }

  return {};
}

function applyRoomOverridePatch(room: Room, patch: RoomOverridePatch): Room {
  const next: Room = { ...room };
  const hasRoomIdOverride = Object.prototype.hasOwnProperty.call(patch, 'roomID');
  const hasCategoryOverride = Object.prototype.hasOwnProperty.call(patch, 'category');

  if (hasRoomIdOverride) {
    if (typeof patch.roomID === 'number' && Number.isFinite(patch.roomID)) {
      next.roomID = Math.trunc(patch.roomID);
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'roomNo')) {
    next.roomNo = normalizeOptionalText(patch.roomNo);
  }

  if (hasCategoryOverride) {
    const category = normalizeOptionalText(patch.category);
    next.category = normalizeRoomCategory(category) ?? category;
  } else if (hasRoomIdOverride) {
    next.category = getCategoryByRoomId(next.roomID);
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'description')) {
    next.description = normalizeOptionalText(patch.description);
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'areClosed')) {
    next.areClosed = typeof patch.areClosed === 'boolean' ? patch.areClosed : undefined;
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'areaM2')) {
    next.areaM2 =
      typeof patch.areaM2 === 'number' && Number.isFinite(patch.areaM2) ? patch.areaM2 : undefined;
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'build')) {
    const build = normalizeOptionalText(patch.build);
    next.build = build ?? null;
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'floor')) {
    const floor = normalizeOptionalText(patch.floor);
    next.floor = floor ?? null;
  }

  return next;
}

function applyRoomOverrides(rooms: Room[], roomOverrides: Record<string, RoomOverridePatch>): Room[] {
  if (Object.keys(roomOverrides).length === 0) return rooms;
  return rooms.map((room) => {
    const patch = roomOverrides[room.key];
    if (!patch) return room;
    return applyRoomOverridePatch(room, patch);
  });
}

function splitSemicolon(line: string): string[] {
  return line.split(';').map((s) => s.trim());
}

const CATEGORY_KAFEDRA = (() => {
  const value = (ROOM_CATEGORIES[14] ?? '').trim();
  return value.length > 0 ? value : 'Кафедра';
})();

const CATEGORY_ADMIN = (() => {
  const value = (ROOM_CATEGORIES[15] ?? '').trim();
  return value.length > 0 ? value : 'Администрация';
})();

function normalizeRoomCategory(value: string | undefined): string | undefined {
  const trimmed = (value ?? '').trim();
  if (trimmed.length === 0) return undefined;

  const folded = trimmed.toLocaleLowerCase('ru-RU');
  if (folded.includes('преподавательск') || folded.includes('кафедр')) return CATEGORY_KAFEDRA;
  if (folded.includes('администрац')) return CATEGORY_ADMIN;

  return trimmed;
}

function getCategoryByRoomId(roomID: number): string | undefined {
  return normalizeRoomCategory(ROOM_CATEGORIES[roomID]);
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
  const roomNo = (args.roomNo ?? '').trim().toLocaleLowerCase('ru-RU');
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
    areaM2: room.areaM2,
    points: room.points,
  }));
}

export async function loadRoomsFromPublicCsv(path = publicAssetUrl('room_data.csv')): Promise<Room[]> {
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
  const areClosedIndex = indexOf('areClosed');
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
    const areClosed = areClosedIndex >= 0 ? parseBoolLoose(cols[areClosedIndex] ?? '') : undefined;
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

export async function loadRoomsFromPublicJson(path = publicAssetUrl('room_data.json')): Promise<Room[]> {
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
    const areClosed = parseUnknownBool(anyItem.areClosed);
    const categoryFromJson = typeof anyItem.category === 'string' ? anyItem.category : undefined;
    const category = normalizeRoomCategory(categoryFromJson) ?? getCategoryByRoomId(roomID);

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
      areClosed,
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
  opts: { buildId?: string; floorId?: string; jsonPath?: string; csvPath?: string } = {},
): Promise<Room[]> {
  const fromBuildFloor =
    typeof opts.buildId === 'string' && opts.buildId.length > 0 && typeof opts.floorId === 'string' && opts.floorId.length > 0
      ? roomDataPaths(opts.buildId, opts.floorId)
      : null;

  const fromBuildFloorPublic =
    typeof opts.buildId === 'string' && opts.buildId.length > 0 && typeof opts.floorId === 'string' && opts.floorId.length > 0
      ? roomPublicDataPaths(opts.buildId, opts.floorId)
      : null;

  const jsonPath = opts.jsonPath ?? fromBuildFloor?.jsonPath ?? publicAssetUrl('room_data.json');
  const csvPath = opts.csvPath ?? fromBuildFloor?.csvPath ?? publicAssetUrl('room_data.csv');
  const fallbackJsonPath = opts.jsonPath ? null : fromBuildFloorPublic?.jsonPath ?? publicAssetUrl('room_data.json');
  const fallbackCsvPath = opts.csvPath ? null : fromBuildFloorPublic?.csvPath ?? publicAssetUrl('room_data.csv');

  const jsonTryPaths = [jsonPath, fallbackJsonPath].filter(
    (v, i, arr): v is string => typeof v === 'string' && arr.indexOf(v) === i && !isServerApiPath(v),
  );
  const csvTryPaths = [csvPath, fallbackCsvPath].filter(
    (v, i, arr): v is string => typeof v === 'string' && arr.indexOf(v) === i && !isServerApiPath(v),
  );

  let lastError: unknown = null;
  let baseRooms: Room[] | null = null;

  for (const tryPath of jsonTryPaths) {
    try {
      baseRooms = await loadRoomsFromPublicJson(tryPath);
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!baseRooms) {
    for (const tryPath of csvTryPaths) {
      try {
        baseRooms = await loadRoomsFromPublicCsv(tryPath);
        break;
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (!baseRooms) {
    if (lastError instanceof Error) throw lastError;
    throw new Error('Failed to load room data');
  }

  const hasBuildFloor =
    typeof opts.buildId === 'string' &&
    opts.buildId.length > 0 &&
    typeof opts.floorId === 'string' &&
    opts.floorId.length > 0;

  if (!hasBuildFloor) return baseRooms;

  const allOverrides = await loadRoomOverridesFromPublic(opts.buildId as string);
  const floorOverrides = allOverrides[opts.floorId as string] ?? {};
  return applyRoomOverrides(baseRooms, floorOverrides);
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
