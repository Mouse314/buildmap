import * as React from 'react'
import './App.css'
import { FloorPlanCanvas } from './map/FloorPlanCanvas'
import { loadRoomDataManifest, loadRoomsFromPublic, type RoomDataManifest } from './map/rooms/utils/roomData'
import { RoomInfoModal } from './map/rooms/components/RoomInfoModal'
import { RoomHoverTooltip } from './map/rooms/components/RoomHoverTooltip'
import { getRoomFillColor } from './map/rooms/utils/roomPalette'
import { type GraphicsPresetId } from './map/graphicsPresets'
import { TopBar } from './components/app/TopBar'
import { FloorsPanel } from './components/app/FloorsPanel'
import { GraphicsPanel } from './components/app/GraphicsPanel'
import { buildLabel, findTitleAnchorFromFloor1, floorLabel, isInteractiveRoom } from './app/utils/roomLabels'
import { useSmartSearch } from './app/search/useSmartSearch'
import type { SearchIndexedRoom } from './app/search/types'

import type { Room } from './map/rooms/utils/Room'

function App() {
  const [rooms, setRooms] = React.useState<Room[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [selectedRoomKey, setSelectedRoomKey] = React.useState<string | null>(null)
  const [hoveredRoom, setHoveredRoom] = React.useState<Room | null>(null)
  const [hoverAnchor, setHoverAnchor] = React.useState<{ x: number; y: number } | null>(null)

  const searchInputRef = React.useRef<HTMLInputElement | null>(null)

  const [theme, setTheme] = React.useState<'light' | 'dark'>('light')

  const [graphicsPreset, setGraphicsPreset] = React.useState<GraphicsPresetId>('medium')

  const [floorsOpen, setFloorsOpen] = React.useState(true)
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

  const [modalAnchor, setModalAnchor] = React.useState<{ x: number; y: number } | null>(
    null,
  )

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
    return getRoomFillColor(match.roomID)
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
    if (!pendingSearchJump) return
    if (selectedBuild !== pendingSearchJump.buildId) return
    if (selectedFloor !== pendingSearchJump.floorId) return
    if (roomsLoading) return

    requestAnimationFrame(() => {
      setSearchResultJumpTrigger((v) => v + 1)
      setPendingSearchJump(null)
    })
  }, [pendingSearchJump, roomsLoading, selectedBuild, selectedFloor])

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
        }}
        onPickSearchCategory={(category) => {
          setSelectedCategory(category)
          setSearchText('')
        }}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
      />

      <FloorsPanel
        floorsOpen={floorsOpen}
        onToggle={() => setFloorsOpen((v) => !v)}
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
      />

      <div className="appMain">
        <FloorPlanCanvas
          rooms={rooms}
          theme={theme}
          graphicsPreset={graphicsPreset}
          searchText={searchText}
          matchedKeys={matchedKeys}
          searchResultJumpTrigger={searchResultJumpTrigger}
          titleText={titleText}
          titleAnchor={titleAnchor}
          selectedRoomKey={selectedRoomKey}
          onSelectRoomKey={(key) => {
            setSelectedRoomKey(key)
            if (key == null) setModalAnchor(null)
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

      {!selectedRoom && hoveredRoom && hoverAnchor ? (
        <RoomHoverTooltip room={hoveredRoom} anchor={hoverAnchor} />
      ) : null}

      {selectedRoom && modalAnchor ? (
        <RoomInfoModal
          room={selectedRoom}
          anchor={modalAnchor}
          onClose={() => {
            setSelectedRoomKey(null)
            setModalAnchor(null)
          }}
        />
      ) : null}
    </div>
  )
}

export default App
