import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Text, useGLTF } from '@react-three/drei';
import { Bloom, EffectComposer, N8AO } from '@react-three/postprocessing';
import * as React from 'react';
import * as THREE from 'three';
import { type OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { computeBounds, roomsToPolygons, type RoomPolygon } from './roomData';
import type { Room } from './Room';
import { getRoomFillColor } from './roomPalette';

const NON_HOVERABLE_ROOM_IDS = new Set<number>([1, 100]);
const WALL_ROOM_ID = 100;
const WALL_EXTRUDE_DEPTH = 1.2;

function polygonCentroid(points: Array<{ x: number; y: number }>): { x: number; y: number } {
  // Area-weighted centroid; falls back to average if degenerate.
  let signedArea = 0;
  let cx = 0;
  let cy = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p0 = points[i];
    const p1 = points[(i + 1) % n];
    const a = p0.x * p1.y - p1.x * p0.y;
    signedArea += a;
    cx += (p0.x + p1.x) * a;
    cy += (p0.y + p1.y) * a;
  }

  if (Math.abs(signedArea) < 1e-6) {
    const avg = points.reduce(
      (acc, p) => ({ x: acc.x + p.x / n, y: acc.y + p.y / n }),
      { x: 0, y: 0 },
    );
    return avg;
  }

  signedArea *= 0.5;
  cx /= 6 * signedArea;
  cy /= 6 * signedArea;
  return { x: cx, y: cy };
}

function RoomLabel({
  polygon,
  showDescription,
  color,
}: {
  polygon: RoomPolygon;
  showDescription: boolean;
  color: string;
}) {
  const centroid = React.useMemo(() => polygonCentroid(polygon.points), [polygon.points]);
  const roomNo = (polygon.roomNo ?? '').trim();
  const description = (polygon.description ?? '').trim();

  if (roomNo.length === 0) {
    if (!showDescription || description.length === 0) return null;
    return (
      <Text
        position={[centroid.x, 0.08, -centroid.y]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={1}
        lineHeight={1.1}
        maxWidth={20}
        fontWeight="bold"
        textAlign="center"
        anchorX="center"
        anchorY="middle"
        color={color}
      >
        {description}
      </Text>
    );
  }

  const text = showDescription && description.length > 0 ? `${roomNo}\n${description}` : roomNo;

  return (
    <Text
      position={[centroid.x, 0.08, -centroid.y]}
      rotation={[-Math.PI / 2, 0, 0]}
      fontSize={1}
      lineHeight={1.1}
      maxWidth={20}
      fontWeight="bold"
      textAlign="center"
      anchorX="center"
      anchorY="middle"
      color={color}
    >
      {text}
    </Text>
  );
}

function RoomLabels({ polygons, color }: { polygons: RoomPolygon[]; color: string }) {
  const { camera } = useThree();
  const [mode, setMode] = React.useState<0 | 1 | 2>(0);
  const modeRef = React.useRef<0 | 1 | 2>(0);

  useFrame(() => {
    let nextMode: 0 | 1 | 2 = 1;

    if ((camera as unknown as THREE.OrthographicCamera).isOrthographicCamera) {
      const zoom = (camera as THREE.OrthographicCamera).zoom;
      nextMode = zoom < 2.05 ? 0 : zoom < 12 ? 1 : 2;
    } else {
      const height = camera.position.y;
      nextMode = height > 95 ? 0 : height > 40 ? 1 : 2;
    }

    if (nextMode !== modeRef.current) {
      modeRef.current = nextMode;
      setMode(nextMode);
    }
  });

  if (mode === 0) return null;
  const showDescription = mode === 2;

  return (
    <group>
      {polygons.map((poly, idx) => (
        <RoomLabel
          key={`${poly.roomID}-${idx}`}
          polygon={poly}
          showDescription={showDescription}
          color={color}
        />
      ))}
    </group>
  );
}

function makePolygonGeometry(
  points: Array<{ x: number; y: number }>,
  opts: { extrudeDepth?: number } = {},
): THREE.BufferGeometry | null {
  if (points.length < 3) return null;
  const vectors = points.map((p) => new THREE.Vector2(p.x, p.y));
  const shape = new THREE.Shape(vectors);

  const depth = opts.extrudeDepth ?? 0;
  const geom: THREE.BufferGeometry = depth > 0
    ? new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: false,
        steps: 1,
      })
    : new THREE.ShapeGeometry(shape);

  geom.computeVertexNormals();
  return geom;
}

