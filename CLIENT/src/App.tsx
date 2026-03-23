import * as React from 'react'
import './App.css'
import { FloorPlanCanvas } from './map/FloorPlanCanvas'
import {
  computeBounds,
  loadRoomDataManifest,
  loadRoomGraphFromPublic,
  loadRoomsFromPublic,
  publicAssetUrl,
  roomsToPolygons,
  type RoomDataManifest,
  type RoomGraph,
} from './map/rooms/utils/roomData'
import { RoomInfoModal } from './map/rooms/components/RoomInfoModal'
import { RoomHoverTooltip } from './map/rooms/components/RoomHoverTooltip'
import { getRoomFillColor } from './map/rooms/utils/roomPalette'
import { type GraphicsPresetId } from './map/graphicsPresets'
import { TopBar } from './components/app/TopBar'
import { FloorsPanel } from './components/app/FloorsPanel'
import { GraphicsPanel } from './components/app/GraphicsPanel'
import { OfficesDirectory } from './components/app/OfficesDirectory'
import { buildLabel, findTitleAnchorFromFloor1, floorLabel, isInteractiveRoom } from './app/utils/roomLabels'
import { useSmartSearch } from './app/search/useSmartSearch'
import type { SearchIndexedRoom } from './app/search/types'
import { buildRouteHints } from './navigation/hints'
import { computeRoute } from './navigation/routeEngine'
import {
  buildGeoCalibration,
  formatDistanceHuman,
  projectUserToMap,
  type GeoAnchor,
} from './navigation/geoProjection'
import type { LoadedFloorData, RouteEndpoint, RouteFloorJump, RouteSegment, RouteTarget } from './navigation/types'
import type { OfficeLocation, OfficeNode, OfficesHierarchyData } from './app/offices/types'

import type { Room } from './map/rooms/utils/Room'

type MapMode = 'normal' | 'routes'

type GeoCornerKey = 'nw' | 'ne' | 'se' | 'sw'

type GeoCornerDraft = {
  id: GeoCornerKey
  label: string
  mapX: number
  mapY: number
  latInput: string
  lonInput: string
}

type BuildGeoDraft = {
  buildId: string
  floorId: string
  bounds: {
    minX: number
    maxX: number
    minY: number
    maxY: number
  }
  corners: Record<GeoCornerKey, GeoCornerDraft>
}

type UserLocationOverlay = {
  buildId: string
  mode: 'inside' | 'outside'
  x: number
  y: number
  distanceText?: string
  headingDeg?: number
  accuracyText?: string
}

type SavedGeoAnchorsFile = {
  version: number
  buildId: string
  floorId: string
  corners: Partial<Record<GeoCornerKey, { lat: number | null; lon: number | null }>>
}

// Temporary test spoof. Set to null to restore real browser geolocation.
const LOCATION_SPOOF: { lat: number; lon: number } | null = {
  lat: 58.591126,
  lon: 49.680707
}
// const LOCATION_SPOOF: { lat: number; lon: number } | null = null;

type RoomEditPayload = {
  roomNo?: string
  category?: string
  description?: string
  areClosed?: boolean
  areaM2?: number
  build?: string | null
  floor?: string | null
}

