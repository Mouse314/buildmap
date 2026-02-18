export type GraphicsPresetId = 'min' | 'medium' | 'max';

export type PostFxConfig = {
  enabled: boolean;
  multisampling: number;
  ssao:
    | {
        samples: number;
        radius: number;
        intensity: number;
        luminanceInfluence: number;
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
      ssao: null,
      bloom: null,
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
      ssao: {
        samples: 8,
        radius: 2.0,
        intensity: 3.0,
        luminanceInfluence: 0.0,
      },
      bloom: {
        intensity: 0.08,
        luminanceThreshold: 0.55,
        luminanceSmoothing: 0.7,
        radius: 0.2,
        mipmapBlur: true,
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
      ssao: {
        samples: 16,
        radius: 2.2,
        intensity: 4.0,
        luminanceInfluence: 0.0,
      },
      bloom: {
        intensity: 0.12,
        luminanceThreshold: 0.5,
        luminanceSmoothing: 0.7,
        radius: 0.2,
        mipmapBlur: true,
      },
    },
  },
] as const;

export function getGraphicsPreset(id: GraphicsPresetId): GraphicsPresetConfig {
  const found = GRAPHICS_PRESETS.find((p) => p.id === id);
  return found ?? GRAPHICS_PRESETS[1];
}
