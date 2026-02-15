import type { RoomId } from './Room';

function hashStringToUint32(value: string): number {
  // FNV-1a 32-bit
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function roomIdToColorHex(roomID: RoomId): string {
  // Stable distinct-ish color via HSL from hash, converted to hex.
  const h = hashStringToUint32(String(roomID));
  const hue = (h % 360) / 360;
  const sat = (55 + (h % 20)) / 100; // 0.55..0.74
  const light = (45 + (h % 10)) / 100; // 0.45..0.54

  const [r, g, b] = hslToRgb(hue, sat, light);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function toHex(v: number): string {
  const n = Math.max(0, Math.min(255, Math.round(v)));
  return n.toString(16).padStart(2, '0');
}

// h, s, l in 0..1; returns rgb in 0..255
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const g = l * 255;
    return [g, g, g];
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  const r = hueToRgb(p, q, h + 1 / 3);
  const g = hueToRgb(p, q, h);
  const b = hueToRgb(p, q, h - 1 / 3);
  return [r * 255, g * 255, b * 255];
}

function hueToRgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}
