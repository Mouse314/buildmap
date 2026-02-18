import { useFrame, useThree } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as React from 'react';
import * as THREE from 'three';
import type { RoomPolygon } from '../roomData';

export type TitleAnchor = { x: number; y: number };

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
  titleText,
}: {
  polygon: RoomPolygon;
  showDescription: boolean;
  color: string;
  titleText?: string;
}) {
  const centroid = React.useMemo(() => polygonCentroid(polygon.points), [polygon.points]);
  const roomID = polygon.roomID;
  const roomNo = (polygon.roomNo ?? '').trim();
  const rawDescription = (polygon.description ?? '').trim();
  const description = roomID === 9 ? '' : rawDescription;

  if (roomID === 200) {
    const isTitle = rawDescription.toUpperCase() === 'TITLE';
    const t = isTitle ? (titleText ?? '').trim() : rawDescription;
    if (t.length === 0) return null;
    const text = isTitle ? t.toLocaleUpperCase() : t;
    const isEntrance = !isTitle && t.trim().toLocaleUpperCase().startsWith('ВХОД');
    return (
      <Text
        position={[centroid.x, 0.1, -centroid.y]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={isTitle ? 6.4 : isEntrance ? 3.6 : 1.8}
        lineHeight={1.05}
        maxWidth={isTitle ? 64 : 30}
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

  const effectiveShowDescription = roomID === 9 ? false : showDescription;

  if (roomNo.length === 0) {
    if (!effectiveShowDescription || description.length === 0) return null;
    return (
      <Text
        position={[centroid.x, 1.25, -centroid.y]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.5}
        lineHeight={1.1}
        maxWidth={10}
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

  if (effectiveShowDescription && description.length > 0) {
    return (
      <group>
        <Text
          position={[centroid.x, 1.25, -centroid.y]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={1}
          lineHeight={1}
          maxWidth={20}
          fontWeight="bold"
          textAlign="center"
          anchorX="center"
          anchorY="bottom"
          color={color}
        >
          {roomNo}
        </Text>

        <Text
          position={[centroid.x, 1.25, -centroid.y]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.5}
          lineHeight={1.05}
          maxWidth={12}
          fontWeight="bold"
          textAlign="center"
          anchorX="center"
          anchorY="top"
          color={color}
        >
          {description}
        </Text>
      </group>
    );
  }

  return (
    <Text
      position={[centroid.x, 1.25, -centroid.y]}
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
      {roomNo}
    </Text>
  );
}

function isSpecialLabel(poly: RoomPolygon): boolean {
  return poly.roomID === 200;
}

export function RoomLabels({
  polygons,
  color,
  titleText,
  titleAnchor,
}: {
  polygons: RoomPolygon[];
  color: string;
  titleText?: string;
  titleAnchor?: TitleAnchor | null;
}) {
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

  const showDescription = mode === 2;
  const visiblePolysRaw = mode === 0 ? polygons.filter(isSpecialLabel) : polygons;
  const shouldForceTitle = Boolean(titleAnchor && (titleText ?? '').trim().length > 0);
  const visiblePolys = shouldForceTitle
    ? visiblePolysRaw.filter((p) => !((p.description ?? '').trim().toUpperCase() === 'TITLE' && p.roomID === 200))
    : visiblePolysRaw;
  if (!shouldForceTitle && visiblePolys.length === 0) return null;

  const forcedTitleText = (titleText ?? '').trim();

  return (
    <group>
      {shouldForceTitle ? (
        <Text
          position={[titleAnchor!.x, 0.1, -titleAnchor!.y]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={6.4}
          lineHeight={1.05}
          maxWidth={64}
          fontWeight="bold"
          textAlign="center"
          anchorX="center"
          anchorY="middle"
          color={color}
        >
          {forcedTitleText.toLocaleUpperCase()}
        </Text>
      ) : null}
      {visiblePolys.map((poly, idx) => (
        <RoomLabel
          key={`${poly.roomID}-${idx}`}
          polygon={poly}
          showDescription={showDescription}
          color={color}
          titleText={titleText}
        />
      ))}
    </group>
  );
}
