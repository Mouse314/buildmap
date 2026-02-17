import { useThree } from '@react-three/fiber';
import * as React from 'react';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { computeBounds, type RoomPolygon } from '../roomData';

export function FitView({
  polygons,
  controlsRef,
}: {
  polygons: RoomPolygon[];
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera, size } = useThree();
  const didFitRef = React.useRef(false);

  React.useEffect(() => {
    if (polygons.length === 0) return;
    if (didFitRef.current) return;

    const bounds = computeBounds(polygons);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerZ = (bounds.minY + bounds.maxY) / 2;

    camera.position.set(centerX, 150, centerZ);
    camera.up.set(0, 0, -1);
    camera.lookAt(centerX, 0, centerZ);

    if (controlsRef.current) {
      controlsRef.current.target.set(centerX, 0, centerZ);
      controlsRef.current.update();
    }

    const boxWidth = Math.max(0.001, bounds.maxX - bounds.minX);
    const boxHeight = Math.max(0.001, bounds.maxY - bounds.minY);

    // More padding so initial view doesn't "stick" to a single room.
    const fitPadding = 1.45;

    const anyCamera = camera as unknown as Record<string, unknown>;
    const isOrtho = Boolean((anyCamera as { isOrthographicCamera?: boolean }).isOrthographicCamera);

    if (isOrtho) {
      const zoom = Math.min(size.width / boxWidth, size.height / boxHeight) * (0.9 / fitPadding);
      const zoomableCamera = camera as unknown as { zoom: number; updateProjectionMatrix: () => void };
      // eslint-disable-next-line react-hooks/immutability
      zoomableCamera.zoom = zoom;
      zoomableCamera.updateProjectionMatrix();
    } else {
      const persp = camera as unknown as { fov: number; aspect: number; updateProjectionMatrix: () => void };
      const aspect = size.width / Math.max(1, size.height);

      const vFov = (persp.fov * Math.PI) / 180;
      const tanV = Math.tan(vFov / 2);
      const tanH = tanV * aspect;

      const distV = (boxHeight / 2) / Math.max(1e-6, tanV);
      const distH = (boxWidth / 2) / Math.max(1e-6, tanH);
      const dist = Math.max(distV, distH) * 1.15 * fitPadding;

      camera.position.set(centerX, Math.max(2, dist), centerZ);
      camera.lookAt(centerX, 0, centerZ);
      persp.aspect = aspect;
      persp.updateProjectionMatrix();

      if (controlsRef.current) {
        controlsRef.current.target.set(centerX, 0, centerZ);
        controlsRef.current.update();
      }
    }

    didFitRef.current = true;
  }, [camera, controlsRef, polygons, size.height, size.width]);

  return null;
}
