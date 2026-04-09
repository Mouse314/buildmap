import { useFrame } from '@react-three/fiber';
import * as React from 'react';
import * as THREE from 'three';

export function HoverHighlighter({
  active,
  glowOpacity = 0.22,
  glowBoost = 1.2,
  renderOrder = 9,
}: {
  active: { key: string; geometry: THREE.BufferGeometry; color: string } | null;
  glowOpacity?: number;
  glowBoost?: number;
  renderOrder?: number;
}) {
  const glowMeshRef = React.useRef<THREE.Mesh | null>(null);
  const glowMatRef = React.useRef<THREE.MeshBasicMaterial | null>(null);

  const displayedRef = React.useRef<{
    key: string;
    geometry: THREE.BufferGeometry;
    color: string;
  } | null>(null);
  const alphaRef = React.useRef(0);

  React.useEffect(() => {
    if (!active) return;
    if (displayedRef.current?.key === active.key) return;

    displayedRef.current = active;

    if (glowMeshRef.current) {
      glowMeshRef.current.geometry = active.geometry;
    }
  }, [active]);

  useFrame((_, delta) => {
    const target = active ? 1 : 0;
    alphaRef.current = THREE.MathUtils.damp(alphaRef.current, target, 16, delta);

    const isVisible = alphaRef.current > 0.002 && Boolean(displayedRef.current);
    if (glowMeshRef.current) glowMeshRef.current.visible = isVisible;

    const displayed = displayedRef.current;
    if (displayed && glowMatRef.current) {
      const glowColor = new THREE.Color(displayed.color).multiplyScalar(glowBoost);
      glowMatRef.current.color.copy(glowColor);
      glowMatRef.current.opacity = glowOpacity * alphaRef.current;
    }

    if (!active && alphaRef.current < 0.002) {
      displayedRef.current = null;
    }
  });

  return (
    <group>
      <mesh
        ref={glowMeshRef}
        geometry={active?.geometry}
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={() => null}
        renderOrder={renderOrder}
        visible={false}
        scale={1.0}
      >
        <meshBasicMaterial
          ref={glowMatRef}
          color={'#000000'}
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={true}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
