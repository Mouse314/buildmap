import * as React from 'react';
import type { Room } from './Room';

function text(value: string | undefined): string {
  return (value ?? '').trim();
}

export function RoomHoverTooltip({
  room,
  anchor,
}: {
  room: Room;
  anchor: { x: number; y: number };
}) {
  const category = text(room.category);
  const roomNo = text(room.roomNo);
  const description = text(room.description);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = React.useState<{ left: number; top: number }>({
    left: anchor.x,
    top: anchor.y,
  });

  const hasAny = category.length > 0 || roomNo.length > 0 || description.length > 0;

  React.useLayoutEffect(() => {
    if (!hasAny) return;
    const el = ref.current;
    if (!el) return;

    const padding = 10;
    const offset = 14;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

    // Prefer right/bottom of cursor.
    let left = anchor.x + offset;
    let top = anchor.y + offset;

    // Flip if it would overflow.
    if (left + r.width + padding > vw) left = anchor.x - offset - r.width;
    if (top + r.height + padding > vh) top = anchor.y - offset - r.height;

    left = clamp(left, padding, vw - padding - r.width);
    top = clamp(top, padding, vh - padding - r.height);

    setPos({ left, top });
  }, [anchor.x, anchor.y, hasAny, room.key]);

  if (!hasAny) return null;

  return (
    <div ref={ref} className="roomHoverTip" style={{ left: pos.left, top: pos.top }}>
      {category.length > 0 ? <div className="roomHoverTipLine roomHoverTipCategory">{category}</div> : null}
      {roomNo.length > 0 ? <div className="roomHoverTipLine">№ {roomNo}</div> : null}
      {description.length > 0 ? (
        <div className="roomHoverTipLine roomHoverTipDesc">{description}</div>
      ) : null}
    </div>
  );
}
