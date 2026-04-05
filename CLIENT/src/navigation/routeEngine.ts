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
  if (points.length <= 1) return points

  const deduped: Array<{ x: number; y: number }> = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const prev = deduped[deduped.length - 1]
    const cur = points[i]
    if (pointDistance(prev, cur) > 0.04) {
      deduped.push(cur)
    }
  }
  return deduped
}

function removeLocalBacktracking(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (points.length <= 2) return points

  const result: Array<{ x: number; y: number }> = [points[0]]
  for (let i = 1; i < points.length; i++) {
    result.push(points[i])

    while (result.length >= 3) {
      const a = result[result.length - 3]
      const b = result[result.length - 2]
      const c = result[result.length - 1]

      const ab = pointDistance(a, b)
      const bc = pointDistance(b, c)
      if (ab < 1e-6 || bc < 1e-6) {
        result.splice(result.length - 2, 1)
        continue
      }

      const ac = pointDistance(a, c)
      const v1x = b.x - a.x
      const v1y = b.y - a.y
      const v2x = c.x - b.x
      const v2y = c.y - b.y
      const dot = (v1x * v2x + v1y * v2y) / (ab * bc)

      const isShortReverseSpike = dot < -0.2
        && ac < Math.max(ab, bc) * 0.6
        && Math.min(ab, bc) < 2.2

      if (!isShortReverseSpike) break
      result.splice(result.length - 2, 1)
    }
  }

  return result
}

function segmentOverlapInfo(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
  eps = 1e-5,
): { length: number; midpoint: { x: number; y: number } | null; direction: { x: number; y: number } | null } {
  const ux = a2.x - a1.x
  const uy = a2.y - a1.y
  const vx = b2.x - b1.x
  const vy = b2.y - b1.y

  const crossUV = ux * vy - uy * vx
  if (Math.abs(crossUV) > eps) return { length: 0, midpoint: null, direction: null }

  const crossABU = (b1.x - a1.x) * uy - (b1.y - a1.y) * ux
  if (Math.abs(crossABU) > eps) return { length: 0, midpoint: null, direction: null }

  const lenSq = ux * ux + uy * uy
  if (lenSq <= eps) return { length: 0, midpoint: null, direction: null }

  const tB1 = ((b1.x - a1.x) * ux + (b1.y - a1.y) * uy) / lenSq
  const tB2 = ((b2.x - a1.x) * ux + (b2.y - a1.y) * uy) / lenSq

  const left = Math.max(0, Math.min(tB1, tB2))
  const right = Math.min(1, Math.max(tB1, tB2))
  const overlapT = right - left
  if (overlapT <= 0) return { length: 0, midpoint: null, direction: null }

  const tMid = left + overlapT * 0.5
  const len = Math.sqrt(lenSq) * overlapT
  const dirLen = Math.sqrt(lenSq)

  return {
    length: len,
    midpoint: { x: a1.x + ux * tMid, y: a1.y + uy * tMid },
    direction: dirLen > 1e-9 ? { x: ux / dirLen, y: uy / dirLen } : null,
  }
}

function polygonSegments(points: Array<{ x: number; y: number }>): Array<[{ x: number; y: number }, { x: number; y: number }]> {
  const segments: Array<[{ x: number; y: number }, { x: number; y: number }]> = []
  if (points.length < 2) return segments
  for (let i = 0; i < points.length; i++) {
    segments.push([points[i], points[(i + 1) % points.length]])
  }
  return segments
}

