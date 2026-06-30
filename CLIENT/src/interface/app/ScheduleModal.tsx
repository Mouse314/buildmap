import * as React from 'react'
import { fetchScheduleCsv, fetchScheduleManifest, type ScheduleManifest } from '../../schedule/api'
import {
  SCHEDULE_COLUMN_LABELS,
  SCHEDULE_COLUMN_ORDER,
  ScheduleDataset,
  type ScheduleColumnKey,
} from '../../schedule/domain'
import { HudModal } from '../ui/hud'

type ScheduleModalProps = {
  isOpen: boolean
  onClose: () => void
}

const EMPTY_COLUMN_FILTERS: Record<ScheduleColumnKey, string> = {
  sourceFile: '',
  date: '',
  weekday: '',
  time: '',
  subgroup: '',
  discipline: '',
  lessonType: '',
  teacher: '',
  cabinet: '',
}

export function ScheduleModal({ isOpen, onClose }: ScheduleModalProps) {
  const [manifest, setManifest] = React.useState<ScheduleManifest | null>(null)
  const [manifestLoading, setManifestLoading] = React.useState(false)
  const [manifestError, setManifestError] = React.useState<string | null>(null)

  const [selectedBatchDate, setSelectedBatchDate] = React.useState('')
  const [selectedCsvName, setSelectedCsvName] = React.useState('')

  const [csvLoading, setCsvLoading] = React.useState(false)
  const [csvError, setCsvError] = React.useState<string | null>(null)
  const [dataset, setDataset] = React.useState<ScheduleDataset | null>(null)

  const [selectedSubgroup, setSelectedSubgroup] = React.useState('__all__')
  const [selectedDateIso, setSelectedDateIso] = React.useState('')
  const [globalFilter, setGlobalFilter] = React.useState('')
  const [columnFilters, setColumnFilters] = React.useState<Record<ScheduleColumnKey, string>>(EMPTY_COLUMN_FILTERS)
  const [sourcePrefix, setSourcePrefix] = React.useState('schedule')

  React.useEffect(() => {
    if (!isOpen) return

    let cancelled = false
    setManifestLoading(true)
    setManifestError(null)

    fetchScheduleManifest(sourcePrefix)
      .then((value) => {
        if (cancelled) return
        setManifest(value)

        if (value.dates.length === 0) {
          setSelectedBatchDate('')
          setSelectedCsvName('')
          return
        }

        const firstDate = value.dates[0]
        setSelectedBatchDate((prev) => (prev.length > 0 ? prev : firstDate.date))

        const firstFile = firstDate.files[0]?.name ?? ''
        setSelectedCsvName((prev) => (prev.length > 0 ? prev : firstFile))
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setManifestError(error instanceof Error ? error.message : 'Не удалось загрузить манифест расписания')
      })
      .finally(() => {
        if (cancelled) return
        setManifestLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, sourcePrefix])

  const selectedBatchFiles = React.useMemo(() => {
    const dates = manifest?.dates ?? []
    const found = dates.find((item) => item.date === selectedBatchDate)
    return found?.files ?? []
  }, [manifest, selectedBatchDate])

  React.useEffect(() => {
    if (!selectedBatchDate) return
    if (selectedBatchFiles.length === 0) {
      setSelectedCsvName('')
      return
    }

    const exists = selectedBatchFiles.some((file) => file.name === selectedCsvName)
    if (!exists) {
      setSelectedCsvName(selectedBatchFiles[0].name)
    }
  }, [selectedBatchDate, selectedBatchFiles, selectedCsvName])

  React.useEffect(() => {
    if (!isOpen) return
    if (!selectedBatchDate || !selectedCsvName) return

    let cancelled = false
    setCsvLoading(true)
    setCsvError(null)

    fetchScheduleCsv(selectedBatchDate, selectedCsvName, sourcePrefix)
      .then((csvText) => {
        if (cancelled) return
        setDataset(ScheduleDataset.fromCsv(csvText))
        setSelectedSubgroup('__all__')
        setSelectedDateIso('')
        setGlobalFilter('')
        setColumnFilters(EMPTY_COLUMN_FILTERS)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setDataset(null)
        setCsvError(error instanceof Error ? error.message : 'Не удалось загрузить CSV расписания')
      })
      .finally(() => {
        if (cancelled) return
        setCsvLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, selectedBatchDate, selectedCsvName, sourcePrefix])

  const subgroups = React.useMemo(() => dataset?.getSubgroups() ?? [], [dataset])
  const dateIsos = React.useMemo(() => dataset?.getDateIsos() ?? [], [dataset])

  const filteredRows = React.useMemo(() => {
    if (!dataset) return []
    return dataset.filter({
      subgroup: selectedSubgroup,
      dateIso: selectedDateIso,
      global: globalFilter,
      columns: columnFilters,
    })
  }, [columnFilters, dataset, globalFilter, selectedDateIso, selectedSubgroup])

  const stats = React.useMemo(() => ScheduleDataset.buildStats(filteredRows), [filteredRows])

  if (!isOpen) return null

  const renderStatsBlock = (title: string, rows: Array<{ label: string; count: number }>) => {
    return (
      <div className="scheduleStatsBlock">
        <div className="scheduleStatsTitle">{title}</div>
        <div className="scheduleStatsItems">
          {rows.length === 0 ? <div className="scheduleStatsEmpty">Нет данных</div> : null}
          {rows.slice(0, 12).map((item) => (
            <div key={`${title}-${item.label}`} className="scheduleStatsItem">
              <span className="scheduleStatsLabel">{item.label}</span>
              <span className="scheduleStatsCount">{item.count}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <HudModal
      isOpen={isOpen}
      onClose={onClose}
      title="Расписание"
      context="Просмотр и фильтрация CSV файлов"
      overlayClassName="scheduleOverlay"
      surfaceClassName="scheduleModal"
      headerClassName="scheduleModalHeader"
      titleClassName="scheduleModalTitle"
      contextClassName="scheduleModalMeta"
      closeButtonClassName="roomModalClose"
      bodyClassName="scheduleModalBody"
    >
        <div className="scheduleControlsGrid">
          <label className="scheduleField">
            <span className="scheduleFieldLabel">Пакет расписания</span>
            <select
              className="scheduleSelect"
              value={selectedBatchDate}
              onChange={(e) => setSelectedBatchDate(e.target.value)}
              disabled={manifestLoading || (manifest?.dates.length ?? 0) === 0}
            >
              {(manifest?.dates ?? []).map((item) => (
                <option key={`batch-${item.date}`} value={item.date}>{item.date}</option>
              ))}
            </select>
          </label>

          <label className="scheduleField scheduleFieldWide">
            <span className="scheduleFieldLabel">Группа (CSV)</span>
            <select
              className="scheduleSelect"
              value={selectedCsvName}
              onChange={(e) => setSelectedCsvName(e.target.value)}
              disabled={csvLoading || selectedBatchFiles.length === 0}
            >
              {selectedBatchFiles.map((file) => (
                <option key={`csv-${file.name}`} value={file.name}>{file.name}</option>
              ))}
            </select>
          </label>

          <label className="scheduleField">
            <span className="scheduleFieldLabel">Подгруппа</span>
            <select
              className="scheduleSelect"
              value={selectedSubgroup}
              onChange={(e) => setSelectedSubgroup(e.target.value)}
              disabled={!dataset}
            >
              <option value="__all__">Все подгруппы</option>
              {subgroups.map((subgroup) => (
                <option key={`subgroup-${subgroup}`} value={subgroup}>{subgroup}</option>
              ))}
            </select>
          </label>

          <label className="scheduleField">
            <span className="scheduleFieldLabel">Календарь (дата)</span>
            <input
              className="scheduleInput"
              type="date"
              value={selectedDateIso}
              onChange={(e) => setSelectedDateIso(e.target.value)}
              list="schedule-date-list"
              disabled={!dataset}
            />
            <datalist id="schedule-date-list">
              {dateIsos.map((value) => (
                <option key={`date-${value}`} value={value} />
              ))}
            </datalist>
          </label>

          <label className="scheduleField scheduleFieldWide">
            <span className="scheduleFieldLabel">Общий фильтр по таблице</span>
            <input
              className="scheduleInput"
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder="Поиск сразу по всем колонкам"
              disabled={!dataset}
            />
          </label>
        </div>

        {manifestError ? <div className="scheduleError">{manifestError}</div> : null}
        {csvError ? <div className="scheduleError">{csvError}</div> : null}

        {manifestLoading || csvLoading ? (
          <div className="scheduleLoading">Загрузка расписания...</div>
        ) : null}

        {dataset ? (
          <>
            <div className="scheduleStatsGrid">
              {renderStatsBlock('Корпуса', stats.buildings)}
              {renderStatsBlock('Преподаватели', stats.teachers)}
              {renderStatsBlock('Дни недели', stats.weekdays)}
            </div>

            <div className="scheduleTableMeta">
              Показано записей: {filteredRows.length} / {dataset.rows.length}
            </div>

            <div className="scheduleTableWrap">
              <table className="scheduleTable">
                <thead>
                  <tr>
                    {SCHEDULE_COLUMN_ORDER.map((column) => (
                      <th key={`head-${column}`}>{SCHEDULE_COLUMN_LABELS[column]}</th>
                    ))}
                  </tr>
                  <tr>
                    {SCHEDULE_COLUMN_ORDER.map((column) => (
                      <th key={`filter-${column}`}>
                        <input
                          className="scheduleColumnFilter"
                          value={columnFilters[column]}
                          onChange={(e) => {
                            const next = e.target.value
                            setColumnFilters((prev) => ({ ...prev, [column]: next }))
                          }}
                          placeholder="фильтр"
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, idx) => (
                    <tr key={`row-${idx}`}>
                      {SCHEDULE_COLUMN_ORDER.map((column) => (
                        <td key={`cell-${idx}-${column}`}>{row.getValueByColumn(column)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
    </HudModal>
  )
}
