import * as React from 'react';
import type { OfficeLocation, OfficeNode, OfficesHierarchyData } from '../../app/offices/types';
import { HudButton, HudModal } from '../ui/hud';

type OfficesDirectoryProps = {
  data: OfficesHierarchyData | null;
  buildLabel: (id: string) => string;
  floorLabel: (id: string) => string;
  onOpenCabinet: (location: OfficeLocation, node: OfficeNode) => void;
};

type OfficeTableRow = {
  key: string;
  instituteId: string;
  institute: string;
  instituteLink: string;
  facultyId: string;
  faculty: string;
  facultyLink: string;
  department: string;
  departmentLink: string;
  cabinet: string;
  location: OfficeLocation | null;
  node: OfficeNode;
};

function flattenRows(institutes: OfficeNode[]): OfficeTableRow[] {
  const rows: OfficeTableRow[] = [];

  for (const institute of institutes) {
    rows.push({
      key: `${institute.id}-self`,
      instituteId: institute.id,
      institute: institute.name,
      instituteLink: institute.link,
      facultyId: '',
      faculty: '',
      facultyLink: '',
      department: '',
      departmentLink: '',
      cabinet: institute.cabinet,
      location: institute.location,
      node: institute,
    });

    for (const maybeFaculty of institute.children) {
      if (maybeFaculty.type === 'faculty') {
        rows.push({
          key: `${maybeFaculty.id}-self`,
          instituteId: institute.id,
          institute: institute.name,
          instituteLink: institute.link,
          facultyId: maybeFaculty.id,
          faculty: maybeFaculty.name,
          facultyLink: maybeFaculty.link,
          department: '',
          departmentLink: '',
          cabinet: maybeFaculty.cabinet,
          location: maybeFaculty.location,
          node: maybeFaculty,
        });

        for (const department of maybeFaculty.children) {
          rows.push({
            key: `${department.id}-self`,
            instituteId: institute.id,
            institute: institute.name,
            instituteLink: institute.link,
            facultyId: maybeFaculty.id,
            faculty: maybeFaculty.name,
            facultyLink: maybeFaculty.link,
            department: department.name,
            departmentLink: department.link,
            cabinet: department.cabinet,
            location: department.location,
            node: department,
          });
        }
        continue;
      }

      rows.push({
        key: `${maybeFaculty.id}-direct`,
        instituteId: institute.id,
        institute: institute.name,
        instituteLink: institute.link,
        facultyId: '',
        faculty: '',
        department: maybeFaculty.name,
        facultyLink: '',
        departmentLink: maybeFaculty.link,
        cabinet: maybeFaculty.cabinet,
        location: maybeFaculty.location,
        node: maybeFaculty,
      });
    }
  }

  return rows;
}

function formatCabinetLabel(value: string): string {
  const text = String(value ?? '').trim();
  if (!text) return '';

  return text.replace(/(\d+\s*-\s*\d+)([A-Za-zА-Яа-я]+)/gu, (_full, prefix: string, suffix: string) => {
    return `${prefix}${suffix.toLocaleLowerCase('ru-RU')}`;
  });
}

