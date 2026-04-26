const ROOM_CATEGORIES: Partial<Record<number, string>> = {
  1: 'коридор',
  2: 'техническое помещение',
  3: 'санузел',
  4: 'душевая',
  5: 'столовая',
  6: 'кухня',
  7: 'актовый зал',
  8: 'кабинет',
  9: 'лестница',
  10: 'лифт',
  11: 'спортивный зал',
  12: 'раздевалка',
  13: 'гардероб',
  14: 'Кафедра',
  15: 'Администрация',
  16: 'библиотека',
  17: 'Лаборатория',
  18: 'Компьютерный класс',
  19: 'Рекреация',
  20: 'Медпункт',
  21: 'Бассейн',
  100: 'стена',
  200: 'надпись',
  300: 'выше',
  301: 'ниже',
};

export const IMPORTANT_ROOM_IDS = new Set<number>([5, 7, 11, 16, 20, 21]);

export function getCategoryByRoomId(roomID: number): string | undefined {
  const value = ROOM_CATEGORIES[roomID];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export default ROOM_CATEGORIES;
