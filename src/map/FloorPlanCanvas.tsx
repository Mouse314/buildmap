import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerformanceMonitor, PerspectiveCamera, Stats } from '@react-three/drei';
import * as React from 'react';
import * as THREE from 'three';
import { type OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { computeBounds, roomsToPolygons, type RoomPolygon } from './rooms/utils/roomData';
import type { Room } from './rooms/utils/Room';
import { RoomLabels, type TitleAnchor } from './canvas/labels';
import { CursorManager, DragDetector } from './canvas/interaction';
import { HoverHighlighter } from './canvas/HoverHighlighter';
import { FitView } from './canvas/FitView';
import { SmoothWheelZoom } from './canvas/SmoothWheelZoom';
import { AutoFitToPolygons } from './canvas/AutoFitToPolygons';
import { PanBounds, type PanBoundsRect } from './canvas/PanBounds';
import { getGraphicsPreset, type GraphicsPresetId } from './graphicsPresets';
import { ShadowConfigurator } from './floorplan/components/ShadowConfigurator';
import { SceneEffects } from './floorplan/components/SceneEffects';
import { SceneLights } from './floorplan/components/SceneLights';
import { useSearchAutoFit } from './floorplan/hooks/useSearchAutoFit';
import { buildRenderItems } from './floorplan/utils/renderItems';
import { getSceneColors } from './floorplan/utils/sceneColors';
import { isInteractiveRoomArea } from './floorplan/utils/interactivity';
import { PAN_BOUNDS_PADDING_X, PAN_BOUNDS_PADDING_Z, WALL_ROOM_ID } from './floorplan/config/constants';

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

  const { autoFitTrigger, isSearchTyping } = useSearchAutoFit(searchText);

  const matchedPolygons = React.useMemo(() => {
    if (!matchedKeys) return null;
    if (matchedKeys.size === 0) return [];
    const list: RoomPolygon[] = [];
    for (let i = 0; i < rooms.length; i++) {
      const roomKey = rooms[i]?.key;
      const areaOk = isInteractiveRoomArea(rooms[i]?.areaM2);
      if (roomKey && areaOk && matchedKeys.has(roomKey)) {
        list.push(polygons[i]);
      }
    }
    return list;
  }, [matchedKeys, polygons, rooms]);

  const panBounds = React.useMemo<PanBoundsRect | null>(() => {
    if (!polygons || polygons.length === 0) return null;
    const b = computeBounds(polygons);

    const minX = b.minX - PAN_BOUNDS_PADDING_X;
    const maxX = b.maxX + PAN_BOUNDS_PADDING_X;

    // World Z is -polygonY
    const minZ = -(b.maxY + PAN_BOUNDS_PADDING_Z);
    const maxZ = -(b.minY - PAN_BOUNDS_PADDING_Z);

    return { minX, maxX, minZ, maxZ };
  }, [polygons]);

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

  const enableNightLampShadows = preset.shadowsEnabled && theme === 'dark' && graphicsPreset === 'max';
  const allowAdaptiveQuality = preset.dpr.mode === 'adaptive';

  React.useEffect(() => {
    setDpr(initialDpr);
    setEffectsEnabled(preset.postFx.enabled);
  }, [initialDpr, preset.postFx.enabled]);

  const colors = React.useMemo(() => getSceneColors(theme, graphicsPreset), [graphicsPreset, theme]);

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

  const renderItems = React.useMemo(() => buildRenderItems(polygons, rooms), [polygons, rooms]);

  const renderItemByKey = React.useMemo(() => {
    const map = new Map<string, (typeof renderItems)[number]>();
    for (const item of renderItems) map.set(item.key, item);
    return map;
  }, [renderItems]);

  const hoveredItem = hoveredPolyKey ? renderItemByKey.get(hoveredPolyKey) ?? null : null;

  const selectedItem = React.useMemo(() => {
    if (selectedRoomKey == null) return null;
    const it = renderItems.find((x) => x.key === selectedRoomKey) ?? null;
    return it && it.interactive ? it : null;
  }, [renderItems, selectedRoomKey]);

  const nullRaycast = React.useCallback(() => {
    // no-op
  }, []);

  return (
    <Canvas
      shadows={enableNightLampShadows}
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
      <ShadowConfigurator enabled={enableNightLampShadows} />

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
      <SceneLights
        theme={theme}
        mouseLampEnabled={preset.mouseLampEnabled}
        graphicsPreset={graphicsPreset}
        ambientIntensity={colors.ambientIntensity}
        dirIntensity={colors.dirIntensity}
      />

      <SceneEffects enabled={effectsEnabled} preset={preset} graphicsPreset={graphicsPreset} />

      <FitView polygons={polygons} controlsRef={controlsRef} />

      <AutoFitToPolygons
        enabled={searchToken.length > 0 && isSearchTyping}
        polygons={matchedPolygons}
        controlsRef={controlsRef}
        isDragging={isDragging}
        trigger={autoFitTrigger}
        token={searchToken}
      />

      <PanBounds enabled={true} controlsRef={controlsRef} bounds={panBounds} />


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
          const fillColor = isWall && theme === 'dark'
            ? '#212630'
            : shouldDim
              ? colors.dimFill
              : item.color;
          const fillOpacity = shouldDim ? 0.6 : 1.0;

          return (
            <React.Fragment key={item.key}>
              <mesh
                geometry={item.geometry}
                rotation={[-Math.PI / 2, 0, 0]}
                castShadow={enableNightLampShadows && isWall}
                receiveShadow={enableNightLampShadows && !isWall}
                raycast={!isDragging && item.interactive ? THREE.Mesh.prototype.raycast : nullRaycast}
                onPointerDown={
                  item.interactive
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
                  item.interactive
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
                  item.interactive
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
                  item.interactive
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
            </React.Fragment>
          );
        })}

        <RoomLabels polygons={polygons} color={colors.label} titleText={titleText} titleAnchor={titleAnchor} />
      </group>
    </Canvas>
  );
}