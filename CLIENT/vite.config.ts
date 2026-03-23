import { promises as fs } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

type AdminRoomPatchPayload = {
  buildId?: unknown
  floorId?: unknown
  roomKey?: unknown
  changes?: unknown
}

function safeSegment(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) return null
  return trimmed
}

function normalizeTextField(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

async function readJsonBody(req: import('node:http').IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (raw.length === 0) return null
  return JSON.parse(raw)
}

function adminPersistencePlugin() {
  return {
    name: 'admin-room-persistence',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use('/api/admin/rooms/update', async (req, res, next) => {
        if (req.method !== 'POST') {
          next()
          return
        }

        try {
          const body = (await readJsonBody(req)) as AdminRoomPatchPayload | null
          const buildId = safeSegment(body?.buildId)
          const floorId = safeSegment(body?.floorId)
          const roomKey = typeof body?.roomKey === 'string' ? body.roomKey.trim() : ''
          const changesRaw = body?.changes

          if (!buildId || !floorId || roomKey.length === 0 || !changesRaw || typeof changesRaw !== 'object') {
            res.statusCode = 400
            res.setHeader('Content-Type', 'text/plain; charset=utf-8')
            res.end('Некорректный формат запроса')
            return
          }

          const jsonFilePath = path.resolve(server.config.root, 'public', buildId, floorId, 'room_data.json')
          const fileText = await fs.readFile(jsonFilePath, 'utf8')
          const parsed: unknown = JSON.parse(fileText)
          if (!Array.isArray(parsed)) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'text/plain; charset=utf-8')
            res.end('Файл room_data.json имеет неверный формат')
            return
          }

          const changes = changesRaw as Record<string, unknown>
          const item = parsed.find((x) => x && typeof x === 'object' && (x as Record<string, unknown>).key === roomKey) as
            | Record<string, unknown>
            | undefined

          if (!item) {
            res.statusCode = 404
            res.setHeader('Content-Type', 'text/plain; charset=utf-8')
            res.end('Комната с указанным key не найдена')
            return
          }

          const roomNo = normalizeTextField(changes.roomNo)
          const category = normalizeTextField(changes.category)
          const description = normalizeTextField(changes.description)
          const areaM2 = typeof changes.areaM2 === 'number' && Number.isFinite(changes.areaM2)
            ? changes.areaM2
            : undefined
          const areClosed = typeof changes.areClosed === 'boolean' ? changes.areClosed : undefined
          const build = changes.build == null ? null : normalizeTextField(changes.build)
          const floor = changes.floor == null ? null : normalizeTextField(changes.floor)

          if (roomNo) item.roomNo = roomNo
          else delete item.roomNo

          if (category) item.category = category
          else delete item.category

          if (description) item.description = description
          else delete item.description

          if (typeof areaM2 === 'number') item.areaM2 = areaM2
          else delete item.areaM2

          if (typeof areClosed === 'boolean') item.areClosed = areClosed

          if (build === null) item.build = null
          else if (build) item.build = build
          else delete item.build

          if (floor === null) item.floor = null
          else if (floor) item.floor = floor
          else delete item.floor

          await fs.writeFile(jsonFilePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ ok: true }))
        } catch (error) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          const message = error instanceof Error ? error.message : 'Неизвестная ошибка сохранения'
          res.end(message)
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Use relative base so the build works when hosted under subpaths (e.g. GitHub Pages).
  // This also keeps import.meta.env.BASE_URL usable for public asset fetching.
  base: './',
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    adminPersistencePlugin(),
  ],
})
