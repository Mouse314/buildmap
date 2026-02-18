import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerformanceMonitor, PerspectiveCamera, Stats } from '@react-three/drei';
import { Bloom, EffectComposer, SSAO } from '@react-three/postprocessing';
import * as React from 'react';
import * as THREE from 'three';
import { type OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { computeBounds, roomsToPolygons, type RoomPolygon } from './roomData';
import type { Room } from './Room';
import { getRoomFillColor } from './roomPalette';
import { makePolygonGeometry } from './canvas/geometry';
import { RoomLabels } from './canvas/labels';
import { CursorManager, DragDetector } from './canvas/interaction';
import { HoverHighlighter } from './canvas/HoverHighlighter';
import { FitView } from './canvas/FitView';
import { MouseLamp } from './canvas/MouseLamp';
import { SmoothWheelZoom } from './canvas/SmoothWheelZoom';
import { getGraphicsPreset, type GraphicsPresetId } from './graphicsPresets';

function ShadowConfigurator({ enabled }: { enabled: boolean }) {
  const { gl } = useThree();

  React.useEffect(() => {
    gl.shadowMap.enabled = enabled;
    if (enabled) {
      gl.shadowMap.type = THREE.PCFSoftShadowMap;
    }
  }, [enabled, gl]);

  return null;
}

function AutoFitToPolygons({
  polygons,
  controlsRef,
  enabled,
  isDragging,
  token,
}: {
  polygons: RoomPolygon[] | null;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  enabled: boolean;
  isDragging: boolean;
  token: string;
}) {
  const { camera, size } = useThree();

  const lastTokenRef = React.useRef<string>('');

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
    if (!enabled) return;
    if (isDragging) return;
    if (!polygons || polygons.length === 0) return;
    if (token.length === 0) {
      lastTokenRef.current = '';
      return;
    }
    if (lastTokenRef.current === token) return;
    lastTokenRef.current = token;

    const bounds = computeBounds(polygons);
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
  }, [camera, enabled, isDragging, polygons, size.height, size.width, token]);

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

const NON_HOVERABLE_ROOM_IDS = new Set<number>([1, 100, 200]);
const WALL_ROOM_ID = 100;
const WALL_EXTRUDE_DEPTH = 1.2;
const HIDDEN_ROOM_IDS = new Set<number>([300, 301]);

