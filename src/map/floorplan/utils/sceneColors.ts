import type { GraphicsPresetId } from '../../graphicsPresets';

export function getSceneColors(theme: 'light' | 'dark', graphicsPreset: GraphicsPresetId) {
  const background = theme === 'dark' ? '#0b0f19' : '#747474';
  const label = theme === 'dark' ? '#f3f4f6' : '#111111';
  const dimFill = theme === 'dark' ? '#111827' : '#d1d5db';
  const ambientIntensity = theme === 'dark' ? 0.12 : graphicsPreset === 'max' ? 0.36 : 0.45;
  const dirIntensity = theme === 'dark' ? 0.25 : graphicsPreset === 'max' ? 1.65 : 1.35;

  return { background, label, dimFill, ambientIntensity, dirIntensity };
}
