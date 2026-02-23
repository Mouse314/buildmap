import type { Room } from '../../map/rooms/utils/Room';

function polygonCentroid(points: Array<{ x: number; y: number }>): { x: number; y: number } {
  let signedArea = 0;
  let cx = 0;
  let cy = 0;
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const p0 = points[i];
    const p1 = points[(i + 1) % n];
    const a = p0.x * p1.y - p1.x * p0.y;
    signedArea += a;
    cx += (p0.x + p1.x) * a;
    cy += (p0.y + p1.y) * a;
  }

  if (Math.abs(signedArea) < 1e-6) {
    return points.reduce(
      (acc, p) => ({ x: acc.x + p.x / n, y: acc.y + p.y / n }),
      { x: 0, y: 0 },
    );
  }

  signedArea *= 0.5;
  cx /= 6 * signedArea;
  cy /= 6 * signedArea;
  return { x: cx, y: cy };
}

export function findTitleAnchorFromFloor1(rooms: Room[]): { x: number; y: number } | null {
  const titleRoom = rooms.find((r) => r.roomID === 200 && (r.description ?? '').trim().toUpperCase() === 'TITLE');
  if (!titleRoom) return null;
  if (!Array.isArray(titleRoom.points) || titleRoom.points.length < 3) return null;
  return polygonCentroid(titleRoom.points);
}

const MIN_INTERACTIVE_AREA_M2 = 2;

export function isInteractiveRoom(room: Room): boolean {
  const area = room.areaM2;
  return !(typeof area === 'number' && Number.isFinite(area) && area < MIN_INTERACTIVE_AREA_M2);
}

export function buildLabel(id: string): string {
  const m = id.match(/build(\d+)/i);
  if (m) return `${m[1]} корпус`;
  return id;
}

export function floorLabel(id: string): string {
  const m = id.match(/floor(\d+)/i);
  if (m) return `${m[1]} этаж`;
  return id;
}
