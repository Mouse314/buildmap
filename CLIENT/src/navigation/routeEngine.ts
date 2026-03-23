import type { Room } from '../map/rooms/utils/Room'
import type { LoadedFloorData, RouteFloorJump, RouteResult, RouteSegment, RouteTarget } from './types'

function pointDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function pointsAlmostEqual(a: { x: number; y: number }, b: { x: number; y: number }, eps = 1e-4): boolean {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps
}

function sharedPassagePoint(roomA: Room, roomB: Room): { x: number; y: number } | null {
  const shared: Array<{ x: number; y: number }> = []
  for (const pa of roomA.points) {
    for (const pb of roomB.points) {
      if (pointsAlmostEqual(pa, pb)) {
        shared.push({ x: (pa.x + pb.x) * 0.5, y: (pa.y + pb.y) * 0.5 })
      }
    }
  }
  if (shared.length === 0) return null
  let sx = 0
  let sy = 0
  for (const p of shared) {
    sx += p.x
    sy += p.y
  }
  return { x: sx / shared.length, y: sy / shared.length }
}

function simplifyPathPoints(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (points.length <= 2) return points

  const deduped: Array<{ x: number; y: number }> = []
  for (const p of points) {
    const last = deduped[deduped.length - 1]
    if (!last || pointDistance(last, p) > 0.04) deduped.push(p)
  }
  if (deduped.length <= 2) return deduped

  const result: Array<{ x: number; y: number }> = [deduped[0]]
  for (let i = 1; i + 1 < deduped.length; i++) {
    const prev = result[result.length - 1]
    const cur = deduped[i]
    const next = deduped[i + 1]

    const v1x = cur.x - prev.x
    const v1y = cur.y - prev.y
    const v2x = next.x - cur.x
    const v2y = next.y - cur.y

    const len1 = Math.hypot(v1x, v1y)
    const len2 = Math.hypot(v2x, v2y)
    if (len1 < 1e-6 || len2 < 1e-6) continue

    const dot = (v1x * v2x + v1y * v2y) / (len1 * len2)
    if (dot > 0.965) continue
    result.push(cur)
  }
  result.push(deduped[deduped.length - 1])
  return result
}

function pointInPolygon(point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i]
    const pj = polygon[j]
    const intersects = ((pi.y > point.y) !== (pj.y > point.y))
      && (point.x < ((pj.x - pi.x) * (point.y - pi.y)) / ((pj.y - pi.y) || 1e-9) + pi.x)
    if (intersects) inside = !inside
  }
  return inside
}

function orientation(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function onSegment(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, eps = 1e-7): boolean {
  return Math.min(a.x, b.x) - eps <= c.x
    && c.x <= Math.max(a.x, b.x) + eps
    && Math.min(a.y, b.y) - eps <= c.y
    && c.y <= Math.max(a.y, b.y) + eps
}

function segmentsIntersect(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  q1: { x: number; y: number },
  q2: { x: number; y: number },
): boolean {
  const o1 = orientation(p1, p2, q1)
  const o2 = orientation(p1, p2, q2)
  const o3 = orientation(q1, q2, p1)
  const o4 = orientation(q1, q2, p2)

  if ((o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0)) return true

  if (Math.abs(o1) < 1e-7 && onSegment(p1, p2, q1)) return true
  if (Math.abs(o2) < 1e-7 && onSegment(p1, p2, q2)) return true
  if (Math.abs(o3) < 1e-7 && onSegment(q1, q2, p1)) return true
  if (Math.abs(o4) < 1e-7 && onSegment(q1, q2, p2)) return true

  return false
}

function segmentBlockedByWalls(
  from: { x: number; y: number },
  to: { x: number; y: number },
  wallPolygons: Array<Array<{ x: number; y: number }>>,
): boolean {
  if (pointDistance(from, to) < 1e-6) return false

  const sampleCount = 6
  for (let s = 1; s < sampleCount; s++) {
    const t = s / sampleCount
    const p = {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    }
    for (const wall of wallPolygons) {
      if (pointInPolygon(p, wall)) return true
    }
  }

  for (const wall of wallPolygons) {
    for (let i = 0; i < wall.length; i++) {
      const a = wall[i]
      const b = wall[(i + 1) % wall.length]
      if (!segmentsIntersect(from, to, a, b)) continue

      const atWallVertex = pointsAlmostEqual(from, a, 1e-4)
        || pointsAlmostEqual(from, b, 1e-4)
        || pointsAlmostEqual(to, a, 1e-4)
        || pointsAlmostEqual(to, b, 1e-4)
      if (atWallVertex) continue
      return true
    }
  }
  return false
}

function straightenPathWithWalls(
  points: Array<{ x: number; y: number }>,
  wallPolygons: Array<Array<{ x: number; y: number }>>,
): Array<{ x: number; y: number }> {
  if (points.length <= 2) return points

  const result: Array<{ x: number; y: number }> = []
  let index = 0
  result.push(points[index])

  while (index < points.length - 1) {
    let best = index + 1
    for (let candidate = points.length - 1; candidate > index + 1; candidate--) {
      if (!segmentBlockedByWalls(points[index], points[candidate], wallPolygons)) {
        best = candidate
        break
      }
    }
    result.push(points[best])
    index = best
  }

  return result
}

function distance2D(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function centerOf(points: Array<{ x: number; y: number }>): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 }
  let sx = 0
  let sy = 0
  for (const p of points) {
    sx += p.x
    sy += p.y
  }
  return { x: sx / points.length, y: sy / points.length }
}

