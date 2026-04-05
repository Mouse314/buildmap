import * as React from 'react'
import {
  loadRoomDataManifest,
  loadRoomGraphFromPublic,
  loadRoomsFromPublic,
  publicAssetUrl,
  type RoomDataManifest,
  type RoomGraph,
} from '../../../map/rooms/utils/roomData'
import { findTitleAnchorFromFloor1 } from '../../utils/roomLabels'
import type { LoadedFloorData } from '../../../navigation/types'
import type { OfficesHierarchyData } from '../../offices/types'
import type { Room } from '../../../map/rooms/utils/Room'
import type { BuildGeoDraft } from './types'
import { buildGeoDraftByBuild } from './geoUtils'

export function useMapDataLoader() {
  const [manifest, setManifest] = React.useState<RoomDataManifest | null>(null)
  const [selectedBuild, setSelectedBuild] = React.useState<string>('build14')
  const [selectedFloor, setSelectedFloor] = React.useState<string>('floor1')

  const [rooms, setRooms] = React.useState<Room[]>([])
  const [roomsLoading, setRoomsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [roomGraph, setRoomGraph] = React.useState<RoomGraph | null>(null)
  const [buildFloorData, setBuildFloorData] = React.useState<LoadedFloorData[]>([])
  const [titleAnchor, setTitleAnchor] = React.useState<{ x: number; y: number } | null>(null)
  const [officesHierarchy, setOfficesHierarchy] = React.useState<OfficesHierarchyData | null>(null)
  const [geoDraftByBuild, setGeoDraftByBuild] = React.useState<Record<string, BuildGeoDraft>>({})

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
      .catch((loadError: unknown) => {
        if (cancelled) return
        setError(loadError instanceof Error ? loadError.message : String(loadError))
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
    let cancelled = false
    if (!manifest) {
      return () => {
        cancelled = true
      }
    }

    buildGeoDraftByBuild(manifest.builds)
      .then((next) => {
        if (cancelled) return
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

  const setBuildAndNormalizeFloor = React.useCallback((nextBuild: string) => {
    setSelectedBuild(nextBuild)
    const floors = (manifest?.builds ?? []).find((b) => b.id === nextBuild)?.floors ?? []
    if (floors.length > 0 && !floors.includes(selectedFloor)) {
      setSelectedFloor(floors[0])
    }
  }, [manifest, selectedFloor])

  return {
    manifest,
    selectedBuild,
    selectedFloor,
    rooms,
    roomsLoading,
    error,
    roomGraph,
    buildFloorData,
    titleAnchor,
    officesHierarchy,
    geoDraftByBuild,

    setRooms,
    setSelectedBuild,
    setSelectedFloor,
    setBuildAndNormalizeFloor,
    setGeoDraftByBuild,
  }
}
