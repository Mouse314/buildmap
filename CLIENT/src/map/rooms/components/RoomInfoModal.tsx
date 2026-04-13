import * as React from 'react';
import type { Room } from '../utils/Room';
import { getCategoryByRoomId } from '../utils/roomCategories';
import { formatRoomDescription } from '../utils/stairDirection';
import { HudAnchoredModal, HudButton } from '../../../components/ui/hud';

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
  roomID?: number;
  roomNo?: string;
  category?: string;
  description?: string;
  areClosed?: boolean;
  areaM2?: number;
  build?: string | null;
  floor?: string | null;
};

type RoomDraft = {
  roomIDText: string;
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
    roomIDText: String(room.roomID),
    roomNo: room.roomNo ?? '',
    category: room.category ?? '',
    description: room.description ?? '',
    areClosed: room.areClosed ?? false,
    areaM2Text: typeof room.areaM2 === 'number' && Number.isFinite(room.areaM2) ? String(room.areaM2) : '',
    build: room.build ?? '',
    floor: room.floor ?? '',
  };
}

function textEqualIgnoreCase(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase('ru-RU') === b.trim().toLocaleLowerCase('ru-RU');
}

function equalDraft(a: RoomDraft, b: RoomDraft): boolean {
  return (
    a.roomIDText === b.roomIDText
    &&
    textEqualIgnoreCase(a.roomNo, b.roomNo)
    && textEqualIgnoreCase(a.category, b.category)
    && textEqualIgnoreCase(a.description, b.description)
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

function parseRoomId(value: string): number | undefined {
  const cleaned = value.trim();
  if (cleaned.length === 0) return undefined;
  if (!/^-?\d+$/.test(cleaned)) return undefined;
  const n = Number.parseInt(cleaned, 10);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
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
  const description = formatRoomDescription(room.roomID, room.description);
  const areaText = React.useMemo(() => formatAreaM2(room.areaM2), [room.areaM2]);
  const [draft, setDraft] = React.useState<RoomDraft>(() => toDraft(room));
  const [saveStatus, setSaveStatus] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = React.useState<string>('');

  React.useEffect(() => {
    setDraft(toDraft(room));
    setSaveStatus('idle');
    setSaveError('');
  }, [room]);

  const initialDraft = React.useMemo(() => toDraft(room), [room]);
  const hasDraftChanges = !equalDraft(draft, initialDraft);
  const pointsJson = React.useMemo(() => JSON.stringify(room.points), [room.points]);

  const onSaveClick = async () => {
    if (!onSaveRoom) return;
    const roomID = parseRoomId(draft.roomIDText);
    if (typeof roomID !== 'number') {
      setSaveStatus('error');
      setSaveError('Некорректное значение ID');
      return;
    }

    const categoryByRoomId = getCategoryByRoomId(roomID);

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
        roomID,
        roomNo: draft.roomNo.trim(),
        category: (categoryByRoomId ?? draft.category).trim(),
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
    <HudAnchoredModal
      isOpen
      anchor={anchor}
      onClose={onClose}
      title="Информация о комнате"
      overlayClassName="roomModalOverlay"
      surfaceClassName={`roomModal ${isAdminMode ? 'roomModalAdmin' : ''}`}
      headerClassName="roomModalHeader"
      titleClassName="roomModalTitle"
      closeButtonClassName="roomModalClose"
      bodyClassName="roomModalBody"
      aboveClassName="roomModalAbove"
      belowClassName="roomModalBelow"
      reflowToken={`${room.roomID}:${isAdminMode ? 'admin' : 'view'}:${saveStatus}:${saveError}`}
    >
        <div className="roomModalBodyInner">
          {isAdminMode ? (
            <>
              <div className="roomModalRow">
                <div className="roomModalLabel">ID</div>
                <input
                  className="roomModalInput"
                  value={draft.roomIDText}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setDraft((prev) => {
                      const nextRoomId = parseRoomId(nextValue);
                      if (typeof nextRoomId !== 'number') {
                        return { ...prev, roomIDText: nextValue };
                      }

                      const categoryByRoomId = getCategoryByRoomId(nextRoomId);
                      return {
                        ...prev,
                        roomIDText: nextValue,
                        category: categoryByRoomId ?? prev.category,
                      };
                    });
                  }}
                />
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
              <HudButton
                title="Построить маршрут"
                data={{ action: 'build-route-from-room', roomKey: room.key }}
                className="roomModalRouteBtn"
                onClick={() => onBuildRoute(room)}
              >
                Построить маршрут
              </HudButton>
            </div>
          ) : null}

          {isAdminMode && onSaveRoom ? (
            <div className="roomModalActions">
              <HudButton
                title={saveStatus === 'saving' ? 'Сохранение...' : 'Сохранить в файл'}
                data={{ action: 'save-room' }}
                className="roomModalSaveBtn"
                disabled={!hasDraftChanges || saveStatus === 'saving'}
                onClick={onSaveClick}
              >
                {saveStatus === 'saving' ? 'Сохранение...' : 'Сохранить в файл'}
              </HudButton>
              {saveStatus === 'saved' ? <div className="roomModalSaveHint">Изменения сохранены</div> : null}
              {saveStatus === 'error' ? <div className="roomModalSaveError">{saveError}</div> : null}
            </div>
          ) : null}
        </div>
    </HudAnchoredModal>
  );
}
