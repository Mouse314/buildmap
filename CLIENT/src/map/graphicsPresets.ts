export type GraphicsPresetId = 'min' | 'medium' | 'max';

const GRAPHICS_PRESET_ORDER: GraphicsPresetId[] = ['min', 'medium', 'max'];

export type PostFxConfig = {
  enabled: boolean;
  multisampling: number;
  n8ao:
    | {
        aoRadius: number;
        distanceFalloff: number;
        intensity: number;
        screenSpaceRadius: boolean;
      }
    | null;
  bloom:
    | {
        intensity: number;
        luminanceThreshold: number;
        luminanceSmoothing: number;
        radius: number;
        mipmapBlur: boolean;
      }
    | null;
  vignette:
    | {
        offset: number;
        darkness: number;
      }
    | null;
};

export type GraphicsPresetConfig = {
  id: GraphicsPresetId;
  label: string;
  title: string;

  dpr:
    | { mode: 'fixed'; value: number }
    | { mode: 'adaptive'; baseMax: number; declineTo: number };

  shadowsEnabled: boolean;
  mouseLampEnabled: boolean;
  postFx: PostFxConfig;
};

export type GraphicsPresetsById = Record<GraphicsPresetId, GraphicsPresetConfig>;

export type GraphicsPresetsFile = {
  version: number;
  updatedAt: string;
  presets: GraphicsPresetsById;
};

export const GRAPHICS_PRESETS: readonly GraphicsPresetConfig[] = [
  {
    id: 'min',
    label: 'Низкие',
    title: 'Максимальная производительность',
    dpr: { mode: 'fixed', value: 1 },
    shadowsEnabled: false,
    mouseLampEnabled: false,
    postFx: {
      enabled: false,
      multisampling: 0,
      n8ao: null,
      bloom: null,
      vignette: null,
    },
  },
  {
    id: 'medium',
    label: 'Средние',
    title: 'Улучшенное качество',
    dpr: { mode: 'adaptive', baseMax: 1.5, declineTo: 1.0 },
    shadowsEnabled: false,
    mouseLampEnabled: true,
    postFx: {
      enabled: true,
      multisampling: 0,
      n8ao: null,
      bloom: {
        intensity: 0.06,
        luminanceThreshold: 0.55,
        luminanceSmoothing: 0.75,
        radius: 0.2,
        mipmapBlur: true,
      },
      vignette: {
        offset: 0.38,
        darkness: 0.52,
      },
    },
  },
  {
    id: 'max',
    label: 'Максимальные',
    title: 'Максимальное качество (рекомендуется только для мощных устройств)',
    dpr: { mode: 'fixed', value: 1.5 },
    shadowsEnabled: true,
    mouseLampEnabled: true,
    postFx: {
      enabled: true,
      multisampling: 4,
      n8ao: {
        aoRadius: 2.5,
        distanceFalloff: 1.2,
        intensity: 4.5,
        screenSpaceRadius: false,
      },
      bloom: {
        intensity: 0.16,
        luminanceThreshold: 0.48,
        luminanceSmoothing: 0.72,
        radius: 0.28,
        mipmapBlur: true,
      },
      vignette: {
        offset: 0.32,
        darkness: 0.62,
      },
    },
  },
] as const;

function clonePostFx(config: PostFxConfig): PostFxConfig {
  return {
    enabled: config.enabled,
    multisampling: config.multisampling,
    n8ao: config.n8ao
      ? {
          aoRadius: config.n8ao.aoRadius,
          distanceFalloff: config.n8ao.distanceFalloff,
          intensity: config.n8ao.intensity,
          screenSpaceRadius: config.n8ao.screenSpaceRadius,
        }
      : null,
    bloom: config.bloom
      ? {
          intensity: config.bloom.intensity,
          luminanceThreshold: config.bloom.luminanceThreshold,
          luminanceSmoothing: config.bloom.luminanceSmoothing,
          radius: config.bloom.radius,
          mipmapBlur: config.bloom.mipmapBlur,
        }
      : null,
    vignette: config.vignette
      ? {
          offset: config.vignette.offset,
          darkness: config.vignette.darkness,
        }
      : null,
  };
}

function clonePreset(config: GraphicsPresetConfig): GraphicsPresetConfig {
  return {
    id: config.id,
    label: config.label,
    title: config.title,
    dpr: config.dpr.mode === 'fixed'
      ? { mode: 'fixed', value: config.dpr.value }
      : { mode: 'adaptive', baseMax: config.dpr.baseMax, declineTo: config.dpr.declineTo },
    shadowsEnabled: config.shadowsEnabled,
    mouseLampEnabled: config.mouseLampEnabled,
    postFx: clonePostFx(config.postFx),
  };
}

function toPresetMap(list: readonly GraphicsPresetConfig[]): GraphicsPresetsById {
  const map = {} as GraphicsPresetsById;
  for (const id of GRAPHICS_PRESET_ORDER) {
    const found = list.find((item) => item.id === id) ?? list[0];
    map[id] = clonePreset(found);
  }
  return map;
}

