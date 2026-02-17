import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { Bloom, EffectComposer, SSAO } from '@react-three/postprocessing';
import * as React from 'react';
import * as THREE from 'three';
import { type OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { roomsToPolygons, type RoomPolygon } from './roomData';
import type { Room } from './Room';
import { getRoomFillColor } from './roomPalette';
import { makePolygonGeometry } from './canvas/geometry';
import { RoomLabels } from './canvas/labels';
import { CursorManager, DragDetector } from './canvas/interaction';
import { HoverHighlighter } from './canvas/HoverHighlighter';
import { FitView } from './canvas/FitView';
import { MouseLamp } from './canvas/MouseLamp';
import { SmoothWheelZoom } from './canvas/SmoothWheelZoom';

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
  matchedKeys = null,
}: {
  rooms: Room[];
  selectedRoomKey: string | null;
  onSelectRoomKey: (roomKey: string | null) => void;
  onOpenRoom?: (args: { roomKey: string; clientX: number; clientY: number }) => void;
  onHoverRoom?: (args: { room: Room; clientX: number; clientY: number } | null) => void;
  titleText?: string;
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
      <PerspectiveCamera makeDefault near={0.1} far={5000} fov={45} position={new THREE.Vector3(0, 150, 0)} />
      <ambientLight intensity={theme === 'dark' ? 0.12 : 2} />

      {theme === 'dark' && <MouseLamp height={1} intensity={20} />}

      <EffectComposer enableNormalPass multisampling={0}>
        <SSAO
          samples={16}
          radius={2.2}
          intensity={4.0}
          luminanceInfluence={0.0}
          // color="black"
        />
        <Bloom
          intensity={0.1}
          luminanceThreshold={0.5}
          luminanceSmoothing={0.7}
          radius={0.2}
          mipmapBlur
        />
      </EffectComposer>

      <FitView polygons={polygons} controlsRef={controlsRef} />

      

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

        <RoomLabels polygons={polygons} color={colors.label} titleText={titleText} />
      </group>
    </Canvas>
  );
}