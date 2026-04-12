import { plansApiUrl, publicAssetUrl } from '../map/rooms/utils/roomData'
import { ScheduleDataset, ScheduleLesson } from './domain'

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

async function fetchScheduleManifestFromApi(): Promise<ScheduleManifest> {
  const response = await fetch(plansApiUrl('/api/schedule/manifest'))
  if (!response.ok) {
    throw new Error(`Ошибка загрузки манифеста расписания (${response.status})`)
  }

  const data: unknown = await response.json()
  if (!isScheduleManifest(data)) {
    throw new Error('Неверный формат манифеста расписания')
  }

  return data
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

async function fetchScheduleCsvFromApi(date: string, name: string): Promise<string> {
  const url = new URL(plansApiUrl('/api/schedule/file'), window.location.origin)
  url.searchParams.set('date', date)
  url.searchParams.set('name', name)

  const response = await fetch(url.toString())
  if (!response.ok) {
    throw new Error(`Ошибка загрузки CSV (${response.status})`)
  }

  return response.text()
}

async function fetchScheduleCsvFromStatic(date: string, name: string): Promise<string> {
  const response = await fetch(scheduleStaticCsvUrl(date, name))
  if (!response.ok) {
    throw new Error(`Ошибка загрузки локального CSV (${response.status})`)
  }

  return response.text()
}

export async function fetchScheduleManifest(): Promise<ScheduleManifest> {
  try {
    return await fetchScheduleManifestFromApi()
  } catch {
    return fetchScheduleManifestFromStatic()
  }
}

export async function fetchScheduleCsv(date: string, name: string): Promise<string> {
  try {
    return await fetchScheduleCsvFromApi(date, name)
  } catch {
    return fetchScheduleCsvFromStatic(date, name)
  }
}

export async function fetchScheduleBatchDataset(date: string, fileNames: string[]): Promise<ScheduleDataset> {
  if (fileNames.length === 0) return new ScheduleDataset([])

  const csvTexts = await Promise.all(fileNames.map((name) => fetchScheduleCsv(date, name)))
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
