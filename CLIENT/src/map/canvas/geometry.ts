import * as THREE from 'three';

export function makePolygonGeometry(
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
