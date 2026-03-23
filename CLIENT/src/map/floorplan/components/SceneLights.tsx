import { MouseLamp } from '../../canvas/MouseLamp';
import { LIGHT_POS } from '../config/constants';

export function SceneLights({
  theme,
  mouseLampEnabled,
  graphicsPreset,
  ambientIntensity,
  dirIntensity,
}: {
  theme: 'light' | 'dark';
  mouseLampEnabled: boolean;
  graphicsPreset: 'min' | 'medium' | 'max';
  ambientIntensity: number;
  dirIntensity: number;
}) {
  return (
    <>
      <ambientLight intensity={ambientIntensity} />
      <directionalLight position={[LIGHT_POS.x, LIGHT_POS.y, LIGHT_POS.z]} intensity={dirIntensity} />

      {theme === 'dark' && mouseLampEnabled ? (
        <MouseLamp height={1} intensity={20} shadowMapSize={graphicsPreset === 'max' ? 1024 : 512} />
      ) : null}
    </>
  );
}
