import * as THREE from 'three';
import type { Room } from '../../rooms/utils/Room';
import type { RoomPolygon } from '../../rooms/utils/roomData';
import { makePolygonGeometry } from '../../canvas/geometry';
import { getRoomFillColor } from '../../rooms/utils/roomPalette';
import { HIDDEN_ROOM_IDS, NON_HOVERABLE_ROOM_IDS, WALL_ROOM_ID } from '../config/constants';
import { isInteractiveRoomArea } from './interactivity';
import { WALL_EXTRUDE_DEPTH } from '../../mapRenderConstants';

export type RenderItem = {
  key: string;
  polygon: RoomPolygon;
  geometry: THREE.BufferGeometry;
  color: string;
  interactive: boolean;
};

export function buildRenderItems(
  polygons: RoomPolygon[],
  rooms: Room[],
  opts: { wallExtrudeEnabled?: boolean; allowSmallInteractive?: boolean; allowAllInteractive?: boolean } = {},
): RenderItem[] {
  const items: RenderItem[] = [];
  const wallExtrudeEnabled = opts.wallExtrudeEnabled ?? true;
  const allowSmallInteractive = opts.allowSmallInteractive ?? false;
  const allowAllInteractive = opts.allowAllInteractive ?? false;

  for (let idx = 0; idx < polygons.length; idx++) {
    const poly = polygons[idx];
    if (poly.roomID === 200) continue;
    if (HIDDEN_ROOM_IDS.has(poly.roomID)) continue;

    const isWall = poly.roomID === WALL_ROOM_ID;
    const geom = makePolygonGeometry(poly.points, {
      extrudeDepth: isWall && wallExtrudeEnabled ? WALL_EXTRUDE_DEPTH : 0,
    });
    if (!geom) continue;

    const room = rooms[idx];
    const key = room?.key ?? `${poly.roomID}-${idx}`;
    const areaInteractive = allowSmallInteractive || isInteractiveRoomArea(room?.areaM2);
    const interactive = allowAllInteractive || (!NON_HOVERABLE_ROOM_IDS.has(poly.roomID) && areaInteractive);

    items.push({
      key,
      polygon: poly,
      geometry: geom,
      color: getRoomFillColor(poly.roomID, room?.category),
      interactive,
    });
  }

  return items;
}
