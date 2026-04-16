import * as React from 'react'
import { getRoomFillColor } from '../../map/rooms/utils/roomPalette'
import { formatRoomDescription } from '../../map/rooms/utils/stairDirection'
import {
  applyGraphicsPresetsById,
  applyGraphicsPresetsFromUnknown,
  buildGraphicsPresetsFilePayload,
  cloneGraphicsPresetsById,
  getGraphicsPresetsById,
  type GraphicsPresetId,
  type GraphicsPresetsById,
} from '../../map/graphicsPresets'
import { plansApiUrl, publicAssetUrl } from '../../map/rooms/utils/roomData'
import { buildLabel, floorLabel, isInteractiveRoom } from '../utils/roomLabels'
import { useSmartSearch } from '../search/useSmartSearch'
import type { SearchIndexedRoom } from '../search/types'
import type { OfficeLocation, OfficeNode } from '../offices/types'
import type { Room } from '../../map/rooms/utils/Room'
import { useAdminMode } from './buildmap/useAdminMode'
import { useMapDataLoader } from './buildmap/useMapDataLoader'
import { buildRouteTargetFromRoom, useRoutePlanner } from './buildmap/useRoutePlanner'
import {
  LOCATION_SPOOF,
  PLAN_CORNER_IDS,
  buildRealWorldCardinalLabels,
  buildValidGeoAnchors,
  mapGeoPointToOverlay,
  parseCoordInput,
  saveGeoAnchorsFileViaBrowserApi,
} from './buildmap/geoUtils'
import type { HoverRoomPayload, OpenRoomPayload, RoomEditPayload } from './buildmap/types'
import { buildGeoCalibration } from '../../navigation/geoProjection'
import { fetchScheduleBatchDataset, fetchScheduleManifest, type ScheduleManifest } from '../../schedule/api'
import { ScheduleDataset, type SchedulePeriodMode } from '../../schedule/domain'

function caseFold(value: string | null | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase('ru-RU')
}

const CORRIDOR_ROOM_ID = 1
const CORRIDOR_CATEGORY_KEY = caseFold('коридор')

function isCorridorRoom(room: Room): boolean {
  return room.roomID === CORRIDOR_ROOM_ID || caseFold(room.category) === CORRIDOR_CATEGORY_KEY
}

function normalizeRoomNoToken(value: string | null | undefined): string {
  return caseFold(value).replace(/\s+/g, '').replace(/^№/u, '')
}

function extractRoomNoFromCabinet(value: string | null | undefined): string | null {
  const text = String(value ?? '').trim()
  if (text.length === 0) return null

  const match = text.match(/\d+\s*-\s*([0-9A-Za-zА-Яа-я]+)/u)
  const roomNo = (match?.[1] ?? '').trim()
  return roomNo.length > 0 ? roomNo : null
}

function floorOrderValue(floorId: string): number {
  const match = floorId.match(/floor\s*(\d+)/i)
  if (!match) return Number.NaN
  return Number.parseInt(match[1], 10)
}

function floorCenter(rooms: Room[]): { x: number; y: number } {
  let sx = 0
  let sy = 0
  let count = 0

  for (const room of rooms) {
    for (const point of room.points) {
      sx += point.x
      sy += point.y
      count += 1
    }
  }

  if (count === 0) return { x: 0, y: 0 }
  return { x: sx / count, y: sy / count }
}

function buildNumberFromBuildId(buildId: string): string | null {
  const m = buildId.match(/(\d+)/)
  return m ? m[1] : null
}

function normalizeScheduleRoomToken(value: string | null | undefined): string {
  return caseFold(value).replace(/\s+/g, '')
}

function parseCabinetTarget(value: string | null | undefined): { building: string; roomToken: string } | null {
  const text = String(value ?? '').trim()
  if (text.length === 0) return null

  const m = text.match(/^(\d+)\s*[-–—]\s*([0-9A-Za-zА-Яа-я]+(?:\s*\/\s*[0-9A-Za-zА-Яа-я]+)?)/u)
  if (!m) return null

  const building = m[1]
  const roomToken = normalizeScheduleRoomToken(m[2])
  if (roomToken.length === 0) return null

  return { building, roomToken }
}

function parseScheduleBatchDateToIso(value: string): string {
  const m = value.match(/^(\d{2})\.(\d{2})\.(\d{2})$/)
  if (!m) return ''

  const day = Number.parseInt(m[1], 10)
  const month = Number.parseInt(m[2], 10)
  const year = 2000 + Number.parseInt(m[3], 10)
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return ''
  if (day < 1 || day > 31 || month < 1 || month > 12) return ''

  const dd = String(day).padStart(2, '0')
  const mm = String(month).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

function toIsoDateLocal(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseIsoDateOnly(value: string): Date | null {
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null

  const year = Number.parseInt(m[1], 10)
  const month = Number.parseInt(m[2], 10)
  const day = Number.parseInt(m[3], 10)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  const date = new Date(year, month - 1, day)
  if (Number.isNaN(date.getTime())) return null
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date
}

function getTodayIso(): string {
  return toIsoDateLocal(new Date())
}

function toWeekStartMondayIso(value: string): string {
  const parsed = parseIsoDateOnly(value)
  if (!parsed) return value

  const day = parsed.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  parsed.setDate(parsed.getDate() + mondayOffset)
  return toIsoDateLocal(parsed)
}

function dayDistanceFromIso(firstIso: string, secondIso: string): number | null {
  const first = parseIsoDateOnly(firstIso)
  const second = parseIsoDateOnly(secondIso)
  if (!first || !second) return null

  const firstUtc = Date.UTC(first.getFullYear(), first.getMonth(), first.getDate())
  const secondUtc = Date.UTC(second.getFullYear(), second.getMonth(), second.getDate())
  return Math.round((firstUtc - secondUtc) / 86400000)
}

function scheduleGroupLabelFromSourceFile(sourceFile: string): string {
  const value = sourceFile.trim()
  if (value.length === 0) return ''

  const noExt = value.replace(/\.csv$/i, '')
  // Parser fallback names can include technical suffixes like _20260411_193135.
  return noExt.replace(/_\d{8}_\d{6}$/u, '')
}

function uniqJoin(values: Array<string | null | undefined>, delimiter = ' / '): string {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const value of values) {
    const normalized = String(value ?? '').trim()
    if (normalized.length === 0) continue
    const key = caseFold(normalized)
    if (seen.has(key)) continue
    seen.add(key)
    ordered.push(normalized)
  }
  return ordered.join(delimiter)
}

function mapCounterToBucket(counter: Map<string, number>): Array<{ label: string; count: number }> {
  return Array.from(counter.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return a.label.localeCompare(b.label, 'ru-RU')
    })
}