export function FloorPlanCanvas({
  rooms,
  selectedRoomKey,
  onSelectRoomKey,
  onOpenRoom,
  onHoverRoom,
  titleText,
  theme = 'light',
  graphicsPreset = 'medium',
  searchText = '',
  matchedKeys = null,
}: {
  rooms: Room[];
  selectedRoomKey: string | null;
  onSelectRoomKey: (roomKey: string | null) => void;
  onOpenRoom?: (args: { roomKey: string; clientX: number; clientY: number }) => void;
  onHoverRoom?: (args: { room: Room; clientX: number; clientY: number } | null) => void;
  titleText?: string;
  theme?: 'light' | 'dark';
  graphicsPreset?: GraphicsPresetId;
  searchText?: string;
  matchedKeys?: Set<string> | null;
}) {
  const polygons = React.useMemo(() => roomsToPolygons(rooms), [rooms]);
  const [hoveredPolyKey, setHoveredPolyKey] = React.useState<string | null>(null);
  const controlsRef = React.useRef<OrbitControlsImpl | null>(null);

  const preset = React.useMemo(() => getGraphicsPreset(graphicsPreset), [graphicsPreset]);

  const autoFitEnabled = React.useMemo(() => {
    return (searchText ?? '').trim().length > 0;
  }, [searchText]);

  const autoFitToken = React.useMemo(() => {
    return (searchText ?? '').trim();
  }, [searchText]);

  const matchedPolygons = React.useMemo(() => {
    if (!matchedKeys) return null;
    if (matchedKeys.size === 0) return [];
    const list: RoomPolygon[] = [];
    for (let i = 0; i < rooms.length; i++) {
      const roomKey = rooms[i]?.key;
      if (roomKey && matchedKeys.has(roomKey)) {
        list.push(polygons[i]);
      }
    }
    return list;
  }, [matchedKeys, polygons, rooms]);

  const deviceDpr = React.useMemo(() => {
    if (typeof window === 'undefined') return 1;
    return window.devicePixelRatio || 1;
  }, []);

  const initialDpr = React.useMemo(() => {
    if (preset.dpr.mode === 'fixed') return Math.min(deviceDpr, preset.dpr.value);
    return Math.min(deviceDpr, preset.dpr.baseMax);
  }, [deviceDpr, preset.dpr]);

  const [dpr, setDpr] = React.useState<number>(initialDpr);
  const [effectsEnabled, setEffectsEnabled] = React.useState<boolean>(preset.postFx.enabled);

  const shadowsEnabled = preset.shadowsEnabled;
  const allowAdaptiveQuality = preset.dpr.mode === 'adaptive';

  React.useEffect(() => {
    setDpr(initialDpr);
    setEffectsEnabled(preset.postFx.enabled);
  }, [initialDpr, preset.postFx.enabled]);

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
      if (poly.roomID === 200) continue;
      if (HIDDEN_ROOM_IDS.has(poly.roomID)) continue;
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
      shadows={shadowsEnabled}
      dpr={dpr}
      gl={{
        antialias: false,
        powerPreference: 'high-performance',
        alpha: false,
        stencil: false,
        preserveDrawingBuffer: false,
      }}
      onPointerMissed={() => {
        setHoveredPolyKey(null);
        onHoverRoom?.(null);
      }}
    >
      <ShadowConfigurator enabled={shadowsEnabled} />

      {allowAdaptiveQuality && (
        <PerformanceMonitor
          onDecline={() => {
            if (preset.dpr.mode !== 'adaptive') return;
            setDpr(Math.min(deviceDpr, preset.dpr.declineTo));
            setEffectsEnabled(false);
          }}
          onIncline={() => {
            if (preset.dpr.mode !== 'adaptive') return;
            setDpr(Math.min(deviceDpr, preset.dpr.baseMax));
            setEffectsEnabled(preset.postFx.enabled);
          }}
        />
      )}

      <color attach="background" args={[colors.background]} />
      <CursorManager hovered={Boolean(hoveredItem)} dragging={isDragging} />
      <DragDetector dragRef={dragRef} setIsDragging={setIsDragging} />
      <PerspectiveCamera makeDefault near={0.1} far={5000} fov={45} position={new THREE.Vector3(0, 150, 0)} />
      <ambientLight intensity={theme === 'dark' ? 0.12 : 2} />

      {theme === 'dark' && preset.mouseLampEnabled && <MouseLamp height={1} intensity={20} />}

      {effectsEnabled && (
        <EffectComposer enableNormalPass multisampling={preset.postFx.multisampling}>
          {preset.postFx.ssao ? (
            <SSAO
              samples={preset.postFx.ssao.samples}
              radius={preset.postFx.ssao.radius}
              intensity={preset.postFx.ssao.intensity}
              luminanceInfluence={preset.postFx.ssao.luminanceInfluence}
            />
          ) : (
            <></>
          )}
          {preset.postFx.bloom ? (
            <Bloom
              intensity={preset.postFx.bloom.intensity}
              luminanceThreshold={preset.postFx.bloom.luminanceThreshold}
              luminanceSmoothing={preset.postFx.bloom.luminanceSmoothing}
              radius={preset.postFx.bloom.radius}
              mipmapBlur={preset.postFx.bloom.mipmapBlur}
            />
          ) : (
            <></>
          )}
        </EffectComposer>
      )}

      <FitView polygons={polygons} controlsRef={controlsRef} />

      <AutoFitToPolygons
        enabled={autoFitEnabled}
        polygons={matchedPolygons}
        controlsRef={controlsRef}
        isDragging={isDragging}
        token={autoFitToken}
      />

      

      <OrbitControls
        ref={controlsRef}
        enableRotate={false}
        enablePan
        enableZoom={false}
        enableDamping
        dampingFactor={0.08}
        panSpeed={1.2}
        mouseButtons={{
          LEFT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.PAN,
          RIGHT: THREE.MOUSE.ROTATE,
        }}
        minDistance={10}
        maxDistance={150}
      />

      {<SmoothWheelZoom
        controlsRef={controlsRef}
        isDragging={isDragging}
        dragRef={dragRef}
        minDistance={10}
        maxDistance={150}
        wheelStrength={0.0014}
        smoothTime={18}
      />}

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
        glowOpacity={0.38}
        outlineOpacity={0.7}
        glowBoost={9.0}
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
        glowOpacity={0.32}
        outlineOpacity={0.65}
        glowBoost={8.0}
        renderOrder={9}
      />

      {import.meta.env.DEV && <Stats showPanel={0} className="stats" />}

      <group>
        {renderItems.map((item) => {
          const isSelected = selectedRoomKey === item.key;
          const isHovered = hoveredPolyKey === item.key;
          const isMatched = matchedKeys ? matchedKeys.has(item.key) : true;
          const isWall = item.polygon.roomID === WALL_ROOM_ID;
          const isLabel = item.polygon.roomID === 200;

          const shouldDim = matchedKeys != null && !isMatched && !isSelected && !isHovered && !isWall && !isLabel;
          const fillColor = shouldDim ? colors.dimFill : item.color;
          const fillOpacity = shouldDim ? 0.6 : 1.0;

          return (
            <mesh
              key={item.key}
              geometry={item.geometry}
              rotation={[-Math.PI / 2, 0, 0]}
              castShadow={shadowsEnabled && isWall}
              receiveShadow={shadowsEnabled}
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

        <RoomLabels polygons={polygons} color={colors.label} titleText={titleText} />
      </group>
    </Canvas>
  );
}