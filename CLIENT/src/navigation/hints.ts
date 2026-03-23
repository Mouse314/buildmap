import type { LoadedFloorData, RouteTarget } from './types'

function floorNumber(floorId: string): number | null {
  const m = floorId.match(/floor\s*(\d+)/i)
  if (!m) return null
  return Number.parseInt(m[1], 10)
}

export function buildRouteHints(args: {
  routeFrom: RouteTarget | null
  routeTo: RouteTarget | null
  buildFloorData: LoadedFloorData[]
  routeDistanceM: number | null
}): string[] {
  const hints: string[] = []
  if (!args.routeTo) return hints

  const startFloorId = args.routeFrom?.floorId ?? 'floor1'
  const startN = floorNumber(startFloorId)
  const endN = floorNumber(args.routeTo.floorId)

  if (startN != null && endN != null && startN !== endN) {
    const movement = startN > endN ? 'спуститься' : 'подняться'
    hints.push(`Вам нужно ${movement} с ${startN} на ${endN} этаж.`)
  } else if (endN != null) {
    hints.push(`Маршрут проходит без смены этажа (${endN} этаж).`)
  }

  return hints.slice(0, 2)
}
