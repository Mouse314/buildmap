export type RoomId = number;

export type Room = {
  // Stable identifier for UI selection/render keys
  key: string;

  // From CSV
  // Unique identifier exported from Blender (CSV column: ID)
  blenderID?: number;
  roomID: RoomId;
  roomNo?: string;
  description?: string;
  areaM2?: number;
  vertexIndices?: number[];
  worldCoordsXYRaw?: string;
  points: Array<{ x: number; y: number }>;

  // Derived (not in CSV)
  category?: string;

  // Future fields (not filled yet)
  build: string | null;
  floor: string | null;
};