export function OfficesDirectory({ data, buildLabel, floorLabel, onOpenCabinet }: OfficesDirectoryProps) {
  const [open, setOpen] = React.useState(false);
  const rows = React.useMemo(() => flattenRows(data?.institutes ?? []), [data]);

  const instituteSpanByStart = React.useMemo(() => {
    const spanMap = new Map<number, number>();
    let idx = 0;
    while (idx < rows.length) {
      const baseId = rows[idx].instituteId;
      let j = idx + 1;
      while (j < rows.length && rows[j].instituteId === baseId) j += 1;
      spanMap.set(idx, j - idx);
      idx = j;
    }
    return spanMap;
  }, [rows]);

  const facultySpanByStart = React.useMemo(() => {
    const spanMap = new Map<number, number>();
    let idx = 0;
    while (idx < rows.length) {
      const row = rows[idx];
      const baseFacultyId = row.facultyId;
      if (!baseFacultyId) {
        spanMap.set(idx, 1);
        idx += 1;
        continue;
      }

      let j = idx + 1;
      while (j < rows.length && rows[j].instituteId === row.instituteId && rows[j].facultyId === baseFacultyId) {
        j += 1;
      }
      spanMap.set(idx, j - idx);
      idx = j;
    }
    return spanMap;
  }, [rows]);

  const renderLinkCell = (text: string, href: string, hint: string) => {
    if (!text) return <span className="officesMuted">—</span>;
    if (!href) return <span title="Ссылка отсутствует">{text}</span>;
    return (
      <a className="officesNameLink" href={href} target="_blank" rel="noreferrer" title={hint}>
        {text}
      </a>
    );
  };

  return (
    <>
      <HudButton
        title="Структура ВятГУ"
        data={{ action: 'open-offices-directory' }}
        className="officesDirectoryFab"
        onClick={() => setOpen(true)}
        hint="Открыть таблицу институтов, факультетов и кафедр"
      >
        Структура ВятГУ
      </HudButton>

      <HudModal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Институты, Факультеты и Кафедры"
        context={data
          ? `Найдено на карте: ${data.stats.mappedRows}/${data.stats.totalRows}`
          : 'Загрузка данных...'}
        overlayClassName="officesOverlay"
        surfaceClassName="officesTableModal"
        headerClassName="officesPanelHeader"
        titleClassName="officesPanelTitle"
        contextClassName="officesPanelMeta"
        closeButtonClassName="roomModalClose"
        bodyClassName="officesTableWrap"
      >
              {rows.length > 0 ? (
                <table className="officesTable">
                  <thead>
                    <tr>
                      <th title="Институт">Институт</th>
                      <th title="Факультет">Факультет</th>
                      <th title="Кафедра">Кафедра</th>
                      <th title="Номер кабинета">Кабинет</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, rowIndex) => {
                      const instituteSpan = instituteSpanByStart.get(rowIndex) ?? 0;
                      const facultySpan = facultySpanByStart.get(rowIndex) ?? 0;
                      const instituteStart = instituteSpan > 0;
                      const facultyStart = facultySpan > 0 && row.facultyId.length > 0;
                      const cabinetLabel = formatCabinetLabel(row.cabinet);

                      const rowClass = [
                        instituteStart ? 'officesRowInstituteStart' : '',
                        facultyStart ? 'officesRowFacultyStart' : '',
                      ]
                        .filter((v) => v.length > 0)
                        .join(' ');

                      return (
                        <tr key={row.key} className={rowClass}>
                          {instituteStart ? (
                            <td rowSpan={instituteSpan} title={row.institute || 'Не заполнено'}>
                              {renderLinkCell(row.institute, row.instituteLink, 'Открыть сайт института')}
                            </td>
                          ) : null}

                          {facultyStart ? (
                            <td rowSpan={facultySpan} title={row.faculty || 'Не заполнено'}>
                              {renderLinkCell(row.faculty, row.facultyLink, 'Открыть сайт факультета')}
                            </td>
                          ) : row.facultyId.length === 0 ? (
                            <td title="Факультет не указан">—</td>
                          ) : null}

                          <td title={row.department || 'Кафедра не указана'}>
                            {renderLinkCell(row.department, row.departmentLink, 'Открыть сайт кафедры')}
                          </td>

                          <td title={cabinetLabel || 'Кабинет не указан'}>
                            {row.location && cabinetLabel.length > 0 ? (
                              <HudButton
                                title={cabinetLabel}
                                data={{ action: 'open-cabinet-on-map', roomKey: row.location.roomKey }}
                                className="officesCabinetLink"
                                onClick={() => {
                                  onOpenCabinet(row.location as OfficeLocation, row.node);
                                  setOpen(false);
                                }}
                                hint={`Открыть ${cabinetLabel} на карте: ${buildLabel(row.location.buildId)}, ${floorLabel(row.location.floorId)}`}
                              >
                                {cabinetLabel}
                              </HudButton>
                            ) : (
                              <span className="officesMuted">{cabinetLabel || '—'}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="officesEmpty">Файл с иерархией не найден или пуст.</div>
              )}
      </HudModal>
    </>
  );
}
