import * as React from 'react'
import './App.css'
import { FloorPlanCanvas } from './map/FloorPlanCanvas'
import { loadRoomDataManifest, loadRoomsFromPublic, type RoomDataManifest } from './map/roomData'
import { RoomInfoModal } from './map/RoomInfoModal'
import { RoomHoverTooltip } from './map/RoomHoverTooltip'
import { GlassDropdown } from './components/GlassDropdown'
import { getRoomFillColor } from './map/roomPalette'
import { GRAPHICS_PRESETS, type GraphicsPresetId } from './map/graphicsPresets'

import type { Room } from './map/Room'

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
  const [selectedCategory, setSelectedCategory] = React.useState<string>('__all__')
  const [searchText, setSearchText] = React.useState<string>('')

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

  const buildLabel = React.useCallback((id: string) => {
    const m = id.match(/build(\d+)/i)
    if (m) return `${m[1]} корпус`
    return id
  }, [])

  const floorLabel = React.useCallback((id: string) => {
    const m = id.match(/floor(\d+)/i)
    if (m) return `${m[1]} этаж`
    return id
  }, [])

  const titleText = React.useMemo(() => {
    return `${buildLabel(selectedBuild)}\n${floorLabel(selectedFloor)}`
  }, [buildLabel, floorLabel, selectedBuild, selectedFloor])

  const categoryOptions = React.useMemo(() => {
    const set = new Set<string>()
    for (const r of rooms) {
      const v = (r.category ?? '').trim()
      if (v.length > 0) set.add(v)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rooms])

  const selectedCategoryColor = React.useMemo(() => {
    if (selectedCategory === '__all__') return null
    const match = rooms.find((r) => (r.category ?? '').trim() === selectedCategory)
    if (!match) return null
    return getRoomFillColor(match.roomID)
  }, [rooms, selectedCategory])

  const isFiltering = selectedCategory !== '__all__' || searchText.trim().length > 0

  const matchedKeys = React.useMemo(() => {
    if (!isFiltering) return null
    const q = searchText.trim().toLowerCase()
    const set = new Set<string>()

    for (const r of rooms) {
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

  const totalRooms = rooms.length
  const matchedRooms = matchedKeys ? matchedKeys.size : totalRooms

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
    setError(null)
    loadRoomsFromPublic({ buildId: selectedBuild, floorId: selectedFloor })
      .then((data) => {
        if (cancelled) return
        setRooms(data)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      })

    return () => {
      cancelled = true
    }
  }, [selectedBuild, selectedFloor])

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
      <div className="topBar">
        <GlassDropdown
          value={selectedBuild}
          onChange={(next) => {
            setSelectedBuild(next)
            const floors = (manifest?.builds ?? []).find((b) => b.id === next)?.floors ?? []
            if (floors.length > 0 && !floors.includes(selectedFloor)) {
              setSelectedFloor(floors[0])
            }
          }}
          buttonClassName="topSelect"
          options={[
            ...buildOptions.map((b) => ({ value: b, label: buildLabel(b) })),
          ]}
        />

        <div
          className="topSelectAccentWrap"
          data-active={selectedCategory !== '__all__' && selectedCategoryColor ? 'true' : 'false'}
          style={
            selectedCategory !== '__all__' && selectedCategoryColor
              ? ({ ['--accent-color']: selectedCategoryColor } as React.CSSProperties)
              : undefined
          }
        >
          <GlassDropdown
            value={selectedCategory}
            onChange={setSelectedCategory}
            buttonClassName="topSelect topSelectCategory"
            options={[
              { value: '__all__', label: 'Все категории' },
              ...categoryOptions.map((c) => ({ value: c, label: c })),
            ]}
          />
        </div>

        <div className="topCountBadge" aria-label="Найдено помещений">
          {matchedRooms}/{totalRooms}
        </div>

        <div className="topSearchWrap">
          {searchText.length > 0 ? (
            <button
              className="topSearchClear"
              type="button"
              aria-label="Очистить поиск"
              onClick={() => {
                setSearchText('')
                requestAnimationFrame(() => searchInputRef.current?.focus())
              }}
            >
              ×
            </button>
          ) : null}
          <input
            ref={searchInputRef}
            className="topSearch"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Поиск по номеру или описанию"
          />

        </div>


        <button
          className="topButton topThemeButton"
          type="button"
          onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        >
          {theme === 'light' ? 'Ночная тема 🌃' : 'Дневная тема 🌞'}
        </button>
        
        <button className="topButton" type="button">
          Сообщить об ошибке
        </button>
        
      </div>

      <div className="sidePanel sidePanelLeft" aria-label="Этажи">
        <div className="sidePanelHeader">
          <div className="sidePanelTitle">Этажи</div>
          <button
            type="button"
            className="sidePanelToggle"
            aria-expanded={floorsOpen}
            aria-controls="floors-panel-body"
            title={floorsOpen ? 'Свернуть' : 'Развернуть'}
            onClick={() => setFloorsOpen((v) => !v)}
          >
            {floorsOpen ? '▾' : '▸'}
          </button>
        </div>

        {floorsOpen ? (
          <div className="sidePanelBody" id="floors-panel-body">
            <div className="floorButtons">
              {floorOptions.map((f) => {
                const selected = f === selectedFloor
                const short = f.match(/floor(\d+)/i)?.[1] ?? f
                return (
                  <button
                    key={f}
                    type="button"
                    className={selected ? 'floorButton floorButtonSelected' : 'floorButton'}
                    aria-pressed={selected}
                    title={floorLabel(f)}
                    onClick={() => setSelectedFloor(f)}
                  >
                    {short}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>

      <div className="sidePanel sidePanelRight" aria-label="Настройки графики">
        <div className="sidePanelHeader">
          <div className="sidePanelTitle">Настройки графики</div>
          <button
            type="button"
            className="sidePanelToggle"
            aria-expanded={graphicsOpen}
            aria-controls="graphics-panel-body"
            title={graphicsOpen ? 'Свернуть' : 'Развернуть'}
            onClick={() => setGraphicsOpen((v) => !v)}
          >
            {graphicsOpen ? '▾' : '▸'}
          </button>
        </div>

        {graphicsOpen ? (
          <div className="sidePanelBody" id="graphics-panel-body">
            <div className="graphicsButtons">
              {GRAPHICS_PRESETS.map((p) => {
                const selected = graphicsPreset === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={
                      selected
                        ? 'topButton graphicsButton graphicsButtonSelected'
                        : 'topButton graphicsButton'
                    }
                    aria-pressed={selected}
                    onClick={() => setGraphicsPreset(p.id)}
                    title={p.title}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>

      <div className="appMain">
        <FloorPlanCanvas
          rooms={rooms}
          theme={theme}
          graphicsPreset={graphicsPreset}
          searchText={searchText}
          matchedKeys={matchedKeys}
          titleText={titleText}
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
