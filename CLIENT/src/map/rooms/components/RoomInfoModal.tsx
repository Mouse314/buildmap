import * as React from 'react';
import type { Room } from '../utils/Room';

function text(value: string | undefined): string {
  return (value ?? '').trim();
}

function formatAreaM2(areaM2: number | undefined): string {
  if (typeof areaM2 !== 'number' || !Number.isFinite(areaM2)) return '—';
  const formatted = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(areaM2);
  return `${formatted} м²`;
}

type RoomEditPayload = {
  roomNo?: string;
  category?: string;
  description?: string;
  areClosed?: boolean;
  areaM2?: number;
  build?: string | null;
  floor?: string | null;
};

type RoomDraft = {
  roomNo: string;
  category: string;
  description: string;
  areClosed: boolean;
  areaM2Text: string;
  build: string;
  floor: string;
};

function toDraft(room: Room): RoomDraft {
  return {
    roomNo: room.roomNo ?? '',
    category: room.category ?? '',
    description: room.description ?? '',
    areClosed: room.areClosed ?? false,
    areaM2Text: typeof room.areaM2 === 'number' && Number.isFinite(room.areaM2) ? String(room.areaM2) : '',
    build: room.build ?? '',
    floor: room.floor ?? '',
  };
}

function equalDraft(a: RoomDraft, b: RoomDraft): boolean {
  return (
    a.roomNo === b.roomNo
    && a.category === b.category
    && a.description === b.description
    && a.areClosed === b.areClosed
    && a.areaM2Text === b.areaM2Text
    && a.build === b.build
    && a.floor === b.floor
  );
}

