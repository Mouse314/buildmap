import { useFrame, useThree } from '@react-three/fiber';
import * as React from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

export function SmoothWheelZoom({
  controlsRef,
  isDragging = false,
  dragRef,
  minZoom = 2,
  maxZoom = 600,
  minDistance = 10,
  maxDistance = 140,
  wheelStrength = 0.0016,
  smoothTime = 18,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  isDragging?: boolean;
  dragRef?: React.MutableRefObject<{ down: boolean }>;
  minZoom?: number;
  maxZoom?: number;
  minDistance?: number;
  maxDistance?: number;
  wheelStrength?: number;
  smoothTime?: number;
}) {
  const { camera, gl } = useThree();

  const plane = React.useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const raycaster = React.useMemo(() => new THREE.Raycaster(), []);
  const ndc = React.useMemo(() => new THREE.Vector2(), []);
  const tmpPoint = React.useMemo(() => new THREE.Vector3(), []);
  const tmpPoint2 = React.useMemo(() => new THREE.Vector3(), []);
  const tmpDir = React.useMemo(() => new THREE.Vector3(), []);
  const tmpOffset = React.useMemo(() => new THREE.Vector3(), []);

  const targetZoomRef = React.useRef<number>(
    'zoom' in camera ? (camera as THREE.Camera & { zoom: number }).zoom : 1,
  );

  const targetDistanceRef = React.useRef<number>(50);

  // Timestamp of the last wheel zoom. Used to avoid treating in-progress zoom damping
  // as an external camera change (e.g. FitView) and to prevent unwanted auto-zoom on load.
  const lastWheelAtRef = React.useRef<number>(-1);

  const cursorAnchorRef = React.useRef<
    | {
        ndcX: number;
        ndcY: number;
        worldPoint: THREE.Vector3;
      }
    | null
  >(null);

  const isOrtho = Boolean((camera as unknown as { isOrthographicCamera?: boolean }).isOrthographicCamera);

  const shouldPauseRef = React.useCallback(() => {
    return Boolean(isDragging || dragRef?.current?.down);
  }, [dragRef, isDragging]);

  // NOTE: We sync targets in the render loop as soon as OrbitControls exists.
  // This avoids a common race where FitView sets the camera before controlsRef.current
  // is available, leaving targetDistanceRef at its default and causing an unwanted
  // smooth "auto-zoom" right after load.

  React.useEffect(() => {

    const el = gl.domElement;

    const onWheel = (e: WheelEvent) => {
      // We handle zoom ourselves.
      e.preventDefault();

      // While panning (mouse down), don't let wheel start a new zoom.
      if (dragRef?.current?.down) return;

      const rect = el.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      const ndcY = -(((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);

      const controls = controlsRef.current;
      if (!controls) return;

      const delta = e.deltaY;
      const factor = Math.exp(delta * wheelStrength);

      lastWheelAtRef.current = performance.now();

      if (isOrtho) {
        if (!('zoom' in camera)) return;
        const curTarget = targetZoomRef.current;
        const next = THREE.MathUtils.clamp(curTarget / factor, minZoom, maxZoom);
        targetZoomRef.current = next;
        return;
      }

      // Perspective: dolly by changing distance to target.
      const curDist = targetDistanceRef.current;
      const nextDist = THREE.MathUtils.clamp(curDist * factor, minDistance, maxDistance);
      targetDistanceRef.current = nextDist;

      // Anchor zoom to cursor on the floor plane.
      ndc.set(ndcX, ndcY);
      raycaster.setFromCamera(ndc, camera as THREE.Camera);
      const hit = raycaster.ray.intersectPlane(plane, tmpPoint);
      if (hit) {
        cursorAnchorRef.current = {
          ndcX,
          ndcY,
          worldPoint: tmpPoint.clone(),
        };
      } else {
        cursorAnchorRef.current = null;
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, [camera, gl, isOrtho, maxDistance, maxZoom, minDistance, minZoom, ndc, plane, raycaster, wheelStrength, controlsRef, tmpPoint, dragRef]);

  useFrame((_, delta) => {
    
    const controls = controlsRef.current;
    if (!controls) return;

    // If something else (FitView, external code) has set the camera/target,
    // keep our targets in sync so we don't introduce unwanted damping.
    // We only treat a mismatch as "external" if there was no recent wheel zoom.
    const now = performance.now();
    const recentlyWheeled = lastWheelAtRef.current >= 0 && now - lastWheelAtRef.current < 350;

    // When the user is actively panning/dragging, don't fight OrbitControls.
    // Also resync targets so we don't "snap" when dragging ends.
    if (shouldPauseRef()) {
      cursorAnchorRef.current = null;
      if (isOrtho) {
        if ('zoom' in camera) {
          targetZoomRef.current = (camera as THREE.Camera & { zoom: number }).zoom;
        }
      } else {
        targetDistanceRef.current = camera.position.distanceTo(controls.target);
      }
      return;
    }

    if (isOrtho) {
      if (!('zoom' in camera)) return;
      const zoomable = camera as THREE.Camera & { zoom: number; updateProjectionMatrix: () => void };

      if (!recentlyWheeled && Math.abs(zoomable.zoom - targetZoomRef.current) > 1e-3) {
        targetZoomRef.current = zoomable.zoom;
        cursorAnchorRef.current = null;
        return;
      }

      const target = targetZoomRef.current;
      const next = THREE.MathUtils.damp(zoomable.zoom, target, smoothTime, delta);
      if (Math.abs(next - zoomable.zoom) > 1e-6) {
        zoomable.zoom = next;
        zoomable.updateProjectionMatrix();
        controls.update();
      }
      return;
    }

    const targetDist = targetDistanceRef.current;
    const curDist = camera.position.distanceTo(controls.target);
    const anchor = cursorAnchorRef.current;

    if (!recentlyWheeled && !anchor && Math.abs(curDist - targetDist) > 0.25) {
      targetDistanceRef.current = curDist;
      return;
    }

    // If there's no zoom in progress, leave the camera fully to OrbitControls.
    if (!anchor && Math.abs(curDist - targetDist) < 1e-5) {
      return;
    }

    const nextDist = THREE.MathUtils.damp(curDist, targetDist, smoothTime, delta);

    // Move camera along its view direction relative to target.
    tmpDir.copy(camera.position).sub(controls.target);
    const len = tmpDir.length();
    if (len < 1e-6) return;
    tmpDir.multiplyScalar(1 / len);
    tmpPoint2.copy(controls.target).addScaledVector(tmpDir, nextDist);
    camera.position.copy(tmpPoint2);
    camera.updateMatrixWorld();

    // Zoom-to-cursor compensation: keep anchored world point under cursor.
    if (anchor) {
      ndc.set(anchor.ndcX, anchor.ndcY);
      raycaster.setFromCamera(ndc, camera as THREE.Camera);
      const hit2 = raycaster.ray.intersectPlane(plane, tmpPoint);
      if (hit2) {
        tmpOffset.copy(anchor.worldPoint).sub(tmpPoint);
        camera.position.add(tmpOffset);
        controls.target.add(tmpOffset);
      }
    }

    controls.update();

    if (anchor && Math.abs(nextDist - targetDist) < 0.01) {
      cursorAnchorRef.current = null;
    }
  });

  return null;
}
