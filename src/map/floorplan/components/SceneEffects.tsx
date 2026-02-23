import { Bloom, EffectComposer, N8AO, Vignette } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import type { GraphicsPresetConfig, GraphicsPresetId } from '../../graphicsPresets';

export function SceneEffects({
  enabled,
  preset,
  graphicsPreset,
}: {
  enabled: boolean;
  preset: GraphicsPresetConfig;
  graphicsPreset: GraphicsPresetId;
}) {
  if (!enabled) return null;

  return (
    <EffectComposer enableNormalPass multisampling={preset.postFx.multisampling}>
      {preset.postFx.n8ao ? (
        <N8AO
          aoRadius={preset.postFx.n8ao.aoRadius}
          distanceFalloff={preset.postFx.n8ao.distanceFalloff}
          intensity={preset.postFx.n8ao.intensity}
          screenSpaceRadius={preset.postFx.n8ao.screenSpaceRadius}
          halfRes={graphicsPreset !== 'max'}
        />
      ) : (
        <></>
      )}

      {preset.postFx.bloom ? (
        <Bloom
          intensity={preset.postFx.bloom.intensity}
          luminanceThreshold={preset.postFx.bloom.luminanceThreshold}
          luminanceSmoothing={preset.postFx.bloom.luminanceSmoothing}
          radius={preset.postFx.bloom.radius}
          mipmapBlur={preset.postFx.bloom.mipmapBlur}
        />
      ) : (
        <></>
      )}

      {preset.postFx.vignette ? (
        <Vignette
          offset={preset.postFx.vignette.offset}
          darkness={preset.postFx.vignette.darkness}
          blendFunction={BlendFunction.NORMAL}
        />
      ) : (
        <></>
      )}
    </EffectComposer>
  );
}