function incrementCounter(counter: Map<string, number>, value: string | null | undefined, fallbackLabel: string): void {
  const label = String(value ?? '').trim() || fallbackLabel
  counter.set(label, (counter.get(label) ?? 0) + 1)
}

export function useBuildMapApp() {
  const {
    manifest,
    selectedBuild,
    selectedFloor,
    rooms,
    roomsLoading,
    error,
    roomGraph,
    buildFloorData,
    titleAnchor,
    officesHierarchy,
    geoDraftByBuild,
    setRooms,
    setSelectedBuild,
    setSelectedFloor,
    setBuildAndNormalizeFloor,
    setGeoDraftByBuild,
  } = useMapDataLoader()

  const {
    mapMode,
    routeFrom,
    routeTo,
    activeRouteEndpoint,
    routeDistanceM,
    routeSegments,
    routeFloorJumps,
    routeHints,
    routeAllFloors,
    routeTargetPoint,
    setMapMode,
    setRouteFrom,
    setActiveRouteEndpoint,
    applyRouteEndpoint,
    clearRouteMemory,
  } = useRoutePlanner({
    buildFloorData,
    selectedBuild,
    selectedFloor,
  })

  const {
    isAdminMode,
    toggleAdminMode,
    saveRoomChanges,
  } = useAdminMode({
    selectedBuild,
    selectedFloor,
    setRooms,
  })

  const [selectedRoomKey, setSelectedRoomKey] = React.useState<string | null>(null)
  const [hoveredRoom, setHoveredRoom] = React.useState<Room | null>(null)
  const [hoverAnchor, setHoverAnchor] = React.useState<{ x: number; y: number } | null>(null)
  const [modalAnchor, setModalAnchor] = React.useState<{ x: number; y: number } | null>(null)

  const searchInputRef = React.useRef<HTMLInputElement | null>(null)

  const [theme, setTheme] = React.useState<'light' | 'dark'>('light')
  const [graphicsPreset, setGraphicsPreset] = React.useState<GraphicsPresetId>('min')
  const [graphicsOpen, setGraphicsOpen] = React.useState(true)
  const [isGraphicsPresetsModalOpen, setIsGraphicsPresetsModalOpen] = React.useState(false)
  const [graphicsPresetsById, setGraphicsPresetsById] = React.useState<GraphicsPresetsById>(() => getGraphicsPresetsById())
  const [isSavingGraphicsPresets, setIsSavingGraphicsPresets] = React.useState(false)
  const [graphicsPresetsStatusText, setGraphicsPresetsStatusText] = React.useState<string | null>(null)
  const [graphicsPresetRefreshToken, setGraphicsPresetRefreshToken] = React.useState(0)
  const graphicsPresetsAutosaveTimerRef = React.useRef<number | null>(null)
  const graphicsPresetsAutosaveDraftRef = React.useRef<GraphicsPresetsById | null>(null)
  const graphicsPresetsSaveRequestSeqRef = React.useRef(0)
  const graphicsPresetsLastPreviewSignatureRef = React.useRef('')
  const [geoAdminOpen, setGeoAdminOpen] = React.useState(true)
  const [showGraphOverlay, setShowGraphOverlay] = React.useState(false)

  const [selectedCategory, setSelectedCategory] = React.useState<string>('__all__')
  const [searchText, setSearchText] = React.useState<string>('')
  const [searchResultJumpTrigger, setSearchResultJumpTrigger] = React.useState(0)
  const [pendingSearchJump, setPendingSearchJump] = React.useState<SearchIndexedRoom | null>(null)
  const [isScheduleModalOpen, setIsScheduleModalOpen] = React.useState(false)
  const [schedulePeriodMode, setSchedulePeriodMode] = React.useState<SchedulePeriodMode>('week')
  const [scheduleFocusDateIso, setScheduleFocusDateIso] = React.useState<string>(() => toWeekStartMondayIso(getTodayIso()))
  const [scheduleTeacherFilter, setScheduleTeacherFilter] = React.useState<string>('')
  const [scheduleGroupFilter, setScheduleGroupFilter] = React.useState<string>('')
  const [scheduleManifest, setScheduleManifest] = React.useState<ScheduleManifest | null>(null)
  const [scheduleDataset, setScheduleDataset] = React.useState<ScheduleDataset | null>(null)
  const [isScheduleLoading, setIsScheduleLoading] = React.useState(false)
  const [scheduleLoadError, setScheduleLoadError] = React.useState<string | null>(null)
  const scheduleDatasetByBatchDateRef = React.useRef<Map<string, ScheduleDataset>>(new Map())

  const [geoFileStatusText, setGeoFileStatusText] = React.useState<string | null>(null)
  const [isLocationTracking, setIsLocationTracking] = React.useState(false)
  const [isLocating, setIsLocating] = React.useState(false)
  const [locationStatusText, setLocationStatusText] = React.useState<string | null>(null)
  const locationTrackingRef = React.useRef(false)
  const locationPollTimerRef = React.useRef<number | null>(null)
  const locationRequestInFlightRef = React.useRef(false)

  const [userLocationOverlay, setUserLocationOverlay] = React.useState<{
    buildId: string
    mode: 'inside' | 'outside'
    x: number
    y: number
    distanceText?: string
    headingDeg?: number
    accuracyText?: string
  } | null>(null)

  const isTouchDevice = React.useMemo(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia?.('(pointer: coarse)').matches ?? false
  }, [])

  const selectedRoom = React.useMemo(() => {
    if (selectedRoomKey == null) return null
    return rooms.find((r) => r.key === selectedRoomKey) ?? null
  }, [rooms, selectedRoomKey])

  const selectedRoomScheduleLabel = React.useMemo(() => {
    return selectedRoom?.roomNo || ''
  }, [selectedRoom])

  const buildOptions = React.useMemo(() => {
    const builds = manifest?.builds ?? []
    return builds.map((b) => b.id)
  }, [manifest])

  const floorOptions = React.useMemo(() => {
    const b = (manifest?.builds ?? []).find((x) => x.id === selectedBuild)
    const floors = b?.floors ?? []
    return floors.length > 0 ? floors : [selectedFloor]
  }, [manifest, selectedBuild, selectedFloor])

  const titleText = React.useMemo(() => {
    return `${buildLabel(selectedBuild)}\n${floorLabel(selectedFloor)}`
  }, [selectedBuild, selectedFloor])

  React.useEffect(() => {
    let cancelled = false
    setScheduleLoadError(null)

    fetchScheduleManifest()
      .then((manifest) => {
        if (cancelled) return
        setScheduleManifest(manifest)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setScheduleDataset(new ScheduleDataset([]))
        setScheduleManifest({ dates: [] })
        setScheduleLoadError(error instanceof Error ? error.message : 'Не удалось загрузить расписание')
      })

    return () => {
      cancelled = true
    }
  }, [])

  const scheduleManifestEntriesByFocusDate = React.useMemo(() => {
    const entries = scheduleManifest?.dates ?? []
    if (entries.length === 0) return [] as ScheduleManifest['dates']

    const packageFocusDateIso = schedulePeriodMode === 'week'
      ? toWeekStartMondayIso(scheduleFocusDateIso)
      : scheduleFocusDateIso

    return entries
      .map((entry) => ({
        entry,
        packageDateIso: parseScheduleBatchDateToIso(entry.date),
      }))
      .filter(({ packageDateIso }) => packageDateIso.length > 0)
      .filter(({ packageDateIso }) => {
        const distance = dayDistanceFromIso(packageDateIso, packageFocusDateIso)
        return distance != null && Math.abs(distance) <= 14
      })
      .sort((a, b) => b.packageDateIso.localeCompare(a.packageDateIso))
      .map(({ entry }) => entry)
  }, [scheduleFocusDateIso, scheduleManifest, schedulePeriodMode])

  React.useEffect(() => {
    let cancelled = false

    if (scheduleManifestEntriesByFocusDate.length === 0) {
      setScheduleDataset(new ScheduleDataset([]))
      setIsScheduleLoading(false)
      return
    }

    setIsScheduleLoading(true)
    setScheduleLoadError(null)

    Promise.all(scheduleManifestEntriesByFocusDate.map(async (entry) => {
      const cached = scheduleDatasetByBatchDateRef.current.get(entry.date)
      if (cached) return cached

      const dataset = await fetchScheduleBatchDataset(entry.date, entry.files.map((file) => file.name))
      scheduleDatasetByBatchDateRef.current.set(entry.date, dataset)
      return dataset
    }))
      .then((datasets) => {
        if (cancelled) return
        setScheduleDataset(ScheduleDataset.merge(datasets))
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setScheduleDataset(new ScheduleDataset([]))
        setScheduleLoadError(error instanceof Error ? error.message : 'Не удалось загрузить расписание')
      })
      .finally(() => {
        if (cancelled) return
        setIsScheduleLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [scheduleManifestEntriesByFocusDate])

  const selectedBuildNumber = React.useMemo(() => buildNumberFromBuildId(selectedBuild), [selectedBuild])

  const knownScheduleBuildNumbers = React.useMemo(() => {
    const set = new Set<string>()
    for (const buildId of buildOptions) {
      const num = buildNumberFromBuildId(buildId)
      if (num) set.add(num)
    }
    return set
  }, [buildOptions])

  const roomTokenToKey = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const room of rooms) {
      if (!isInteractiveRoom(room)) continue
      const token = normalizeScheduleRoomToken(room.roomNo)
      if (token.length === 0) continue
      map.set(token, room.key)
    }
    return map
  }, [rooms])

  const scheduleRowsByPeriod = React.useMemo(() => {
    if (!scheduleDataset) return []
    return ScheduleDataset.rowsByPeriod(scheduleDataset.rows, schedulePeriodMode, scheduleFocusDateIso)
  }, [scheduleDataset, schedulePeriodMode, scheduleFocusDateIso])

  const scheduleTeacherOptions = React.useMemo(() => {
    if (!scheduleDataset) return [] as string[]
    const seen = new Set<string>()
    const values: string[] = []

    for (const row of scheduleDataset.rows) {
      const teacher = row.teacher.trim()
      if (teacher.length === 0) continue
      const key = caseFold(teacher)
      if (seen.has(key)) continue
      seen.add(key)
      values.push(teacher)
    }

    return values.sort((a, b) => a.localeCompare(b, 'ru-RU'))
  }, [scheduleDataset])

  const scheduleGroupOptions = React.useMemo(() => {
    if (!scheduleDataset) return [] as string[]
    const seen = new Set<string>()
    const values: string[] = []

    for (const row of scheduleDataset.rows) {
      const group = scheduleGroupLabelFromSourceFile(row.sourceFile)
      if (group.length === 0) continue
      const key = caseFold(group)
      if (seen.has(key)) continue
      seen.add(key)
      values.push(group)
    }

    return values.sort((a, b) => a.localeCompare(b, 'ru-RU'))
  }, [scheduleDataset])

  const scheduleTeacherSuggestions = React.useMemo(() => {
    const query = caseFold(scheduleTeacherFilter)
    const source = query.length > 0
      ? scheduleTeacherOptions.filter((option) => caseFold(option).includes(query))
      : scheduleTeacherOptions
    return source.slice(0, 120)
  }, [scheduleTeacherFilter, scheduleTeacherOptions])

  const scheduleGroupSuggestions = React.useMemo(() => {
    const query = caseFold(scheduleGroupFilter)
    const source = query.length > 0
      ? scheduleGroupOptions.filter((option) => caseFold(option).includes(query))
      : scheduleGroupOptions
    return source.slice(0, 120)
  }, [scheduleGroupFilter, scheduleGroupOptions])

  const scheduleRowsByPeriodFiltered = React.useMemo(() => {
    const teacherFilterQuery = caseFold(scheduleTeacherFilter)
    const groupFilterQuery = caseFold(scheduleGroupFilter)

    return scheduleRowsByPeriod.filter((row) => {
      if (teacherFilterQuery.length > 0) {
        if (!caseFold(row.teacher).includes(teacherFilterQuery)) return false
      }

      if (groupFilterQuery.length > 0) {
        const group = scheduleGroupLabelFromSourceFile(row.sourceFile)
        if (!caseFold(group).includes(groupFilterQuery)) return false
      }

      return true
    })
  }, [scheduleGroupFilter, scheduleRowsByPeriod, scheduleTeacherFilter])

  const scheduleStatsSummary = React.useMemo(() => {
    const buildingCounter = new Map<string, number>()
    const teacherCounter = new Map<string, number>()
    const groupCounter = new Map<string, number>()

    for (const row of scheduleRowsByPeriodFiltered) {
      const building = parseCabinetTarget(row.cabinet)?.building ?? ''
      const group = scheduleGroupLabelFromSourceFile(row.sourceFile)

      incrementCounter(buildingCounter, building, 'Не указан')
      incrementCounter(teacherCounter, row.teacher, 'Не указан')
      incrementCounter(groupCounter, group, 'Не указана')
    }

    return {
      totalLessons: scheduleRowsByPeriodFiltered.length,
      buildings: mapCounterToBucket(buildingCounter),
      teachers: mapCounterToBucket(teacherCounter),
      groups: mapCounterToBucket(groupCounter),
    }
  }, [scheduleRowsByPeriodFiltered])

  const scheduleRowsForSelectedBuild = React.useMemo(() => {
    if (!selectedBuildNumber) return [] as Array<{ roomToken: string; row: (typeof scheduleRowsByPeriod)[number] }>

    const filtered: Array<{ roomToken: string; row: (typeof scheduleRowsByPeriod)[number] }> = []
    const seen = new Set<string>()
    for (const row of scheduleRowsByPeriodFiltered) {
      const target = parseCabinetTarget(row.cabinet)
      if (!target) continue
      if (!knownScheduleBuildNumbers.has(target.building)) continue
      if (target.building !== selectedBuildNumber) continue

      const dedupKey = [
        scheduleGroupLabelFromSourceFile(row.sourceFile),
        row.date,
        row.weekday,
        row.time,
        row.subgroup,
        row.discipline,
        row.lessonType,
        row.teacher,
        row.cabinet,
      ].join('\u0001')
      if (seen.has(dedupKey)) continue
      seen.add(dedupKey)

      filtered.push({ roomToken: target.roomToken, row })
    }
    return filtered
  }, [knownScheduleBuildNumbers, scheduleRowsByPeriodFiltered, selectedBuildNumber])

  const scheduleHeatByRoomKey = React.useMemo(() => {
    const counts: Record<string, number> = {}
    const slotsByRoom = new Map<string, Set<string>>()

    for (const item of scheduleRowsForSelectedBuild) {
      const key = roomTokenToKey.get(item.roomToken)
      if (!key) continue
      const slotDate = item.row.dateIso ?? item.row.date
      const slotKey = `${slotDate}\u0001${item.row.time}`
      const slots = slotsByRoom.get(key) ?? new Set<string>()
      slots.add(slotKey)
      slotsByRoom.set(key, slots)
    }

    for (const [key, slots] of slotsByRoom) {
      counts[key] = slots.size
    }

    return counts
  }, [roomTokenToKey, scheduleRowsForSelectedBuild])

  const scheduleHeatMax = React.useMemo(() => {
    let max = 0
    for (const value of Object.values(scheduleHeatByRoomKey)) {
      if (value > max) max = value
    }
    return max
  }, [scheduleHeatByRoomKey])

  const scheduleRoomLessonsByKey = React.useMemo(() => {
    const map = new Map<string, Array<{
      groups: string[]
      date: string
      weekday: string
      time: string
      subgroup: string
      discipline: string
      lessonType: string
      teacher: string
      cabinet: string
      dateIso: string
    }>>()

    const groupedByRoomAndSlot = new Map<string, Map<string, Array<(typeof scheduleRowsForSelectedBuild)[number]['row']>>>()

    for (const item of scheduleRowsForSelectedBuild) {
      const roomKey = roomTokenToKey.get(item.roomToken)
      if (!roomKey) continue

      const slotDate = item.row.dateIso ?? item.row.date
      const slotKey = `${slotDate}\u0001${item.row.time}`
      const bySlot = groupedByRoomAndSlot.get(roomKey) ?? new Map()
      const slotRows = bySlot.get(slotKey) ?? []
      slotRows.push(item.row)
      bySlot.set(slotKey, slotRows)
      groupedByRoomAndSlot.set(roomKey, bySlot)
    }

    for (const [roomKey, bySlot] of groupedByRoomAndSlot) {
      const lessons: Array<{
        groups: string[]
        date: string
        weekday: string
        time: string
        subgroup: string
        discipline: string
        lessonType: string
        teacher: string
        cabinet: string
        dateIso: string
      }> = []

      for (const slotRows of bySlot.values()) {
        if (slotRows.length === 0) continue

        const first = slotRows[0]
        const groups = slotRows
          .map((row) => scheduleGroupLabelFromSourceFile(row.sourceFile))
          .filter((value) => value.length > 0)

        lessons.push({
          groups,
          date: first.date,
          weekday: first.weekday,
          time: first.time,
          subgroup: uniqJoin(slotRows.map((row) => row.subgroup)),
          discipline: uniqJoin(slotRows.map((row) => row.discipline)),
          lessonType: uniqJoin(slotRows.map((row) => row.lessonType)),
          teacher: uniqJoin(slotRows.map((row) => row.teacher)),
          cabinet: uniqJoin(slotRows.map((row) => row.cabinet)),
          dateIso: first.dateIso ?? '',
        })
      }

      map.set(roomKey, lessons)
    }

    for (const lessons of map.values()) {
      lessons.sort((a, b) => {
        const byDate = a.dateIso.localeCompare(b.dateIso)
        if (byDate !== 0) return byDate
        return a.time.localeCompare(b.time)
      })
    }

    return map
  }, [roomTokenToKey, scheduleRowsForSelectedBuild])

  const selectedRoomScheduleLessons = React.useMemo(() => {
    if (!selectedRoomKey) return []
    const rows = scheduleRoomLessonsByKey.get(selectedRoomKey) ?? []
    return rows.map(({ dateIso: _dateIso, ...rest }) => rest)
  }, [scheduleRoomLessonsByKey, selectedRoomKey])

  const categoryOptions = React.useMemo(() => {
    const byCaseFold = new Map<string, string>()
    for (const r of rooms) {
      if (!isInteractiveRoom(r) && !isCorridorRoom(r)) continue
      const label = (r.category ?? '').trim()
      if (label.length === 0) continue

      const key = caseFold(label)
      if (!byCaseFold.has(key)) byCaseFold.set(key, label)
    }
    return Array.from(byCaseFold.values()).sort((a, b) => a.localeCompare(b))
  }, [rooms])

  const selectedCategoryColor = React.useMemo(() => {
    if (selectedCategory === '__all__') return null
    const selectedCategoryKey = caseFold(selectedCategory)
    const isCorridorCategory = selectedCategoryKey === CORRIDOR_CATEGORY_KEY
    const match = rooms.find((r) => {
      const isCorridor = isCorridorRoom(r)
      if (!isInteractiveRoom(r) && !isCorridor) return false
      if (isCorridorCategory) return isCorridor
      return caseFold(r.category) === selectedCategoryKey
    })
    if (!match) return null
    return getRoomFillColor(match.roomID, match.category)
  }, [rooms, selectedCategory])

  const isFiltering = selectedCategory !== '__all__' || searchText.trim().length > 0

  const selectedGeoDraft = geoDraftByBuild[selectedBuild] ?? null

  const selectedGeoCalibration = React.useMemo(() => {
    if (!selectedGeoDraft) return null
    const anchors = buildValidGeoAnchors(selectedGeoDraft)
    return buildGeoCalibration(anchors, selectedGeoDraft.bounds)
  }, [selectedGeoDraft])

  const selectedGeoFilledCount = React.useMemo(() => {
    if (!selectedGeoDraft) return 0
    return buildValidGeoAnchors(selectedGeoDraft).length
  }, [selectedGeoDraft])

  const selectedGeoRealCardinalLabels = React.useMemo(() => {
    return buildRealWorldCardinalLabels(selectedGeoDraft)
  }, [selectedGeoDraft])

  const selectedGeoMarkers = React.useMemo(() => {
    if (!isAdminMode) return null
    if (!selectedGeoDraft) return null
    if (selectedFloor !== selectedGeoDraft.floorId) return null

    return PLAN_CORNER_IDS.map((id) => {
      const corner = selectedGeoDraft.corners[id]
      const lat = parseCoordInput(corner.latInput)
      const lon = parseCoordInput(corner.lonInput)
      return {
        id,
        x: corner.mapX,
        y: corner.mapY,
        label: corner.label,
        isFilled: lat != null && lon != null,
      }
    })
  }, [isAdminMode, selectedFloor, selectedGeoDraft])

  const activeUserLocationOverlay = React.useMemo(() => {
    if (!userLocationOverlay) return null
    if (userLocationOverlay.buildId !== selectedBuild) return null

    return {
      mode: userLocationOverlay.mode,
      x: userLocationOverlay.x,
      y: userLocationOverlay.y,
      distanceText: userLocationOverlay.distanceText,
      headingDeg: userLocationOverlay.headingDeg,
      accuracyText: userLocationOverlay.accuracyText,
    }
  }, [selectedBuild, userLocationOverlay])

  const routeEndpointGeoControl = React.useMemo(() => {
    if (mapMode !== 'routes') return null
    if (!routeTo) return null

    const targetPoint = routeTargetPoint && routeTargetPoint.floorId === selectedFloor
      ? routeTargetPoint
      : null
    const fallbackPoint = floorCenter(rooms)
    const x = targetPoint?.x ?? fallbackPoint.x
    const y = targetPoint?.y ?? fallbackPoint.y

    if (routeTo.floorId === selectedFloor && targetPoint) {
      return {
        x,
        y,
        mode: 'cancel' as const,
        icon: '✖',
        text: 'Финиш',
        targetFloorId: null,
      }
    }

    if (routeAllFloors.length === 1 && routeAllFloors[0] === routeTo.floorId) {
      const currentOrder = floorOrderValue(selectedFloor)
      const targetOrder = floorOrderValue(routeTo.floorId)
      if (Number.isFinite(currentOrder) && Number.isFinite(targetOrder) && currentOrder !== targetOrder) {
        const isUp = targetOrder > currentOrder
        return {
          x,
          y,
          mode: 'jump-floor' as const,
          icon: isUp ? '⬆️' : '⬇️',
          text: isUp ? 'Маршрут выше' : 'Маршрут ниже',
          targetFloorId: routeTo.floorId,
        }
      }
    }

    return null
  }, [mapMode, rooms, routeAllFloors, routeTargetPoint, routeTo, selectedFloor])

  const matchedKeys = React.useMemo(() => {
    if (!isFiltering) return null
    const q = caseFold(searchText)
    const selectedCategoryKey = selectedCategory === '__all__' ? '' : caseFold(selectedCategory)
    const isCorridorCategory = selectedCategoryKey === CORRIDOR_CATEGORY_KEY
    const set = new Set<string>()

    for (const r of rooms) {
      const isCorridor = isCorridorRoom(r)
      if (!isInteractiveRoom(r) && !isCorridor) continue
      const category = caseFold(r.category)
      const roomNo = (r.roomNo ?? '').trim()
      const description = formatRoomDescription(r.roomID, r.description)

      if (selectedCategoryKey.length > 0) {
        if (isCorridorCategory) {
          if (!isCorridor) continue
        } else if (category !== selectedCategoryKey) {
          continue
        }
      }

      if (q.length > 0) {
        const ok = caseFold(roomNo).includes(q) || caseFold(description).includes(q)
        if (!ok) continue
      }

      set.add(r.key)
    }

    return set
  }, [isFiltering, rooms, searchText, selectedCategory])

  const smartSearchData = useSmartSearch({ manifest, selectedBuild, searchText, isInteractiveRoom })

  const totalRooms = React.useMemo(
    () => rooms.filter((room) => isInteractiveRoom(room) && !isCorridorRoom(room)).length,
    [rooms],
  )
  const matchedRooms = matchedKeys ? matchedKeys.size : totalRooms

  const bumpGraphicsPresetRefreshToken = React.useCallback(() => {
    setGraphicsPresetRefreshToken((value) => (value + 1) % 1000000000)
  }, [])

  const clearGraphicsPresetsAutosaveTimer = React.useCallback(() => {
    if (graphicsPresetsAutosaveTimerRef.current == null) return
    window.clearTimeout(graphicsPresetsAutosaveTimerRef.current)
    graphicsPresetsAutosaveTimerRef.current = null
  }, [])

  React.useEffect(() => {
    return () => {
      clearGraphicsPresetsAutosaveTimer()
    }
  }, [clearGraphicsPresetsAutosaveTimer])

  const persistGraphicsPresetsById = React.useCallback(async (nextPresetsById: GraphicsPresetsById) => {
    if (!isAdminMode) return

    const requestSeq = graphicsPresetsSaveRequestSeqRef.current + 1
    graphicsPresetsSaveRequestSeqRef.current = requestSeq
    setIsSavingGraphicsPresets(true)

    const payload = buildGraphicsPresetsFilePayload(nextPresetsById)
    let response: Response

    try {
      response = await fetch(plansApiUrl('/api/admin/graphics/presets'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
    } catch {
      if (graphicsPresetsSaveRequestSeqRef.current !== requestSeq) return
      setIsSavingGraphicsPresets(false)
      setGraphicsPresetsStatusText('Ошибка автосохранения: сервер недоступен')
      return
    }

    if (!response.ok) {
      if (graphicsPresetsSaveRequestSeqRef.current !== requestSeq) return
      setIsSavingGraphicsPresets(false)
      const details = (await response.text()).trim()
      setGraphicsPresetsStatusText(
        details.length > 0 ? `Ошибка автосохранения: ${details}` : `Ошибка автосохранения (${response.status})`,
      )
      return
    }

    if (graphicsPresetsSaveRequestSeqRef.current !== requestSeq) return

    const appliedPresets = cloneGraphicsPresetsById(nextPresetsById)
    applyGraphicsPresetsById(appliedPresets)
    setGraphicsPresetsById(getGraphicsPresetsById())
    bumpGraphicsPresetRefreshToken()
    setGraphicsPresetsStatusText('Автосохранено в public/graphics_presets.json')
    setIsSavingGraphicsPresets(false)
  }, [bumpGraphicsPresetRefreshToken, isAdminMode])

  const scheduleGraphicsPresetsAutosave = React.useCallback((nextPresetsById: GraphicsPresetsById) => {
    graphicsPresetsAutosaveDraftRef.current = cloneGraphicsPresetsById(nextPresetsById)
    setGraphicsPresetsStatusText('Автосохранение...')
    clearGraphicsPresetsAutosaveTimer()

    graphicsPresetsAutosaveTimerRef.current = window.setTimeout(() => {
      const draft = graphicsPresetsAutosaveDraftRef.current
      graphicsPresetsAutosaveTimerRef.current = null
      if (!draft) return
      void persistGraphicsPresetsById(draft)
    }, 320)
  }, [clearGraphicsPresetsAutosaveTimer, persistGraphicsPresetsById])

  React.useEffect(() => {
    let cancelled = false

    fetch(publicAssetUrl('graphics_presets.json'))
      .then(async (response) => {
        if (!response.ok) return null
        const data: unknown = await response.json()
        return data
      })
      .then((data) => {
        if (cancelled || !data) return
        const applied = applyGraphicsPresetsFromUnknown(data)
        if (!applied) return
        setGraphicsPresetsById(getGraphicsPresetsById())
        bumpGraphicsPresetRefreshToken()
      })
      .catch(() => {
        if (cancelled) return
      })

    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (selectedRoomKey == null) return
    const room = rooms.find((x) => x.key === selectedRoomKey)
    if (!isAdminMode && room && !isInteractiveRoom(room)) {
      setSelectedRoomKey(null)
      setModalAnchor(null)
    }
  }, [isAdminMode, rooms, selectedRoomKey])

  React.useEffect(() => {
    if (!pendingSearchJump) return
    if (selectedBuild !== pendingSearchJump.buildId) return
    if (selectedFloor !== pendingSearchJump.floorId) return
    if (roomsLoading) return

    requestAnimationFrame(() => {
      const pendingRoomNo = normalizeRoomNoToken(pendingSearchJump.roomNo)
      const roomByRoomNo = pendingRoomNo.length > 0
        ? rooms.find((room) => normalizeRoomNoToken(room.roomNo) === pendingRoomNo)
        : null
      const fallbackKey = pendingSearchJump.key.trim().length > 0 ? pendingSearchJump.key : null
      setSelectedRoomKey(roomByRoomNo?.key ?? fallbackKey)
      setModalAnchor(null)
      setSearchResultJumpTrigger((v) => v + 1)
      setPendingSearchJump(null)
    })
  }, [pendingSearchJump, rooms, roomsLoading, selectedBuild, selectedFloor])

  React.useEffect(() => {
    if (mapMode !== 'routes') return
    setModalAnchor(null)
  }, [mapMode])

  const onBuildChange = React.useCallback((next: string) => {
    setBuildAndNormalizeFloor(next)
  }, [setBuildAndNormalizeFloor])

  const onClearSearch = React.useCallback(() => {
    setSearchText('')
    setSelectedCategory('__all__')
    requestAnimationFrame(() => searchInputRef.current?.focus())
  }, [])

  const onPickSearchRoom = React.useCallback((item: SearchIndexedRoom) => {
    setSelectedCategory('__all__')
    setSelectedBuild(item.buildId)
    setSelectedFloor(item.floorId)
    setSearchText(item.roomNo.length > 0 ? item.roomNo : item.description)
    setPendingSearchJump(item)

    if (mapMode === 'routes') {
      applyRouteEndpoint(activeRouteEndpoint, {
        buildId: item.buildId,
        floorId: item.floorId,
        roomKey: item.key,
        label: item.roomNo.length > 0 ? `№ ${item.roomNo}` : item.description,
      })
    }
  }, [activeRouteEndpoint, applyRouteEndpoint, mapMode, setSelectedBuild, setSelectedFloor])

  const onPickSearchCategory = React.useCallback((category: string) => {
    const targetKey = caseFold(category)
    const canonical = categoryOptions.find((option) => caseFold(option) === targetKey) ?? category.trim()
    setSelectedCategory(canonical.length > 0 ? canonical : category)
    setSearchText('')
  }, [categoryOptions])

  const onToggleTheme = React.useCallback(() => {
    setTheme((current) => (current === 'light' ? 'dark' : 'light'))
  }, [])

  const clearLocationPollingTimer = React.useCallback(() => {
    if (locationPollTimerRef.current != null) {
      window.clearInterval(locationPollTimerRef.current)
      locationPollTimerRef.current = null
    }
  }, [])

  const requestUserLocation = React.useCallback(() => {
    if (!locationTrackingRef.current) return

    if (!selectedGeoCalibration) {
      setUserLocationOverlay(null)
      setIsLocating(false)
      setLocationStatusText('Заполните координаты 4 углов для этого корпуса в админ-режиме')
      return
    }

    if (LOCATION_SPOOF) {
      const mapped = mapGeoPointToOverlay(selectedGeoCalibration, LOCATION_SPOOF, selectedBuild)
      setUserLocationOverlay(mapped.overlay)
      setLocationStatusText(`Тестовые координаты: ${mapped.statusText}`)
      setIsLocating(false)
      return
    }

    if (!navigator.geolocation) {
      setUserLocationOverlay(null)
      setIsLocating(false)
      setLocationStatusText('Геолокация не поддерживается в этом браузере')
      return
    }

    if (locationRequestInFlightRef.current) return

    locationRequestInFlightRef.current = true

    setIsLocating(true)
    setLocationStatusText('Уточняем текущее местоположение…')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        locationRequestInFlightRef.current = false
        if (!locationTrackingRef.current) return

        const mapped = mapGeoPointToOverlay(
          selectedGeoCalibration,
          { lat: position.coords.latitude, lon: position.coords.longitude },
          selectedBuild,
          position.coords.accuracy,
        )
        setUserLocationOverlay(mapped.overlay)
        setLocationStatusText(mapped.statusText)
        setIsLocating(false)
      },
      (geoError) => {
        locationRequestInFlightRef.current = false
        if (!locationTrackingRef.current) return

        setUserLocationOverlay(null)
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setLocationStatusText('Доступ к геолокации запрещён пользователем')
        } else if (geoError.code === geoError.TIMEOUT) {
          setLocationStatusText('Не удалось определить координаты: истекло время ожидания')
        } else {
          setLocationStatusText('Не удалось определить текущую геопозицию')
        }
        setIsLocating(false)
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      },
    )
  }, [selectedBuild, selectedGeoCalibration])

  React.useEffect(() => {
    if (!isLocationTracking) {
      clearLocationPollingTimer()
      locationRequestInFlightRef.current = false
      setIsLocating(false)
      return
    }

    requestUserLocation()
    locationPollTimerRef.current = window.setInterval(() => {
      requestUserLocation()
    }, 2500)

    return () => {
      clearLocationPollingTimer()
    }
  }, [clearLocationPollingTimer, isLocationTracking, requestUserLocation])

  const locateUserOnMap = React.useCallback(() => {
    if (isLocationTracking) {
      locationTrackingRef.current = false
      setIsLocationTracking(false)
      locationRequestInFlightRef.current = false
      setIsLocating(false)
      setUserLocationOverlay(null)
      setLocationStatusText(null)
      return
    }

    locationTrackingRef.current = true
    setIsLocationTracking(true)
    setLocationStatusText('Определяем текущее местоположение…')
  }, [isLocationTracking])

  const onToggleGraphicsPanel = React.useCallback(() => {
    setGraphicsOpen((current) => !current)
  }, [])

  const openGraphicsPresetsModal = React.useCallback(() => {
    if (!isAdminMode) {
      window.alert('Подробная настройка пресетов доступна только в админ-режиме')
      return
    }

    const currentPresets = getGraphicsPresetsById()
    setGraphicsPresetsById(currentPresets)
    graphicsPresetsLastPreviewSignatureRef.current = JSON.stringify(currentPresets)
    setGraphicsPresetsStatusText(null)
    setIsGraphicsPresetsModalOpen(true)
  }, [isAdminMode])

  const onGraphicsPresetsEditorActivePresetChange = React.useCallback((presetId: GraphicsPresetId) => {
    setGraphicsPreset((current) => (current === presetId ? current : presetId))
  }, [])

  const previewGraphicsPresetsDraft = React.useCallback((nextPresetsById: GraphicsPresetsById) => {
    const appliedPresets = cloneGraphicsPresetsById(nextPresetsById)
    const signature = JSON.stringify(appliedPresets)
    if (signature === graphicsPresetsLastPreviewSignatureRef.current) return
    graphicsPresetsLastPreviewSignatureRef.current = signature

    applyGraphicsPresetsById(appliedPresets)
    setGraphicsPresetsById(appliedPresets)
    bumpGraphicsPresetRefreshToken()
    scheduleGraphicsPresetsAutosave(appliedPresets)
  }, [bumpGraphicsPresetRefreshToken, scheduleGraphicsPresetsAutosave])

  const closeGraphicsPresetsModal = React.useCallback(() => {
    const pendingDraft = graphicsPresetsAutosaveDraftRef.current
    if (pendingDraft) {
      clearGraphicsPresetsAutosaveTimer()
      void persistGraphicsPresetsById(pendingDraft)
    }
    setIsGraphicsPresetsModalOpen(false)
  }, [clearGraphicsPresetsAutosaveTimer, persistGraphicsPresetsById])

  const onToggleGeoAdminPanel = React.useCallback(() => {
    setGeoAdminOpen((current) => !current)
  }, [])

  const onToggleGraphOverlay = React.useCallback(() => {
    setShowGraphOverlay((current) => !current)
  }, [])

  const onRouteFloorJump = React.useCallback((targetFloorId: string) => {
    setSelectedFloor(targetFloorId)
  }, [setSelectedFloor])

  const onSelectRoomKey = React.useCallback((key: string | null) => {
    if (mapMode === 'routes') {
      setSelectedRoomKey(null)
      setModalAnchor(null)
      if (key != null) {
        const room = rooms.find((r) => r.key === key)
        if (room && isInteractiveRoom(room)) {
          applyRouteEndpoint(activeRouteEndpoint, buildRouteTargetFromRoom(room, selectedBuild, selectedFloor))
        }
      }
      return
    }

    setSelectedRoomKey(key)
    if (key == null) setModalAnchor(null)
  }, [activeRouteEndpoint, applyRouteEndpoint, mapMode, rooms, selectedBuild, selectedFloor])

  const onOpenRoom = React.useCallback(({ clientX, clientY }: OpenRoomPayload) => {
    if (mapMode === 'routes') return
    setModalAnchor({ x: clientX, y: clientY })
  }, [mapMode])

  const onHoverRoom = React.useCallback((payload: HoverRoomPayload) => {
    if (!payload) {
      setHoveredRoom(null)
      setHoverAnchor(null)
      return
    }
    setHoveredRoom(payload.room)
    setHoverAnchor({ x: payload.clientX, y: payload.clientY })
  }, [])

  const onBuildRouteFromRoom = React.useCallback((room: Room) => {
    setMapMode('routes')
    applyRouteEndpoint(activeRouteEndpoint, buildRouteTargetFromRoom(room, selectedBuild, selectedFloor))
  }, [activeRouteEndpoint, applyRouteEndpoint, selectedBuild, selectedFloor, setMapMode])

  const onSaveSelectedRoomChanges = React.useCallback(async (changes: RoomEditPayload) => {
    if (!selectedRoom) throw new Error('Комната не выбрана')
    await saveRoomChanges(selectedRoom, changes)
  }, [saveRoomChanges, selectedRoom])

  const onCloseRoomModal = React.useCallback(() => {
    setSelectedRoomKey(null)
    setModalAnchor(null)
  }, [])

  const openOfficeOnMap = React.useCallback((location: OfficeLocation, node: OfficeNode) => {
    const roomNoFromCabinet = extractRoomNoFromCabinet(node.cabinet)
    const roomNoForSearch = roomNoFromCabinet ?? location.roomNo

    setMapMode('normal')
    setSelectedCategory('__all__')
    setSelectedBuild(location.buildId)
    setSelectedFloor(location.floorId)
    setSearchText(roomNoForSearch)
    setPendingSearchJump({
      key: location.roomKey,
      buildId: location.buildId,
      floorId: location.floorId,
      roomNo: roomNoForSearch,
      description: node.name,
      category: node.type,
    })
  }, [setMapMode, setSelectedBuild, setSelectedFloor])

  const updateGeoCornerInput = React.useCallback((cornerId: typeof PLAN_CORNER_IDS[number], field: 'latInput' | 'lonInput', value: string) => {
    setGeoDraftByBuild((prev) => {
      const draft = prev[selectedBuild]
      if (!draft) return prev
      return {
        ...prev,
        [selectedBuild]: {
          ...draft,
          corners: {
            ...draft.corners,
            [cornerId]: {
              ...draft.corners[cornerId],
              [field]: value,
            },
          },
        },
      }
    })
  }, [selectedBuild, setGeoDraftByBuild])

  const clearSelectedBuildGeoInputs = React.useCallback(() => {
    setGeoDraftByBuild((prev) => {
      const draft = prev[selectedBuild]
      if (!draft) return prev
      const nextCorners = { ...draft.corners }
      for (const id of PLAN_CORNER_IDS) {
        nextCorners[id] = {
          ...nextCorners[id],
          latInput: '',
          lonInput: '',
        }
      }
      return {
        ...prev,
        [selectedBuild]: {
          ...draft,
          corners: nextCorners,
        },
      }
    })
  }, [selectedBuild, setGeoDraftByBuild])

  const saveSelectedBuildGeoToFile = React.useCallback(async () => {
    const draft = geoDraftByBuild[selectedBuild]
    if (!draft) return

    const result = await saveGeoAnchorsFileViaBrowserApi(draft)
    if (result === 'saved') {
      setGeoFileStatusText(`Сохранено в файл корпуса ${draft.buildId}/geo_anchors.json`)
      return
    }
    if (result === 'downloaded') {
      setGeoFileStatusText('JSON скачан. Поместите его в папку корпуса: <build>/geo_anchors.json')
      return
    }
    setGeoFileStatusText('Сохранение отменено')
  }, [geoDraftByBuild, selectedBuild])

  const onSetRouteModeNormal = React.useCallback(() => {
    setMapMode('normal')
    setIsScheduleModalOpen(false)
  }, [setMapMode])

  const onSetRouteModeRoutes = React.useCallback(() => {
    setMapMode('routes')
    setIsScheduleModalOpen(false)
    setSelectedRoomKey(null)
    setModalAnchor(null)
  }, [setMapMode])

  const onSetRouteModeSchedule = React.useCallback(() => {
    setMapMode('schedule')
    setSelectedRoomKey(null)
    setModalAnchor(null)
  }, [setMapMode])

  const onOpenScheduleModal = React.useCallback(() => {
    setIsScheduleModalOpen(true)
  }, [])

  const onCloseScheduleModal = React.useCallback(() => {
    setIsScheduleModalOpen(false)
  }, [])

  const onSetSchedulePeriodMode = React.useCallback((mode: SchedulePeriodMode) => {
    setSchedulePeriodMode(mode)
    if (mode === 'week') {
      setScheduleFocusDateIso(toWeekStartMondayIso(getTodayIso()))
      return
    }

    setScheduleFocusDateIso((current) => {
      if (parseIsoDateOnly(current)) return current
      return getTodayIso()
    })
  }, [])

  const onSetScheduleFocusDate = React.useCallback((dateIso: string) => {
    const parsed = parseIsoDateOnly(dateIso)
    if (!parsed) return

    const normalized = toIsoDateLocal(parsed)
    setScheduleFocusDateIso(schedulePeriodMode === 'week' ? toWeekStartMondayIso(normalized) : normalized)
  }, [schedulePeriodMode])

  const onSetScheduleTeacherFilter = React.useCallback((value: string) => {
    setScheduleTeacherFilter(value)
  }, [])

  const onSetScheduleGroupFilter = React.useCallback((value: string) => {
    setScheduleGroupFilter(value)
  }, [])

  const onSetActiveRouteFrom = React.useCallback(() => {
    setActiveRouteEndpoint('from')
  }, [setActiveRouteEndpoint])

  const onSetActiveRouteTo = React.useCallback(() => {
    setActiveRouteEndpoint('to')
  }, [setActiveRouteEndpoint])

  const onSetMainEntrance = React.useCallback(() => {
    setRouteFrom(null)
  }, [setRouteFrom])

  const onRouteEndpointGeoAction = React.useCallback((mode: 'jump-floor' | 'cancel', targetFloorId: string | null) => {
    if (mode === 'jump-floor' && targetFloorId) {
      setSelectedFloor(targetFloorId)
      return
    }

    if (mode === 'cancel') {
      clearRouteMemory()
      setMapMode('normal')
      setSelectedRoomKey(null)
      setModalAnchor(null)
    }
  }, [clearRouteMemory, setMapMode, setSelectedFloor])

  return {
    error,
    rooms,
    selectedRoomKey,
    hoveredRoom,
    hoverAnchor,
    searchInputRef,
    theme,
    graphicsPreset,
    graphicsPresetRefreshToken,
    graphicsOpen,
    isGraphicsPresetsModalOpen,
    graphicsPresetsById,
    isSavingGraphicsPresets,
    graphicsPresetsStatusText,
    geoAdminOpen,
    selectedBuild,
    selectedFloor,
    titleAnchor,
    selectedCategory,
    searchText,
    searchResultJumpTrigger,
    isScheduleModalOpen,
    schedulePeriodMode,
    scheduleFocusDateIso,
    scheduleTeacherFilter,
    scheduleGroupFilter,
    scheduleTeacherOptions,
    scheduleGroupOptions,
    scheduleTeacherSuggestions,
    scheduleGroupSuggestions,
    scheduleStatsSummary,
    isScheduleLoading,
    scheduleLoadError,
    roomGraph,
    mapMode,
    routeFrom,
    routeTo,
    activeRouteEndpoint,
    routeDistanceM,
    routeSegments,
    routeFloorJumps,
    routeHints,
    showGraphOverlay,
    officesHierarchy,
    isAdminMode,
    geoFileStatusText,
    isLocationTracking,
    isLocating,
    locationStatusText,
    modalAnchor,
    isTouchDevice,
    selectedRoom,
    buildOptions,
    floorOptions,
    titleText,
    categoryOptions,
    selectedCategoryColor,
    selectedGeoDraft,
    selectedGeoFilledCount,
    selectedGeoRealCardinalLabels,
    selectedGeoMarkers,
    activeUserLocationOverlay,
    routeEndpointGeoControl,
    scheduleHeatByRoomKey,
    scheduleHeatMax,
    matchedKeys,
    smartSearchData,
    totalRooms,
    matchedRooms,
    geoCornerIds: PLAN_CORNER_IDS,

    setSelectedFloor,
    setGraphicsPreset,
    setMapMode,
    setSearchText,
    setSelectedCategory,
    setActiveRouteEndpoint,
    setRouteFrom,

    onBuildChange,
    onClearSearch,
    onPickSearchRoom,
    onPickSearchCategory,
    onToggleTheme,
    toggleAdminMode,
    locateUserOnMap,
    onToggleGraphicsPanel,
    onGraphicsPresetsEditorActivePresetChange,
    previewGraphicsPresetsDraft,
    openGraphicsPresetsModal,
    closeGraphicsPresetsModal,
    onToggleGeoAdminPanel,
    onToggleGraphOverlay,
    onRouteFloorJump,
    onSelectRoomKey,
    onOpenRoom,
    onHoverRoom,
    saveRoomChanges,
    onSaveSelectedRoomChanges,
    onBuildRouteFromRoom,
    onCloseRoomModal,
    updateGeoCornerInput,
    clearSelectedBuildGeoInputs,
    saveSelectedBuildGeoToFile,
    openOfficeOnMap,
    onSetRouteModeNormal,
    onSetRouteModeRoutes,
    onSetRouteModeSchedule,
    onOpenScheduleModal,
    onCloseScheduleModal,
    onSetSchedulePeriodMode,
    onSetScheduleFocusDate,
    onSetScheduleTeacherFilter,
    onSetScheduleGroupFilter,
    onSetActiveRouteFrom,
    onSetActiveRouteTo,
    onSetMainEntrance,
    onRouteEndpointGeoAction,
    selectedRoomScheduleLabel,
    selectedRoomScheduleLessons,
  }
}
