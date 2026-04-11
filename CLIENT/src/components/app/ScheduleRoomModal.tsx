import * as React from 'react'

export type ScheduleRoomLesson = {
  group: string
  date: string
  weekday: string
  time: string
  subgroup: string
  discipline: string
  lessonType: string
  teacher: string
  cabinet: string
}

export function ScheduleRoomModal({
  roomLabel,
  periodMode,
  lessons,
  anchor,
  onClose,
}: {
  roomLabel: string
  periodMode: 'week' | 'day'
  lessons: ScheduleRoomLesson[]
  anchor: { x: number; y: number }
  onClose: () => void
}) {
  const modalRef = React.useRef<HTMLDivElement | null>(null)
  const [placement, setPlacement] = React.useState<'above' | 'below'>('above')
  const [pos, setPos] = React.useState<{ left: number; top: number }>({
    left: anchor.x,
    top: anchor.y,
  })

  React.useLayoutEffect(() => {
    const el = modalRef.current
    if (!el) return

    const padding = 12
    const gap = 12

    const topBarEl = document.querySelector<HTMLElement>('.topBar')
    const topBarBottom = topBarEl ? topBarEl.getBoundingClientRect().bottom : 0
    const safeTop = Math.max(padding, Math.ceil(topBarBottom) + 8)

    const r = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
    const left = clamp(anchor.x, padding + r.width / 2, vw - padding - r.width / 2)

    const canPlaceAbove = anchor.y - gap - r.height >= safeTop
    const canPlaceBelow = anchor.y + gap + r.height <= vh - padding

    let nextPlacement: 'above' | 'below' = placement
    if (nextPlacement === 'above' && !canPlaceAbove && canPlaceBelow) {
      nextPlacement = 'below'
    } else if (nextPlacement === 'below' && !canPlaceBelow && canPlaceAbove) {
      nextPlacement = 'above'
    } else if (!canPlaceAbove && canPlaceBelow) {
      nextPlacement = 'below'
    } else if (canPlaceAbove) {
      nextPlacement = 'above'
    }

    const topMin = nextPlacement === 'above' ? safeTop + r.height + gap : safeTop - gap
    const topMaxRaw = nextPlacement === 'above' ? vh - padding : vh - padding - r.height - gap
    const topMax = Math.max(topMin, topMaxRaw)
    const top = clamp(anchor.y, topMin, topMax)

    setPlacement(nextPlacement)
    setPos({ left, top })
  }, [anchor.x, anchor.y, placement, lessons.length, roomLabel])

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="scheduleRoomOverlay"
      onPointerDown={(e) => {
        if (e.pointerType !== 'mouse') return
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={modalRef}
        className={placement === 'above' ? 'scheduleRoomModal scheduleRoomModalAnchor scheduleRoomModalAbove' : 'scheduleRoomModal scheduleRoomModalAnchor scheduleRoomModalBelow'}
        style={{ left: pos.left, top: pos.top }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="scheduleRoomHeader">
          <div>
            <div className="scheduleRoomTitle">Расписание кабинета {roomLabel}</div>
            <div className="scheduleRoomMeta">
              Режим: {periodMode === 'day' ? 'день' : 'неделя'} · занятий: {lessons.length}
            </div>
          </div>
          <button type="button" className="scheduleRoomClose" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        <div className="scheduleRoomBody">
          {lessons.length === 0 ? (
            <div className="scheduleRoomEmpty">Для этого кабинета в выбранном периоде занятий нет.</div>
          ) : (
            <table className="scheduleRoomTable">
              <thead>
                <tr>
                  <th>Группа</th>
                  <th>Дата</th>
                  <th>Время</th>
                  <th>Подгруппа</th>
                  <th>Дисциплина</th>
                  <th>Тип</th>
                  <th>Преподаватель</th>
                </tr>
              </thead>
              <tbody>
                {lessons.map((lesson, idx) => (
                  <tr key={`schedule-room-${idx}`}>
                    <td>{lesson.group || '—'}</td>
                    <td>{lesson.date} · {lesson.weekday}</td>
                    <td>{lesson.time}</td>
                    <td>{lesson.subgroup}</td>
                    <td>{lesson.discipline}</td>
                    <td>{lesson.lessonType}</td>
                    <td>{lesson.teacher}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