function buildPerpendicularDoorApproach(
  corridorRoom: Room,
  room: Room,
  corridorNode: { x: number; y: number },
  passage: { x: number; y: number },
): { x: number; y: number } | null {
  const corridorSegments = polygonSegments(corridorRoom.points)
  const roomSegments = polygonSegments(room.points)

  let bestMidpoint: { x: number; y: number } | null = null
  let bestDirection: { x: number; y: number } | null = null
  let bestLength = 0

  for (const [a1, a2] of corridorSegments) {
    for (const [b1, b2] of roomSegments) {
      const overlap = segmentOverlapInfo(a1, a2, b1, b2)
      if (!overlap.midpoint || !overlap.direction) continue
      if (overlap.length <= bestLength) continue
      bestLength = overlap.length
      bestMidpoint = overlap.midpoint
      bestDirection = overlap.direction
    }
  }

  if (!bestMidpoint || !bestDirection || bestLength < 0.05) return null

  const base = passage
  const toCorridor = { x: corridorNode.x - base.x, y: corridorNode.y - base.y }
  const n1 = { x: -bestDirection.y, y: bestDirection.x }
  const n2 = { x: bestDirection.y, y: -bestDirection.x }

  const dot1 = toCorridor.x * n1.x + toCorridor.y * n1.y
  const dot2 = toCorridor.x * n2.x + toCorridor.y * n2.y
  const normal = dot1 >= dot2 ? n1 : n2
  const corridorDepth = Math.abs(toCorridor.x * normal.x + toCorridor.y * normal.y)
  if (corridorDepth < 0.06) return null

  const offset = Math.max(0.24, Math.min(1.15, corridorDepth * 0.45))
  return {
    x: base.x + normal.x * offset,
    y: base.y + normal.y * offset,
  }
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

function edgePairKey(floorId: string, from: string, to: string): string {
  return `${floorId}|${from}|${to}`
}

const CORRIDOR_ROOM_ID = 1

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
  const edgeViaByFloorPair = new Map<string, { x: number; y: number } | null>()

  for (const floor of floors) {
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

      const via = edge.via
        && Number.isFinite(edge.via.x)
        && Number.isFinite(edge.via.y)
        ? { x: edge.via.x, y: edge.via.y }
        : null

      const w = via
        ? distance2D(left, via) + distance2D(via, right)
        : distance2D(left, right)

      addDirected(`${floor.floorId}|${edge.from}`, `${floor.floorId}|${edge.to}`, w)
      addDirected(`${floor.floorId}|${edge.to}`, `${floor.floorId}|${edge.from}`, w)

      edgeViaByFloorPair.set(edgePairKey(floor.floorId, edge.from, edge.to), via)
      edgeViaByFloorPair.set(edgePairKey(floor.floorId, edge.to, edge.from), via)
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
      const pushPoint = (point: { x: number; y: number }) => {
        const last = points[points.length - 1]
        if (!last || pointDistance(last, point) > 0.035) {
          points.push(point)
        }
      }

      const firstNode = nodeById.get(floorPathIds[0])
      const lastNode = nodeById.get(floorPathIds[floorPathIds.length - 1])
      if (firstNode) pushPoint({ x: firstNode.x, y: firstNode.y })

      for (let i = 0; i + 1 < floorPathIds.length; i++) {
        const leftId = floorPathIds[i]
        const rightId = floorPathIds[i + 1]
        const leftNode = nodeById.get(leftId)
        const rightNode = nodeById.get(rightId)
        if (!leftNode || !rightNode) continue

        const leftRoom = roomByFloorKey.get(`${floorId}|${leftNode.key}`)
        const rightRoom = roomByFloorKey.get(`${floorId}|${rightNode.key}`)

        let passage = edgeViaByFloorPair.get(edgePairKey(floorId, leftNode.key, rightNode.key)) ?? null
        if (!passage && leftNode.kind === 'room' && rightNode.kind === 'room' && leftRoom && rightRoom) {
          passage = sharedPassagePoint(leftRoom, rightRoom)
        }

        if (!passage) {
          passage = {
            x: (leftNode.x + rightNode.x) * 0.5,
            y: (leftNode.y + rightNode.y) * 0.5,
          }
        }

        const leftIsCorridor = leftRoom?.roomID === CORRIDOR_ROOM_ID
        const rightIsCorridor = rightRoom?.roomID === CORRIDOR_ROOM_ID
        let passagePushed = false

        if (leftIsCorridor !== rightIsCorridor && leftRoom && rightRoom) {
          const corridorRoom = leftIsCorridor ? leftRoom : rightRoom
          const targetRoom = leftIsCorridor ? rightRoom : leftRoom
          const corridorNode = leftIsCorridor ? leftNode : rightNode
          const approach = buildPerpendicularDoorApproach(
            corridorRoom,
            targetRoom,
            { x: corridorNode.x, y: corridorNode.y },
            passage,
          )
          if (approach) {
            if (leftIsCorridor) {
              // corridor -> room: approach inside corridor, then doorway
              pushPoint(approach)
              pushPoint(passage)
            } else {
              // room -> corridor: doorway first, then move into corridor centerline
              pushPoint(passage)
              pushPoint(approach)
            }
            passagePushed = true
          }
        }

        if (!passagePushed) {
          pushPoint(passage)
        }
      }

      if (lastNode) pushPoint({ x: lastNode.x, y: lastNode.y })

      const simplified = simplifyPathPoints(points)
      const cleaned = removeLocalBacktracking(simplified)
      for (let i = 0; i + 1 < cleaned.length; i++) {
        const from = cleaned[i]
        const to = cleaned[i + 1]
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
