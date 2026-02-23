import { useFrame } from '@react-three/fiber';
import * as React from 'react';
import * as THREE from 'three';

export function MouseLamp({
  height = 1,
  intensity = 55,
  shadowMapSize = 512,
}: {
  height?: number;
  intensity?: number;
  shadowMapSize?: number;
}) {
  const lightRef = React.useRef<THREE.SpotLight | null>(null);
  const targetRef = React.useRef<THREE.Object3D | null>(null);
  const bulbRef = React.useRef<THREE.Mesh | null>(null);

  const plane = React.useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const hitPoint = React.useMemo(() => new THREE.Vector3(), []);
  const desiredLightPos = React.useMemo(() => new THREE.Vector3(), []);

  React.useEffect(() => {
    const light = lightRef.current;
    const target = targetRef.current;
    if (!light || !target) return;
    light.target = target;
    light.target.updateMatrixWorld();
  }, []);

  useFrame((state, delta) => {
    const light = lightRef.current;
    const target = targetRef.current;
    if (!light || !target) return;

    state.raycaster.setFromCamera(state.pointer, state.camera);
    const hit = state.raycaster.ray.intersectPlane(plane, hitPoint);
    if (!hit) return;

    desiredLightPos.set(hitPoint.x, height, hitPoint.z);

    const t = 1 - Math.exp(-18 * delta);
    light.position.lerp(desiredLightPos, t);
    target.position.lerp(hitPoint, t);
    light.target.updateMatrixWorld();

    if (bulbRef.current) bulbRef.current.position.copy(light.position);
  });

  return (
    <group>
      <object3D ref={targetRef} />

      <pointLight
        ref={lightRef}
        castShadow
        intensity={intensity}
        distance={height * 32}
        decay={2}
        position={[0, height, 0]}
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-bias={-0.00015}
        shadow-camera-near={0.5}
        shadow-camera-far={height * 12}
      />

      {/* меш лампы */}
      {/* <mesh ref={bulbRef} position={[0, height, 0]} raycast={() => null}>
        <sphereGeometry args={[0.35, 18, 18]} />
        <meshBasicMaterial color={0xfff1c7} />
      </mesh> */}
    </group>
  );
}
