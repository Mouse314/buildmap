import * as THREE from 'three'
type RouteJumpPoint = {
  x: number
  y: number
  targetFloorId: string
  direction: 'up' | 'down'
}

function floorNumberFromId(floorId: string): number | null {
  const m = floorId.match(/floor\s*(\d+)/i)
  if (!m) return null
  return Number.parseInt(m[1], 10)
}

export function buildRoundedRoutePoints(points: THREE.Vector3[]): THREE.Vector3[] {
  if (points.length <= 2) return points

  const rounded: THREE.Vector3[] = [points[0].clone()]

  for (let i = 1; i + 1 < points.length; i++) {
    const prev = points[i - 1]
    const current = points[i]
    const next = points[i + 1]

    const incoming = new THREE.Vector3().subVectors(prev, current)
    const outgoing = new THREE.Vector3().subVectors(next, current)
    const lenIn = incoming.length()
    const lenOut = outgoing.length()

    if (lenIn < 0.01 || lenOut < 0.01) {
      rounded.push(current.clone())
      continue
    }

    incoming.normalize()
    outgoing.normalize()

    const dot = THREE.MathUtils.clamp(incoming.dot(outgoing), -1, 1)
    const angle = Math.acos(dot)
    if (angle < 0.24) {
      rounded.push(current.clone())
      continue
    }

    const cornerCut = Math.max(0.22, Math.min(0.85, Math.min(lenIn, lenOut) * 0.2))
    const p1 = current.clone().addScaledVector(incoming, cornerCut)
    const p2 = current.clone().addScaledVector(outgoing, cornerCut)

    const steps = 7
    for (let s = 1; s <= steps; s++) {
      const t = s / steps
      const oneMinus = 1 - t
      const q = new THREE.Vector3(
        oneMinus * oneMinus * p1.x + 2 * oneMinus * t * current.x + t * t * p2.x,
        oneMinus * oneMinus * p1.y + 2 * oneMinus * t * current.y + t * t * p2.y,
        oneMinus * oneMinus * p1.z + 2 * oneMinus * t * current.z + t * t * p2.z,
      )
      rounded.push(q)
    }
  }

  rounded.push(points[points.length - 1].clone())
  return rounded
}

export function buildRouteJumpGroups(routeFloorJumps: RouteJumpPoint[]) {
  const clusters: Array<{
    centerX: number
    centerY: number
    items: Array<{ x: number; y: number; targetFloorId: string; direction: 'up' | 'down' }>
  }> = []

  const clusterRadius = 1.25
  for (const jump of routeFloorJumps) {
    let assigned = false
    for (const cluster of clusters) {
      const d = Math.hypot(jump.x - cluster.centerX, jump.y - cluster.centerY)
      if (d > clusterRadius) continue
      cluster.items.push(jump)
      const n = cluster.items.length
      cluster.centerX = cluster.centerX + (jump.x - cluster.centerX) / n
      cluster.centerY = cluster.centerY + (jump.y - cluster.centerY) / n
      assigned = true
      break
    }
    if (!assigned) {
      clusters.push({
        centerX: jump.x,
        centerY: jump.y,
        items: [jump],
      })
    }
  }

  return clusters.map((cluster, clusterIdx) => {
    const jumps = [...cluster.items].sort((a, b) => {
      if (a.direction !== b.direction) return a.direction === 'down' ? -1 : 1
      return a.targetFloorId.localeCompare(b.targetFloorId)
    })

    const uniq = new Map<string, (typeof jumps)[number]>()
    for (const jump of jumps) {
      uniq.set(`${jump.targetFloorId}|${jump.direction}`, jump)
    }

    const buttons = Array.from(uniq.values()).map((jump, buttonIdx) => {
      const floorNum = floorNumberFromId(jump.targetFloorId)
      const floorLabel = floorNum != null ? `${floorNum} этаж` : jump.targetFloorId
      return {
        key: `cluster-${clusterIdx}|btn-${buttonIdx}|${jump.targetFloorId}|${jump.direction}`,
        targetFloorId: jump.targetFloorId,
        title: `Перейти на ${floorLabel}`,
        label: floorLabel,
        emoji: jump.direction === 'up' ? '⬆️' : '⬇️',
      }
    })

    return {
      key: `cluster-${clusterIdx}`,
      x: cluster.centerX,
      y: cluster.centerY,
      buttons,
    }
  })
}
