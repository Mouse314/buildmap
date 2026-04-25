import * as React from 'react'
import { HudAnchoredModal } from '../ui/hud'

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
    <HudAnchoredModal
      isOpen
      anchor={anchor}
      onClose={onClose}
      title={`Расписание кабинета ${roomLabel}`}
      context={`Режим: ${periodMode === 'day' ? 'день' : 'неделя'} · занятий: ${normalizedLessons.length}`}
      overlayClassName="scheduleRoomOverlay"
      surfaceClassName="scheduleRoomModal scheduleRoomModalAnchor"
      headerClassName="scheduleRoomHeader"
      titleClassName="scheduleRoomTitle"
      contextClassName="scheduleRoomMeta"
      closeButtonClassName="roomModalClose"
      bodyClassName="scheduleRoomBody"
      aboveClassName="scheduleRoomModalAbove"
      belowClassName="scheduleRoomModalBelow"
      reflowToken={`${roomLabel}:${normalizedLessons.length}`}
    >
        <div className="scheduleRoomBodyInner">
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
    </HudAnchoredModal>
  )
}
