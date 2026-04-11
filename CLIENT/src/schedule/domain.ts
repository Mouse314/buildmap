export type ScheduleColumnKey =
  | 'sourceFile'
  | 'date'
  | 'weekday'
  | 'time'
  | 'subgroup'
  | 'discipline'
  | 'lessonType'
  | 'teacher'
  | 'cabinet'

export const SCHEDULE_COLUMN_LABELS: Record<ScheduleColumnKey, string> = {
  sourceFile: 'Файл',
  date: 'Дата',
  weekday: 'День недели',
  time: 'Время',
  subgroup: 'Подгруппа',
  discipline: 'Дисциплина',
  lessonType: 'Тип занятия',
  teacher: 'Преподаватель',
  cabinet: 'Кабинет',
}

export const SCHEDULE_COLUMN_ORDER: ScheduleColumnKey[] = [
  'sourceFile',
  'date',
  'weekday',
  'time',
  'subgroup',
  'discipline',
  'lessonType',
  'teacher',
  'cabinet',
]

function fold(value: string | null | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase('ru-RU')
}

function parseDateToIso(dateRaw: string): string | null {
  const text = dateRaw.trim()
  const m = text.match(/^(\d{2})\.(\d{2})\.(\d{2})$/)
  if (!m) return null
  const day = Number.parseInt(m[1], 10)
  const month = Number.parseInt(m[2], 10)
  const year = 2000 + Number.parseInt(m[3], 10)
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const d = String(day).padStart(2, '0')
  const mm = String(month).padStart(2, '0')
  return `${year}-${mm}-${d}`
}

function inferBuildingFromCabinet(cabinet: string): string | null {
  const m = cabinet.trim().match(/^(\d+)\s*-/)
  return m ? m[1] : null
}

export class ScheduleLesson {
  readonly sourceFile: string
  readonly date: string
  readonly dateIso: string | null
  readonly weekday: string
  readonly time: string
  readonly subgroup: string
  readonly discipline: string
  readonly lessonType: string
  readonly teacher: string
  readonly cabinet: string
  readonly building: string | null

  constructor(args: {
    sourceFile: string
    date: string
    weekday: string
    time: string
    subgroup: string
    discipline: string
    lessonType: string
    teacher: string
    cabinet: string
  }) {
    this.sourceFile = args.sourceFile.trim()
    this.date = args.date.trim()
    this.dateIso = parseDateToIso(this.date)
    this.weekday = args.weekday.trim()
    this.time = args.time.trim()
    this.subgroup = args.subgroup.trim()
    this.discipline = args.discipline.trim()
    this.lessonType = args.lessonType.trim()
    this.teacher = args.teacher.trim()
    this.cabinet = args.cabinet.trim()
    this.building = inferBuildingFromCabinet(this.cabinet)
  }

  getValueByColumn(column: ScheduleColumnKey): string {
    switch (column) {
      case 'sourceFile':
        return this.sourceFile
      case 'date':
        return this.date
      case 'weekday':
        return this.weekday
      case 'time':
        return this.time
      case 'subgroup':
        return this.subgroup
      case 'discipline':
        return this.discipline
      case 'lessonType':
        return this.lessonType
      case 'teacher':
        return this.teacher
      case 'cabinet':
        return this.cabinet
      default:
        return ''
    }
  }
}

export class ScheduleCsvParser {
  static parse(text: string): string[][] {
    const rows: string[][] = []
    let row: string[] = []
    let cell = ''
    let inQuotes = false

    const src = text.replace(/^\uFEFF/, '')

    for (let i = 0; i < src.length; i++) {
      const ch = src[i]

      if (inQuotes) {
        if (ch === '"') {
          if (src[i + 1] === '"') {
            cell += '"'
            i += 1
          } else {
            inQuotes = false
          }
        } else {
          cell += ch
        }
        continue
      }

      if (ch === '"') {
        inQuotes = true
        continue
      }

      if (ch === ',') {
        row.push(cell)
        cell = ''
        continue
      }

      if (ch === '\n') {
        row.push(cell)
        rows.push(row)
        row = []
        cell = ''
        continue
      }

      if (ch === '\r') continue

      cell += ch
    }

    row.push(cell)
    rows.push(row)

    return rows.filter((r) => r.some((v) => v.trim().length > 0))
  }
}

function toRecord(headers: string[], values: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < headers.length; i++) {
    out[headers[i]] = values[i] ?? ''
  }
  return out
}

export type ScheduleFilter = {
  subgroup: string
  dateIso: string
  global: string
  columns: Partial<Record<ScheduleColumnKey, string>>
}

export type SchedulePeriodMode = 'week' | 'day'

