import {
  computeBounds,
  loadRoomsFromPublic,
  publicAssetUrl,
  roomsToPolygons,
} from '../../../map/rooms/utils/roomData'
import { getCategoryByRoomId } from '../../../map/rooms/utils/roomCategories'
import {
  buildGeoCalibration,
  formatDistanceHuman,
  projectUserToMap,
  type GeoAnchor,
} from '../../../navigation/geoProjection'
import type { Room } from '../../../map/rooms/utils/Room'
import type {
  BuildGeoDraft,
  GeoCornerDraft,
  GeoCornerKey,
  SavedGeoAnchorsFile,
  UserLocationOverlay,
  XY,
  RoomEditPayload,
} from './types'

// Temporary test spoof. Set to null to restore real browser geolocation.
// const LOCATION_SPOOF: { lat: number; lon: number } | null = {
//   lat: 58.591126,
//   lon: 49.680707
// }
export const LOCATION_SPOOF: { lat: number; lon: number } | null = null

export const PLAN_CORNER_IDS: GeoCornerKey[] = ['nw', 'ne', 'se', 'sw']

function normalizeText(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function applyRoomChangesLocal(room: Room, changes: RoomEditPayload): Room {
  const nextRoomId = typeof changes.roomID === 'number' && Number.isFinite(changes.roomID)
    ? Math.trunc(changes.roomID)
    : room.roomID
  const nextCategory = normalizeText(changes.category) ?? getCategoryByRoomId(nextRoomId) ?? room.category

  return {
    ...room,
    roomID: nextRoomId,
    roomNo: normalizeText(changes.roomNo),
    category: nextCategory,
    description: normalizeText(changes.description),
    areClosed: changes.areClosed,
    areaM2: typeof changes.areaM2 === 'number' && Number.isFinite(changes.areaM2) ? changes.areaM2 : undefined,
    build: changes.build ?? null,
    floor: changes.floor ?? null,
  }
}

export function parseCoordInput(value: string): number | null {
  const cleaned = value.trim().replace(',', '.')
  if (cleaned.length === 0) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

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
  const result: Partial<Record<GeoCornerKey, { latInput: string; lonInput: string }>> = {}

  for (const id of PLAN_CORNER_IDS) {
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
  const corners: SavedGeoAnchorsFile['corners'] = {}
  for (const id of PLAN_CORNER_IDS) {
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

export async function loadGeoAnchorsFileFromPublic(buildId: string, floorId: string): Promise<Partial<Record<GeoCornerKey, { latInput: string; lonInput: string }>>> {
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

export async function saveGeoAnchorsFileViaBrowserApi(draft: BuildGeoDraft): Promise<'saved' | 'downloaded' | 'cancelled'> {
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

export function buildValidGeoAnchors(draft: BuildGeoDraft | null): GeoAnchor[] {
  if (!draft) return []

  const parsedById: Partial<Record<GeoCornerKey, { lat: number; lon: number }>> = {}
  for (const id of PLAN_CORNER_IDS) {
    const corner = draft.corners[id]
    const lat = parseCoordInput(corner.latInput)
    const lon = parseCoordInput(corner.lonInput)
    if (lat == null || lon == null) continue
    parsedById[id] = { lat, lon }
  }

  const result: GeoAnchor[] = []
  for (const id of PLAN_CORNER_IDS) {
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

export function buildRealWorldCardinalLabels(draft: BuildGeoDraft | null): Partial<Record<GeoCornerKey, string>> {
  if (!draft) return {}
  const parsed = PLAN_CORNER_IDS
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

export function mapGeoPointToOverlay(
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

export async function buildGeoDraftByBuild(manifestBuilds: Array<{ id: string; floors: string[] }>): Promise<Record<string, BuildGeoDraft>> {
  const list = await Promise.all(
    manifestBuilds.map(async (build) => {
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

  const next: Record<string, BuildGeoDraft> = {}
  for (const item of list) {
    const defaults = makeDefaultGeoCorners(item.bounds, item.snappedCorners)
    for (const id of PLAN_CORNER_IDS) {
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

  return next
}
