import { publicAssetUrl } from '../map/rooms/utils/roomData'
import { ScheduleDataset, ScheduleLesson } from './domain'

const RETRYABLE_CSV_STATUS_CODES = new Set([429, 502, 503, 504])
const CSV_FETCH_RETRY_COUNT = 3
const CSV_FETCH_RETRY_BASE_DELAY_MS = 250
const CSV_FETCH_CONCURRENCY = 6

export type ScheduleManifest = {
  dates: Array<{
    date: string
    files: Array<{
      name: string
      size: number
      modifiedAt: string
    }>
  }>
}

function isScheduleManifest(value: unknown): value is ScheduleManifest {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).dates))
}

function scheduleStaticManifestUrl(): string {
  return publicAssetUrl('schedule/manifest.json')
}

function scheduleStaticCsvUrl(date: string, name: string): string {
  const safeDate = encodeURIComponent(date.trim())
  const safeName = encodeURIComponent(name.trim())
  return publicAssetUrl(`schedule/${safeDate}/${safeName}`)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function retryDelayMs(attempt: number): number {
  const jitter = Math.floor(Math.random() * 120)
  return CSV_FETCH_RETRY_BASE_DELAY_MS * 2 ** attempt + jitter
}

async function fetchTextWithRetry(url: string, errorPrefix: string): Promise<string> {
  for (let attempt = 0; attempt < CSV_FETCH_RETRY_COUNT; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return response.text()
      }

      const shouldRetry = RETRYABLE_CSV_STATUS_CODES.has(response.status) && attempt < CSV_FETCH_RETRY_COUNT - 1
      if (shouldRetry) {
        await delay(retryDelayMs(attempt))
        continue
      }

      throw new Error(`${errorPrefix} (${response.status})`)
    } catch (error) {
      const canRetry = attempt < CSV_FETCH_RETRY_COUNT - 1
      if (!canRetry) {
        throw error
      }

      await delay(retryDelayMs(attempt))
    }
  }

  throw new Error(`${errorPrefix} (unknown)`)
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return []

  const results = new Array<R>(items.length)
  let nextIndex = 0

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(items[index], index)
    }
  })

  await Promise.all(workers)
  return results
}

async function fetchScheduleManifestFromStatic(): Promise<ScheduleManifest> {
  const response = await fetch(scheduleStaticManifestUrl())
  if (!response.ok) {
    throw new Error(`Ошибка загрузки локального манифеста расписания (${response.status})`)
  }

  const data: unknown = await response.json()
  if (!isScheduleManifest(data)) {
    throw new Error('Неверный формат локального манифеста расписания')
  }

  return data
}

async function fetchScheduleCsvFromStatic(date: string, name: string): Promise<string> {
  return fetchTextWithRetry(scheduleStaticCsvUrl(date, name), 'Ошибка загрузки локального CSV')
}

export async function fetchScheduleManifest(): Promise<ScheduleManifest> {
  return fetchScheduleManifestFromStatic()
}

export async function fetchScheduleCsv(date: string, name: string): Promise<string> {
  return fetchScheduleCsvFromStatic(date, name)
}

export async function fetchScheduleBatchDataset(date: string, fileNames: string[]): Promise<ScheduleDataset> {
  if (fileNames.length === 0) return new ScheduleDataset([])

  const csvTexts = await mapWithConcurrency(fileNames, CSV_FETCH_CONCURRENCY, (name) => fetchScheduleCsv(date, name))
  const datasets = csvTexts.map((text, idx) => {
    const csvName = fileNames[idx] ?? ''
    const dataset = ScheduleDataset.fromCsv(text)

    // In map schedule mode, we treat sourceFile as group label and bind it to CSV source.
    const rows = dataset.rows.map((row) => {
      return new ScheduleLesson({
        sourceFile: csvName,
        date: row.date,
        weekday: row.weekday,
        time: row.time,
        subgroup: row.subgroup,
        discipline: row.discipline,
        lessonType: row.lessonType,
        teacher: row.teacher,
        cabinet: row.cabinet,
      })
    })

    return new ScheduleDataset(rows)
  })

  return ScheduleDataset.merge(datasets)
}
