import * as React from 'react'
import { buildRouteHints } from '../../../navigation/hints'
import { computeRoute } from '../../../navigation/routeEngine'
import type { LoadedFloorData, RouteEndpoint, RouteFloorJump, RouteSegment, RouteTarget } from '../../../navigation/types'
import type { Room } from '../../../map/rooms/utils/Room'
import { formatRoomDescription } from '../../../map/rooms/utils/stairDirection'
import type { MapMode } from './types'

function roomCenter(room: Room): { x: number; y: number } {
  if (room.points.length === 0) return { x: 0, y: 0 }

  let sx = 0
  let sy = 0
  for (const point of room.points) {
    sx += point.x
    sy += point.y
  }

  return {
    x: sx / room.points.length,
    y: sy / room.points.length,
  }
}

export function buildRouteTargetFromRoom(room: Room, buildId: string, floorId: string): RouteTarget {
  if (room.roomID === 9) {
    return {
      buildId,
      floorId,
      roomKey: room.key,
      label: 'лестница',
    }
  }

  const roomNo = (room.roomNo ?? '').trim()
  const description = formatRoomDescription(room.roomID, room.description)
  return {
    buildId,
    floorId,
    roomKey: room.key,
    label: roomNo.length > 0 ? `№ ${roomNo}` : (description || room.category || 'кабинет'),
  }
}

export function useRoutePlanner({
  buildFloorData,
  selectedBuild,
  selectedFloor,
}: {
  buildFloorData: LoadedFloorData[]
  selectedBuild: string
  selectedFloor: string
}) {
  const [mapMode, setMapMode] = React.useState<MapMode>('normal')
  const [routeFrom, setRouteFrom] = React.useState<RouteTarget | null>(null)
  const [routeTo, setRouteTo] = React.useState<RouteTarget | null>(null)
  const [activeRouteEndpoint, setActiveRouteEndpoint] = React.useState<RouteEndpoint>('to')
  const [routeDistanceM, setRouteDistanceM] = React.useState<number | null>(null)
  const [routeSegments, setRouteSegments] = React.useState<RouteSegment[]>([])
  const [routeFloorJumps, setRouteFloorJumps] = React.useState<RouteFloorJump[]>([])
  const [routeResult, setRouteResult] = React.useState<{ segments: RouteSegment[]; floorJumps: RouteFloorJump[] } | null>(null)
  const [routeHints, setRouteHints] = React.useState<string[]>([])
  const [routeAllFloors, setRouteAllFloors] = React.useState<string[]>([])
  const [routeTargetPoint, setRouteTargetPoint] = React.useState<{ floorId: string; x: number; y: number } | null>(null)

  const clearRouteMemory = React.useCallback(() => {
    setRouteFrom(null)
    setRouteTo(null)
    setActiveRouteEndpoint('to')
    setRouteDistanceM(null)
    setRouteSegments([])
    setRouteFloorJumps([])
    setRouteResult(null)
    setRouteHints([])
    setRouteAllFloors([])
    setRouteTargetPoint(null)
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
    if (mapMode !== 'routes') {
      setRouteResult(null)
      setRouteHints([])
      setRouteDistanceM(null)
      setRouteAllFloors([])
      setRouteTargetPoint(null)
      return
    }
    if (!routeTo) {
      setRouteResult(null)
      setRouteHints([])
      setRouteDistanceM(null)
      setRouteAllFloors([])
      setRouteTargetPoint(null)
      return
    }
    if (routeTo.buildId !== selectedBuild) {
      setRouteResult(null)
      setRouteHints([])
      setRouteDistanceM(null)
      setRouteAllFloors([])
      setRouteTargetPoint(null)
      return
    }
    if (routeFrom && routeFrom.buildId !== selectedBuild) {
      setRouteResult(null)
      setRouteHints([])
      setRouteDistanceM(null)
      setRouteAllFloors([])
      setRouteTargetPoint(null)
      return
    }

    const targetFloorData = buildFloorData.find((f) => f.floorId === routeTo.floorId)
    const targetRoom = targetFloorData?.rooms.find((room) => room.key === routeTo.roomKey)
    setRouteTargetPoint(targetRoom ? { floorId: routeTo.floorId, ...roomCenter(targetRoom) } : null)

    const result = computeRoute({
      buildId: selectedBuild,
      floorsData: buildFloorData,
      source: routeFrom,
      target: routeTo,
    })

    if (!result) {
      setRouteResult(null)
      setRouteHints(['Маршрут не найден'])
      setRouteDistanceM(null)
      setRouteAllFloors([])
      return
    }

    const floorsSet = new Set<string>()
    for (const segment of result.segments) floorsSet.add(segment.floorId)
    for (const jump of result.floorJumps) {
      floorsSet.add(jump.floorId)
      floorsSet.add(jump.targetFloorId)
    }
    if (floorsSet.size === 0) floorsSet.add(routeTo.floorId)
    setRouteAllFloors(Array.from(floorsSet))

    setRouteResult({
      segments: result.segments,
      floorJumps: result.floorJumps,
    })
    setRouteDistanceM(result.distance)
    setRouteHints(buildRouteHints({
      routeFrom,
      routeTo,
      buildFloorData,
      routeDistanceM: result.distance,
    }))
  }, [buildFloorData, mapMode, routeFrom, routeTo, selectedBuild])

  React.useEffect(() => {
    if (!routeResult) {
      setRouteSegments([])
      setRouteFloorJumps([])
      return
    }

    setRouteSegments(routeResult.segments.filter((s) => s.floorId === selectedFloor))
    setRouteFloorJumps(routeResult.floorJumps.filter((j) => j.floorId === selectedFloor))
  }, [routeResult, selectedFloor])

  return {
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
    setRouteTo,
    setActiveRouteEndpoint,
    applyRouteEndpoint,
    clearRouteMemory,
  }
}
