import type { RoomGraph } from '../map/rooms/utils/roomData'
import type { Room } from '../map/rooms/utils/Room'

export type LoadedFloorData = {
  floorId: string
  rooms: Room[]
  graph: RoomGraph
}

export type RouteTarget = {
  buildId: string
  floorId: string
  roomKey: string
  label: string
}

export type RouteEndpoint = 'from' | 'to'

export type RouteSegment = {
  floorId: string
  from: { x: number; y: number }
  to: { x: number; y: number }
}

export type RouteFloorJump = {
  floorId: string
  targetFloorId: string
  x: number
  y: number
  direction: 'up' | 'down'
}

export type RouteResult = {
  distance: number
  segments: RouteSegment[]
  floorJumps: RouteFloorJump[]
}
