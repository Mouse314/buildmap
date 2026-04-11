import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultPublicRoot = path.resolve(__dirname, '../../CLIENT/public');
const publicRoot = process.env.PLANS_PUBLIC_DIR
  ? path.resolve(process.cwd(), process.env.PLANS_PUBLIC_DIR)
  : defaultPublicRoot;

const defaultScheduleRoot = path.resolve(__dirname, '../schedule_parser/parsed_schedule');
const scheduleRoot = process.env.SCHEDULE_PARSED_DIR
  ? path.resolve(process.cwd(), process.env.SCHEDULE_PARSED_DIR)
  : defaultScheduleRoot;

const host = process.env.HOST && process.env.HOST.trim().length > 0 ? process.env.HOST.trim() : '0.0.0.0';
const portRaw = process.env.PORT ?? '3001';
const port = Number.parseInt(portRaw, 10);

if (!Number.isFinite(port) || port <= 0) {
  throw new Error(`Invalid PORT value: ${portRaw}`);
}

const GRAPHICS_PRESET_IDS = ['min', 'medium', 'max'];

const DEFAULT_GRAPHICS_PRESETS_BY_ID = {
  min: {
    id: 'min',
    label: 'Сбалансированные',
    title: 'Максимальная производительность',
    dpr: { mode: 'fixed', value: 1 },
    shadowsEnabled: false,
    mouseLampEnabled: false,
    postFx: {
      enabled: false,
      multisampling: 0,
      n8ao: null,
      bloom: null,
      vignette: null,
    },
  },
  medium: {
    id: 'medium',
    label: 'Выше среднего',
    title: 'Улучшенное качество',
    dpr: { mode: 'adaptive', baseMax: 1.5, declineTo: 1.0 },
    shadowsEnabled: false,
    mouseLampEnabled: true,
    postFx: {
      enabled: true,
      multisampling: 0,
      n8ao: null,
      bloom: {
        intensity: 0.06,
        luminanceThreshold: 0.55,
        luminanceSmoothing: 0.75,
        radius: 0.2,
        mipmapBlur: true,
      },
      vignette: {
        offset: 0.38,
        darkness: 0.52,
      },
    },
  },
  max: {
    id: 'max',
    label: 'Максимальные',
    title: 'Максимальное качество (рекомендуется только для мощных устройств)',
    dpr: { mode: 'fixed', value: 1.5 },
    shadowsEnabled: true,
    mouseLampEnabled: true,
    postFx: {
      enabled: true,
      multisampling: 4,
      n8ao: {
        aoRadius: 2.5,
        distanceFalloff: 1.2,
        intensity: 4.5,
        screenSpaceRadius: false,
      },
      bloom: {
        intensity: 0.16,
        luminanceThreshold: 0.48,
        luminanceSmoothing: 0.72,
        radius: 0.28,
        mipmapBlur: true,
      },
      vignette: {
        offset: 0.32,
        darkness: 0.62,
      },
    },
  },
};

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function asObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}

function asFiniteNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function asNonEmptyText(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function sanitizeGraphicsPostFx(raw, fallback) {
  const obj = asObject(raw) ?? {};
  const n8aoRaw = asObject(obj.n8ao);
  const bloomRaw = asObject(obj.bloom);
  const vignetteRaw = asObject(obj.vignette);

  return {
    enabled: asBoolean(obj.enabled, fallback.enabled),
    multisampling: asFiniteNumber(obj.multisampling, fallback.multisampling),
    n8ao: obj.n8ao == null
      ? null
      : {
          aoRadius: asFiniteNumber(n8aoRaw?.aoRadius, fallback.n8ao?.aoRadius ?? 2.5),
          distanceFalloff: asFiniteNumber(n8aoRaw?.distanceFalloff, fallback.n8ao?.distanceFalloff ?? 1.2),
          intensity: asFiniteNumber(n8aoRaw?.intensity, fallback.n8ao?.intensity ?? 4.5),
          screenSpaceRadius: asBoolean(n8aoRaw?.screenSpaceRadius, fallback.n8ao?.screenSpaceRadius ?? false),
        },
    bloom: obj.bloom == null
      ? null
      : {
          intensity: asFiniteNumber(bloomRaw?.intensity, fallback.bloom?.intensity ?? 0.16),
          luminanceThreshold: asFiniteNumber(bloomRaw?.luminanceThreshold, fallback.bloom?.luminanceThreshold ?? 0.48),
          luminanceSmoothing: asFiniteNumber(bloomRaw?.luminanceSmoothing, fallback.bloom?.luminanceSmoothing ?? 0.72),
          radius: asFiniteNumber(bloomRaw?.radius, fallback.bloom?.radius ?? 0.28),
          mipmapBlur: asBoolean(bloomRaw?.mipmapBlur, fallback.bloom?.mipmapBlur ?? true),
        },
    vignette: obj.vignette == null
      ? null
      : {
          offset: asFiniteNumber(vignetteRaw?.offset, fallback.vignette?.offset ?? 0.32),
          darkness: asFiniteNumber(vignetteRaw?.darkness, fallback.vignette?.darkness ?? 0.62),
        },
  };
}

function sanitizeGraphicsPreset(raw, fallback, id) {
  const obj = asObject(raw) ?? {};
  const dprRaw = asObject(obj.dpr) ?? {};
  const mode = dprRaw.mode === 'adaptive' || dprRaw.mode === 'fixed' ? dprRaw.mode : fallback.dpr.mode;

  const dpr = mode === 'fixed'
    ? {
        mode: 'fixed',
        value: asFiniteNumber(dprRaw.value, fallback.dpr.mode === 'fixed' ? fallback.dpr.value : 1),
      }
    : {
        mode: 'adaptive',
        baseMax: asFiniteNumber(dprRaw.baseMax, fallback.dpr.mode === 'adaptive' ? fallback.dpr.baseMax : 1.5),
        declineTo: asFiniteNumber(dprRaw.declineTo, fallback.dpr.mode === 'adaptive' ? fallback.dpr.declineTo : 1),
      };

  return {
    id,
    label: asNonEmptyText(obj.label, fallback.label),
    title: asNonEmptyText(obj.title, fallback.title),
    dpr,
    shadowsEnabled: asBoolean(obj.shadowsEnabled, fallback.shadowsEnabled),
    mouseLampEnabled: asBoolean(obj.mouseLampEnabled, fallback.mouseLampEnabled),
    postFx: sanitizeGraphicsPostFx(obj.postFx, fallback.postFx),
  };
}

function sanitizeGraphicsPresetsById(raw) {
  const source = asObject(raw) ?? {};
  return {
    min: sanitizeGraphicsPreset(source.min, DEFAULT_GRAPHICS_PRESETS_BY_ID.min, 'min'),
    medium: sanitizeGraphicsPreset(source.medium, DEFAULT_GRAPHICS_PRESETS_BY_ID.medium, 'medium'),
    max: sanitizeGraphicsPreset(source.max, DEFAULT_GRAPHICS_PRESETS_BY_ID.max, 'max'),
  };
}

function sanitizeGraphicsPresetsFile(raw) {
  const obj = asObject(raw) ?? {};
  const presetsRaw = asObject(obj.presets) ?? obj;

  const hasAnyPreset = GRAPHICS_PRESET_IDS.some((id) => Object.prototype.hasOwnProperty.call(presetsRaw, id));
  const presets = hasAnyPreset
    ? sanitizeGraphicsPresetsById(presetsRaw)
    : cloneJson(DEFAULT_GRAPHICS_PRESETS_BY_ID);

  return {
    version: 1,
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : '',
    presets,
  };
}

function graphicsPresetsFilePath() {
  return path.join(publicRoot, 'graphics_presets.json');
}

async function ensureGraphicsPresetsFileInitialized() {
  const filePath = graphicsPresetsFilePath();

  try {
    await fs.access(filePath);
    return { created: false, filePath };
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }

  const initialPayload = {
    version: 1,
    updatedAt: '',
    presets: cloneJson(DEFAULT_GRAPHICS_PRESETS_BY_ID),
  };

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(initialPayload, null, 2)}\n`, 'utf8');
  return { created: true, filePath };
}

function setCommonHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(`${JSON.stringify(payload)}\n`);
}

function sendText(res, statusCode, message) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(message);
}

function safeSegment(raw) {
  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const value = decoded.trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) return null;
  return value;
}

function safeScheduleDate(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return /^\d{2}\.\d{2}\.\d{2}$/.test(value) ? value : null;
}

function safeScheduleFileName(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (value.length === 0) return null;
  if (value.includes('/') || value.includes('\\') || value.includes('\0')) return null;
  if (path.basename(value) !== value) return null;
  if (!/\.csv$/i.test(value)) return null;
  return value;
}

function parseScheduleDateToEpoch(value) {
  const m = value.match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  if (!m) return Number.NEGATIVE_INFINITY;
  const day = Number.parseInt(m[1], 10);
  const month = Number.parseInt(m[2], 10);
  const year = 2000 + Number.parseInt(m[3], 10);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return Number.NEGATIVE_INFINITY;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(d.getTime())) return Number.NEGATIVE_INFINITY;
  return d.getTime();
}

async function readScheduleManifest() {
  let entries;
  try {
    entries = await fs.readdir(scheduleRoot, { withFileTypes: true });
  } catch {
    return { dates: [] };
  }

  const dateDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => safeScheduleDate(name) != null)
    .sort((a, b) => parseScheduleDateToEpoch(b) - parseScheduleDateToEpoch(a));

  const dates = [];

  for (const dateDir of dateDirs) {
    const folderPath = path.join(scheduleRoot, dateDir);
    let files;
    try {
      files = await fs.readdir(folderPath, { withFileTypes: true });
    } catch {
      continue;
    }

    const csvFiles = [];
    for (const file of files) {
      if (!file.isFile()) continue;
      if (!/\.csv$/i.test(file.name)) continue;
      const filePath = path.join(folderPath, file.name);
      try {
        const stats = await fs.stat(filePath);
        csvFiles.push({
          name: file.name,
          size: stats.size,
          modifiedAt: stats.mtime.toISOString(),
        });
      } catch {
        // ignore broken file entries
      }
    }

    csvFiles.sort((a, b) => a.name.localeCompare(b.name, 'ru-RU'));
    if (csvFiles.length > 0) {
      dates.push({
        date: dateDir,
        files: csvFiles,
      });
    }
  }

  return { dates };
}

function normalizeNullableTextField(value) {
  if (value == null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeNullableNumberField(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

function normalizeNullableIntegerField(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)) return value;
  return undefined;
}

function normalizeNullableBooleanField(value) {
  if (value == null) return null;
  if (typeof value === 'boolean') return value;
  return undefined;
}

function sanitizeOverridePatch(rawPatch) {
  if (!rawPatch || typeof rawPatch !== 'object') return {};
  const patch = {};

  if (Object.prototype.hasOwnProperty.call(rawPatch, 'roomID')) {
    const roomID = normalizeNullableIntegerField(rawPatch.roomID);
    if (roomID !== undefined) patch.roomID = roomID;
  }

  if (Object.prototype.hasOwnProperty.call(rawPatch, 'roomNo')) {
    const roomNo = normalizeNullableTextField(rawPatch.roomNo);
    if (roomNo !== undefined) patch.roomNo = roomNo;
  }

  if (Object.prototype.hasOwnProperty.call(rawPatch, 'category')) {
    const category = normalizeNullableTextField(rawPatch.category);
    if (category !== undefined) patch.category = category;
  }

  if (Object.prototype.hasOwnProperty.call(rawPatch, 'description')) {
    const description = normalizeNullableTextField(rawPatch.description);
    if (description !== undefined) patch.description = description;
  }

  if (Object.prototype.hasOwnProperty.call(rawPatch, 'areClosed')) {
    const areClosed = normalizeNullableBooleanField(rawPatch.areClosed);
    if (areClosed !== undefined) patch.areClosed = areClosed;
  }

  if (Object.prototype.hasOwnProperty.call(rawPatch, 'areaM2')) {
    const areaM2 = normalizeNullableNumberField(rawPatch.areaM2);
    if (areaM2 !== undefined) patch.areaM2 = areaM2;
  }

  if (Object.prototype.hasOwnProperty.call(rawPatch, 'build')) {
    const build = normalizeNullableTextField(rawPatch.build);
    if (build !== undefined) patch.build = build;
  }

  if (Object.prototype.hasOwnProperty.call(rawPatch, 'floor')) {
    const floor = normalizeNullableTextField(rawPatch.floor);
    if (floor !== undefined) patch.floor = floor;
  }

  return patch;
}

function sanitizeOverridesFile(raw, buildId) {
  const result = {
    version: 1,
    buildId,
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : '',
    floors: {},
  };

  if (!raw || typeof raw !== 'object') return result;

  const anyRaw = raw;
  const floorsRaw = anyRaw.floors;
  if (!floorsRaw || typeof floorsRaw !== 'object') return result;

  for (const [floorId, floorRaw] of Object.entries(floorsRaw)) {
    if (!floorRaw || typeof floorRaw !== 'object') continue;
    const floorPatches = {};
    for (const [roomKey, patchRaw] of Object.entries(floorRaw)) {
      const normalizedRoomKey = String(roomKey).trim();
      if (normalizedRoomKey.length === 0) continue;
      const patch = sanitizeOverridePatch(patchRaw);
      if (Object.keys(patch).length === 0) continue;
      floorPatches[normalizedRoomKey] = patch;
    }
    if (Object.keys(floorPatches).length > 0) {
      result.floors[floorId] = floorPatches;
    }
  }

  return result;
}

function isSafeId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}

function isMissingFileError(error) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function discoverBuildIdsFromManifest() {
  const manifestPath = path.join(publicRoot, 'room_data_manifest.json');

  try {
    const rawText = await fs.readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(rawText);
    if (!parsed || typeof parsed !== 'object') return [];
    const buildsRaw = parsed.builds;
    if (!Array.isArray(buildsRaw)) return [];

    const result = [];
    for (const buildItem of buildsRaw) {
      if (!buildItem || typeof buildItem !== 'object') continue;
      const buildId = isSafeId(buildItem.id);
      if (!buildId) continue;
      result.push(buildId);
    }

    return result;
  } catch {
    return [];
  }
}

async function isBuildDirWithFloors(buildDirPath) {
  let entries;
  try {
    entries = await fs.readdir(buildDirPath, { withFileTypes: true });
  } catch {
    return false;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const floorId = isSafeId(entry.name);
    if (!floorId || !/^floor/i.test(floorId)) continue;

    const floorPath = path.join(buildDirPath, floorId);
    const hasRoomJson = await fileExists(path.join(floorPath, 'room_data.json'));
    const hasRoomCsv = await fileExists(path.join(floorPath, 'room_data.csv'));
    if (hasRoomJson || hasRoomCsv) return true;
  }

  return false;
}

async function discoverBuildIdsFromPublicFolders() {
  let entries;
  try {
    entries = await fs.readdir(publicRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const result = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const buildId = isSafeId(entry.name);
    if (!buildId) continue;

    const buildDirPath = path.join(publicRoot, buildId);
    if (await isBuildDirWithFloors(buildDirPath)) {
      result.push(buildId);
    }
  }

  return result;
}

async function discoverBuildIdsForOverrides() {
  const [fromManifest, fromFolders] = await Promise.all([
    discoverBuildIdsFromManifest(),
    discoverBuildIdsFromPublicFolders(),
  ]);

  return Array.from(new Set([...fromManifest, ...fromFolders])).sort((a, b) => a.localeCompare(b));
}

async function ensureOverridesFilesInitialized() {
  const buildIds = await discoverBuildIdsForOverrides();
  let createdCount = 0;

  for (const buildId of buildIds) {
    const filePath = path.join(publicRoot, buildId, 'room_overrides.json');
    try {
      await fs.access(filePath);
      continue;
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
    }

    const initialData = sanitizeOverridesFile(null, buildId);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(initialData, null, 2)}\n`, 'utf8');
    createdCount += 1;
  }

  return { buildIdsCount: buildIds.length, createdCount };
}

