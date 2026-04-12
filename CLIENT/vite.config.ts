import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const plansApiProxyTarget =
  typeof process.env.VITE_PLANS_API_PROXY_TARGET === 'string' && process.env.VITE_PLANS_API_PROXY_TARGET.trim().length > 0
    ? process.env.VITE_PLANS_API_PROXY_TARGET.trim()
    : 'http://localhost:3001'

const localScheduleRoot =
  typeof process.env.VITE_LOCAL_SCHEDULE_DIR === 'string' && process.env.VITE_LOCAL_SCHEDULE_DIR.trim().length > 0
    ? path.resolve(process.cwd(), process.env.VITE_LOCAL_SCHEDULE_DIR.trim())
    : path.resolve(__dirname, '../SERVER/schedule_parser/parsed_schedule')

function safeScheduleDate(raw: string | null): string | null {
  if (!raw) return null
  const value = raw.trim()
  return /^\d{2}\.\d{2}\.\d{2}$/.test(value) ? value : null
}

function safeScheduleFileName(raw: string | null): string | null {
  if (!raw) return null
  const value = raw.trim()
  if (value.length === 0) return null
  if (value.includes('/') || value.includes('\\') || value.includes('\0')) return null
  if (path.basename(value) !== value) return null
  if (!/\.csv$/i.test(value)) return null
  return value
}

function parseScheduleDateToEpoch(value: string): number {
  const m = value.match(/^(\d{2})\.(\d{2})\.(\d{2})$/)
  if (!m) return Number.NEGATIVE_INFINITY
  const day = Number.parseInt(m[1], 10)
  const month = Number.parseInt(m[2], 10)
  const year = 2000 + Number.parseInt(m[3], 10)
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return Number.NEGATIVE_INFINITY
  const d = new Date(Date.UTC(year, month - 1, day))
  return Number.isNaN(d.getTime()) ? Number.NEGATIVE_INFINITY : d.getTime()
}

async function readLocalScheduleManifest() {
  let entries: Array<{ isDirectory(): boolean; name: string }>
  try {
    entries = await fs.readdir(localScheduleRoot, { withFileTypes: true })
  } catch {
    return { dates: [] }
  }

  const dateDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => safeScheduleDate(name) != null)
    .sort((a, b) => parseScheduleDateToEpoch(b) - parseScheduleDateToEpoch(a))

  const dates: Array<{
    date: string
    files: Array<{
      name: string
      size: number
      modifiedAt: string
    }>
  }> = []

  for (const dateDir of dateDirs) {
    const folderPath = path.join(localScheduleRoot, dateDir)
    let files: Array<{ isFile(): boolean; name: string }>
    try {
      files = await fs.readdir(folderPath, { withFileTypes: true })
    } catch {
      continue
    }

    const csvFiles = []
    for (const file of files) {
      if (!file.isFile()) continue
      if (!/\.csv$/i.test(file.name)) continue
      const filePath = path.join(folderPath, file.name)
      try {
        const stats = await fs.stat(filePath)
        csvFiles.push({
          name: file.name,
          size: stats.size,
          modifiedAt: stats.mtime.toISOString(),
        })
      } catch {
        // ignore broken file entries
      }
    }

    csvFiles.sort((a, b) => a.name.localeCompare(b.name, 'ru-RU'))
    if (csvFiles.length > 0) {
      dates.push({
        date: dateDir,
        files: csvFiles,
      })
    }
  }

  return { dates }
}

function sendJson(res: import('node:http').ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(`${JSON.stringify(payload)}\n`)
}

function sendText(res: import('node:http').ServerResponse, statusCode: number, message: string): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.end(message)
}

function createScheduleApiMiddleware() {
  return async (
    req: import('node:http').IncomingMessage,
    res: import('node:http').ServerResponse,
    next: () => void,
  ): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const pathname = url.pathname.replace(/\/+$/, '') || '/'

    if (pathname === '/api/schedule/manifest') {
      const manifest = await readLocalScheduleManifest()
      sendJson(res, 200, manifest)
      return
    }

    if (pathname === '/api/schedule/file') {
      const date = safeScheduleDate(url.searchParams.get('date'))
      const name = safeScheduleFileName(url.searchParams.get('name'))
      if (!date || !name) {
        sendJson(res, 400, { error: 'Invalid schedule date or file name' })
        return
      }

      const filePath = path.join(localScheduleRoot, date, name)
      const normalized = path.normalize(filePath)
      if (!normalized.startsWith(path.normalize(localScheduleRoot + path.sep))) {
        sendJson(res, 400, { error: 'Invalid schedule path' })
        return
      }

      try {
        const contents = await fs.readFile(normalized)
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/csv; charset=utf-8')
        res.end(contents)
      } catch {
        sendText(res, 404, 'Schedule file not found')
      }
      return
    }

    next()
  }
}

function localScheduleApiPlugin() {
  const middleware = createScheduleApiMiddleware()
  return {
    name: 'local-schedule-api',
    configureServer(server: { middlewares: { use: (fn: unknown) => void } }) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server: { middlewares: { use: (fn: unknown) => void } }) {
      server.middlewares.use(middleware)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Use relative base so the build works when hosted under subpaths (e.g. GitHub Pages).
  // This also keeps import.meta.env.BASE_URL usable for public asset fetching.
  base: './',
  build: {
    // Keep authored CSS declarations as-is to avoid dropping unprefixed backdrop-filter in production.
    cssMinify: 'esbuild',
  },
  server: {
    proxy: {
      '/api/plans': {
        target: plansApiProxyTarget,
        changeOrigin: true,
      },
      '/api/admin': {
        target: plansApiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  plugins: [
    localScheduleApiPlugin(),
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],
})
