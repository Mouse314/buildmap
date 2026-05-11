import { useFrame, useThree } from '@react-three/fiber';
import * as React from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

// Управляет плавным zoom колесом мыши с привязкой к курсору.
export function SmoothWheelZoom({
  controlsRef,
  isDragging = false,
  dragRef,
  minZoom = 1,
  maxZoom = 1600,
  minDistance = 10,
  maxDistance = 1400,
  wheelStrength = 0.0016,
  smoothTime = 18,
  zoomRequest = null,
  buttonZoomFactor = 0.85,
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
  zoomRequest?: { dir: 'in' | 'out'; token: number } | null;
  buttonZoomFactor?: number;
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

  // Время последнего zoom колесом; нужно, чтобы не путать демпфирование с внешним движением камеры.
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

  // Цели синхронизируются в рендер-цикле сразу после появления OrbitControls,
  // чтобы избежать нежелательного авто-зума на старте.

  React.useEffect(() => {

    const el = gl.domElement;

    const onWheel = (e: WheelEvent) => {
      // Масштабирование обрабатываем вручную.
      e.preventDefault();

      // Во время перетаскивания не запускаем новый zoom по колесу.
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

      // Для перспективной камеры меняем дистанцию до target.
      const curDist = targetDistanceRef.current;
      const nextDist = THREE.MathUtils.clamp(curDist * factor, minDistance, maxDistance);
      targetDistanceRef.current = nextDist;

      // Привязываем zoom к позиции курсора на плоскости пола.
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

  React.useEffect(() => {
    if (!zoomRequest) return;
    const controls = controlsRef.current;
    if (!controls) return;

    const factor = zoomRequest.dir === 'in' ? buttonZoomFactor : 1 / buttonZoomFactor;
    lastWheelAtRef.current = performance.now();
    cursorAnchorRef.current = null;

    if (isOrtho) {
      if (!('zoom' in camera)) return;
      const zoomable = camera as THREE.Camera & { zoom: number };
      const next = THREE.MathUtils.clamp(zoomable.zoom * factor, minZoom, maxZoom);
      targetZoomRef.current = next;
      return;
    }

    const curDist = camera.position.distanceTo(controls.target);
    const nextDist = THREE.MathUtils.clamp(curDist * factor, minDistance, maxDistance);
    targetDistanceRef.current = nextDist;
  }, [zoomRequest, buttonZoomFactor, camera, controlsRef, isOrtho, maxDistance, maxZoom, minDistance, minZoom]);

  useFrame((_, delta) => {
    
    const controls = controlsRef.current;
    if (!controls) return;

    // Если камеру/target изменил внешний код, синхронизируем цели, чтобы не было лишнего демпфирования.
    const now = performance.now();
    const recentlyWheeled = lastWheelAtRef.current >= 0 && now - lastWheelAtRef.current < 350;

    // Во время drag не вмешиваемся в OrbitControls и подравниваем цели, чтобы не было рывка после отпускания.
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

    // Если zoom не идет, полностью отдаем управление OrbitControls.
    if (!anchor && Math.abs(curDist - targetDist) < 1e-5) {
      return;
    }

    const nextDist = THREE.MathUtils.damp(curDist, targetDist, smoothTime, delta);

    // Двигаем камеру вдоль направления взгляда относительно target.
    tmpDir.copy(camera.position).sub(controls.target);
    const len = tmpDir.length();
    if (len < 1e-6) return;
    tmpDir.multiplyScalar(1 / len);
    tmpPoint2.copy(controls.target).addScaledVector(tmpDir, nextDist);
    camera.position.copy(tmpPoint2);
    camera.updateMatrixWorld();

    // Компенсация zoom к курсору: удерживаем закрепленную мировую точку под указателем.
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