async function readOverridesFile(buildId) {
  const filePath = path.join(publicRoot, buildId, 'room_overrides.json');

  try {
    const rawText = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(rawText);
    return {
      filePath,
      data: sanitizeOverridesFile(parsed, buildId),
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return {
        filePath,
        data: sanitizeOverridesFile(null, buildId),
      };
    }
    throw error;
  }
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (raw.length === 0) return null;
  return JSON.parse(raw);
}

async function sendFile(res, filePath, contentType) {
  try {
    const contents = await fs.readFile(filePath);
    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    res.end(contents);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
    sendJson(res, 500, { error: 'Failed to read file' });
  }
}

async function handleAdminRoomUpdate(req, res) {
  try {
    const body = await readJsonBody(req);
    const buildId = safeSegment(body?.buildId);
    const floorId = safeSegment(body?.floorId);
    const roomKey = typeof body?.roomKey === 'string' ? body.roomKey.trim() : '';
    const changesRaw = body?.changes;

    if (!buildId || !floorId || roomKey.length === 0 || !changesRaw || typeof changesRaw !== 'object') {
      sendText(res, 400, 'Некорректный формат запроса');
      return;
    }

    const jsonFilePath = path.join(publicRoot, buildId, floorId, 'room_data.json');
    const fileText = await fs.readFile(jsonFilePath, 'utf8');
    const parsed = JSON.parse(fileText);

    if (!Array.isArray(parsed)) {
      sendText(res, 500, 'Файл room_data.json имеет неверный формат');
      return;
    }

    const item = parsed.find(
      (x) => x && typeof x === 'object' && x.key === roomKey,
    );

    if (!item || typeof item !== 'object') {
      sendText(res, 404, 'Комната с указанным key не найдена');
      return;
    }

    const roomPatch = sanitizeOverridePatch(changesRaw);
    if (Object.keys(roomPatch).length === 0) {
      sendText(res, 400, 'Нет корректных полей для сохранения');
      return;
    }

    const nowIso = new Date().toISOString();
    const { filePath: overridesFilePath, data: overridesData } = await readOverridesFile(buildId);
    const floorPatches = overridesData.floors[floorId] && typeof overridesData.floors[floorId] === 'object'
      ? overridesData.floors[floorId]
      : {};

    floorPatches[roomKey] = {
      ...(floorPatches[roomKey] ?? {}),
      ...roomPatch,
      updatedAt: nowIso,
    };

    overridesData.version = 1;
    overridesData.buildId = buildId;
    overridesData.updatedAt = nowIso;
    overridesData.floors[floorId] = floorPatches;

    await fs.mkdir(path.dirname(overridesFilePath), { recursive: true });
    await fs.writeFile(overridesFilePath, `${JSON.stringify(overridesData, null, 2)}\n`, 'utf8');
    sendJson(res, 200, {
      ok: true,
      buildId,
      floorId,
      roomKey,
      overridesFile: path.relative(publicRoot, overridesFilePath).replace(/\\/g, '/'),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка сохранения';
    sendText(res, 500, message);
  }
}

async function handleAdminGraphicsPresetsSave(req, res) {
  try {
    const body = await readJsonBody(req);
    const bodyObj = asObject(body);
    const rawPresets = asObject(bodyObj?.presets) ?? bodyObj;

    if (!rawPresets || !GRAPHICS_PRESET_IDS.some((id) => Object.prototype.hasOwnProperty.call(rawPresets, id))) {
      sendText(res, 400, 'Некорректный формат графических пресетов');
      return;
    }

    const payload = sanitizeGraphicsPresetsFile({
      version: 1,
      updatedAt: new Date().toISOString(),
      presets: rawPresets,
    });

    const filePath = graphicsPresetsFilePath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

    sendJson(res, 200, {
      ok: true,
      file: path.relative(publicRoot, filePath).replace(/\\/g, '/'),
      updatedAt: payload.updatedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка сохранения пресетов';
    sendText(res, 500, message);
  }
}

async function handleGetRequest(req, res) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  if (pathname === '/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === '/api/admin/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === '/api/plans/manifest') {
    const filePath = path.join(publicRoot, 'room_data_manifest.json');
    await sendFile(res, filePath, 'application/json; charset=utf-8');
    return;
  }

  if (pathname === '/api/schedule/manifest') {
    const manifest = await readScheduleManifest();
    sendJson(res, 200, manifest);
    return;
  }

  if (pathname === '/api/schedule/file') {
    const date = safeScheduleDate(url.searchParams.get('date'));
    const name = safeScheduleFileName(url.searchParams.get('name'));

    if (!date || !name) {
      sendJson(res, 400, { error: 'Invalid schedule date or file name' });
      return;
    }

    const filePath = path.join(scheduleRoot, date, name);
    const normalized = path.normalize(filePath);
    if (!normalized.startsWith(path.normalize(scheduleRoot + path.sep))) {
      sendJson(res, 400, { error: 'Invalid schedule path' });
      return;
    }

    await sendFile(res, normalized, 'text/csv; charset=utf-8');
    return;
  }

  const parts = pathname.split('/').filter((x) => x.length > 0);
  if (parts.length === 5 && parts[0] === 'api' && parts[1] === 'plans') {
    const buildId = safeSegment(parts[2]);
    const floorId = safeSegment(parts[3]);
    const dataType = parts[4];

    if (!buildId || !floorId) {
      sendJson(res, 400, { error: 'Invalid buildId or floorId' });
      return;
    }

    if (dataType === 'rooms') {
      const filePath = path.join(publicRoot, buildId, floorId, 'room_data.json');
      await sendFile(res, filePath, 'application/json; charset=utf-8');
      return;
    }

    if (dataType === 'rooms.csv') {
      const filePath = path.join(publicRoot, buildId, floorId, 'room_data.csv');
      await sendFile(res, filePath, 'text/csv; charset=utf-8');
      return;
    }

    if (dataType === 'graph') {
      const filePath = path.join(publicRoot, buildId, floorId, 'room_graph.json');
      await sendFile(res, filePath, 'application/json; charset=utf-8');
      return;
    }
  }

  sendJson(res, 404, { error: 'Route not found' });
}

async function handlePostRequest(req, res) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  if (pathname === '/api/admin/rooms/update') {
    await handleAdminRoomUpdate(req, res);
    return;
  }

  if (pathname === '/api/admin/graphics/presets') {
    await handleAdminGraphicsPresetsSave(req, res);
    return;
  }

  sendJson(res, 404, { error: 'Route not found' });
}

const server = http.createServer(async (req, res) => {
  setCommonHeaders(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === 'GET') {
    await handleGetRequest(req, res);
    return;
  }

  if (req.method === 'POST') {
    await handlePostRequest(req, res);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }
});

async function bootstrap() {
  try {
    const [initRoomOverrides, initGraphicsPresets] = await Promise.all([
      ensureOverridesFilesInitialized(),
      ensureGraphicsPresetsFileInitialized(),
    ]);
    // eslint-disable-next-line no-console
    console.log(
      `[init] room_overrides.json checked for ${initRoomOverrides.buildIdsCount} build(s), created ${initRoomOverrides.createdCount} file(s)`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `[init] graphics_presets.json ${initGraphicsPresets.created ? 'created' : 'already exists'}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.warn(`[init] Failed to initialize admin data files: ${message}`);
  }

  server.listen(port, host, () => {
    // eslint-disable-next-line no-console
    console.log(`Plans API server is running on http://${host}:${port}`);
    // eslint-disable-next-line no-console
    console.log(`Serving data from ${publicRoot}`);
    // eslint-disable-next-line no-console
    console.log(`Serving schedule data from ${scheduleRoot}`);
  });
}

void bootstrap();
