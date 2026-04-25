import { Canvas, useFrame } from '@react-three/fiber';
import { Html, Line, OrbitControls, PerspectiveCamera, Stats } from '@react-three/drei';
import * as React from 'react';
import * as THREE from 'three';
import { type OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { computeBounds, roomsToPolygons, type RoomPolygon } from './rooms/utils/roomData';
import type { RoomGraph } from './rooms/utils/roomData';
import type { Room } from './rooms/utils/Room';
import { RoomLabels, type TitleAnchor } from './canvas/labels';
import { CursorManager, DragDetector } from './canvas/interaction';
import { HoverHighlighter } from './canvas/HoverHighlighter';
import { FitView } from './canvas/FitView';
import { SmoothWheelZoom } from './canvas/SmoothWheelZoom';
import { AutoFitToPolygons } from './canvas/AutoFitToPolygons';
import { PanBounds, type PanBoundsRect } from './canvas/PanBounds';
import { getGraphicsPreset, type GraphicsPresetConfig, type GraphicsPresetId } from './graphicsPresets';
import { ShadowConfigurator } from './floorplan/components/ShadowConfigurator';
import { SceneEffects } from './floorplan/components/SceneEffects';
import { SceneLights } from './floorplan/components/SceneLights';
import { useSearchAutoFit } from './floorplan/hooks/useSearchAutoFit';
import { buildRenderItems } from './floorplan/utils/renderItems';
import { getSceneColors } from './floorplan/utils/sceneColors';
import { isInteractiveRoomArea } from './floorplan/utils/interactivity';
import { HIDDEN_ROOM_IDS, PAN_BOUNDS_PADDING_X, PAN_BOUNDS_PADDING_Z, WALL_ROOM_ID } from './floorplan/config/constants';
import { buildRoundedRoutePoints, buildRouteJumpGroups } from '../navigation/mapRouteUi';
import { HudButton } from '../interface/ui/hud';

// Обновляет время в шейдере маршрута для анимации потока.
function RouteShaderTicker({ material }: { material: THREE.ShaderMaterial }) {
  useFrame((_, delta) => {
    material.uniforms.uTime.value += delta;
  });
  return null;
}

// Строит объемную трубку маршрута по набору точек.
function RouteTube({ points, material }: { points: THREE.Vector3[]; material: THREE.ShaderMaterial }) {
  const geometry = React.useMemo(() => {
    const rounded = buildRoundedRoutePoints(points);
    const control = rounded.length >= 3 ? rounded : [rounded[0], rounded[0].clone().lerp(rounded[1], 0.5), rounded[1]];
    const curve = new THREE.CatmullRomCurve3(control, false, 'centripetal', 0.05);
    const tubularSegments = Math.max(30, control.length * 18);
    return new THREE.TubeGeometry(curve, tubularSegments, 0.36, 16, false);
  }, [points]);

  React.useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  return <mesh geometry={geometry} material={material} renderOrder={23} />;
}

// Главный canvas-компонент плана этажа с интерактивом и оверлеями.
export function FloorPlanCanvas({
  rooms,
  roomGraph = null,
  selectedRoomKey,
  onSelectRoomKey,
  onOpenRoom,
  onHoverRoom,
  titleText,
  titleAnchor = null,
  theme = 'light',
  isAdminMode = false,
  graphicsPreset = 'medium',
  graphicsPresetConfig = null,
  graphicsPresetRefreshToken = 0,
  searchText = '',
  searchResultJumpTrigger = 0,
  matchedKeys = null,
  routeSegments = [],
  routeFloorJumps = [],
  scheduleHeatEnabled = false,
  scheduleHeatByRoomKey = null,
  scheduleHeatMax = 0,
  routeEndpointGeoControl = null,
  onRouteFloorJump,
  onRouteEndpointGeoAction,
  showGraphOverlay = false,
  userLocationOverlay = null,
  geoAnchorMarkers = null,
}: {
  rooms: Room[];
  roomGraph?: RoomGraph | null;
  selectedRoomKey: string | null;
  onSelectRoomKey: (roomKey: string | null) => void;
  onOpenRoom?: (args: { roomKey: string; clientX: number; clientY: number }) => void;
  onHoverRoom?: (args: { room: Room; clientX: number; clientY: number } | null) => void;
  titleText?: string;
  titleAnchor?: TitleAnchor | null;
  theme?: 'light' | 'dark';
  isAdminMode?: boolean;
  graphicsPreset?: GraphicsPresetId;
  graphicsPresetConfig?: GraphicsPresetConfig | null;
  graphicsPresetRefreshToken?: number;
  searchText?: string;
  searchResultJumpTrigger?: number;
  matchedKeys?: Set<string> | null;
  routeSegments?: Array<{ from: { x: number; y: number }; to: { x: number; y: number } }>;
  routeFloorJumps?: Array<{ x: number; y: number; targetFloorId: string; direction: 'up' | 'down' }>;
  scheduleHeatEnabled?: boolean;
  scheduleHeatByRoomKey?: Record<string, number> | null;
  scheduleHeatMax?: number;
  routeEndpointGeoControl?: {
    x: number;
    y: number;
    mode: 'jump-floor' | 'cancel';
    icon: string;
    text: string;
    targetFloorId: string | null;
  } | null;
  onRouteFloorJump?: (targetFloorId: string) => void;
  onRouteEndpointGeoAction?: (mode: 'jump-floor' | 'cancel', targetFloorId: string | null) => void;
  showGraphOverlay?: boolean;
  userLocationOverlay?: {
    mode: 'inside' | 'outside';
    x: number;
    y: number;
    distanceText?: string | null;
    headingDeg?: number;
    accuracyText?: string | null;
  } | null;
  geoAnchorMarkers?: Array<{
    id: string;
    x: number;
    y: number;
    label: string;
    isFilled: boolean;
  }> | null;
}) {
  const polygons = React.useMemo(() => roomsToPolygons(rooms), [rooms]);
  const [hoveredPolyKey, setHoveredPolyKey] = React.useState<string | null>(null);
  const controlsRef = React.useRef<OrbitControlsImpl | null>(null);

  const preset = graphicsPresetConfig ?? getGraphicsPreset(graphicsPreset);

  const searchToken = React.useMemo(() => {
    return (searchText ?? '').trim();
  }, [searchText]);

  const { autoFitTrigger, isSearchTyping } = useSearchAutoFit(searchText);
  const [isSearchJumping, setIsSearchJumping] = React.useState(false);
  const jumpTimeoutRef = React.useRef<number | null>(null);

  const floorPolygonsForFit = React.useMemo(() => {
    const list: RoomPolygon[] = [];
    for (let i = 0; i < polygons.length; i++) {
      const poly = polygons[i];
      if (poly.roomID === 200) continue;
      if (HIDDEN_ROOM_IDS.has(poly.roomID)) continue;
      const areaOk = isInteractiveRoomArea(rooms[i]?.areaM2);
      if (!areaOk) continue;
      list.push(poly);
    }
    return list;
  }, [polygons, rooms]);

  React.useEffect(() => {
    if (!searchResultJumpTrigger) return;
    setIsSearchJumping(true);
    if (jumpTimeoutRef.current != null) {
      window.clearTimeout(jumpTimeoutRef.current);
    }
    jumpTimeoutRef.current = window.setTimeout(() => {
      setIsSearchJumping(false);
      jumpTimeoutRef.current = null;
    }, 450);
  }, [searchResultJumpTrigger]);

  const autoFitEnabled = searchToken.length > 0 && (isSearchTyping || isSearchJumping);
  const combinedAutoFitTrigger = autoFitTrigger + searchResultJumpTrigger;

  const matchedPolygons = React.useMemo(() => {
    if (!matchedKeys) return null;
    if (matchedKeys.size === 0) return floorPolygonsForFit;
    const list: RoomPolygon[] = [];
    for (let i = 0; i < rooms.length; i++) {
      const roomKey = rooms[i]?.key;
      const areaOk = isInteractiveRoomArea(rooms[i]?.areaM2);
      if (roomKey && areaOk && matchedKeys.has(roomKey)) {
        list.push(polygons[i]);
      }
    }
    return list;
  }, [floorPolygonsForFit, matchedKeys, polygons, rooms]);

  const panBounds = React.useMemo<PanBoundsRect | null>(() => {
    if (!polygons || polygons.length === 0) return null;
    const b = computeBounds(polygons);

    const minX = b.minX - PAN_BOUNDS_PADDING_X;
    const maxX = b.maxX + PAN_BOUNDS_PADDING_X;

    // В мировой системе координат ось Z инвертирована относительно polygonY.
    const minZ = -(b.maxY + PAN_BOUNDS_PADDING_Z);
    const maxZ = -(b.minY - PAN_BOUNDS_PADDING_Z);

    return { minX, maxX, minZ, maxZ };
  }, [polygons]);

  const deviceDpr = React.useMemo(() => {
    if (typeof window === 'undefined') return 1;
    return window.devicePixelRatio || 1;
  }, []);

  const isTouchDevice = React.useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(pointer: coarse)').matches ?? false;
  }, []);

  const dpr = React.useMemo(() => {
    if (preset.dpr.mode === 'fixed') return Math.min(deviceDpr, preset.dpr.value);
    return Math.min(deviceDpr, preset.dpr.baseMax);
  }, [deviceDpr, preset.dpr]);

  const effectsEnabled = preset.postFx.enabled;

  const enableNightLampShadows = preset.shadowsEnabled && theme === 'dark' && graphicsPreset === 'max';

  const colors = React.useMemo(() => getSceneColors(theme, graphicsPreset), [graphicsPreset, theme]);

  const clickCandidateRef = React.useRef<{ roomKey: string; clientX: number; clientY: number } | null>(null);
  const suppressMouseTapUntilRef = React.useRef<number>(0);
  const dragRef = React.useRef<{ down: boolean; startX: number; startY: number; moved: boolean }>(
    { down: false, startX: 0, startY: 0, moved: false },
  );
  const [isDragging, setIsDragging] = React.useState(false);

  const suppressMapTapFromOverlay = React.useCallback(() => {
    // Не даем DOM-оверлеям случайно активировать выбор комнаты под ними.
    clickCandidateRef.current = null;
    suppressMouseTapUntilRef.current = performance.now() + 420;
  }, []);

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

  const wallExtrudeEnabled = graphicsPreset === 'medium' || graphicsPreset === 'max';
  const renderItems = React.useMemo(
    () => buildRenderItems(polygons, rooms, {
      wallExtrudeEnabled,
      allowSmallInteractive: isAdminMode,
      allowAllInteractive: isAdminMode,
    }),
    [isAdminMode, polygons, rooms, wallExtrudeEnabled],
  );

  const roomKeysSet = React.useMemo(() => {
    const set = new Set<string>();
    for (const room of rooms) {
      set.add(room.key);
    }
    return set;
  }, [rooms]);

  const graphNodeMap = React.useMemo(() => {
    const map = new Map<
      string,
      { x: number; y: number; roomID: number | null; kind: 'room' | 'street'; label: string | null }
    >();
    if (!roomGraph) return map;

    for (const node of roomGraph.nodes) {
      const kind = node.kind === 'street' ? 'street' : 'room';
      if (kind === 'room' && !roomKeysSet.has(node.key)) continue;
      map.set(node.key, {
        x: node.x,
        y: node.y,
        roomID: node.roomID,
        kind,
        label: node.label ?? null,
      });
    }

    return map;
  }, [roomGraph, roomKeysSet]);

  const graphEdges = React.useMemo(() => {
    if (!roomGraph) return [] as Array<{ key: string; points: THREE.Vector3[] }>;
    const edges: Array<{ key: string; points: THREE.Vector3[] }> = [];

    for (let idx = 0; idx < roomGraph.edges.length; idx++) {
      const edge = roomGraph.edges[idx];
      const from = graphNodeMap.get(edge.from);
      const to = graphNodeMap.get(edge.to);
      if (!from || !to) continue;

      edges.push({
        key: `g-edge-${idx}-${edge.from}-${edge.to}`,
        points: [new THREE.Vector3(from.x, from.y, 0), new THREE.Vector3(to.x, to.y, 0)],
      });
    }

    return edges;
  }, [graphNodeMap, roomGraph]);

  const graphNodes = React.useMemo(() => {
    return Array.from(graphNodeMap.entries()).map(([key, node]) => ({
      key,
      roomID: node.roomID,
      kind: node.kind,
      label: node.label,
      position: new THREE.Vector3(node.x, node.y, 0),
    }));
  }, [graphNodeMap]);

  const routePaths = React.useMemo(() => {
    const paths: Array<{ key: string; points: THREE.Vector3[] }> = [];
    const epsilon = 1e-4;
    const equal2D = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
    };

    let current: Array<{ x: number; y: number }> = [];
    for (let idx = 0; idx < routeSegments.length; idx++) {
      const seg = routeSegments[idx];
      if (current.length === 0) {
        current.push(seg.from, seg.to);
        continue;
      }

      const last = current[current.length - 1];
      if (equal2D(last, seg.from)) {
        current.push(seg.to);
      } else {
        if (current.length >= 2) {
          paths.push({
            key: `route-path-${paths.length}`,
            points: current.map((p) => new THREE.Vector3(p.x, p.y, 0)),
          });
        }
        current = [seg.from, seg.to];
      }
    }

    if (current.length >= 2) {
      paths.push({
        key: `route-path-${paths.length}`,
        points: current.map((p) => new THREE.Vector3(p.x, p.y, 0)),
      });
    }
    return paths;
  }, [routeSegments]);

  const routeJumpGroups = React.useMemo(() => buildRouteJumpGroups(routeFloorJumps), [routeFloorJumps]);

  const routeShaderMaterial = React.useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime;

        void main() {
          float along = vUv.x;
          float flow = 0.68 + 0.6 * sin((along * 100.0) - (uTime * 5.2));
          float pulse = 0.86 + 0.3 * sin((uTime * 3.6) + (along * 9.0));
          float headPos = fract(uTime * 0.22);
          float distToHead = abs(along - headPos);
          float wrapped = min(distToHead, 1.0 - distToHead);
          float headGlow = exp(-wrapped * 26.0);
          float intensity = (flow * pulse) + (0.45 * headGlow);
          gl_FragColor = vec4(vec3(intensity), 0.95);
        }
      `,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    });
  }, []);

  React.useEffect(() => {
    return () => {
      routeShaderMaterial.dispose();
    };
  }, [routeShaderMaterial]);

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
    // Пустой raycast для неинтерактивных мешей.
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
      onCreated={({ gl }) => {
        gl.domElement.style.touchAction = 'none';
      }}
      onPointerMissed={() => {
        setHoveredPolyKey(null);
        onHoverRoom?.(null);
      }}
    >
      <ShadowConfigurator enabled={enableNightLampShadows} />
      <RouteShaderTicker material={routeShaderMaterial} />

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

      <SceneEffects
        key={`scene-effects-${graphicsPreset}-${graphicsPresetRefreshToken}`}
        enabled={effectsEnabled}
        preset={preset}
        graphicsPreset={graphicsPreset}
      />

      <FitView polygons={polygons} controlsRef={controlsRef} />

      <AutoFitToPolygons
        enabled={autoFitEnabled}
        polygons={matchedPolygons}
        controlsRef={controlsRef}
        isDragging={isDragging}
        trigger={combinedAutoFitTrigger}
        token={searchToken}
      />

      <PanBounds enabled={true} controlsRef={controlsRef} bounds={panBounds} />


      <OrbitControls
        ref={controlsRef}
        enableRotate={false}
        enablePan
        enableZoom={isTouchDevice}
        enableDamping
        dampingFactor={0.08}
        panSpeed={isTouchDevice ? 1.5 : 1.2}
        mouseButtons={{
          LEFT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.PAN,
          RIGHT: THREE.MOUSE.ROTATE,
        }}
        touches={{
          ONE: THREE.TOUCH.PAN,
          TWO: THREE.TOUCH.DOLLY_PAN,
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
        wheelStrength={isTouchDevice ? 0 : 0.0014}
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
          const heatCount = scheduleHeatByRoomKey?.[item.key] ?? 0;
          const heatMaxSafe = Math.max(1, scheduleHeatMax);
          const fillColor = (() => {
            if (scheduleHeatEnabled && !isWall && !isLabel) {
              const cool = new THREE.Color('#eef1f6');
              if (heatCount <= 0) return cool.getStyle();
              const hot = new THREE.Color('#cf2d2d');
              const t = Math.min(1, heatCount / heatMaxSafe);
              const eased = 0.18 + (0.82 * Math.sqrt(t));
              return cool.lerp(hot, eased).getStyle();
            }

            if (isWall && theme === 'dark') return '#212630';
            if (shouldDim) return colors.dimFill;
            return item.color;
          })();

          const fillOpacity = scheduleHeatEnabled && !isWall && !isLabel
            ? 0.96
            : (shouldDim ? 0.6 : 1.0);

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
                        const pointerType = (e.nativeEvent as PointerEvent).pointerType ?? 'mouse';
                        if (pointerType === 'mouse' && performance.now() < suppressMouseTapUntilRef.current) return;
                        if (pointerType === 'mouse' && e.nativeEvent.button !== 0) return;
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
                        const pointerType = (e.nativeEvent as PointerEvent).pointerType ?? 'mouse';
                        if (pointerType === 'mouse' && performance.now() < suppressMouseTapUntilRef.current) return;
                        if (pointerType === 'mouse' && e.nativeEvent.button !== 0) return;
                        e.stopPropagation();
                        if (isDragging) return;

                        const cand = clickCandidateRef.current;
                        clickCandidateRef.current = null;
                        if (!cand || cand.roomKey !== item.key) return;
                        if (dragRef.current.moved) return;

                        if (pointerType !== 'mouse') {
                          suppressMouseTapUntilRef.current = performance.now() + 500;
                        }

                        const nextKey = pointerType === 'mouse'
                          ? (selectedRoomKey === item.key ? null : item.key)
                          : item.key;
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

        <RoomLabels
          polygons={polygons}
          color={colors.label}
          titleText={titleText}
          titleAnchor={titleAnchor}
          labelsOnPlan={!wallExtrudeEnabled}
        />

        {showGraphOverlay ? (
          <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.24, 0]}>
            {graphEdges.map((edge) => (
              <Line
                key={edge.key}
                points={edge.points}
                color={colors.dimFill}
                transparent
                opacity={0.9}
                lineWidth={1.2}
                renderOrder={12}
              />
            ))}

            {graphNodes.map((node) => (
              <mesh key={`g-node-${node.key}`} position={node.position} renderOrder={13}>
                {node.kind === 'street' ? (
                  <boxGeometry args={[0.34, 0.34, 0.34]} />
                ) : (
                  <sphereGeometry args={[0.18, 12, 12]} />
                )}
                <meshBasicMaterial color={node.kind === 'street' ? colors.dimFill : colors.label} depthWrite={false} />
              </mesh>
            ))}
          </group>
        ) : null}

        {routePaths.length > 0 ? (
          <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.42, 0]}>
            {routePaths.map((path) => (
              <RouteTube
                key={path.key}
                points={path.points}
                material={routeShaderMaterial}
              />
            ))}
          </group>
        ) : null}

        {routeJumpGroups.length > 0 ? (
          <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.56, 0]}>
            {routeJumpGroups.map((group) => (
              <Html key={group.key} position={[group.x, group.y, 0]} sprite center zIndexRange={[90, 10]}>
                <div className="routeStairJumpGroup">
                  {group.buttons.map((jump) => (
                    <HudButton
                      key={jump.key}
                      title={jump.label}
                      data={{ action: 'route-jump-floor', targetFloorId: jump.targetFloorId }}
                      className="routeStairJumpBtn"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        suppressMapTapFromOverlay();
                      }}
                      onPointerUp={(e) => {
                        e.stopPropagation();
                        suppressMapTapFromOverlay();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        suppressMapTapFromOverlay();
                        onRouteFloorJump?.(jump.targetFloorId);
                      }}
                      hint={jump.title}
                      aria-label={jump.title}
                    >
                      <span className="routeStairJumpEmoji" aria-hidden>{jump.emoji}</span>
                      <span className="routeStairJumpText">{jump.label}</span>
                    </HudButton>
                  ))}
                </div>
              </Html>
            ))}
          </group>
        ) : null}

        {routeEndpointGeoControl ? (
          <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.58, 0]}>
            <Html position={[routeEndpointGeoControl.x, routeEndpointGeoControl.y, 0]} sprite center zIndexRange={[90, 10]}>
              <div className="routeEndGeoGroup">
                <HudButton
                  title={routeEndpointGeoControl.text}
                  data={{ action: 'route-endpoint-geo', mode: routeEndpointGeoControl.mode, targetFloorId: routeEndpointGeoControl.targetFloorId }}
                  className="routeEndGeoBtn"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    suppressMapTapFromOverlay();
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    suppressMapTapFromOverlay();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    suppressMapTapFromOverlay();
                    onRouteEndpointGeoAction?.(routeEndpointGeoControl.mode, routeEndpointGeoControl.targetFloorId);
                  }}
                  hint={routeEndpointGeoControl.text}
                  aria-label={routeEndpointGeoControl.text}
                >
                  <span className="routeEndGeoEmoji" aria-hidden>{routeEndpointGeoControl.icon}</span>
                  <span className="routeEndGeoText">{routeEndpointGeoControl.text}</span>
                </HudButton>
              </div>
            </Html>
          </group>
        ) : null}

        {userLocationOverlay ? (
          <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.64, 0]}>
            <Html position={[userLocationOverlay.x, userLocationOverlay.y, 0]} sprite center>
              {userLocationOverlay.mode === 'inside' ? (
                <div className="userLocationDot" title={userLocationOverlay.accuracyText ?? 'Текущее местоположение'}>
                  <span className="userLocationPulse" />
                  <span className="userLocationCore" />
                </div>
              ) : (
                <div className="userLocationOutside" title={userLocationOverlay.accuracyText ?? 'Пользователь вне корпуса'}>
                  <span
                    className="userLocationArrow"
                    style={{ transform: `rotate(${userLocationOverlay.headingDeg ?? 0}deg)` }}
                    aria-hidden
                  >
                    ➤
                  </span>
                  <span className="userLocationDistance">{userLocationOverlay.distanceText ?? 'вне корпуса'}</span>
                </div>
              )}
            </Html>
          </group>
        ) : null}

        {geoAnchorMarkers && geoAnchorMarkers.length > 0 ? (
          <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.7, 0]}>
            {geoAnchorMarkers.map((marker) => (
              <Html
                key={`geo-anchor-${marker.id}`}
                position={[marker.x, marker.y, 0]}
                sprite
                center
                zIndexRange={[40, 32]}
              >
                <div className={marker.isFilled ? 'geoAnchorMapMarker geoAnchorMapMarkerReady' : 'geoAnchorMapMarker'}>
                  <span className="geoAnchorMapDot" aria-hidden />
                  <span className="geoAnchorMapLabel">{marker.label}</span>
                </div>
              </Html>
            ))}
          </group>
        ) : null}
      </group>
    </Canvas>
  );
}