function toPresetList(map: GraphicsPresetsById): GraphicsPresetConfig[] {
  return GRAPHICS_PRESET_ORDER.map((id) => clonePreset(map[id]));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function boolValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function textValue(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function sanitizePostFxConfig(raw: unknown, fallback: PostFxConfig): PostFxConfig {
  const obj = asRecord(raw);

  const n8aoRaw = asRecord(obj?.n8ao);
  const bloomRaw = asRecord(obj?.bloom);
  const vignetteRaw = asRecord(obj?.vignette);

  return {
    enabled: boolValue(obj?.enabled, fallback.enabled),
    multisampling: finiteNumber(obj?.multisampling, fallback.multisampling),
    n8ao:
      obj?.n8ao == null
        ? null
        : {
            aoRadius: finiteNumber(n8aoRaw?.aoRadius, fallback.n8ao?.aoRadius ?? 2.5),
            distanceFalloff: finiteNumber(n8aoRaw?.distanceFalloff, fallback.n8ao?.distanceFalloff ?? 1.2),
            intensity: finiteNumber(n8aoRaw?.intensity, fallback.n8ao?.intensity ?? 4.5),
            screenSpaceRadius: boolValue(n8aoRaw?.screenSpaceRadius, fallback.n8ao?.screenSpaceRadius ?? false),
          },
    bloom:
      obj?.bloom == null
        ? null
        : {
            intensity: finiteNumber(bloomRaw?.intensity, fallback.bloom?.intensity ?? 0.16),
            luminanceThreshold: finiteNumber(bloomRaw?.luminanceThreshold, fallback.bloom?.luminanceThreshold ?? 0.48),
            luminanceSmoothing: finiteNumber(bloomRaw?.luminanceSmoothing, fallback.bloom?.luminanceSmoothing ?? 0.72),
            radius: finiteNumber(bloomRaw?.radius, fallback.bloom?.radius ?? 0.28),
            mipmapBlur: boolValue(bloomRaw?.mipmapBlur, fallback.bloom?.mipmapBlur ?? true),
          },
    vignette:
      obj?.vignette == null
        ? null
        : {
            offset: finiteNumber(vignetteRaw?.offset, fallback.vignette?.offset ?? 0.32),
            darkness: finiteNumber(vignetteRaw?.darkness, fallback.vignette?.darkness ?? 0.62),
          },
  };
}

function sanitizePresetConfig(id: GraphicsPresetId, raw: unknown, fallback: GraphicsPresetConfig): GraphicsPresetConfig {
  const obj = asRecord(raw);

  const dprRaw = asRecord(obj?.dpr);
  const requestedDprMode = dprRaw?.mode;
  const dprMode: 'fixed' | 'adaptive' = requestedDprMode === 'adaptive' || requestedDprMode === 'fixed'
    ? requestedDprMode
    : fallback.dpr.mode;

  const dpr = dprMode === 'fixed'
    ? {
        mode: 'fixed' as const,
        value: finiteNumber(dprRaw?.value, fallback.dpr.mode === 'fixed' ? fallback.dpr.value : 1),
      }
    : {
        mode: 'adaptive' as const,
        baseMax: finiteNumber(dprRaw?.baseMax, fallback.dpr.mode === 'adaptive' ? fallback.dpr.baseMax : 1.5),
        declineTo: finiteNumber(dprRaw?.declineTo, fallback.dpr.mode === 'adaptive' ? fallback.dpr.declineTo : 1),
      };

  return {
    id,
    label: textValue(obj?.label, fallback.label),
    title: textValue(obj?.title, fallback.title),
    dpr,
    shadowsEnabled: boolValue(obj?.shadowsEnabled, fallback.shadowsEnabled),
    mouseLampEnabled: boolValue(obj?.mouseLampEnabled, fallback.mouseLampEnabled),
    postFx: sanitizePostFxConfig(obj?.postFx, fallback.postFx),
  };
}

export function cloneGraphicsPresetsById(source: GraphicsPresetsById): GraphicsPresetsById {
  return {
    min: clonePreset(source.min),
    medium: clonePreset(source.medium),
    max: clonePreset(source.max),
  };
}

const DEFAULT_PRESETS_BY_ID = toPresetMap(GRAPHICS_PRESETS);
let runtimePresetsById = cloneGraphicsPresetsById(DEFAULT_PRESETS_BY_ID);
let runtimePresetsList = toPresetList(runtimePresetsById);

export function listGraphicsPresets(): readonly GraphicsPresetConfig[] {
  return runtimePresetsList;
}

export function getGraphicsPreset(id: GraphicsPresetId): GraphicsPresetConfig {
  return runtimePresetsById[id] ?? runtimePresetsById.medium;
}

export function getGraphicsPresetsById(): GraphicsPresetsById {
  return cloneGraphicsPresetsById(runtimePresetsById);
}

export function getDefaultGraphicsPresetsById(): GraphicsPresetsById {
  return cloneGraphicsPresetsById(DEFAULT_PRESETS_BY_ID);
}

export function applyGraphicsPresetsById(next: GraphicsPresetsById): void {
  runtimePresetsById = cloneGraphicsPresetsById(next);
  runtimePresetsList = toPresetList(runtimePresetsById);
}

function parseGraphicsPresetsById(raw: unknown): GraphicsPresetsById | null {
  const obj = asRecord(raw);
  if (!obj) return null;

  const hasAnyPreset = GRAPHICS_PRESET_ORDER.some((id) => Object.prototype.hasOwnProperty.call(obj, id));
  if (!hasAnyPreset) return null;

  return {
    min: sanitizePresetConfig('min', obj.min, DEFAULT_PRESETS_BY_ID.min),
    medium: sanitizePresetConfig('medium', obj.medium, DEFAULT_PRESETS_BY_ID.medium),
    max: sanitizePresetConfig('max', obj.max, DEFAULT_PRESETS_BY_ID.max),
  };
}

export function applyGraphicsPresetsFromUnknown(raw: unknown): boolean {
  const root = asRecord(raw);
  if (!root) return false;
  const presetsSource = asRecord(root.presets) ?? root;
  const parsed = parseGraphicsPresetsById(presetsSource);
  if (!parsed) return false;
  applyGraphicsPresetsById(parsed);
  return true;
}

export function buildGraphicsPresetsFilePayload(byId: GraphicsPresetsById): GraphicsPresetsFile {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    presets: cloneGraphicsPresetsById(byId),
  };
}