function floorOrderValue(floorId: string): number {
  const m = floorId.match(/floor\s*(\d+)/i)
  if (!m) return Number.POSITIVE_INFINITY
  return Number.parseInt(m[1], 10)
}

function parseStairDirection(description: string | undefined): { up: boolean; down: boolean } {
  const marker = (description ?? '').trim()
  if (marker === '1') return { up: true, down: false }
  if (marker === '2') return { up: false, down: true }
  if (marker === '12') return { up: true, down: true }
  return { up: true, down: true }
}

function isRoomClosed(room: Room | undefined): boolean {
  return room?.areClosed === true
}

export function computeRoute(args: {
  buildId: string
  floorsData: LoadedFloorData[]
  source: RouteTarget | null
  target: RouteTarget
}): RouteResult | null {
  const floors = [...args.floorsData].sort((a, b) => floorOrderValue(a.floorId) - floorOrderValue(b.floorId))
  if (floors.length === 0) return null

  const nodeById = new Map<string, {
    floorId: string
    key: string
    x: number
    y: number
    roomID: number | null
    kind: 'room' | 'street'
  }>()

  const adjacency = new Map<string, Array<{ to: string; weight: number }>>()
  const addDirected = (from: string, to: string, weight: number) => {
    const arr = adjacency.get(from) ?? []
    arr.push({ to, weight })
    adjacency.set(from, arr)
  }

  const roomByFloorKey = new Map<string, Room>()
  const wallPolygonsByFloor = new Map<string, Array<Array<{ x: number; y: number }>>>()

  for (const floor of floors) {
    wallPolygonsByFloor.set(
      floor.floorId,
      floor.rooms.filter((room) => room.roomID === 100 && room.points.length >= 3).map((room) => room.points),
    )

    for (const room of floor.rooms) {
      roomByFloorKey.set(`${floor.floorId}|${room.key}`, room)
    }

    for (const node of floor.graph.nodes) {
      const globalId = `${floor.floorId}|${node.key}`
      const kind: 'room' | 'street' = node.kind === 'street' ? 'street' : 'room'

      if (kind === 'room') {
        const room = roomByFloorKey.get(`${floor.floorId}|${node.key}`)
        if (isRoomClosed(room)) continue
      }

      nodeById.set(globalId, {
        floorId: floor.floorId,
        key: node.key,
        x: node.x,
        y: node.y,
        roomID: node.roomID,
        kind,
      })
    }

    for (const edge of floor.graph.edges) {
      const left = nodeById.get(`${floor.floorId}|${edge.from}`)
      const right = nodeById.get(`${floor.floorId}|${edge.to}`)
      if (!left || !right) continue
      const w = distance2D(left, right)
      addDirected(`${floor.floorId}|${edge.from}`, `${floor.floorId}|${edge.to}`, w)
      addDirected(`${floor.floorId}|${edge.to}`, `${floor.floorId}|${edge.from}`, w)
    }
  }

  const stairTransitionCost = 6
  for (let i = 0; i + 1 < floors.length; i++) {
    const lower = floors[i]
    const upper = floors[i + 1]

    const lowerStairs = lower.graph.nodes.filter((n) => (n.kind ?? 'room') === 'room' && n.roomID === 9)
    const upperStairs = upper.graph.nodes.filter((n) => (n.kind ?? 'room') === 'room' && n.roomID === 9)

    for (const stairLow of lowerStairs) {
      let nearest: { key: string; d: number } | null = null
      for (const stairUp of upperStairs) {
        const d = distance2D(stairLow, stairUp)
        if (d > 5) continue
        if (!nearest || d < nearest.d) {
          nearest = { key: stairUp.key, d }
        }
      }
      if (!nearest) continue

      const lowRoom = roomByFloorKey.get(`${lower.floorId}|${stairLow.key}`)
      const upRoom = roomByFloorKey.get(`${upper.floorId}|${nearest.key}`)
      const lowDir = parseStairDirection(lowRoom?.description)
      const upDir = parseStairDirection(upRoom?.description)

      const lowId = `${lower.floorId}|${stairLow.key}`
      const upId = `${upper.floorId}|${nearest.key}`
      if (!nodeById.has(lowId) || !nodeById.has(upId)) continue

      if (lowDir.up && upDir.down) {
        addDirected(lowId, upId, stairTransitionCost)
      }
      if (upDir.down && lowDir.up) {
        addDirected(upId, lowId, stairTransitionCost)
      }
    }
  }

  const floor1 = floors.find((f) => /floor1/i.test(f.floorId))
  if (!floor1) return null

  const entranceLabels = floor1.rooms.filter(
    (r) => r.roomID === 200 && (r.description ?? '').toUpperCase().includes('ВХОД'),
  )
  const entranceLabel = entranceLabels.sort((a, b) => centerOf(a.points).y - centerOf(b.points).y)[0]
  if (!entranceLabel) return null
  const entrancePoint = centerOf(entranceLabel.points)

  let entranceStartNodeId: string | null = null
  let minStartDist = Number.POSITIVE_INFINITY
  for (const node of floor1.graph.nodes) {
    if ((node.kind ?? 'room') !== 'room') continue
    const globalId = `${floor1.floorId}|${node.key}`
    if (!nodeById.has(globalId)) continue
    const d = distance2D(entrancePoint, node)
    if (d < minStartDist) {
      minStartDist = d
      entranceStartNodeId = globalId
    }
  }
  if (!entranceStartNodeId) return null

  const resolveNodeId = (candidate: RouteTarget): string | null => {
    const floor = floors.find((f) => f.floorId === candidate.floorId)
    if (!floor) return null

    let resolved = `${candidate.floorId}|${candidate.roomKey}`
    if (nodeById.has(resolved)) return resolved

    const room = floor.rooms.find((r) => r.key === candidate.roomKey)
    if (!room) return null
    if (isRoomClosed(room)) return null
    const roomCenter = centerOf(room.points)

    let nearestNodeKey: string | null = null
    let nearestDist = Number.POSITIVE_INFINITY
    for (const n of floor.graph.nodes) {
      if ((n.kind ?? 'room') !== 'room') continue
      const nodeRoom = roomByFloorKey.get(`${floor.floorId}|${n.key}`)
      if (isRoomClosed(nodeRoom)) continue
      const d = distance2D(roomCenter, n)
      if (d < nearestDist) {
        nearestDist = d
        nearestNodeKey = n.key
      }
    }
    if (!nearestNodeKey) return null
    resolved = `${candidate.floorId}|${nearestNodeKey}`
    return resolved
  }

  const startNodeId = args.source ? resolveNodeId(args.source) : entranceStartNodeId
  if (!startNodeId) return null

  const targetNodeId = resolveNodeId(args.target)
  if (!targetNodeId) return null

  const dist = new Map<string, number>()
  const prev = new Map<string, string | null>()
  const queue = new Set<string>()

  for (const id of nodeById.keys()) {
    dist.set(id, Number.POSITIVE_INFINITY)
    prev.set(id, null)
    queue.add(id)
  }
  dist.set(startNodeId, 0)

  while (queue.size > 0) {
    let current: string | null = null
    let best = Number.POSITIVE_INFINITY
    for (const id of queue) {
      const d = dist.get(id) ?? Number.POSITIVE_INFINITY
      if (d < best) {
        best = d
        current = id
      }
    }
    if (!current || !Number.isFinite(best)) break
    queue.delete(current)
    if (current === targetNodeId) break

    const neighbors = adjacency.get(current) ?? []
    for (const edge of neighbors) {
      if (!queue.has(edge.to)) continue
      const alt = best + edge.weight
      if (alt < (dist.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
        dist.set(edge.to, alt)
        prev.set(edge.to, current)
      }
    }
  }

  const total = dist.get(targetNodeId)
  if (typeof total !== 'number' || !Number.isFinite(total)) return null

  const path: string[] = []
  let cursor: string | null = targetNodeId
  while (cursor) {
    path.push(cursor)
    cursor = prev.get(cursor) ?? null
  }
  path.reverse()
  if (path.length < 2) return null

  const segments: RouteSegment[] = []
  const floorJumps: RouteFloorJump[] = []
  const floorJumpKeys = new Set<string>()

  const pushFloorJump = (jump: RouteFloorJump) => {
    const key = `${jump.floorId}|${jump.targetFloorId}|${jump.direction}|${jump.x.toFixed(3)}|${jump.y.toFixed(3)}`
    if (floorJumpKeys.has(key)) return
    floorJumpKeys.add(key)
    floorJumps.push(jump)
  }

  for (let i = 0; i + 1 < path.length; i++) {
    const left = nodeById.get(path[i])
    const right = nodeById.get(path[i + 1])
    if (!left || !right) continue
    if (left.floorId === right.floorId) continue

    const forwardDirection: 'up' | 'down' = floorOrderValue(right.floorId) > floorOrderValue(left.floorId) ? 'up' : 'down'
    const reverseDirection: 'up' | 'down' = forwardDirection === 'up' ? 'down' : 'up'

    pushFloorJump({
      floorId: left.floorId,
      targetFloorId: right.floorId,
      x: left.x,
      y: left.y,
      direction: forwardDirection,
    })

    pushFloorJump({
      floorId: right.floorId,
      targetFloorId: left.floorId,
      x: right.x,
      y: right.y,
      direction: reverseDirection,
    })
  }

  let idx = 0
  while (idx < path.length) {
    const node = nodeById.get(path[idx])
    if (!node) {
      idx++
      continue
    }

    const floorId = node.floorId
    let end = idx + 1
    while (end < path.length) {
      const n = nodeById.get(path[end])
      if (!n || n.floorId !== floorId) break
      end++
    }

    const floorPathIds = path.slice(idx, end)
    if (floorPathIds.length >= 2) {
      const points: Array<{ x: number; y: number }> = []
      const firstNode = nodeById.get(floorPathIds[0])
      const lastNode = nodeById.get(floorPathIds[floorPathIds.length - 1])
      if (firstNode) points.push({ x: firstNode.x, y: firstNode.y })

      for (let i = 0; i + 1 < floorPathIds.length; i++) {
        const leftId = floorPathIds[i]
        const rightId = floorPathIds[i + 1]
        const leftNode = nodeById.get(leftId)
        const rightNode = nodeById.get(rightId)
        if (!leftNode || !rightNode) continue

        let passage: { x: number; y: number } | null = null
        if (leftNode.kind === 'room' && rightNode.kind === 'room') {
          const leftRoom = roomByFloorKey.get(`${floorId}|${leftNode.key}`)
          const rightRoom = roomByFloorKey.get(`${floorId}|${rightNode.key}`)
          if (leftRoom && rightRoom) {
            passage = sharedPassagePoint(leftRoom, rightRoom)
          }
        }

        if (!passage) {
          passage = {
            x: (leftNode.x + rightNode.x) * 0.5,
            y: (leftNode.y + rightNode.y) * 0.5,
          }
        }
        points.push(passage)
      }

      if (lastNode) points.push({ x: lastNode.x, y: lastNode.y })

      const simplified = simplifyPathPoints(points)
      const wallPolygons = wallPolygonsByFloor.get(floorId) ?? []
      const straightened = straightenPathWithWalls(simplified, wallPolygons)
      for (let i = 0; i + 1 < straightened.length; i++) {
        const from = straightened[i]
        const to = straightened[i + 1]
        if (pointDistance(from, to) < 0.04) continue
        segments.push({ floorId, from, to })
      }
    }

    idx = Math.max(end, idx + 1)
  }

  return {
    distance: total,
    segments,
    floorJumps,
  }
}
