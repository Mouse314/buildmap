import * as React from 'react'
import './App.css'
import { FloorPlanCanvas } from './map/FloorPlanCanvas'
import {
  loadRoomDataManifest,
  loadRoomGraphFromPublic,
  loadRoomsFromPublic,
  publicAssetUrl,
  type RoomDataManifest,
  type RoomGraph,
} from './map/rooms/utils/roomData'
import { RoomInfoModal } from './map/rooms/components/RoomInfoModal'
import { RoomHoverTooltip } from './map/rooms/components/RoomHoverTooltip'
import { getRoomFillColor } from './map/rooms/utils/roomPalette'
import { type GraphicsPresetId } from './map/graphicsPresets'
import { TopBar } from './components/app/TopBar'
import { FloorsPanel } from './components/app/FloorsPanel'
import { GraphicsPanel } from './components/app/GraphicsPanel'
import { OfficesDirectory } from './components/app/OfficesDirectory'
import { buildLabel, findTitleAnchorFromFloor1, floorLabel, isInteractiveRoom } from './app/utils/roomLabels'
import { useSmartSearch } from './app/search/useSmartSearch'
import type { SearchIndexedRoom } from './app/search/types'
import { buildRouteHints } from './navigation/hints'
import { computeRoute } from './navigation/routeEngine'
import type { LoadedFloorData, RouteEndpoint, RouteFloorJump, RouteSegment, RouteTarget } from './navigation/types'
import type { OfficeLocation, OfficeNode, OfficesHierarchyData } from './app/offices/types'

import type { Room } from './map/rooms/utils/Room'

type MapMode = 'normal' | 'routes'

type RoomEditPayload = {
  roomNo?: string
  category?: string
  description?: string
  areClosed?: boolean
  areaM2?: number
  build?: string | null
  floor?: string | null
}