function CursorManager({ hovered, dragging }: { hovered: boolean; dragging: boolean }) {
  React.useEffect(() => {
    const next = dragging ? 'grabbing' : hovered ? 'pointer' : 'auto';
    document.body.style.cursor = next;
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, [dragging, hovered]);

  return null;
}

function DragDetector({
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

function HoverHighlighter({
  active,
  glowOpacity = 0.22,
  outlineOpacity = 0.55,
  glowBoost = 2.2,
  renderOrder = 9,
}: {
  active: { key: string; geometry: THREE.BufferGeometry; color: string } | null;
  glowOpacity?: number;
  outlineOpacity?: number;
  glowBoost?: number;
  renderOrder?: number;
}) {
  const edgesCache = React.useRef(new Map<string, THREE.EdgesGeometry>());
  const glowMeshRef = React.useRef<THREE.Mesh | null>(null);
  const outlineRef = React.useRef<THREE.LineSegments | null>(null);
  const glowMatRef = React.useRef<THREE.MeshBasicMaterial | null>(null);
  const lineMatRef = React.useRef<THREE.LineBasicMaterial | null>(null);

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

    let edges = edgesCache.current.get(active.key);
    if (!edges) {
      edges = new THREE.EdgesGeometry(active.geometry);
      edgesCache.current.set(active.key, edges);
    }

    if (outlineRef.current) {
      outlineRef.current.geometry = edges;
    }
  }, [active]);

  useFrame((_, delta) => {
    const target = active ? 1 : 0;
    alphaRef.current = THREE.MathUtils.damp(alphaRef.current, target, 16, delta);

    const isVisible = alphaRef.current > 0.002 && Boolean(displayedRef.current);
    if (glowMeshRef.current) glowMeshRef.current.visible = isVisible;
    if (outlineRef.current) outlineRef.current.visible = isVisible;

    const displayed = displayedRef.current;
    if (displayed && glowMatRef.current) {
      const glowColor = new THREE.Color(displayed.color).multiplyScalar(glowBoost);
      glowMatRef.current.color.copy(glowColor);
      glowMatRef.current.opacity = glowOpacity * alphaRef.current;
    }

    if (displayed && lineMatRef.current) {
      lineMatRef.current.color.set(displayed.color);
      lineMatRef.current.opacity = outlineOpacity * alphaRef.current;
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
      >
        <meshBasicMaterial
          ref={glowMatRef}
          color={'#000000'}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

function FitView({
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

    camera.position.set(centerX, 50, centerZ);
    camera.up.set(0, 0, -1);
    camera.lookAt(centerX, 0, centerZ);

    if (controlsRef.current) {
      controlsRef.current.target.set(centerX, 0, centerZ);
      controlsRef.current.update();
    }

    const boxWidth = Math.max(0.001, bounds.maxX - bounds.minX);
    const boxHeight = Math.max(0.001, bounds.maxY - bounds.minY);
    const zoom = Math.min(size.width / boxWidth, size.height / boxHeight) * 0.9;

    if ('zoom' in camera) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (camera as any).zoom = zoom;
      camera.updateProjectionMatrix();
    }

    didFitRef.current = true;
  }, [camera, controlsRef, polygons, size.height, size.width]);

  return null;
}

function MouseLamp({
  height = 1,
  intensity = 55,
}: {
  height?: number;
  intensity?: number;
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
        // angle={0.55}
        // penumbra={0.65}
        position={[0, height, 0]}
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
        shadow-bias={-0.00015}
        shadow-camera-near={0.5}
        shadow-camera-far={height * 12}
      />

      // меш лампы
      {/* <mesh ref={bulbRef} position={[0, height, 0]} raycast={() => null}>
        <sphereGeometry args={[0.35, 18, 18]} />
        <meshBasicMaterial color={0xfff1c7} />
      </mesh> */}
    </group>
  );
}

export function FloorPlanCanvas({
  rooms,
  selectedRoomKey,
  onSelectRoomKey,
  onOpenRoom,
  onHoverRoom,
  theme = 'light',
  matchedKeys = null,
}: {
  rooms: Room[];
  selectedRoomKey: string | null;
  onSelectRoomKey: (roomKey: string | null) => void;
  onOpenRoom?: (args: { roomKey: string; clientX: number; clientY: number }) => void;
  onHoverRoom?: (args: { room: Room; clientX: number; clientY: number } | null) => void;
  theme?: 'light' | 'dark';
  matchedKeys?: Set<string> | null;
}) {
  const polygons = React.useMemo(() => roomsToPolygons(rooms), [rooms]);
  const [hoveredPolyKey, setHoveredPolyKey] = React.useState<string | null>(null);
  const controlsRef = React.useRef<OrbitControlsImpl | null>(null);

  const colors = React.useMemo(() => {
    const background = theme === 'dark' ? '#0b0f19' : '#747474';
    const label = theme === 'dark' ? '#f3f4f6' : '#111111';
    const dimFill = theme === 'dark' ? '#111827' : '#d1d5db';
    return { background, label, dimFill };
  }, [theme]);

  const clickCandidateRef = React.useRef<{ roomKey: string; clientX: number; clientY: number } | null>(null);
  const dragRef = React.useRef<{ down: boolean; startX: number; startY: number; moved: boolean }>(
    { down: false, startX: 0, startY: 0, moved: false },
  );
  const [isDragging, setIsDragging] = React.useState(false);

  React.useEffect(() => {
    if (!isDragging) return;
    setHoveredPolyKey(null);
    clickCandidateRef.current = null;
    onHoverRoom?.(null);
  }, [isDragging, onHoverRoom]);

  const hoveredPolyKeyRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    hoveredPolyKeyRef.current = hoveredPolyKey;
  }, [hoveredPolyKey]);

  const renderItems = React.useMemo(() => {
    const items: Array<{
      key: string;
      polygon: RoomPolygon;
      geometry: THREE.BufferGeometry;
      color: string;
      hoverable: boolean;
    }> = [];

    for (let idx = 0; idx < polygons.length; idx++) {
      const poly = polygons[idx];
      const isWall = poly.roomID === WALL_ROOM_ID;
      const geom = makePolygonGeometry(poly.points, {
        extrudeDepth: isWall ? WALL_EXTRUDE_DEPTH : 0,
      });
      if (!geom) continue;
      const room = rooms[idx];
      const key = room?.key ?? `${poly.roomID}-${idx}`;
      const hoverable = !NON_HOVERABLE_ROOM_IDS.has(poly.roomID);
      items.push({
        key,
        polygon: poly,
        geometry: geom,
        color: getRoomFillColor(poly.roomID),
        hoverable,
      });
    }

    return items;
  }, [polygons, rooms]);

  const renderItemByKey = React.useMemo(() => {
    const map = new Map<string, (typeof renderItems)[number]>();
    for (const item of renderItems) map.set(item.key, item);
    return map;
  }, [renderItems]);

  const hoveredItem = hoveredPolyKey ? renderItemByKey.get(hoveredPolyKey) ?? null : null;

  const selectedItem = React.useMemo(() => {
    if (selectedRoomKey == null) return null;
    return renderItems.find((it) => it.key === selectedRoomKey) ?? null;
  }, [renderItems, selectedRoomKey]);

  const nullRaycast = React.useCallback(() => {
    // no-op
  }, []);

  return (
    <Canvas
      shadows
      onCreated={({ gl }) => {
        gl.shadowMap.enabled = true;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
      }}
      onPointerMissed={() => {
        setHoveredPolyKey(null);
        onHoverRoom?.(null);
      }}
    >
      <color attach="background" args={[colors.background]} />
      <CursorManager hovered={Boolean(hoveredItem)} dragging={isDragging} />
      <DragDetector dragRef={dragRef} setIsDragging={setIsDragging} />
      <PerspectiveCamera makeDefault near={0.1} far={500} position={[0, 50, 0]} />
      <ambientLight intensity={theme === 'dark' ? 0.12 : 1} />

      {theme === 'dark' && <MouseLamp height={1} intensity={20} />}

      <EffectComposer>
        {/* <N8AO
          halfRes
          quality="medium"
          aoRadius={1.4}
          intensity={1.15}
          distanceFalloff={0.9}
          aoSamples={16}
          denoiseSamples={4}
          denoiseRadius={12}
        /> */}
        <Bloom
          intensity={0.45}
          luminanceThreshold={1.0}
          luminanceSmoothing={0.05}
          radius={0.18}
          mipmapBlur={false}
        />
      </EffectComposer>

      <FitView polygons={polygons} controlsRef={controlsRef} />
      <OrbitControls
        ref={controlsRef}
        enableRotate={false}
        enablePan
        enableZoom
        enableDamping
        dampingFactor={0.06}
        zoomSpeed={1.2}
        panSpeed={1.2}
        mouseButtons={{
          LEFT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.ROTATE,
        }}
        minZoom={2}
        maxZoom={600}
      />

      <HoverHighlighter
        active={
          selectedItem
            ? {
                key: `selected-${selectedItem.key}`,
                geometry: selectedItem.geometry,
                color: selectedItem.color,
              }
            : null
        }
        glowOpacity={0.28}
        outlineOpacity={0.65}
        glowBoost={2.35}
        renderOrder={7}
      />

      <HoverHighlighter
        active={
          hoveredItem
            ? {
                key: `hovered-${hoveredItem.key}`,
                geometry: hoveredItem.geometry,
                color: hoveredItem.color,
              }
            : null
        }
        glowOpacity={0.22}
        outlineOpacity={0.55}
        glowBoost={2.2}
        renderOrder={9}
      />

      <group>
        {renderItems.map((item) => {
          const isSelected = selectedRoomKey === item.key;
          const isHovered = hoveredPolyKey === item.key;
          const isMatched = matchedKeys ? matchedKeys.has(item.key) : true;
          const isWall = item.polygon.roomID === WALL_ROOM_ID;

          const shouldDim = matchedKeys != null && !isMatched && !isSelected && !isHovered && !isWall;
          const fillColor = shouldDim ? colors.dimFill : item.color;
          const fillOpacity = shouldDim ? 0.6 : 1.0;

          return (
            <mesh
              key={item.key}
              geometry={item.geometry}
              rotation={[-Math.PI / 2, 0, 0]}
              castShadow={isWall}
              receiveShadow
              raycast={!isDragging && item.hoverable ? THREE.Mesh.prototype.raycast : nullRaycast}
              onPointerDown={
                item.hoverable
                  ? (e) => {
                      if (e.nativeEvent.button !== 0) return;
                      if (isDragging) return;
                      clickCandidateRef.current = {
                        roomKey: item.key,
                        clientX: e.nativeEvent.clientX,
                        clientY: e.nativeEvent.clientY,
                      };
                    }
                  : undefined
              }
              onPointerUp={
                item.hoverable
                  ? (e) => {
                      if (e.nativeEvent.button !== 0) return;
                      e.stopPropagation();
                      if (isDragging) return;

                      const cand = clickCandidateRef.current;
                      clickCandidateRef.current = null;
                      if (!cand || cand.roomKey !== item.key) return;
                      if (dragRef.current.moved) return;

                      const nextKey = selectedRoomKey === item.key ? null : item.key;
                      onSelectRoomKey(nextKey);
                      if (nextKey != null) {
                        onOpenRoom?.({ roomKey: nextKey, clientX: cand.clientX, clientY: cand.clientY });
                      }
                    }
                  : undefined
              }
              onPointerOver={
                item.hoverable
                  ? (e) => {
                      if (isDragging) return;
                      e.stopPropagation();
                      if (hoveredPolyKeyRef.current === item.key) return;
                      setHoveredPolyKey(item.key);

                      const room = rooms.find((r) => r.key === item.key);
                      if (room) {
                        onHoverRoom?.({ room, clientX: e.nativeEvent.clientX, clientY: e.nativeEvent.clientY });
                      }
                    }
                  : undefined
              }
              onPointerOut={
                item.hoverable
                  ? (e) => {
                      if (isDragging) return;
                      e.stopPropagation();
                      setHoveredPolyKey(null);
                      onHoverRoom?.(null);
                    }
                  : undefined
              }
            >
              <meshPhongMaterial
                color={fillColor}
                transparent
                opacity={fillOpacity}
                side={THREE.DoubleSide}
              />
            </mesh>
          );
        })}

        <RoomLabels polygons={polygons} color={colors.label} />
      </group>
    </Canvas>
  );
}

useGLTF.preload(`${import.meta.env.BASE_URL}Build_1.glb`);
