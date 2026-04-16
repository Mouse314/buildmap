import * as React from 'react'
import { HudModal } from '../ui/hud'

type StatsRow = { label: string; count: number }

type ScheduleStatsSummary = {
  totalLessons: number
  buildings: StatsRow[]
  teachers: StatsRow[]
  groups: StatsRow[]
}

type ScheduleStatsModalProps = {
  isOpen: boolean
  onClose: () => void
  periodMode: 'week' | 'day'
  focusDateIso: string
  teacherFilter: string
  groupFilter: string
  isLoading: boolean
  loadError: string | null
  summary: ScheduleStatsSummary
}

function formatIsoDate(value: string): string {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return value
  return `${m[3]}.${m[2]}.${m[1]}`
}

function buildWeekRangeLabel(mondayIso: string): string {
  const m = mondayIso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return `Неделя с ${formatIsoDate(mondayIso)}`

  const date = new Date(Number.parseInt(m[1], 10), Number.parseInt(m[2], 10) - 1, Number.parseInt(m[3], 10))
  if (Number.isNaN(date.getTime())) return `Неделя с ${formatIsoDate(mondayIso)}`

  const sunday = new Date(date)
  sunday.setDate(date.getDate() + 6)

  const sundayIso = `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`
  return `${formatIsoDate(mondayIso)} - ${formatIsoDate(sundayIso)}`
}

function LeaderboardSection({
  title,
  rows,
  emptyText,
}: {
  title: string
  rows: StatsRow[]
  emptyText: string
}) {
  const [showAll, setShowAll] = React.useState(false)

  React.useEffect(() => {
    setShowAll(false)
  }, [rows])

  const visible = showAll ? rows : rows.slice(0, 10)

  return (
    <section className="scheduleStatsSection">
      <div className="scheduleStatsSectionHeader">
        <h3 className="scheduleStatsSectionTitle">{title}</h3>
        {rows.length > 10 ? (
          <button
            type="button"
            className="scheduleStatsToggleBtn"
            onClick={() => setShowAll((current) => !current)}
          >
            {showAll ? 'Скрыть полный список' : `Показать полный список (${rows.length})`}
          </button>
        ) : null}
      </div>

      {rows.length === 0 ? <div className="scheduleStatsEmpty">{emptyText}</div> : null}

      {rows.length > 0 ? (
        <ol className="scheduleStatsList">
          {visible.map((item) => (
            <li key={`${title}-${item.label}`} className="scheduleStatsListItem">
              <span className="scheduleStatsLabel">{item.label}</span>
              <span className="scheduleStatsCount">{item.count}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  )
}

export function ScheduleStatsModal({
  isOpen,
  onClose,
  periodMode,
  focusDateIso,
  teacherFilter,
  groupFilter,
  isLoading,
  loadError,
  summary,
}: ScheduleStatsModalProps) {
  const [showAllBuildings, setShowAllBuildings] = React.useState(false)

  React.useEffect(() => {
    if (!isOpen) setShowAllBuildings(false)
  }, [isOpen])

  if (!isOpen) return null

  const periodLabel = periodMode === 'week'
    ? `Неделя: ${buildWeekRangeLabel(focusDateIso)}`
    : `День: ${formatIsoDate(focusDateIso)}`

  const chartRows = showAllBuildings ? summary.buildings : summary.buildings.slice(0, 10)
  const maxBuildingCount = summary.buildings[0]?.count ?? 0

  return (
    <HudModal
      isOpen={isOpen}
      onClose={onClose}
      title="Статистика расписания"
      context={periodLabel}
      overlayClassName="scheduleOverlay"
      surfaceClassName="scheduleStatsModal"
      headerClassName="scheduleModalHeader"
      titleClassName="scheduleModalTitle"
      contextClassName="scheduleModalMeta"
      closeButtonClassName="roomModalClose"
      bodyClassName="scheduleStatsBody"
    >
      <div className="scheduleStatsMetaWrap">
        <div className="scheduleStatsMetaLine">Занятий в выборке: {summary.totalLessons}</div>
        <div className="scheduleStatsMetaLine">Фильтр преподавателя: {teacherFilter.trim() || 'не задан'}</div>
        <div className="scheduleStatsMetaLine">Фильтр группы: {groupFilter.trim() || 'не задан'}</div>
      </div>

      {loadError ? <div className="scheduleError">{loadError}</div> : null}
      {isLoading ? <div className="scheduleLoading">Загрузка расписания...</div> : null}

      <section className="scheduleStatsSection">
        <div className="scheduleStatsSectionHeader">
          <h3 className="scheduleStatsSectionTitle">Распределение по корпусам</h3>
          {summary.buildings.length > 10 ? (
            <button
              type="button"
              className="scheduleStatsToggleBtn"
              onClick={() => setShowAllBuildings((current) => !current)}
            >
              {showAllBuildings ? 'Скрыть полный список' : `Показать полный список (${summary.buildings.length})`}
            </button>
          ) : null}
        </div>

        {summary.buildings.length === 0 ? <div className="scheduleStatsEmpty">Нет данных по корпусам</div> : null}

        {summary.buildings.length > 0 ? (
          <div className="scheduleStatsChart" role="img" aria-label="График распределения занятий по корпусам">
            {chartRows.map((item) => {
              const width = maxBuildingCount > 0 ? Math.max(6, Math.round((item.count / maxBuildingCount) * 100)) : 0
              return (
                <div key={`building-chart-${item.label}`} className="scheduleStatsBarRow">
                  <div className="scheduleStatsBarLabel">Корпус {item.label}</div>
                  <div className="scheduleStatsBarTrack">
                    <div className="scheduleStatsBarFill" style={{ width: `${width}%` }} />
                  </div>
                  <div className="scheduleStatsBarValue">{item.count}</div>
                </div>
              )
            })}
          </div>
        ) : null}
      </section>

      <div className="scheduleStatsSectionsGrid">
        <LeaderboardSection
          title="Топ-10 преподавателей"
          rows={summary.teachers}
          emptyText="Нет данных по преподавателям"
        />
        <LeaderboardSection
          title="Топ-10 групп"
          rows={summary.groups}
          emptyText="Нет данных по группам"
        />
      </div>
    </HudModal>
  )
}