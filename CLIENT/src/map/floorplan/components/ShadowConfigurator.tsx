import { useThree } from '@react-three/fiber';
import * as React from 'react';
import * as THREE from 'three';

export function ShadowConfigurator({ enabled }: { enabled: boolean }) {
  const { gl } = useThree();

  React.useEffect(() => {
    gl.shadowMap.enabled = enabled;
    if (enabled) {
      gl.shadowMap.type = THREE.PCFSoftShadowMap;
    }
  }, [enabled, gl]);

  return null;
}