function parseArea(value: string): number | undefined {
  const cleaned = value.trim().replace(',', '.');
  if (cleaned.length === 0) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

export function RoomInfoModal({
  room,
  anchor,
  onClose,
  onBuildRoute,
  isAdminMode,
  onSaveRoom,
}: {
  room: Room;
  anchor: { x: number; y: number };
  onClose: () => void;
  onBuildRoute?: (room: Room) => void;
  isAdminMode: boolean;
  onSaveRoom?: (changes: RoomEditPayload) => Promise<void>;
}) {
  const roomNo = text(room.roomNo);
  const category = text(room.category);
  const description = text(room.description);
  const areaText = React.useMemo(() => formatAreaM2(room.areaM2), [room.areaM2]);

  const modalRef = React.useRef<HTMLDivElement | null>(null);
  const [placement, setPlacement] = React.useState<'above' | 'below'>('above');
  const [pos, setPos] = React.useState<{ left: number; top: number }>({
    left: anchor.x,
    top: anchor.y,
  });
  const [draft, setDraft] = React.useState<RoomDraft>(() => toDraft(room));
  const [saveStatus, setSaveStatus] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = React.useState<string>('');

  React.useEffect(() => {
    setDraft(toDraft(room));
    setSaveStatus('idle');
    setSaveError('');
  }, [room]);

  React.useLayoutEffect(() => {
    const el = modalRef.current;
    if (!el) return;

    const padding = 12;
    const gap = 12;

    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

    const left = clamp(anchor.x, padding + r.width / 2, vw - padding - r.width / 2);

    const canPlaceAbove = anchor.y - r.height - gap >= padding;
    const nextPlacement: 'above' | 'below' = canPlaceAbove ? 'above' : 'below';

    const top = clamp(anchor.y, padding, vh - padding);

    setPlacement(nextPlacement);
    setPos({ left, top });
  }, [anchor.x, anchor.y, room.roomID]);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const initialDraft = React.useMemo(() => toDraft(room), [room]);
  const hasDraftChanges = !equalDraft(draft, initialDraft);
  const pointsJson = React.useMemo(() => JSON.stringify(room.points), [room.points]);

  const onSaveClick = async () => {
    if (!onSaveRoom) return;
    const areaM2 = parseArea(draft.areaM2Text);
    if (draft.areaM2Text.trim().length > 0 && typeof areaM2 !== 'number') {
      setSaveStatus('error');
      setSaveError('Некорректное значение площади');
      return;
    }

    try {
      setSaveStatus('saving');
      setSaveError('');
      await onSaveRoom({
        roomNo: draft.roomNo.trim(),
        category: draft.category.trim(),
        description: draft.description.trim(),
        areClosed: draft.areClosed,
        areaM2,
        build: draft.build.trim().length > 0 ? draft.build.trim() : null,
        floor: draft.floor.trim().length > 0 ? draft.floor.trim() : null,
      });
      setSaveStatus('saved');
    } catch (error) {
      setSaveStatus('error');
      setSaveError(error instanceof Error ? error.message : 'Не удалось сохранить изменения');
    }
  };

  return (
    <div
      className="roomModalOverlay"
      role="dialog"
      aria-modal="true"
      onPointerDown={(e) => {
        if (e.pointerType !== 'mouse') return;
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        className={
          placement === 'above'
            ? `roomModal ${isAdminMode ? 'roomModalAdmin' : ''} roomModalAbove`
            : `roomModal ${isAdminMode ? 'roomModalAdmin' : ''} roomModalBelow`
        }
        style={{ left: pos.left, top: pos.top }}
      >
        <div className="roomModalHeader">
          <div className="roomModalTitle">Информация о комнате</div>
          <button type="button" className="roomModalClose" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="roomModalBody">
          {isAdminMode ? (
            <>
              <div className="roomModalRow">
                <div className="roomModalLabel">ID</div>
                <div className="roomModalValue">{room.roomID}</div>
              </div>

              <div className="roomModalRow">
                <div className="roomModalLabel">key</div>
                <div className="roomModalValue">{room.key}</div>
              </div>

              <div className="roomModalRow">
                <div className="roomModalLabel">blenderID</div>
                <div className="roomModalValue">{room.blenderID ?? '—'}</div>
              </div>

              <div className="roomModalRow">
                <div className="roomModalLabel">Номер</div>
                <input
                  className="roomModalInput"
                  value={draft.roomNo}
                  onChange={(e) => setDraft((prev) => ({ ...prev, roomNo: e.target.value }))}
                />
              </div>

              <div className="roomModalRow">
                <div className="roomModalLabel">Категория</div>
                <input
                  className="roomModalInput"
                  value={draft.category}
                  onChange={(e) => setDraft((prev) => ({ ...prev, category: e.target.value }))}
                />
              </div>

              <div className="roomModalRow">
                <div className="roomModalLabel">Описание</div>
                <textarea
                  className="roomModalInput roomModalTextarea"
                  rows={3}
                  value={draft.description}
                  onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>

              <div className="roomModalRow">
                <div className="roomModalLabel">Площадь</div>
                <input
                  className="roomModalInput"
                  value={draft.areaM2Text}
                  onChange={(e) => setDraft((prev) => ({ ...prev, areaM2Text: e.target.value }))}
                />
              </div>

              <div className="roomModalRow">
                <div className="roomModalLabel">Закрыта</div>
                <label className="roomModalCheckboxLabel">
                  <input
                    type="checkbox"
                    checked={draft.areClosed}
                    onChange={(e) => setDraft((prev) => ({ ...prev, areClosed: e.target.checked }))}
                  />
                  <span>{draft.areClosed ? 'Да' : 'Нет'}</span>
                </label>
              </div>

              <div className="roomModalRow">
                <div className="roomModalLabel">build</div>
                <input
                  className="roomModalInput"
                  value={draft.build}
                  onChange={(e) => setDraft((prev) => ({ ...prev, build: e.target.value }))}
                />
              </div>

              <div className="roomModalRow">
                <div className="roomModalLabel">floor</div>
                <input
                  className="roomModalInput"
                  value={draft.floor}
                  onChange={(e) => setDraft((prev) => ({ ...prev, floor: e.target.value }))}
                />
              </div>

              <div className="roomModalRow">
                <div className="roomModalLabel">vertexIndices</div>
                <div className="roomModalValue">{Array.isArray(room.vertexIndices) ? room.vertexIndices.join(', ') : '—'}</div>
              </div>

              <div className="roomModalRow">
                <div className="roomModalLabel">worldCoordsXYRaw</div>
                <div className="roomModalValue roomModalValueDesc">{room.worldCoordsXYRaw ?? '—'}</div>
              </div>

              <div className="roomModalRow roomModalRowSingle">
                <div className="roomModalLabel">points</div>
                <textarea className="roomModalPoints" value={pointsJson} readOnly rows={4} />
              </div>
            </>
          ) : (
            <>
              <div className="roomModalRow">
                <div className="roomModalLabel">Категория</div>
                <div className="roomModalValue">{category}</div>
              </div>

              <div className="roomModalRow">
                <div className="roomModalLabel">Номер</div>
                <div className="roomModalValue">{roomNo}</div>
              </div>

              <div className="roomModalRow">
                <div className="roomModalLabel">Описание</div>
                <div className="roomModalValue roomModalValueDesc">{description}</div>
              </div>

              <div className="roomModalRow">
                <div className="roomModalLabel">Площадь</div>
                <div className="roomModalValue">{areaText}</div>
              </div>
            </>
          )}

          {onBuildRoute ? (
            <div className="roomModalActions">
              <button
                type="button"
                className="roomModalRouteBtn"
                onClick={() => onBuildRoute(room)}
              >
                Построить маршрут
              </button>
            </div>
          ) : null}

          {isAdminMode && onSaveRoom ? (
            <div className="roomModalActions">
              <button
                type="button"
                className="roomModalSaveBtn"
                disabled={!hasDraftChanges || saveStatus === 'saving'}
                onClick={onSaveClick}
              >
                {saveStatus === 'saving' ? 'Сохранение...' : 'Сохранить в файл'}
              </button>
              {saveStatus === 'saved' ? <div className="roomModalSaveHint">Изменения сохранены</div> : null}
              {saveStatus === 'error' ? <div className="roomModalSaveError">{saveError}</div> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
