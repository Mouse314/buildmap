export type GraphicsPresetId = 'min' | 'medium' | 'max';

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

export const GRAPHICS_PRESETS: readonly GraphicsPresetConfig[] = [
  {
    id: 'min',
    label: 'Минимум',
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
    label: 'Среднее',
    title: 'Баланс (как сейчас)',
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
    label: 'Максимум',
    title: 'Все эффекты (может быть тяжелее)',
    dpr: { mode: 'fixed', value: 2.0 },
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

export function getGraphicsPreset(id: GraphicsPresetId): GraphicsPresetConfig {
  const found = GRAPHICS_PRESETS.find((p) => p.id === id);
  return found ?? GRAPHICS_PRESETS[1];
}
