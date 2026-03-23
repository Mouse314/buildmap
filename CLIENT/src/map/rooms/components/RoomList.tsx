import * as React from 'react';
import type { RoomPolygon } from '../utils/roomData';

type RoomListEntry = {
  roomID: number;
  roomNo: string;
  description: string;
};

function normalizeText(value: string | undefined): string {
  return (value ?? '').trim();
}

function sortKey(roomNo: string): { kind: 0 | 1; n: number; s: string } {
  const trimmed = roomNo.trim();
  const n = Number.parseInt(trimmed, 10);
  if (Number.isFinite(n) && String(n) === trimmed) return { kind: 0, n, s: trimmed };
  return { kind: 1, n: Number.POSITIVE_INFINITY, s: trimmed.toLowerCase() };
}

export function RoomList({
  polygons,
  selectedRoomID,
  onSelectRoomID,
}: {
  polygons: RoomPolygon[];
  selectedRoomID: number | null;
  onSelectRoomID: (roomID: number | null) => void;
}) {
  const rooms = React.useMemo<RoomListEntry[]>(() => {
    const byId = new Map<number, RoomListEntry>();

    for (const p of polygons) {
      if (byId.has(p.roomID)) continue;
      const roomNo = normalizeText(p.roomNo);
      const description = normalizeText(p.description);
      byId.set(p.roomID, { roomID: p.roomID, roomNo, description });
    }

    const entries = Array.from(byId.values());
    entries.sort((a, b) => {
      const ak = sortKey(a.roomNo.length > 0 ? a.roomNo : String(a.roomID));
      const bk = sortKey(b.roomNo.length > 0 ? b.roomNo : String(b.roomID));
      if (ak.kind !== bk.kind) return ak.kind - bk.kind;
      if (ak.n !== bk.n) return ak.n - bk.n;
      return ak.s.localeCompare(bk.s, 'ru');
    });
    return entries;
  }, [polygons]);

  return (
    <div className="roomSidebar">
      <div className="roomSidebarHeader">
        <div className="roomSidebarTitle">Комнаты</div>
        <div className="roomSidebarCount">{rooms.length}</div>
      </div>

      <div className="roomSidebarList" role="list">
        {rooms.map((room) => {
          const isSelected = selectedRoomID === room.roomID;
          const title = room.roomNo.length > 0 ? room.roomNo : `ID ${room.roomID}`;

          return (
            <button
              key={room.roomID}
              type="button"
              className={isSelected ? 'roomListItem roomListItemSelected' : 'roomListItem'}
              onClick={() => onSelectRoomID(isSelected ? null : room.roomID)}
              title={room.description.length > 0 ? `${title} — ${room.description}` : title}
            >
              <div className="roomListItemTitle">{title}</div>
              {room.description.length > 0 ? <div className="roomListItemDesc">{room.description}</div> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
