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

export function RoomInfoModal({
  room,
  anchor,
  onClose,
  onBuildRoute,
}: {
  room: Room;
  anchor: { x: number; y: number };
  onClose: () => void;
  onBuildRoute?: (room: Room) => void;
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
        className={placement === 'above' ? 'roomModal roomModalAbove' : 'roomModal roomModalBelow'}
        style={{ left: pos.left, top: pos.top }}
      >
        <div className="roomModalHeader">
          <div className="roomModalTitle">Информация о комнате</div>
          <button type="button" className="roomModalClose" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="roomModalBody">
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
        </div>
      </div>
    </div>
  );
}
