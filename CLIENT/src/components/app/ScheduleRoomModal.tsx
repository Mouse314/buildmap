import * as React from 'react'

export type ScheduleRoomLesson = {
  groups: string[]
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

  const normalizedLessons = React.useMemo(() => {
    return lessons.map((lesson) => ({
      ...lesson,
      groups: lesson.groups.filter((value) => value.trim().length > 0),
    }))
  }, [lessons])

  const dayBlocks = React.useMemo(() => {
    const blocks: Array<{
      dayKey: string
      date: string
      weekday: string
      lessons: typeof normalizedLessons
    }> = []

    for (const lesson of normalizedLessons) {
      const dayKey = `${lesson.date}\u0001${lesson.weekday}`
      const prev = blocks[blocks.length - 1]

      if (!prev || prev.dayKey !== dayKey) {
        blocks.push({
          dayKey,
          date: lesson.date,
          weekday: lesson.weekday,
          lessons: [lesson],
        })
      } else {
        prev.lessons.push(lesson)
      }
    }

    return blocks
  }, [normalizedLessons])

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
              Режим: {periodMode === 'day' ? 'день' : 'неделя'} · занятий: {normalizedLessons.length}
            </div>
          </div>
          <button type="button" className="scheduleRoomClose" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        <div className="scheduleRoomBody">
          {normalizedLessons.length === 0 ? (
            <div className="scheduleRoomEmpty">Для этого кабинета в выбранном периоде занятий нет.</div>
          ) : (
            <div className="scheduleRoomGrid" role="table" aria-label={`Расписание кабинета ${roomLabel}`}>
              <div className="scheduleRoomGridHeader" role="rowgroup">
                <div className="scheduleRoomGridRow" role="row">
                  <div className="scheduleRoomGridHeaderCell" role="columnheader">Группа</div>
                  <div className="scheduleRoomGridHeaderCell" role="columnheader">Время</div>
                  <div className="scheduleRoomGridHeaderCell" role="columnheader">Подгруппа</div>
                  <div className="scheduleRoomGridHeaderCell" role="columnheader">Дисциплина</div>
                  <div className="scheduleRoomGridHeaderCell" role="columnheader">Тип</div>
                  <div className="scheduleRoomGridHeaderCell" role="columnheader">Преподаватель</div>
                </div>
              </div>

              <div className="scheduleRoomGridBody" role="rowgroup">
                {dayBlocks.map((block, blockIndex) => (
                  <React.Fragment key={`schedule-room-day-${block.dayKey}-${blockIndex}`}>
                    <div className="scheduleRoomDayHeaderRow" role="row">
                      <div className="scheduleRoomDayHeader" role="cell">
                        {block.date} · {block.weekday}
                      </div>
                    </div>
                    {block.lessons.map((lesson, lessonIndex) => (
                      <div className="scheduleRoomGridRow" role="row" key={`schedule-room-${blockIndex}-${lessonIndex}`}>
                        <div className="scheduleRoomGridCell" role="cell">
                          {lesson.groups.length > 0 ? (
                            <div className="scheduleRoomGroupsCell">
                              {lesson.groups.map((group, groupIndex) => (
                                <div key={`group-${blockIndex}-${lessonIndex}-${groupIndex}`}>{group}</div>
                              ))}
                            </div>
                          ) : '—'}
                        </div>
                        <div className="scheduleRoomGridCell" role="cell">{lesson.time}</div>
                        <div className="scheduleRoomGridCell" role="cell">{lesson.subgroup || '—'}</div>
                        <div className="scheduleRoomGridCell" role="cell">{lesson.discipline || '—'}</div>
                        <div className="scheduleRoomGridCell" role="cell">{lesson.lessonType || '—'}</div>
                        <div className="scheduleRoomGridCell" role="cell">{lesson.teacher || '—'}</div>
                      </div>
                    ))}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
