import type { RoomId } from './Room';

// Здесь можно вручную назначать цвета для комнат.
// Ключ = roomID из CSV, значение = CSS-цвет (лучше hex: "#RRGGBB").
export const ROOM_COLORS: Partial<Record<RoomId, string>> = {
  1: '#1d4ed8',
  2: '#16a34a',
  3: '#d97706',
  4: '#dc2626',
  5: '#7c3aed',
  6: '#db2777',
  8: '#0891b2',
  9: '#be123c',
  11: '#65a30d',
  12: '#9333ea',
  13: '#ea580c',
  14: '#0f766e',
  15: '#4f46e5',
  16: '#64748b',
  17: '#db2777',
  100: '#2e2e2e',
  200: '#763131',
  300: '#280a6e',
  301: '#29115e',
};

export const FALLBACK_ROOM_COLOR = '#9ca3af';

const warnedMissing = new Set<RoomId>();

export function getRoomFillColor(roomID: RoomId): string {
  const color = ROOM_COLORS[roomID];
  if (color) return color;

  if (!warnedMissing.has(roomID)) {
    warnedMissing.add(roomID);
    // eslint-disable-next-line no-console
    console.warn(
      `[roomPalette] Missing color for roomID=${roomID}. Add it to ROOM_COLORS in src/map/roomPalette.ts`,
    );
  }

  return FALLBACK_ROOM_COLOR;
}