function normalizeText(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function applyRoomChangesLocal(room: Room, changes: RoomEditPayload): Room {
  return {
    ...room,
    roomNo: normalizeText(changes.roomNo),
    category: normalizeText(changes.category),
    description: normalizeText(changes.description),
    areClosed: changes.areClosed,
    areaM2: typeof changes.areaM2 === 'number' && Number.isFinite(changes.areaM2) ? changes.areaM2 : undefined,
    build: changes.build ?? null,
    floor: changes.floor ?? null,
  }
}

function App() {
  const [rooms, setRooms] = React.useState<Room[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [selectedRoomKey, setSelectedRoomKey] = React.useState<string | null>(null)
  const [hoveredRoom, setHoveredRoom] = React.useState<Room | null>(null)
  const [hoverAnchor, setHoverAnchor] = React.useState<{ x: number; y: number } | null>(null)

  const searchInputRef = React.useRef<HTMLInputElement | null>(null)

  const [theme, setTheme] = React.useState<'light' | 'dark'>('light')

  const [graphicsPreset, setGraphicsPreset] = React.useState<GraphicsPresetId>('min')

  const [graphicsOpen, setGraphicsOpen] = React.useState(true)

  const [manifest, setManifest] = React.useState<RoomDataManifest | null>(null)
  const [selectedBuild, setSelectedBuild] = React.useState<string>('build14')
  const [selectedFloor, setSelectedFloor] = React.useState<string>('floor1')
  const [titleAnchor, setTitleAnchor] = React.useState<{ x: number; y: number } | null>(null)
  const [selectedCategory, setSelectedCategory] = React.useState<string>('__all__')
  const [searchText, setSearchText] = React.useState<string>('')
  const [searchResultJumpTrigger, setSearchResultJumpTrigger] = React.useState(0)
  const [roomsLoading, setRoomsLoading] = React.useState(false)
  const [pendingSearchJump, setPendingSearchJump] = React.useState<SearchIndexedRoom | null>(null)
  const [roomGraph, setRoomGraph] = React.useState<RoomGraph | null>(null)
  const [mapMode, setMapMode] = React.useState<MapMode>('normal')
  const [buildFloorData, setBuildFloorData] = React.useState<LoadedFloorData[]>([])
  const [routeFrom, setRouteFrom] = React.useState<RouteTarget | null>(null)
  const [routeTo, setRouteTo] = React.useState<RouteTarget | null>(null)
  const [activeRouteEndpoint, setActiveRouteEndpoint] = React.useState<RouteEndpoint>('to')
  const [routeDistanceM, setRouteDistanceM] = React.useState<number | null>(null)
  const [routeSegments, setRouteSegments] = React.useState<RouteSegment[]>([])
  const [routeFloorJumps, setRouteFloorJumps] = React.useState<RouteFloorJump[]>([])
  const [routeHints, setRouteHints] = React.useState<string[]>([])
  const [showGraphOverlay, setShowGraphOverlay] = React.useState(false)
  const [officesHierarchy, setOfficesHierarchy] = React.useState<OfficesHierarchyData | null>(null)
  const [isAdminMode, setIsAdminMode] = React.useState(false)

  const [modalAnchor, setModalAnchor] = React.useState<{ x: number; y: number } | null>(
    null,
  )

  const isTouchDevice = React.useMemo(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia?.('(pointer: coarse)').matches ?? false
  }, [])

  const toggleAdminMode = React.useCallback(() => {
    if (isAdminMode) {
      setIsAdminMode(false)
      return
    }
    const password = window.prompt('Введите пароль администратора')
    if (password === 'poper') {
      setIsAdminMode(true)
      return
    }
    window.alert('Неверный пароль')
  }, [isAdminMode])

  const saveRoomChanges = React.useCallback(async (room: Room, changes: RoomEditPayload) => {
    const response = await fetch('/api/admin/rooms/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        buildId: selectedBuild,
        floorId: selectedFloor,
        roomKey: room.key,
        changes,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(text || `Ошибка сохранения (${response.status})`)
    }

    const updatedRoom = applyRoomChangesLocal(room, changes)
    setRooms((prev) => prev.map((item) => (item.key === room.key ? updatedRoom : item)))
  }, [selectedBuild, selectedFloor])

  const selectedRoom = React.useMemo(() => {
    if (selectedRoomKey == null) return null
    return rooms.find((r) => r.key === selectedRoomKey) ?? null
  }, [rooms, selectedRoomKey])

  const buildOptions = React.useMemo(() => {
    const builds = manifest?.builds ?? []
    return builds.map((b) => b.id)
  }, [manifest])

  const floorOptions = React.useMemo(() => {
    const b = (manifest?.builds ?? []).find((x) => x.id === selectedBuild)
    const floors = b?.floors ?? []
    return floors.length > 0 ? floors : [selectedFloor]
  }, [manifest, selectedBuild, selectedFloor])

  const titleText = React.useMemo(() => {
    return `${buildLabel(selectedBuild)}\n${floorLabel(selectedFloor)}`
  }, [selectedBuild, selectedFloor])

  const categoryOptions = React.useMemo(() => {
    const set = new Set<string>()
    for (const r of rooms) {
      if (!isInteractiveRoom(r)) continue
      const v = (r.category ?? '').trim()
      if (v.length > 0) set.add(v)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rooms])

  const selectedCategoryColor = React.useMemo(() => {
    if (selectedCategory === '__all__') return null
    const match = rooms.find((r) => isInteractiveRoom(r) && (r.category ?? '').trim() === selectedCategory)
    if (!match) return null
    return getRoomFillColor(match.roomID, match.category)
  }, [rooms, selectedCategory])

  const isFiltering = selectedCategory !== '__all__' || searchText.trim().length > 0

  const matchedKeys = React.useMemo(() => {
    if (!isFiltering) return null
    const q = searchText.trim().toLowerCase()
    const set = new Set<string>()

    for (const r of rooms) {
      if (!isInteractiveRoom(r)) continue
      const category = (r.category ?? '').trim()
      const roomNo = (r.roomNo ?? '').trim()
      const description = (r.description ?? '').trim()

      if (selectedCategory !== '__all__' && category !== selectedCategory) continue

      if (q.length > 0) {
        const ok =
          roomNo.toLowerCase().includes(q) || description.toLowerCase().includes(q)
        if (!ok) continue
      }

      set.add(r.key)
    }

    return set
  }, [isFiltering, rooms, searchText, selectedCategory])

  const smartSearchData = useSmartSearch({ manifest, selectedBuild, searchText, isInteractiveRoom })

  const totalRooms = React.useMemo(() => rooms.filter(isInteractiveRoom).length, [rooms])
  const matchedRooms = matchedKeys ? matchedKeys.size : totalRooms

  const buildRouteTargetFromRoom = React.useCallback((room: Room, buildId: string, floorId: string): RouteTarget => {
    const roomNo = (room.roomNo ?? '').trim()
    return {
      buildId,
      floorId,
      roomKey: room.key,
      label: roomNo.length > 0 ? `№ ${roomNo}` : (room.description ?? room.category ?? 'кабинет'),
    }
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
    if (selectedRoomKey == null) return
    const r = rooms.find((x) => x.key === selectedRoomKey)
    if (r && !isInteractiveRoom(r)) {
      setSelectedRoomKey(null)
      setModalAnchor(null)
    }
  }, [rooms, selectedRoomKey])

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
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
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
      setRouteHints([])
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
    if (!pendingSearchJump) return
    if (selectedBuild !== pendingSearchJump.buildId) return
    if (selectedFloor !== pendingSearchJump.floorId) return
    if (roomsLoading) return

    requestAnimationFrame(() => {
      setSelectedRoomKey(pendingSearchJump.key)
      setModalAnchor(null)
      setSearchResultJumpTrigger((v) => v + 1)
      setPendingSearchJump(null)
    })
  }, [pendingSearchJump, roomsLoading, selectedBuild, selectedFloor])

  const openOfficeOnMap = React.useCallback((location: OfficeLocation, node: OfficeNode) => {
    setMapMode('normal')
    setSelectedCategory('__all__')
    setSelectedBuild(location.buildId)
    setSelectedFloor(location.floorId)
    setSearchText(location.roomNo)
    setPendingSearchJump({
      key: location.roomKey,
      buildId: location.buildId,
      floorId: location.floorId,
      roomNo: location.roomNo,
      description: node.name,
      category: node.type,
    })
  }, [])

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

  if (error) {
    return (
      <div className="appError">
        <div className="appErrorTitle">Failed to load room data</div>
        <pre className="appErrorDetails">{error}</pre>
      </div>
    )
  }

  return (
    <div className="appRoot" data-theme={theme}>
      <TopBar
        selectedBuild={selectedBuild}
        buildOptions={buildOptions}
        buildLabel={buildLabel}
        onBuildChange={(next) => {
          setSelectedBuild(next)
          const floors = (manifest?.builds ?? []).find((b) => b.id === next)?.floors ?? []
          if (floors.length > 0 && !floors.includes(selectedFloor)) {
            setSelectedFloor(floors[0])
          }
        }}
        selectedCategory={selectedCategory}
        categoryOptions={categoryOptions}
        selectedCategoryColor={selectedCategoryColor}
        onCategoryChange={setSelectedCategory}
        matchedRooms={matchedRooms}
        totalRooms={totalRooms}
        searchText={searchText}
        onSearchTextChange={setSearchText}
        onClearSearch={() => {
          setSearchText('')
          setSelectedCategory('__all__')
          requestAnimationFrame(() => searchInputRef.current?.focus())
        }}
        searchInputRef={searchInputRef}
        smartSearchData={smartSearchData}
        floorLabel={floorLabel}
        onPickSearchRoom={(item) => {
          setSelectedCategory('__all__')
          setSelectedBuild(item.buildId)
          setSelectedFloor(item.floorId)
          setSearchText(item.roomNo.length > 0 ? item.roomNo : item.description)
          setPendingSearchJump(item)
          if (mapMode === 'routes') {
            applyRouteEndpoint(activeRouteEndpoint, {
              buildId: item.buildId,
              floorId: item.floorId,
              roomKey: item.key,
              label: item.roomNo.length > 0 ? `№ ${item.roomNo}` : item.description,
            })
          }
        }}
        onPickSearchCategory={(category) => {
          setSelectedCategory(category)
          setSearchText('')
        }}
        graphicsPreset={graphicsPreset}
        onSelectPreset={setGraphicsPreset}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        isAdminMode={isAdminMode}
        onToggleAdminMode={toggleAdminMode}
      />

      <FloorsPanel
        floorOptions={floorOptions}
        selectedFloor={selectedFloor}
        floorLabel={floorLabel}
        onSelectFloor={setSelectedFloor}
      />

      <GraphicsPanel
        graphicsOpen={graphicsOpen}
        onToggle={() => setGraphicsOpen((v) => !v)}
        graphicsPreset={graphicsPreset}
        onSelectPreset={setGraphicsPreset}
        showGraphOverlay={showGraphOverlay}
        onToggleGraphOverlay={() => setShowGraphOverlay((v) => !v)}
      />

      <div className="appMain">
        <FloorPlanCanvas
          rooms={rooms}
          roomGraph={roomGraph}
          theme={theme}
          graphicsPreset={graphicsPreset}
          searchText={searchText}
          matchedKeys={matchedKeys}
          searchResultJumpTrigger={searchResultJumpTrigger}
          routeSegments={routeSegments}
          routeFloorJumps={routeFloorJumps}
          onRouteFloorJump={(targetFloorId) => setSelectedFloor(targetFloorId)}
          showGraphOverlay={showGraphOverlay}
          titleText={titleText}
          titleAnchor={titleAnchor}
          selectedRoomKey={selectedRoomKey}
          onSelectRoomKey={(key) => {
            setSelectedRoomKey(key)
            if (key == null) setModalAnchor(null)
            if (key != null && mapMode === 'routes') {
              const room = rooms.find((r) => r.key === key)
              if (room && isInteractiveRoom(room)) {
                applyRouteEndpoint(activeRouteEndpoint, buildRouteTargetFromRoom(room, selectedBuild, selectedFloor))
              }
            }
          }}
          onOpenRoom={({ clientX, clientY }) => {
            setModalAnchor({ x: clientX, y: clientY })
          }}
          onHoverRoom={(payload) => {
            if (!payload) {
              setHoveredRoom(null)
              setHoverAnchor(null)
              return
            }
            setHoveredRoom(payload.room)
            setHoverAnchor({ x: payload.clientX, y: payload.clientY })
          }}
        />
      </div>

      {!isTouchDevice && !selectedRoom && hoveredRoom && hoverAnchor ? (
        <RoomHoverTooltip room={hoveredRoom} anchor={hoverAnchor} />
      ) : null}

      {selectedRoom && modalAnchor ? (
        <RoomInfoModal
          room={selectedRoom}
          anchor={modalAnchor}
          isAdminMode={isAdminMode}
          onSaveRoom={(changes) => saveRoomChanges(selectedRoom, changes)}
          onBuildRoute={(room) => {
            setMapMode('routes')
            applyRouteEndpoint(activeRouteEndpoint, buildRouteTargetFromRoom(room, selectedBuild, selectedFloor))
          }}
          onClose={() => {
            setSelectedRoomKey(null)
            setModalAnchor(null)
          }}
        />
      ) : null}

      {mapMode === 'routes' && routeHints.length > 0 ? (
        <div className="routeHintsWrap" aria-live="polite">
          {routeHints.map((hint, idx) => (
            <div key={`route-hint-${idx}`} className="routeHintItem">{hint}</div>
          ))}
        </div>
      ) : null}

      <OfficesDirectory
        data={officesHierarchy}
        buildLabel={buildLabel}
        floorLabel={floorLabel}
        onOpenCabinet={openOfficeOnMap}
      />

      <div className="mapModeSwitchWrap">
        <button
          type="button"
          className={mapMode === 'normal' ? 'mapModeBtn mapModeBtnActive' : 'mapModeBtn'}
          onClick={() => setMapMode('normal')}
        >
          Обычный
        </button>
        <button
          type="button"
          className={mapMode === 'routes' ? 'mapModeBtn mapModeBtnActive' : 'mapModeBtn'}
          onClick={() => setMapMode('routes')}
        >
          Маршруты
        </button>
        {mapMode === 'routes' ? (
          <div className="mapModeRouteMeta">
            <div className="routeEndpointSwitch">
              <button
                type="button"
                className={activeRouteEndpoint === 'from' ? 'routeEndpointBtn routeEndpointBtnActive' : 'routeEndpointBtn'}
                onClick={() => setActiveRouteEndpoint('from')}
              >
                Откуда
              </button>
              <button
                type="button"
                className={activeRouteEndpoint === 'to' ? 'routeEndpointBtn routeEndpointBtnActive' : 'routeEndpointBtn'}
                onClick={() => setActiveRouteEndpoint('to')}
              >
                Куда
              </button>
              <button
                type="button"
                className="routeMainEntranceBtn"
                onClick={() => setRouteFrom(null)}
                title="Сбросить точку старта к главному входу"
              >
                От главного входа
              </button>
            </div>
            <div className="routeMetaLine">Откуда: {routeFrom ? routeFrom.label : 'Главный вход'}</div>
            <div className="routeMetaLine">Куда: {routeTo ? routeTo.label : 'Выберите кабинет или воспользуйтесь поиском'}</div>
            {routeDistanceM != null ? <div className="routeMetaDistance">Длина: {routeDistanceM.toFixed(1)} м</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default App
