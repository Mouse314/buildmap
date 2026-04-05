import * as React from 'react'
import { buildRouteHints } from '../../../navigation/hints'
import { computeRoute } from '../../../navigation/routeEngine'
import type { LoadedFloorData, RouteEndpoint, RouteFloorJump, RouteSegment, RouteTarget } from '../../../navigation/types'
import type { Room } from '../../../map/rooms/utils/Room'
import type { MapMode } from './types'

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
  return {
    buildId,
    floorId,
    roomKey: room.key,
    label: roomNo.length > 0 ? `№ ${roomNo}` : (room.description ?? room.category ?? 'кабинет'),
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
  const [routeHints, setRouteHints] = React.useState<string[]>([])

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
      setRouteHints(['Маршрут не найден'])
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

  return {
    mapMode,
    routeFrom,
    routeTo,
    activeRouteEndpoint,
    routeDistanceM,
    routeSegments,
    routeFloorJumps,
    routeHints,

    setMapMode,
    setRouteFrom,
    setActiveRouteEndpoint,
    applyRouteEndpoint,
  }
}
