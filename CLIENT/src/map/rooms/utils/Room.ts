export type RoomId = number;

export type Room = {
  // Стабильный идентификатор для выбора и рендера в UI.
  key: string;

  // Поля, приходящие из CSV.
  // Уникальный идентификатор, экспортируемый из Blender (колонка CSV: ID).
  blenderID?: number;
  roomID: RoomId;
  roomNo?: string;
  description?: string;
  areClosed?: boolean;
  areaM2?: number;
  vertexIndices?: number[];
  worldCoordsXYRaw?: string;
  points: Array<{ x: number; y: number }>;

  // Вычисляемые поля (не из CSV).
  category?: string;

  // Поля для последующего расширения.
  build: string | null;
  floor: string | null;
};
