const STAIR_ROOM_ID = 9;

function normalizeStairDirectionMarker(value: string | undefined): string {
  const marker = (value ?? '').trim().toLocaleLowerCase('ru-RU').replace(/\s+/g, '');

  if (marker === '21') return '12';
  if (marker === 'вверх-вниз' || marker === 'вверх/вниз' || marker === 'вверхвниз') return '12';
  if (marker === 'up-down' || marker === 'up/down' || marker === 'updown' || marker === 'both') return '12';

  if (marker === 'вверх' || marker === 'up' || marker === '↑') return '1';
  if (marker === 'вниз' || marker === 'down' || marker === '↓') return '2';

  if (marker === '↑↓' || marker === '↓↑' || marker === '↕') return '12';

  return marker;
}

export function formatStairDescription(description: string | undefined): string {
  const raw = (description ?? '').trim();
  const marker = normalizeStairDirectionMarker(raw);

  if (marker === '1') return 'вверх';
  if (marker === '2') return 'вниз';
  if (marker === '12') return 'вверх-вниз';

  return raw;
}

export function formatRoomDescription(roomID: number | undefined, description: string | undefined): string {
  const raw = (description ?? '').trim();
  if (roomID !== STAIR_ROOM_ID) return raw;
  return formatStairDescription(raw);
}

export function parseStairDirectionFlags(description: string | undefined): { up: boolean; down: boolean } {
  const marker = normalizeStairDirectionMarker(description);

  if (marker === '1') return { up: true, down: false };
  if (marker === '2') return { up: false, down: true };
  if (marker === '12') return { up: true, down: true };

  return { up: true, down: true };
}
