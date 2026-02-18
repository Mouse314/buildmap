import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, PerformanceMonitor, PerspectiveCamera, Stats } from '@react-three/drei';
import { Bloom, EffectComposer, SSAO } from '@react-three/postprocessing';
import * as React from 'react';
import * as THREE from 'three';
import { type OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { roomsToPolygons, type RoomPolygon } from './roomData';
import type { Room } from './Room';
import { getRoomFillColor } from './roomPalette';
import { makePolygonGeometry } from './canvas/geometry';
import { RoomLabels, type TitleAnchor } from './canvas/labels';
import { CursorManager, DragDetector } from './canvas/interaction';
import { HoverHighlighter } from './canvas/HoverHighlighter';
import { FitView } from './canvas/FitView';
import { MouseLamp } from './canvas/MouseLamp';
import { SmoothWheelZoom } from './canvas/SmoothWheelZoom';
import { AutoFitToPolygons } from './canvas/AutoFitToPolygons';
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
  titleAnchor = null,
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
  titleAnchor?: TitleAnchor | null;
  theme?: 'light' | 'dark';
  graphicsPreset?: GraphicsPresetId;
  searchText?: string;
  matchedKeys?: Set<string> | null;
}) {
  const polygons = React.useMemo(() => roomsToPolygons(rooms), [rooms]);
  const [hoveredPolyKey, setHoveredPolyKey] = React.useState<string | null>(null);
  const controlsRef = React.useRef<OrbitControlsImpl | null>(null);

  const preset = React.useMemo(() => getGraphicsPreset(graphicsPreset), [graphicsPreset]);

  const searchToken = React.useMemo(() => {
    return (searchText ?? '').trim();
  }, [searchText]);

  const [autoFitTrigger, setAutoFitTrigger] = React.useState(0);
  const [isSearchTyping, setIsSearchTyping] = React.useState(false);
  const typingTimeoutRef = React.useRef<number | null>(null);
  const didMountRef = React.useRef(false);
  React.useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    setAutoFitTrigger((v) => v + 1);

    // Hard limit: allow auto-fit only while user is actively editing the search text.
    if (typingTimeoutRef.current != null) {
      window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if ((searchText ?? '').length === 0) {
      setIsSearchTyping(false);
      return;
    }

    setIsSearchTyping(true);
    typingTimeoutRef.current = window.setTimeout(() => {
      setIsSearchTyping(false);
      typingTimeoutRef.current = null;
    }, 250);
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
        enabled={searchToken.length > 0 && isSearchTyping}
        polygons={matchedPolygons}
        controlsRef={controlsRef}
        isDragging={isDragging}
        trigger={autoFitTrigger}
        token={searchToken}
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

      <SmoothWheelZoom
        controlsRef={controlsRef}
        isDragging={isDragging}
        dragRef={dragRef}
        minDistance={10}
        maxDistance={150}
        wheelStrength={0.0014}
        smoothTime={18}
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

        <RoomLabels polygons={polygons} color={colors.label} titleText={titleText} titleAnchor={titleAnchor} />
      </group>
    </Canvas>
  );
}