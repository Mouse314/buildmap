import type { RoomId } from './Room';

const CATEGORY_COLORS: Record<string, string> = {
  администрация: '#7130ff',
  кафедра: '#08b0a2',
  преподавательская: '#08b0a2',
};

export const ROOM_COLORS: Partial<Record<RoomId, string>> = {
  1: '#3c5d9f',
  2: '#ababab',
  3: '#7c00bf',
  4: '#0067c1',
  5: '#69b500',
  6: '#9bce00',
  7: '#caa200',
  8: '#00bfd1',
  9: '#0275bc',
  10: '#059669',
  11: '#e7ca48',
  12: '#3845ba',
  13: '#b46f49',
  14: '#08b0a2',
  15: '#8333d8',
  16: '#f6ba37',
  17: '#26d9a9',
  18: '#0885b2',
  19: '#2c6a7a',
  20: '#ff7f7f',
  100: '#2e2e2e',
  200: '#763131',
  300: '#280a6e',
  301: '#29115e',
};

export const FALLBACK_ROOM_COLOR = '#9ca3af';

const warnedMissing = new Set<RoomId>();

export function getRoomFillColor(roomID: RoomId, category?: string): string {
  const categoryKey = (category ?? '').trim().toLowerCase();
  if (categoryKey.length > 0 && CATEGORY_COLORS[categoryKey]) {
    return CATEGORY_COLORS[categoryKey];
  }

  const color = ROOM_COLORS[roomID];
  if (color) return color;

  if (!warnedMissing.has(roomID)) {
    warnedMissing.add(roomID);
    // eslint-disable-next-line no-console
    console.warn(
      `[roomPalette] Missing color for roomID=${roomID}. Add it to ROOM_COLORS in src/map/rooms/roomPalette.ts`,
    );
  }

  return FALLBACK_ROOM_COLOR;
}
