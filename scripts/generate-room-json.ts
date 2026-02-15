import fs from 'node:fs/promises';
import path from 'node:path';

type RoomPolygon = {
  roomID: number;
  roomNo?: string;
  description?: string;
  points: Array<{ x: number; y: number }>;
};

function parseWorldCoordsXY(value: string): Array<{ x: number; y: number }> {
  // Example: [(-5.591, -21.033), (-1.902, -21.033), ...]
  const matches = value.match(/-?\d+(?:\.\d+)?/g);
  if (!matches || matches.length < 6) return [];

  const numbers = matches.map((n) => Number(n)).filter((n) => Number.isFinite(n));
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    points.push({ x: numbers[i], y: numbers[i + 1] });
  }
  return points;
}

function splitSemicolon(line: string): string[] {
  // CSV here doesn't seem to use quotes; keep it minimal and robust.
  return line.split(';').map((s) => s.trim());
}

async function main() {
  const rootDir = process.cwd();
  const csvPath = path.join(rootDir, 'public', 'room_data.csv');
  const jsonPath = path.join(rootDir, 'public', 'room_data.json');

  const text = await fs.readFile(csvPath, 'utf8');
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    await fs.writeFile(jsonPath, '[]\n', 'utf8');
    return;
  }

  const headers = splitSemicolon(lines[0]);
  const indexOf = (name: string) => headers.findIndex((h) => h === name);

  const roomIdIndex = indexOf('roomID');
  const roomNoIndex = indexOf('roomNo');
  const descriptionIndex = indexOf('Description');
  const worldCoordsIndex = indexOf('World_Coords_XY');

  if (roomIdIndex < 0 || worldCoordsIndex < 0) {
    throw new Error(
      `CSV headers must include roomID and World_Coords_XY. Found: ${headers.join(', ')}`,
    );
  }

  const polygons: RoomPolygon[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitSemicolon(line);
    const roomID = Number.parseInt(cols[roomIdIndex] ?? '', 10);
    if (!Number.isFinite(roomID)) continue;

    const points = parseWorldCoordsXY(cols[worldCoordsIndex] ?? '');
    if (points.length < 3) continue;

    const roomNo = roomNoIndex >= 0 ? (cols[roomNoIndex] || undefined) : undefined;
    const description =
      descriptionIndex >= 0 ? (cols[descriptionIndex] || undefined) : undefined;

    polygons.push({ roomID, roomNo, description, points });
  }

  // Stable output (diff-friendly)
  polygons.sort((a, b) => a.roomID - b.roomID);

  await fs.writeFile(jsonPath, JSON.stringify(polygons, null, 2) + '\n', 'utf8');

  // eslint-disable-next-line no-console
  console.log(`[generate-room-json] Wrote ${polygons.length} rooms -> public/room_data.json`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[generate-room-json] Failed:', e);
  process.exit(1);
});