function normalizeText(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function applyRoomChangesLocal(room: Room, changes: RoomEditPayload): Room {
  return {
    ...room,
    roomNo: normalizeText(changes.roomNo),
    category: normalizeText(changes.category),
    description: normalizeText(changes.description),
    areClosed: changes.areClosed,
    areaM2: typeof changes.areaM2 === 'number' && Number.isFinite(changes.areaM2) ? changes.areaM2 : undefined,
    build: changes.build ?? null,
    floor: changes.floor ?? null,
  }
}

function parseCoordInput(value: string): number | null {
  const cleaned = value.trim().replace(',', '.')
  if (cleaned.length === 0) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

type XY = { x: number; y: number }
const PLAN_CORNER_IDS: GeoCornerKey[] = ['nw', 'ne', 'se', 'sw']

function snapCornerToNearestWallVertex(corner: XY, polygons: Array<{ points: XY[] }>): XY {
  let best: XY | null = null
  let bestDist = Number.POSITIVE_INFINITY

  for (const poly of polygons) {
    for (const p of poly.points) {
      const dist = Math.hypot(p.x - corner.x, p.y - corner.y)
      if (dist < bestDist) {
        bestDist = dist
        best = p
      }
    }
  }

  return best ?? corner
}

function buildSnappedCorners(bounds: { minX: number; maxX: number; minY: number; maxY: number }, polygons: Array<{ points: XY[] }>): Record<GeoCornerKey, XY> {
  const boxCorners: Record<GeoCornerKey, XY> = {
    nw: { x: bounds.minX, y: bounds.maxY },
    ne: { x: bounds.maxX, y: bounds.maxY },
    se: { x: bounds.maxX, y: bounds.minY },
    sw: { x: bounds.minX, y: bounds.minY },
  }

  return {
    nw: snapCornerToNearestWallVertex(boxCorners.nw, polygons),
    ne: snapCornerToNearestWallVertex(boxCorners.ne, polygons),
    se: snapCornerToNearestWallVertex(boxCorners.se, polygons),
    sw: snapCornerToNearestWallVertex(boxCorners.sw, polygons),
  }
}

function makeDefaultGeoCorners(
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  snapped?: Partial<Record<GeoCornerKey, XY>>,
): Record<GeoCornerKey, GeoCornerDraft> {
  const nw = snapped?.nw ?? { x: bounds.minX, y: bounds.maxY }
  const ne = snapped?.ne ?? { x: bounds.maxX, y: bounds.maxY }
  const se = snapped?.se ?? { x: bounds.maxX, y: bounds.minY }
  const sw = snapped?.sw ?? { x: bounds.minX, y: bounds.minY }

  return {
    nw: {
      id: 'nw',
      label: 'Верхний левый (на плане)',
      mapX: nw.x,
      mapY: nw.y,
      latInput: '',
      lonInput: '',
    },
    ne: {
      id: 'ne',
      label: 'Верхний правый (на плане)',
      mapX: ne.x,
      mapY: ne.y,
      latInput: '',
      lonInput: '',
    },
    se: {
      id: 'se',
      label: 'Нижний правый (на плане)',
      mapX: se.x,
      mapY: se.y,
      latInput: '',
      lonInput: '',
    },
    sw: {
      id: 'sw',
      label: 'Нижний левый (на плане)',
      mapX: sw.x,
      mapY: sw.y,
      latInput: '',
      lonInput: '',
    },
  }
}

function parseGeoAnchorsFromFile(raw: unknown): Partial<Record<GeoCornerKey, { latInput: string; lonInput: string }>> {
  if (!raw || typeof raw !== 'object') return {}
  const anyRaw = raw as Record<string, unknown>
  const cornersRaw = anyRaw.corners
  if (!cornersRaw || typeof cornersRaw !== 'object') return {}
  const anyCorners = cornersRaw as Record<string, unknown>
  const ids: GeoCornerKey[] = PLAN_CORNER_IDS
  const result: Partial<Record<GeoCornerKey, { latInput: string; lonInput: string }>> = {}

  for (const id of ids) {
    const item = anyCorners[id]
    if (!item || typeof item !== 'object') continue
    const anyItem = item as Record<string, unknown>
    const lat = anyItem.lat
    const lon = anyItem.lon
    const latInput = typeof lat === 'number' && Number.isFinite(lat) ? String(lat) : ''
    const lonInput = typeof lon === 'number' && Number.isFinite(lon) ? String(lon) : ''
    result[id] = { latInput, lonInput }
  }

  return result
}

function buildGeoAnchorsFilePayload(draft: BuildGeoDraft): SavedGeoAnchorsFile {
  const ids: GeoCornerKey[] = PLAN_CORNER_IDS
  const corners: SavedGeoAnchorsFile['corners'] = {}
  for (const id of ids) {
    const corner = draft.corners[id]
    corners[id] = {
      lat: parseCoordInput(corner.latInput),
      lon: parseCoordInput(corner.lonInput),
    }
  }
  return {
    version: 1,
    buildId: draft.buildId,
    floorId: draft.floorId,
    corners,
  }
}

async function loadGeoAnchorsFileFromPublic(buildId: string, floorId: string): Promise<Partial<Record<GeoCornerKey, { latInput: string; lonInput: string }>>> {
  const candidatePaths = [
    `${buildId}/geo_anchors.json`,
    `${buildId}/geo_anchor.json`,
    `${buildId}/${floorId}/geo_anchors.json`,
    `${buildId}/${floorId}/geo_anchor.json`,
  ]

  for (const relativePath of candidatePaths) {
    try {
      const response = await fetch(publicAssetUrl(relativePath))
      if (!response.ok) continue
      const data: unknown = await response.json()
      return parseGeoAnchorsFromFile(data)
    } catch {
      // Try the next path variant.
    }
  }

  return {}
}

async function saveGeoAnchorsFileViaBrowserApi(draft: BuildGeoDraft): Promise<'saved' | 'downloaded' | 'cancelled'> {
  const payload = buildGeoAnchorsFilePayload(draft)
  const fileText = `${JSON.stringify(payload, null, 2)}\n`
  const anyWindow = window as Window & {
    showSaveFilePicker?: (opts?: unknown) => Promise<{
      createWritable: () => Promise<{ write: (chunk: string) => Promise<void>; close: () => Promise<void> }>
    }>
  }

  if (typeof anyWindow.showSaveFilePicker === 'function') {
    try {
      const handle = await anyWindow.showSaveFilePicker({
        suggestedName: 'geo_anchors.json',
        types: [{
          description: 'JSON file',
          accept: { 'application/json': ['.json'] },
        }],
      })
      const writable = await handle.createWritable()
      await writable.write(fileText)
      await writable.close()
      return 'saved'
    } catch (error) {
      const maybeName = (error as { name?: string })?.name
      if (maybeName === 'AbortError') return 'cancelled'
    }
  }

  const blob = new Blob([fileText], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${draft.buildId}_geo_anchors.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  return 'downloaded'
}

function buildValidGeoAnchors(draft: BuildGeoDraft | null): GeoAnchor[] {
  if (!draft) return []
  const ids: GeoCornerKey[] = PLAN_CORNER_IDS

  const parsedById: Partial<Record<GeoCornerKey, { lat: number; lon: number }>> = {}
  for (const id of ids) {
    const corner = draft.corners[id]
    const lat = parseCoordInput(corner.latInput)
    const lon = parseCoordInput(corner.lonInput)
    if (lat == null || lon == null) continue
    parsedById[id] = { lat, lon }
  }

  const result: GeoAnchor[] = []
  for (const id of ids) {
    const geo = parsedById[id]
    if (!geo) continue
    const planCorner = draft.corners[id]
    result.push({
      id,
      map: { x: planCorner.mapX, y: planCorner.mapY },
      geo,
    })
  }

  return result
}

function toCardinalLabel(ns: 'north' | 'south', ew: 'east' | 'west'): string {
  if (ns === 'north' && ew === 'east') return 'Северо-восток'
  if (ns === 'north' && ew === 'west') return 'Северо-запад'
  if (ns === 'south' && ew === 'east') return 'Юго-восток'
  return 'Юго-запад'
}

function buildRealWorldCardinalLabels(draft: BuildGeoDraft | null): Partial<Record<GeoCornerKey, string>> {
  if (!draft) return {}
  const ids: GeoCornerKey[] = PLAN_CORNER_IDS
  const parsed = ids
    .map((id) => {
      const c = draft.corners[id]
      const lat = parseCoordInput(c.latInput)
      const lon = parseCoordInput(c.lonInput)
      if (lat == null || lon == null) return null
      return { id, lat, lon }
    })
    .filter((v): v is { id: GeoCornerKey; lat: number; lon: number } => v != null)

  if (parsed.length < 2) return {}

  const latCenter = parsed.reduce((sum, p) => sum + p.lat, 0) / parsed.length
  const lonCenter = parsed.reduce((sum, p) => sum + p.lon, 0) / parsed.length
  const result: Partial<Record<GeoCornerKey, string>> = {}

  for (const p of parsed) {
    const ns: 'north' | 'south' = p.lat >= latCenter ? 'north' : 'south'
    const ew: 'east' | 'west' = p.lon >= lonCenter ? 'east' : 'west'
    result[p.id] = toCardinalLabel(ns, ew)
  }

  return result
}

function mapGeoPointToOverlay(
  calibration: ReturnType<typeof buildGeoCalibration>,
  point: { lat: number; lon: number },
  buildId: string,
  accuracyM?: number,
): { overlay: UserLocationOverlay; statusText: string } {
  const projection = projectUserToMap(calibration as NonNullable<ReturnType<typeof buildGeoCalibration>>, point)
  const isOutside = projection.outsideDistanceM > 3
  const accuracyText = Number.isFinite(accuracyM) ? `Точность ±${Math.round(accuracyM as number)} м` : undefined

  if (isOutside) {
    const distanceText = `До корпуса: ${formatDistanceHuman(projection.outsideDistanceM)}`
    return {
      overlay: {
        buildId,
        mode: 'outside',
        x: projection.clamped.x,
        y: projection.clamped.y,
        headingDeg: projection.headingDeg,
        distanceText,
        accuracyText,
      },
      statusText: distanceText,
    }
  }

  return {
    overlay: {
      buildId,
      mode: 'inside',
      x: projection.projected.x,
      y: projection.projected.y,
      accuracyText,
    },
    statusText: 'Текущее местоположение отображено на плане',
  }
}

function App() {
  const [rooms, setRooms] = React.useState<Room[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [selectedRoomKey, setSelectedRoomKey] = React.useState<string | null>(null)
  const [hoveredRoom, setHoveredRoom] = React.useState<Room | null>(null)
  const [hoverAnchor, setHoverAnchor] = React.useState<{ x: number; y: number } | null>(null)

  const searchInputRef = React.useRef<HTMLInputElement | null>(null)

  const [theme, setTheme] = React.useState<'light' | 'dark'>('light')

  const [graphicsPreset, setGraphicsPreset] = React.useState<GraphicsPresetId>('min')

  const [graphicsOpen, setGraphicsOpen] = React.useState(true)

  const [manifest, setManifest] = React.useState<RoomDataManifest | null>(null)
  const [selectedBuild, setSelectedBuild] = React.useState<string>('build14')
  const [selectedFloor, setSelectedFloor] = React.useState<string>('floor1')
  const [titleAnchor, setTitleAnchor] = React.useState<{ x: number; y: number } | null>(null)
  const [selectedCategory, setSelectedCategory] = React.useState<string>('__all__')
  const [searchText, setSearchText] = React.useState<string>('')
  const [searchResultJumpTrigger, setSearchResultJumpTrigger] = React.useState(0)
  const [roomsLoading, setRoomsLoading] = React.useState(false)
  const [pendingSearchJump, setPendingSearchJump] = React.useState<SearchIndexedRoom | null>(null)
  const [roomGraph, setRoomGraph] = React.useState<RoomGraph | null>(null)
  const [mapMode, setMapMode] = React.useState<MapMode>('normal')
  const [buildFloorData, setBuildFloorData] = React.useState<LoadedFloorData[]>([])
  const [routeFrom, setRouteFrom] = React.useState<RouteTarget | null>(null)
  const [routeTo, setRouteTo] = React.useState<RouteTarget | null>(null)
  const [activeRouteEndpoint, setActiveRouteEndpoint] = React.useState<RouteEndpoint>('to')
  const [routeDistanceM, setRouteDistanceM] = React.useState<number | null>(null)
  const [routeSegments, setRouteSegments] = React.useState<RouteSegment[]>([])
  const [routeFloorJumps, setRouteFloorJumps] = React.useState<RouteFloorJump[]>([])
  const [routeHints, setRouteHints] = React.useState<string[]>([])
  const [showGraphOverlay, setShowGraphOverlay] = React.useState(false)
  const [officesHierarchy, setOfficesHierarchy] = React.useState<OfficesHierarchyData | null>(null)
  const [isAdminMode, setIsAdminMode] = React.useState(false)
  const [geoDraftByBuild, setGeoDraftByBuild] = React.useState<Record<string, BuildGeoDraft>>({})
  const [geoFileStatusText, setGeoFileStatusText] = React.useState<string | null>(null)
  const [isLocating, setIsLocating] = React.useState(false)
  const [locationStatusText, setLocationStatusText] = React.useState<string | null>(null)
  const [userLocationOverlay, setUserLocationOverlay] = React.useState<UserLocationOverlay | null>(null)

  const [modalAnchor, setModalAnchor] = React.useState<{ x: number; y: number } | null>(
    null,
  )

  const isTouchDevice = React.useMemo(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia?.('(pointer: coarse)').matches ?? false
  }, [])

  const toggleAdminMode = React.useCallback(() => {
    if (isAdminMode) {
      setIsAdminMode(false)
      return
    }
    const password = window.prompt('Введите пароль администратора')
    if (password === 'poper') {
      setIsAdminMode(true)
      return
    }
    window.alert('Неверный пароль')
  }, [isAdminMode])

  const saveRoomChanges = React.useCallback(async (room: Room, changes: RoomEditPayload) => {
    const response = await fetch('/api/admin/rooms/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        buildId: selectedBuild,
        floorId: selectedFloor,
        roomKey: room.key,
        changes,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(text || `Ошибка сохранения (${response.status})`)
    }

    const updatedRoom = applyRoomChangesLocal(room, changes)
    setRooms((prev) => prev.map((item) => (item.key === room.key ? updatedRoom : item)))
  }, [selectedBuild, selectedFloor])

  const selectedRoom = React.useMemo(() => {
    if (selectedRoomKey == null) return null
    return rooms.find((r) => r.key === selectedRoomKey) ?? null
  }, [rooms, selectedRoomKey])

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

  const categoryOptions = React.useMemo(() => {
    const set = new Set<string>()
    for (const r of rooms) {
      if (!isInteractiveRoom(r)) continue
      const v = (r.category ?? '').trim()
      if (v.length > 0) set.add(v)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rooms])

  const selectedCategoryColor = React.useMemo(() => {
    if (selectedCategory === '__all__') return null
    const match = rooms.find((r) => isInteractiveRoom(r) && (r.category ?? '').trim() === selectedCategory)
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
    const ids: GeoCornerKey[] = ['nw', 'ne', 'se', 'sw']
    return ids.map((id) => {
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

  const matchedKeys = React.useMemo(() => {
    if (!isFiltering) return null
    const q = searchText.trim().toLowerCase()
    const set = new Set<string>()

    for (const r of rooms) {
      if (!isInteractiveRoom(r)) continue
      const category = (r.category ?? '').trim()
      const roomNo = (r.roomNo ?? '').trim()
      const description = (r.description ?? '').trim()

      if (selectedCategory !== '__all__' && category !== selectedCategory) continue

      if (q.length > 0) {
        const ok =
          roomNo.toLowerCase().includes(q) || description.toLowerCase().includes(q)
        if (!ok) continue
      }

      set.add(r.key)
    }

    return set
  }, [isFiltering, rooms, searchText, selectedCategory])

  const smartSearchData = useSmartSearch({ manifest, selectedBuild, searchText, isInteractiveRoom })

  const totalRooms = React.useMemo(() => rooms.filter(isInteractiveRoom).length, [rooms])
  const matchedRooms = matchedKeys ? matchedKeys.size : totalRooms

  const buildRouteTargetFromRoom = React.useCallback((room: Room, buildId: string, floorId: string): RouteTarget => {
    const roomNo = (room.roomNo ?? '').trim()
    return {
      buildId,
      floorId,
      roomKey: room.key,
      label: roomNo.length > 0 ? `№ ${roomNo}` : (room.description ?? room.category ?? 'кабинет'),
    }
  }, [])

  const applyRouteEndpoint = React.useCallback((endpoint: RouteEndpoint, target: RouteTarget) => {
    if (endpoint === 'from') {
      setRouteFrom(target)
      setActiveRouteEndpoint('to')
      setRouteTo((prev) => (prev && prev.buildId !== target.buildId ? null : prev))
      return
    }
    setRouteTo(target)
    setRouteFrom((prev) => (prev && prev.buildId !== target.buildId ? null : prev))
  }, [])

  React.useEffect(() => {
    if (selectedRoomKey == null) return
    const r = rooms.find((x) => x.key === selectedRoomKey)
    if (r && !isInteractiveRoom(r)) {
      setSelectedRoomKey(null)
      setModalAnchor(null)
    }
  }, [rooms, selectedRoomKey])

  React.useEffect(() => {
    let cancelled = false
    loadRoomDataManifest()
      .then((m) => {
        if (cancelled) return
        setManifest(m)
        if (!m || m.builds.length === 0) return

        const buildExists = m.builds.some((b) => b.id === selectedBuild)
        const nextBuild = buildExists ? selectedBuild : m.builds[0].id
        const floors = m.builds.find((b) => b.id === nextBuild)?.floors ?? []
        const floorExists = floors.includes(selectedFloor)
        const nextFloor = floorExists ? selectedFloor : floors[0] ?? selectedFloor

        if (nextBuild !== selectedBuild) setSelectedBuild(nextBuild)
        if (nextFloor !== selectedFloor) setSelectedFloor(nextFloor)
      })
      .catch(() => {
        if (cancelled) return
        setManifest(null)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    let cancelled = false
    setRoomsLoading(true)
    setError(null)
    loadRoomsFromPublic({ buildId: selectedBuild, floorId: selectedFloor })
      .then((data) => {
        if (cancelled) return
        setRooms(data)
        setRoomsLoading(false)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
        setRoomsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedBuild, selectedFloor])

  React.useEffect(() => {
    let cancelled = false
    const floors = (manifest?.builds ?? []).find((b) => b.id === selectedBuild)?.floors ?? []
    if (floors.length === 0) {
      setBuildFloorData([])
      return () => {
        cancelled = true
      }
    }

    Promise.all(
      floors.map(async (floorId) => {
        const [loadedRooms, loadedGraph] = await Promise.all([
          loadRoomsFromPublic({ buildId: selectedBuild, floorId }),
          loadRoomGraphFromPublic({ buildId: selectedBuild, floorId }),
        ])
        return {
          floorId,
          rooms: loadedRooms,
          graph: loadedGraph,
        }
      }),
    )
      .then((data) => {
        if (cancelled) return
        setBuildFloorData(
          data
            .filter((x): x is LoadedFloorData => Boolean(x.graph))
            .map((x) => ({ floorId: x.floorId, rooms: x.rooms, graph: x.graph as RoomGraph })),
        )
      })
      .catch(() => {
        if (cancelled) return
        setBuildFloorData([])
      })

    return () => {
      cancelled = true
    }
  }, [manifest, selectedBuild])

  React.useEffect(() => {
    if (mapMode !== 'routes') {
      setRouteSegments([])
      setRouteFloorJumps([])
      setRouteHints([])
      setRouteDistanceM(null)
      return
    }
    if (!routeTo) {
      setRouteSegments([])
      setRouteFloorJumps([])
      setRouteHints([])
      setRouteDistanceM(null)
      return
    }
    if (routeTo.buildId !== selectedBuild) {
      setRouteSegments([])
      setRouteFloorJumps([])
      setRouteHints([])
      setRouteDistanceM(null)
      return
    }
    if (routeFrom && routeFrom.buildId !== selectedBuild) {
      setRouteSegments([])
      setRouteFloorJumps([])
      setRouteHints([])
      setRouteDistanceM(null)
      return
    }

    const result = computeRoute({
      buildId: selectedBuild,
      floorsData: buildFloorData,
      source: routeFrom,
      target: routeTo,
    })

    if (!result) {
      setRouteSegments([])
      setRouteFloorJumps([])
      setRouteHints([])
      setRouteDistanceM(null)
      return
    }

    setRouteDistanceM(result.distance)
    setRouteSegments(result.segments.filter((s) => s.floorId === selectedFloor))
    setRouteFloorJumps(result.floorJumps.filter((j) => j.floorId === selectedFloor))
    setRouteHints(buildRouteHints({
      routeFrom,
      routeTo,
      buildFloorData,
      routeDistanceM: result.distance,
    }))
  }, [buildFloorData, mapMode, routeFrom, routeTo, selectedBuild, selectedFloor])

  React.useEffect(() => {
    let cancelled = false
    loadRoomGraphFromPublic({ buildId: selectedBuild, floorId: selectedFloor })
      .then((graph) => {
        if (cancelled) return
        setRoomGraph(graph)
      })
      .catch(() => {
        if (cancelled) return
        setRoomGraph(null)
      })

    return () => {
      cancelled = true
    }
  }, [selectedBuild, selectedFloor])

  React.useEffect(() => {
    let cancelled = false

    fetch(publicAssetUrl('offices_hierarchy.json'))
      .then(async (response) => {
        if (!response.ok) return null
        const data: unknown = await response.json()
        return data as OfficesHierarchyData
      })
      .then((data) => {
        if (cancelled) return
        setOfficesHierarchy(data)
      })
      .catch(() => {
        if (cancelled) return
        setOfficesHierarchy(null)
      })

    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (!pendingSearchJump) return
    if (selectedBuild !== pendingSearchJump.buildId) return
    if (selectedFloor !== pendingSearchJump.floorId) return
    if (roomsLoading) return

    requestAnimationFrame(() => {
      setSelectedRoomKey(pendingSearchJump.key)
      setModalAnchor(null)
      setSearchResultJumpTrigger((v) => v + 1)
      setPendingSearchJump(null)
    })
  }, [pendingSearchJump, roomsLoading, selectedBuild, selectedFloor])

  React.useEffect(() => {
    let cancelled = false
    if (!manifest) return () => {
      cancelled = true
    }

    const builds = manifest.builds
    Promise.all(
      builds.map(async (build) => {
        const floor1Id = build.floors.find((f) => /floor1/i.test(f)) ?? build.floors[0] ?? 'floor1'
        const [floorRooms, savedFileData] = await Promise.all([
          loadRoomsFromPublic({ buildId: build.id, floorId: floor1Id }),
          loadGeoAnchorsFileFromPublic(build.id, floor1Id),
        ])
        const allPolygons = roomsToPolygons(floorRooms)
        const wallBasedPolygons = allPolygons.filter((poly) => poly.roomID !== 200)
        const bounds = computeBounds(wallBasedPolygons.length > 0 ? wallBasedPolygons : allPolygons)
        const snappedCorners = buildSnappedCorners(bounds, wallBasedPolygons.length > 0 ? wallBasedPolygons : allPolygons)
        return {
          buildId: build.id,
          floorId: floor1Id,
          bounds,
          snappedCorners,
          savedFileData,
        }
      }),
    )
      .then((list) => {
        if (cancelled) return

        const next: Record<string, BuildGeoDraft> = {}
        for (const item of list) {
          const defaults = makeDefaultGeoCorners(item.bounds, item.snappedCorners)
          const ids: GeoCornerKey[] = PLAN_CORNER_IDS
          for (const id of ids) {
            const savedCorner = item.savedFileData[id]
            if (savedCorner?.latInput != null) defaults[id].latInput = savedCorner.latInput
            if (savedCorner?.lonInput != null) defaults[id].lonInput = savedCorner.lonInput
          }
          next[item.buildId] = {
            buildId: item.buildId,
            floorId: item.floorId,
            bounds: item.bounds,
            corners: defaults,
          }
        }
        setGeoDraftByBuild(next)
      })
      .catch(() => {
        if (cancelled) return
        setGeoDraftByBuild({})
      })

    return () => {
      cancelled = true
    }
  }, [manifest])

  const openOfficeOnMap = React.useCallback((location: OfficeLocation, node: OfficeNode) => {
    setMapMode('normal')
    setSelectedCategory('__all__')
    setSelectedBuild(location.buildId)
    setSelectedFloor(location.floorId)
    setSearchText(location.roomNo)
    setPendingSearchJump({
      key: location.roomKey,
      buildId: location.buildId,
      floorId: location.floorId,
      roomNo: location.roomNo,
      description: node.name,
      category: node.type,
    })
  }, [])

  const updateGeoCornerInput = React.useCallback((cornerId: GeoCornerKey, field: 'latInput' | 'lonInput', value: string) => {
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
  }, [selectedBuild])

  const clearSelectedBuildGeoInputs = React.useCallback(() => {
    setGeoDraftByBuild((prev) => {
      const draft = prev[selectedBuild]
      if (!draft) return prev
      const ids: GeoCornerKey[] = PLAN_CORNER_IDS
      const nextCorners = { ...draft.corners }
      for (const id of ids) {
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
  }, [selectedBuild])

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

  const locateUserOnMap = React.useCallback(() => {
    if (!selectedGeoCalibration) {
      setLocationStatusText('Заполните координаты 4 углов для этого корпуса в админ-режиме')
      return
    }

    if (LOCATION_SPOOF) {
      const mapped = mapGeoPointToOverlay(selectedGeoCalibration, LOCATION_SPOOF, selectedBuild)
      setUserLocationOverlay(mapped.overlay)
      setLocationStatusText(`Тестовые координаты: ${mapped.statusText}`)
      return
    }

    if (!navigator.geolocation) {
      setLocationStatusText('Геолокация не поддерживается в этом браузере')
      return
    }

    setIsLocating(true)
    setLocationStatusText('Запрашиваем доступ к геопозиции…')

    navigator.geolocation.getCurrentPosition(
      (position) => {
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
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setLocationStatusText('Доступ к геолокации запрещён пользователем')
        } else if (error.code === error.TIMEOUT) {
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
    let cancelled = false

    const floors = (manifest?.builds ?? []).find((b) => b.id === selectedBuild)?.floors ?? []
    const floor1Id = floors.find((f) => /floor1/i.test(f)) ?? 'floor1'

    loadRoomsFromPublic({ buildId: selectedBuild, floorId: floor1Id })
      .then((data) => {
        if (cancelled) return
        setTitleAnchor(findTitleAnchorFromFloor1(data))
      })
      .catch(() => {
        if (cancelled) return
        setTitleAnchor(null)
      })

    return () => {
      cancelled = true
    }
  }, [manifest, selectedBuild])

  if (error) {
    return (
      <div className="appError">
        <div className="appErrorTitle">Failed to load room data</div>
        <pre className="appErrorDetails">{error}</pre>
      </div>
    )
  }

  return (
    <div className="appRoot" data-theme={theme}>
      <TopBar
        selectedBuild={selectedBuild}
        buildOptions={buildOptions}
        buildLabel={buildLabel}
        onBuildChange={(next) => {
          setSelectedBuild(next)
          const floors = (manifest?.builds ?? []).find((b) => b.id === next)?.floors ?? []
          if (floors.length > 0 && !floors.includes(selectedFloor)) {
            setSelectedFloor(floors[0])
          }
        }}
        selectedCategory={selectedCategory}
        categoryOptions={categoryOptions}
        selectedCategoryColor={selectedCategoryColor}
        onCategoryChange={setSelectedCategory}
        matchedRooms={matchedRooms}
        totalRooms={totalRooms}
        searchText={searchText}
        onSearchTextChange={setSearchText}
        onClearSearch={() => {
          setSearchText('')
          setSelectedCategory('__all__')
          requestAnimationFrame(() => searchInputRef.current?.focus())
        }}
        searchInputRef={searchInputRef}
        smartSearchData={smartSearchData}
        floorLabel={floorLabel}
        onPickSearchRoom={(item) => {
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
        }}
        onPickSearchCategory={(category) => {
          setSelectedCategory(category)
          setSearchText('')
        }}
        graphicsPreset={graphicsPreset}
        onSelectPreset={setGraphicsPreset}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        isAdminMode={isAdminMode}
        onToggleAdminMode={toggleAdminMode}
        isLocating={isLocating}
        onLocateUser={locateUserOnMap}
        locationStatusText={locationStatusText}
      />

      <FloorsPanel
        floorOptions={floorOptions}
        selectedFloor={selectedFloor}
        floorLabel={floorLabel}
        onSelectFloor={setSelectedFloor}
      />

      <GraphicsPanel
        graphicsOpen={graphicsOpen}
        onToggle={() => setGraphicsOpen((v) => !v)}
        graphicsPreset={graphicsPreset}
        onSelectPreset={setGraphicsPreset}
        showGraphOverlay={showGraphOverlay}
        onToggleGraphOverlay={() => setShowGraphOverlay((v) => !v)}
      />

      <div className="appMain">
        <FloorPlanCanvas
          rooms={rooms}
          roomGraph={roomGraph}
          theme={theme}
          graphicsPreset={graphicsPreset}
          searchText={searchText}
          matchedKeys={matchedKeys}
          searchResultJumpTrigger={searchResultJumpTrigger}
          routeSegments={routeSegments}
          routeFloorJumps={routeFloorJumps}
          onRouteFloorJump={(targetFloorId) => setSelectedFloor(targetFloorId)}
          showGraphOverlay={showGraphOverlay}
          userLocationOverlay={activeUserLocationOverlay}
          geoAnchorMarkers={selectedGeoMarkers}
          titleText={titleText}
          titleAnchor={titleAnchor}
          selectedRoomKey={selectedRoomKey}
          onSelectRoomKey={(key) => {
            setSelectedRoomKey(key)
            if (key == null) setModalAnchor(null)
            if (key != null && mapMode === 'routes') {
              const room = rooms.find((r) => r.key === key)
              if (room && isInteractiveRoom(room)) {
                applyRouteEndpoint(activeRouteEndpoint, buildRouteTargetFromRoom(room, selectedBuild, selectedFloor))
              }
            }
          }}
          onOpenRoom={({ clientX, clientY }) => {
            setModalAnchor({ x: clientX, y: clientY })
          }}
          onHoverRoom={(payload) => {
            if (!payload) {
              setHoveredRoom(null)
              setHoverAnchor(null)
              return
            }
            setHoveredRoom(payload.room)
            setHoverAnchor({ x: payload.clientX, y: payload.clientY })
          }}
        />
      </div>

      {!isTouchDevice && !selectedRoom && hoveredRoom && hoverAnchor ? (
        <RoomHoverTooltip room={hoveredRoom} anchor={hoverAnchor} />
      ) : null}

      {selectedRoom && modalAnchor ? (
        <RoomInfoModal
          room={selectedRoom}
          anchor={modalAnchor}
          isAdminMode={isAdminMode}
          onSaveRoom={(changes) => saveRoomChanges(selectedRoom, changes)}
          onBuildRoute={(room) => {
            setMapMode('routes')
            applyRouteEndpoint(activeRouteEndpoint, buildRouteTargetFromRoom(room, selectedBuild, selectedFloor))
          }}
          onClose={() => {
            setSelectedRoomKey(null)
            setModalAnchor(null)
          }}
        />
      ) : null}

      {mapMode === 'routes' && routeHints.length > 0 ? (
        <div className="routeHintsWrap" aria-live="polite">
          {routeHints.map((hint, idx) => (
            <div key={`route-hint-${idx}`} className="routeHintItem">{hint}</div>
          ))}
        </div>
      ) : null}

      {locationStatusText ? (
        <div className="locationStatusFloating" aria-live="polite">{locationStatusText}</div>
      ) : null}

      {isAdminMode && selectedGeoDraft ? (
        <div className="geoAdminPanel">
          <div className="geoAdminHeader">
            <div className="geoAdminTitle">Геопривязка: {buildLabel(selectedBuild)}</div>
            <div className="geoAdminMeta">Этаж: {floorLabel(selectedGeoDraft.floorId)} · заполнено: {selectedGeoFilledCount}/4</div>
            {selectedFloor !== selectedGeoDraft.floorId ? (
              <div className="geoAdminWarn">Для наглядности точек переключитесь на {floorLabel(selectedGeoDraft.floorId)}</div>
            ) : null}
          </div>

          <div className="geoAdminRows">
            {(PLAN_CORNER_IDS as GeoCornerKey[]).map((id) => {
              const corner = selectedGeoDraft.corners[id]
              return (
                <div key={`geo-${id}`} className="geoAdminRow">
                  <div className="geoAdminCornerLabelWrap">
                    <div className="geoAdminCornerLabel">{corner.label}</div>
                    <div className="geoAdminCornerGeoLabel">
                      По карте: {selectedGeoRealCardinalLabels[id] ?? 'определится после ввода координат'}
                    </div>
                  </div>
                  <input
                    className="geoAdminInput"
                    placeholder="Широта"
                    value={corner.latInput}
                    onChange={(e) => updateGeoCornerInput(id, 'latInput', e.target.value)}
                  />
                  <input
                    className="geoAdminInput"
                    placeholder="Долгота"
                    value={corner.lonInput}
                    onChange={(e) => updateGeoCornerInput(id, 'lonInput', e.target.value)}
                  />
                  <div className="geoAdminMapCoord" title="Координаты точки на плане">
                    x: {corner.mapX.toFixed(2)} · y: {corner.mapY.toFixed(2)}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="geoAdminActions">
            <button type="button" className="geoAdminClearBtn" onClick={clearSelectedBuildGeoInputs}>
              Очистить координаты
            </button>
            <button type="button" className="geoAdminSaveBtn" onClick={saveSelectedBuildGeoToFile}>
              Сохранить в файл корпуса
            </button>
            <div className="geoAdminHint">
              Для позиционирования заполните минимум 3 угла, рекомендуется все 4.
            </div>
          </div>
          {geoFileStatusText ? <div className="geoAdminFileStatus" aria-live="polite">{geoFileStatusText}</div> : null}
        </div>
      ) : null}

      <OfficesDirectory
        data={officesHierarchy}
        buildLabel={buildLabel}
        floorLabel={floorLabel}
        onOpenCabinet={openOfficeOnMap}
      />

      <div className="mapModeSwitchWrap">
        <button
          type="button"
          className={mapMode === 'normal' ? 'mapModeBtn mapModeBtnActive' : 'mapModeBtn'}
          onClick={() => setMapMode('normal')}
        >
          Обычный
        </button>
        <button
          type="button"
          className={mapMode === 'routes' ? 'mapModeBtn mapModeBtnActive' : 'mapModeBtn'}
          onClick={() => setMapMode('routes')}
        >
          Маршруты
        </button>
        {mapMode === 'routes' ? (
          <div className="mapModeRouteMeta">
            <div className="routeEndpointSwitch">
              <button
                type="button"
                className={activeRouteEndpoint === 'from' ? 'routeEndpointBtn routeEndpointBtnActive' : 'routeEndpointBtn'}
                onClick={() => setActiveRouteEndpoint('from')}
              >
                Откуда
              </button>
              <button
                type="button"
                className={activeRouteEndpoint === 'to' ? 'routeEndpointBtn routeEndpointBtnActive' : 'routeEndpointBtn'}
                onClick={() => setActiveRouteEndpoint('to')}
              >
                Куда
              </button>
              <button
                type="button"
                className="routeMainEntranceBtn"
                onClick={() => setRouteFrom(null)}
                title="Сбросить точку старта к главному входу"
              >
                От главного входа
              </button>
            </div>
            <div className="routeMetaLine">Откуда: {routeFrom ? routeFrom.label : 'Главный вход'}</div>
            <div className="routeMetaLine">Куда: {routeTo ? routeTo.label : 'Выберите кабинет или воспользуйтесь поиском'}</div>
            {routeDistanceM != null ? <div className="routeMetaDistance">Длина: {routeDistanceM.toFixed(1)} м</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default App
