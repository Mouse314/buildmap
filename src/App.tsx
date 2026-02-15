import * as React from 'react'
import './App.css'
import { FloorPlanCanvas } from './map/FloorPlanCanvas'
import { loadRoomsFromPublic } from './map/roomData'
import { RoomInfoModal } from './map/RoomInfoModal'
import { RoomHoverTooltip } from './map/RoomHoverTooltip'
import { GlassDropdown } from './components/GlassDropdown'

import type { Room } from './map/Room'

function App() {
  const [rooms, setRooms] = React.useState<Room[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [selectedRoomKey, setSelectedRoomKey] = React.useState<string | null>(null)
  const [hoveredRoom, setHoveredRoom] = React.useState<Room | null>(null)
  const [hoverAnchor, setHoverAnchor] = React.useState<{ x: number; y: number } | null>(null)

  const searchInputRef = React.useRef<HTMLInputElement | null>(null)

  const [theme, setTheme] = React.useState<'light' | 'dark'>('light')

  const [selectedBuild, setSelectedBuild] = React.useState<string>('__all__')
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
    const set = new Set<string>()
    for (const r of rooms) {
      const v = (r.build ?? '').trim()
      if (v.length > 0) set.add(v)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rooms])

  const categoryOptions = React.useMemo(() => {
    const set = new Set<string>()
    for (const r of rooms) {
      const v = (r.category ?? '').trim()
      if (v.length > 0) set.add(v)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rooms])

  const isFiltering =
    selectedBuild !== '__all__' || selectedCategory !== '__all__' || searchText.trim().length > 0

  const matchedKeys = React.useMemo(() => {
    if (!isFiltering) return null
    const q = searchText.trim().toLowerCase()
    const set = new Set<string>()

    for (const r of rooms) {
      const build = (r.build ?? '').trim()
      const category = (r.category ?? '').trim()
      const roomNo = (r.roomNo ?? '').trim()
      const description = (r.description ?? '').trim()

      if (selectedBuild !== '__all__' && build !== selectedBuild) continue
      if (selectedCategory !== '__all__' && category !== selectedCategory) continue

      if (q.length > 0) {
        const ok =
          roomNo.toLowerCase().includes(q) || description.toLowerCase().includes(q)
        if (!ok) continue
      }

      set.add(r.key)
    }

    return set
  }, [isFiltering, rooms, searchText, selectedBuild, selectedCategory])

  React.useEffect(() => {
    let cancelled = false
    loadRoomsFromPublic({ jsonPath: '/room_data.json', csvPath: '/room_data.csv' })
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
  }, [])

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
          onChange={setSelectedBuild}
          buttonClassName="topSelect"
          options={[
            { value: '__all__', label: 'Все корпуса' },
            ...buildOptions.map((b) => ({ value: b, label: b })),
          ]}
        />

        <GlassDropdown
          value={selectedCategory}
          onChange={setSelectedCategory}
          buttonClassName="topSelect"
          options={[
            { value: '__all__', label: 'Все категории' },
            ...categoryOptions.map((c) => ({ value: c, label: c })),
          ]}
        />

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

      <div className="appMain">
        <FloorPlanCanvas
          rooms={rooms}
          theme={theme}
          matchedKeys={matchedKeys}
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
