import { MIN_INTERACTIVE_AREA_M2 } from '../config/constants';

export function isInteractiveRoomArea(areaM2: number | undefined): boolean {
  return !(typeof areaM2 === 'number' && Number.isFinite(areaM2) && areaM2 < MIN_INTERACTIVE_AREA_M2);
}
