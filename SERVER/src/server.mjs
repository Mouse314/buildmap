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

const host = process.env.HOST && process.env.HOST.trim().length > 0 ? process.env.HOST.trim() : '0.0.0.0';
const portRaw = process.env.PORT ?? '3001';
const port = Number.parseInt(portRaw, 10);

if (!Number.isFinite(port) || port <= 0) {
  throw new Error(`Invalid PORT value: ${portRaw}`);
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

function normalizeTextField(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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

    const changes = changesRaw;
    const item = parsed.find(
      (x) => x && typeof x === 'object' && x.key === roomKey,
    );

    if (!item || typeof item !== 'object') {
      sendText(res, 404, 'Комната с указанным key не найдена');
      return;
    }

    const roomNo = normalizeTextField(changes.roomNo);
    const category = normalizeTextField(changes.category);
    const description = normalizeTextField(changes.description);
    const areaM2 = typeof changes.areaM2 === 'number' && Number.isFinite(changes.areaM2)
      ? changes.areaM2
      : undefined;
    const areClosed = typeof changes.areClosed === 'boolean' ? changes.areClosed : undefined;
    const build = changes.build == null ? null : normalizeTextField(changes.build);
    const floor = changes.floor == null ? null : normalizeTextField(changes.floor);

    if (roomNo) item.roomNo = roomNo;
    else delete item.roomNo;

    if (category) item.category = category;
    else delete item.category;

    if (description) item.description = description;
    else delete item.description;

    if (typeof areaM2 === 'number') item.areaM2 = areaM2;
    else delete item.areaM2;

    if (typeof areClosed === 'boolean') item.areClosed = areClosed;

    if (build === null) item.build = null;
    else if (build) item.build = build;
    else delete item.build;

    if (floor === null) item.floor = null;
    else if (floor) item.floor = floor;
    else delete item.floor;

    await fs.writeFile(jsonFilePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    sendJson(res, 200, { ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка сохранения';
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

  if (pathname === '/api/plans/manifest') {
    const filePath = path.join(publicRoot, 'room_data_manifest.json');
    await sendFile(res, filePath, 'application/json; charset=utf-8');
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

server.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`Plans API server is running on http://${host}:${port}`);
  // eslint-disable-next-line no-console
  console.log(`Serving data from ${publicRoot}`);
});
