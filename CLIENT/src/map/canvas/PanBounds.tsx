import { useFrame } from '@react-three/fiber';
import * as React from 'react';
import { type OrbitControls as OrbitControlsImpl } from 'three-stdlib';

export type PanBoundsRect = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// Ограничивает панорамирование камеры границами плана.
export function PanBounds({
  enabled,
  controlsRef,
  bounds,
}: {
  enabled: boolean;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  bounds: PanBoundsRect | null;
}) {
  useFrame(() => {
    if (!enabled) return;
    if (!bounds) return;
    const controls = controlsRef.current;
    if (!controls) return;

    const target = controls.target;
    const nextX = clamp(target.x, bounds.minX, bounds.maxX);
    const nextZ = clamp(target.z, bounds.minZ, bounds.maxZ);

    if (nextX === target.x && nextZ === target.z) return;

    const dx = nextX - target.x;
    const dz = nextZ - target.z;

    target.x = nextX;
    target.z = nextZ;

    // Сохраняем смещение между камерой и target, двигая их на одинаковую дельту.
    const cam = controls.object;
    cam.position.x += dx;
    cam.position.z += dz;
    controls.update();
  });

  return null;
}