export type ScheduleStatsBucket = Array<{ label: string; count: number }>

export type ScheduleStats = {
  buildings: ScheduleStatsBucket
  teachers: ScheduleStatsBucket
  weekdays: ScheduleStatsBucket
}

export class ScheduleDataset {
  readonly rows: ScheduleLesson[]

  constructor(rows: ScheduleLesson[]) {
    this.rows = rows
  }

  static fromCsv(csvText: string): ScheduleDataset {
    const matrix = ScheduleCsvParser.parse(csvText)
    if (matrix.length === 0) return new ScheduleDataset([])

    const headers = matrix[0].map((h) => h.trim())
    const lessons: ScheduleLesson[] = []

    for (let i = 1; i < matrix.length; i++) {
      const record = toRecord(headers, matrix[i])
      const lesson = new ScheduleLesson({
        sourceFile: record['Файл'] ?? '',
        date: record['Дата'] ?? '',
        weekday: record['День недели'] ?? '',
        time: record['Время'] ?? '',
        subgroup: record['Подгруппа'] ?? '',
        discipline: record['Дисциплина'] ?? '',
        lessonType: record['Тип занятия'] ?? '',
        teacher: record['Преподаватель'] ?? '',
        cabinet: record['Кабинет'] ?? '',
      })
      lessons.push(lesson)
    }

    return new ScheduleDataset(lessons)
  }

  static merge(datasets: ScheduleDataset[]): ScheduleDataset {
    const merged: ScheduleLesson[] = []
    for (const dataset of datasets) {
      merged.push(...dataset.rows)
    }
    return new ScheduleDataset(merged)
  }

  static rowsByPeriod(rows: ScheduleLesson[], mode: SchedulePeriodMode, focusDateIso: string): ScheduleLesson[] {
    if (focusDateIso.trim().length === 0) return rows
    if (mode === 'day') {
      return rows.filter((row) => row.dateIso === focusDateIso)
    }

    const from = new Date(`${focusDateIso}T00:00:00`)
    if (Number.isNaN(from.getTime())) return rows
    const day = from.getDay()
    const mondayOffset = day === 0 ? -6 : 1 - day
    from.setDate(from.getDate() + mondayOffset)

    const to = new Date(from)
    to.setDate(from.getDate() + 6)

    const fromTs = from.getTime()
    const toTs = to.getTime()

    return rows.filter((row) => {
      if (!row.dateIso) return false
      const current = new Date(`${row.dateIso}T00:00:00`)
      if (Number.isNaN(current.getTime())) return false
      const ts = current.getTime()
      return ts >= fromTs && ts <= toTs
    })
  }

  getSubgroups(): string[] {
    const set = new Set<string>()
    for (const row of this.rows) {
      if (row.subgroup.length > 0) set.add(row.subgroup)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru-RU'))
  }

  getDateIsos(): string[] {
    const set = new Set<string>()
    for (const row of this.rows) {
      if (row.dateIso) set.add(row.dateIso)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }

  filter(filter: ScheduleFilter): ScheduleLesson[] {
    const subgroupKey = fold(filter.subgroup)
    const selectedDateIso = filter.dateIso.trim()
    const globalQuery = fold(filter.global)

    return this.rows.filter((row) => {
      if (subgroupKey.length > 0 && subgroupKey !== '__all__' && fold(row.subgroup) !== subgroupKey) {
        return false
      }

      if (selectedDateIso.length > 0 && row.dateIso !== selectedDateIso) {
        return false
      }

      for (const column of SCHEDULE_COLUMN_ORDER) {
        const query = fold(filter.columns[column])
        if (query.length === 0) continue
        if (!fold(row.getValueByColumn(column)).includes(query)) return false
      }

      if (globalQuery.length > 0) {
        const hit = SCHEDULE_COLUMN_ORDER.some((column) => fold(row.getValueByColumn(column)).includes(globalQuery))
        if (!hit) return false
      }

      return true
    })
  }

  static buildStats(rows: ScheduleLesson[]): ScheduleStats {
    const toBucket = (values: Array<string | null | undefined>): ScheduleStatsBucket => {
      const map = new Map<string, number>()
      for (const value of values) {
        const label = (value ?? '').trim()
        if (label.length === 0) continue
        map.set(label, (map.get(label) ?? 0) + 1)
      }

      return Array.from(map.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count
          return a.label.localeCompare(b.label, 'ru-RU')
        })
    }

    return {
      buildings: toBucket(rows.map((r) => r.building)),
      teachers: toBucket(rows.map((r) => r.teacher)),
      weekdays: toBucket(rows.map((r) => r.weekday)),
    }
  }
}
