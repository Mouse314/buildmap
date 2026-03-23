import { useFrame, useThree } from '@react-three/fiber';
import * as React from 'react';
import * as THREE from 'three';
import { type OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { computeBounds, type RoomPolygon } from '../rooms/utils/roomData';

export function AutoFitToPolygons({
  polygons,
  controlsRef,
  enabled,
  isDragging,
  trigger,
  token,
}: {
  polygons: RoomPolygon[] | null;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  enabled: boolean;
  isDragging: boolean;
  trigger: number;
  token: string;
}) {
  const { camera, size } = useThree();

  const polygonsRef = React.useRef<RoomPolygon[] | null>(null);
  const tokenRef = React.useRef<string>('');
  const pendingTriggerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    polygonsRef.current = polygons;
  }, [polygons]);

  React.useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const goalRef = React.useRef<{
    position: THREE.Vector3;
    target: THREE.Vector3;
    active: boolean;
  }>({
    position: new THREE.Vector3(),
    target: new THREE.Vector3(),
    active: false,
  });

  React.useEffect(() => {
    if (enabled) return;
    goalRef.current.active = false;
    pendingTriggerRef.current = null;
  }, [enabled]);

  const runFit = React.useCallback(() => {
    if (!enabled) return false;
    if (isDragging) return false;

    const currentToken = (tokenRef.current ?? '').trim();
    if (currentToken.length === 0) return false;

    const polys = polygonsRef.current;
    if (!polys || polys.length === 0) return false;

    const bounds = computeBounds(polys);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    // Polygons are created in XY and then rotated by -90° around X,
    // so their Y maps to world -Z.
    const centerZ = -((bounds.minY + bounds.maxY) / 2);

    const boxWidth = Math.max(0.001, bounds.maxX - bounds.minX);
    const boxHeight = Math.max(0.001, bounds.maxY - bounds.minY);
    const fitPadding = 1.35;

    // Keep top-down orientation stable.
    camera.up.set(0, 0, -1);

    const aspect = size.width / Math.max(1, size.height);
    const persp = camera as unknown as { fov?: number; aspect?: number; updateProjectionMatrix?: () => void };
    const fov = typeof persp.fov === 'number' ? persp.fov : 45;

    const vFov = (fov * Math.PI) / 180;
    const tanV = Math.tan(vFov / 2);
    const tanH = tanV * aspect;

    const distV = (boxHeight / 2) / Math.max(1e-6, tanV);
    const distH = (boxWidth / 2) / Math.max(1e-6, tanH);
    const dist = Math.max(distV, distH) * 1.15 * fitPadding;

    goalRef.current.position.set(centerX, Math.max(2, dist), centerZ);
    goalRef.current.target.set(centerX, 0, centerZ);
    goalRef.current.active = true;

    // Ensure projection matches current size.
    if (typeof persp.aspect === 'number') persp.aspect = aspect;
    persp.updateProjectionMatrix?.();

    return true;
  }, [camera, enabled, isDragging, size.height, size.width]);

  // Only react to explicit "trigger" changes (i.e. search text edits).
  React.useEffect(() => {
    if (!enabled) return;
    pendingTriggerRef.current = trigger;
    if (!isDragging) {
      const didRun = runFit();
      if (didRun) pendingTriggerRef.current = null;
    }
  }, [enabled, isDragging, runFit, trigger]);

  // If user was dragging at the time of the edit, apply once after drag ends.
  React.useEffect(() => {
    if (isDragging) return;
    if (pendingTriggerRef.current == null) return;
    const didRun = runFit();
    if (didRun) pendingTriggerRef.current = null;
  }, [isDragging, runFit]);

  useFrame((_, delta) => {
    if (!enabled) return;
    if (isDragging) return;
    if (!goalRef.current.active) return;

    const goalPos = goalRef.current.position;
    const goalTarget = goalRef.current.target;

    const nextX = THREE.MathUtils.damp(camera.position.x, goalPos.x, 10, delta);
    const nextY = THREE.MathUtils.damp(camera.position.y, goalPos.y, 10, delta);
    const nextZ = THREE.MathUtils.damp(camera.position.z, goalPos.z, 10, delta);
    camera.position.set(nextX, nextY, nextZ);

    if (controlsRef.current) {
      const target = controlsRef.current.target;
      target.x = THREE.MathUtils.damp(target.x, goalTarget.x, 10, delta);
      target.y = THREE.MathUtils.damp(target.y, goalTarget.y, 10, delta);
      target.z = THREE.MathUtils.damp(target.z, goalTarget.z, 10, delta);
      controlsRef.current.update();
    } else {
      camera.lookAt(goalTarget.x, goalTarget.y, goalTarget.z);
    }

    const done =
      camera.position.distanceToSquared(goalPos) < 0.0004 &&
      (!controlsRef.current || controlsRef.current.target.distanceToSquared(goalTarget) < 0.0004);
    if (done) {
      goalRef.current.active = false;
    }
  });

  return null;
}
