export type GeoPoint = {
  lat: number;
  lon: number;
};

export type MapPoint = {
  x: number;
  y: number;
};

export type GeoAnchor = {
  id: 'nw' | 'ne' | 'se' | 'sw';
  map: MapPoint;
  geo: GeoPoint;
};

export type GeoBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type Affine2 = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};

export type GeoCalibration = {
  origin: GeoPoint;
  geoToMap: Affine2;
  mapToGeoMeters: Affine2;
  bounds: GeoBounds;
};

export type ProjectedUserPosition = {
  projected: MapPoint;
  clamped: MapPoint;
  isInside: boolean;
  outsideDistanceM: number;
  headingDeg: number;
};

type LocalMeters = {
  x: number;
  y: number;
};

const EARTH_RADIUS_M = 6378137;

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

function normalizeGeoAnchors(anchors: GeoAnchor[]): GeoAnchor[] {
  return anchors.filter((anchor) => {
    return Number.isFinite(anchor.geo.lat) && Number.isFinite(anchor.geo.lon) && Number.isFinite(anchor.map.x) && Number.isFinite(anchor.map.y);
  });
}

function geoToLocalMeters(point: GeoPoint, origin: GeoPoint): LocalMeters {
  const lat0 = toRad(origin.lat);
  const dLat = toRad(point.lat - origin.lat);
  const dLon = toRad(point.lon - origin.lon);
  return {
    x: EARTH_RADIUS_M * dLon * Math.cos(lat0),
    y: EARTH_RADIUS_M * dLat,
  };
}

function applyAffine(affine: Affine2, point: LocalMeters): MapPoint {
  return {
    x: affine.a * point.x + affine.b * point.y + affine.c,
    y: affine.d * point.x + affine.e * point.y + affine.f,
  };
}

function applyAffineToMap(affine: Affine2, point: MapPoint): LocalMeters {
  return {
    x: affine.a * point.x + affine.b * point.y + affine.c,
    y: affine.d * point.x + affine.e * point.y + affine.f,
  };
}

function solve3x3(m: number[][], v: number[]): number[] | null {
  const a = [
    [m[0][0], m[0][1], m[0][2], v[0]],
    [m[1][0], m[1][1], m[1][2], v[1]],
    [m[2][0], m[2][1], m[2][2], v[2]],
  ];

  for (let col = 0; col < 3; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < 3; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }

    if (Math.abs(a[pivot][col]) < 1e-10) return null;

    if (pivot !== col) {
      const tmp = a[pivot];
      a[pivot] = a[col];
      a[col] = tmp;
    }

    const pivotVal = a[col][col];
    for (let c = col; c < 4; c += 1) {
      a[col][c] /= pivotVal;
    }

    for (let row = 0; row < 3; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let c = col; c < 4; c += 1) {
        a[row][c] -= factor * a[col][c];
      }
    }
  }

  return [a[0][3], a[1][3], a[2][3]];
}

function fitAffineLeastSquares(source: LocalMeters[], target: MapPoint[]): Affine2 | null {
  if (source.length !== target.length || source.length < 3) return null;

  let suu = 0;
  let suv = 0;
  let svv = 0;
  let su = 0;
  let sv = 0;
  const n = source.length;

  let sxu = 0;
  let sxv = 0;
  let sx = 0;
  let syu = 0;
  let syv = 0;
  let sy = 0;

  for (let i = 0; i < source.length; i += 1) {
    const u = source[i].x;
    const v = source[i].y;
    const x = target[i].x;
    const y = target[i].y;

    suu += u * u;
    suv += u * v;
    svv += v * v;
    su += u;
    sv += v;

    sxu += x * u;
    sxv += x * v;
    sx += x;

    syu += y * u;
    syv += y * v;
    sy += y;
  }

  const m = [
    [suu, suv, su],
    [suv, svv, sv],
    [su, sv, n],
  ];

  const xCoeffs = solve3x3(m, [sxu, sxv, sx]);
  const yCoeffs = solve3x3(m, [syu, syv, sy]);
  if (!xCoeffs || !yCoeffs) return null;

  return {
    a: xCoeffs[0],
    b: xCoeffs[1],
    c: xCoeffs[2],
    d: yCoeffs[0],
    e: yCoeffs[1],
    f: yCoeffs[2],
  };
}

export function buildGeoCalibration(anchors: GeoAnchor[], bounds: GeoBounds): GeoCalibration | null {
  const valid = normalizeGeoAnchors(anchors);
  if (valid.length < 3) return null;

  const origin = {
    lat: valid.reduce((sum, item) => sum + item.geo.lat, 0) / valid.length,
    lon: valid.reduce((sum, item) => sum + item.geo.lon, 0) / valid.length,
  };

  const geoMeters = valid.map((a) => geoToLocalMeters(a.geo, origin));
  const mapPoints = valid.map((a) => a.map);

  const geoToMap = fitAffineLeastSquares(geoMeters, mapPoints);
  if (!geoToMap) return null;

  const mapAsLocal = mapPoints.map((p) => ({ x: p.x, y: p.y }));
  const geoMetersAsMap = geoMeters.map((p) => ({ x: p.x, y: p.y }));
  const mapToGeoMeters = fitAffineLeastSquares(mapAsLocal, geoMetersAsMap);
  if (!mapToGeoMeters) return null;

  return {
    origin,
    geoToMap,
    mapToGeoMeters,
    bounds,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function projectUserToMap(calibration: GeoCalibration, userGeo: GeoPoint): ProjectedUserPosition {
  const userMeters = geoToLocalMeters(userGeo, calibration.origin);
  const projected = applyAffine(calibration.geoToMap, userMeters);

  const clamped: MapPoint = {
    x: clamp(projected.x, calibration.bounds.minX, calibration.bounds.maxX),
    y: clamp(projected.y, calibration.bounds.minY, calibration.bounds.maxY),
  };

  const isInside = clamped.x === projected.x && clamped.y === projected.y;
  const edgeMeters = applyAffineToMap(calibration.mapToGeoMeters, clamped);
  const dxMeters = userMeters.x - edgeMeters.x;
  const dyMeters = userMeters.y - edgeMeters.y;
  const outsideDistanceM = Math.hypot(dxMeters, dyMeters);

  // Arrow should indicate direction from building edge to user.
  // Horizontal mirror is required for the glyph orientation on the current map setup.
  const mapDx = clamped.x - projected.x;
  const mapDy = clamped.y - projected.y;
  const headingDeg = (Math.atan2(mapDy, -mapDx) * 180) / Math.PI;

  return {
    projected,
    clamped,
    isInside,
    outsideDistanceM,
    headingDeg,
  };
}

export function formatDistanceHuman(distanceM: number): string {
  if (!Number.isFinite(distanceM) || distanceM < 0) return '0 м';
  if (distanceM < 1000) return `${Math.round(distanceM)} м`;
  return `${(distanceM / 1000).toFixed(distanceM >= 10000 ? 1 : 2)} км`;
}