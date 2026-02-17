import { useThree } from '@react-three/fiber';
import * as React from 'react';

export function CursorManager({ hovered, dragging }: { hovered: boolean; dragging: boolean }) {
  React.useEffect(() => {
    const next = dragging ? 'grabbing' : hovered ? 'pointer' : 'auto';
    document.body.style.cursor = next;
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, [dragging, hovered]);

  return null;
}

export function DragDetector({
  dragRef,
  setIsDragging,
}: {
  dragRef: React.MutableRefObject<{ down: boolean; startX: number; startY: number; moved: boolean }>;
  setIsDragging: (v: boolean) => void;
}) {
  const { gl } = useThree();

  React.useEffect(() => {
    const el = gl.domElement;
    const thresholdPx = 5;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragRef.current.down = true;
      dragRef.current.startX = e.clientX;
      dragRef.current.startY = e.clientY;
      dragRef.current.moved = false;
      setIsDragging(false);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragRef.current.down || dragRef.current.moved) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      if (dx * dx + dy * dy >= thresholdPx * thresholdPx) {
        dragRef.current.moved = true;
        setIsDragging(true);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.type === 'pointerup' && e.button !== 0) return;
      if (!dragRef.current.down) return;
      dragRef.current.down = false;

      window.setTimeout(() => {
        dragRef.current.moved = false;
        setIsDragging(false);
      }, 0);
    };

    el.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [dragRef, gl, setIsDragging]);

  return null;
}
