import type { Room } from '../../../map/rooms/utils/Room'

export type MapMode = 'normal' | 'routes'

export type GeoCornerKey = 'nw' | 'ne' | 'se' | 'sw'

export type GeoCornerDraft = {
  id: GeoCornerKey
  label: string
  mapX: number
  mapY: number
  latInput: string
  lonInput: string
}

export type BuildGeoDraft = {
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

export type UserLocationOverlay = {
  buildId: string
  mode: 'inside' | 'outside'
  x: number
  y: number
  distanceText?: string
  headingDeg?: number
  accuracyText?: string
}

export type SavedGeoAnchorsFile = {
  version: number
  buildId: string
  floorId: string
  corners: Partial<Record<GeoCornerKey, { lat: number | null; lon: number | null }>>
}

export type RoomEditPayload = {
  roomNo?: string
  category?: string
  description?: string
  areClosed?: boolean
  areaM2?: number
  build?: string | null
  floor?: string | null
}

export type OpenRoomPayload = {
  roomKey: string
  clientX: number
  clientY: number
}

export type HoverRoomPayload = {
  room: Room
  clientX: number
  clientY: number
} | null

export type XY = { x: number; y: number }
