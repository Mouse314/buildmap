import { plansApiUrl } from '../map/rooms/utils/roomData'
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

export async function fetchScheduleManifest(): Promise<ScheduleManifest> {
  const response = await fetch(plansApiUrl('/api/schedule/manifest'))
  if (!response.ok) {
    throw new Error(`Ошибка загрузки манифеста расписания (${response.status})`)
  }

  const data: unknown = await response.json()
  if (!data || typeof data !== 'object' || !Array.isArray((data as Record<string, unknown>).dates)) {
    throw new Error('Неверный формат манифеста расписания')
  }

  return data as ScheduleManifest
}

export async function fetchScheduleCsv(date: string, name: string): Promise<string> {
  const url = new URL(plansApiUrl('/api/schedule/file'), window.location.origin)
  url.searchParams.set('date', date)
  url.searchParams.set('name', name)

  const response = await fetch(url.toString())
  if (!response.ok) {
    throw new Error(`Ошибка загрузки CSV (${response.status})`)
  }

  return response.text()
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
