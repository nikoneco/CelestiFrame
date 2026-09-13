import { degreesToDirection, normalizeDegrees } from "../geometry/angle.js?v=1.8.0";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
// The map uses a schematic fan.  Keep the brighter galactic-center area
// deliberately broad enough to read at a glance while letting it fade into
// the rest of the plane instead of adding another hard boundary.
export const MILKY_WAY_CORE_EMPHASIS_EXTENT_DEGREES = 45;
const MILKY_WAY_ADAPTIVE_ANGULAR_STEP_DEGREES = 4;
const MILKY_WAY_ADAPTIVE_AZIMUTH_STEP_DEGREES = 5;
const MILKY_WAY_ADAPTIVE_MAX_DEPTH = 16;
// An azimuth is undefined only when the horizontal component is effectively
// zero.  A 0.000006 degree cone is small enough to keep ordinary near-zenith
// arcs while preventing one exact zenith sample from making a giant wedge.
const MILKY_WAY_ZENITH_VECTOR_EPSILON = 1e-7;
// IAU galactic coordinate rotation in the J2000/ICRS frame.
const EQUATORIAL_TO_GALACTIC = Object.freeze([
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.4448296300, 0.7469822445],
  [-0.8676661490, -0.1980763734, 0.4559837762],
]);

function julianDate(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

function galacticToEquatorial(longitudeDegrees, latitudeDegrees = 0) {
  const longitude = longitudeDegrees * DEG;
  const latitude = latitudeDegrees * DEG;
  const galactic = [
    Math.cos(latitude) * Math.cos(longitude),
    Math.cos(latitude) * Math.sin(longitude),
    Math.sin(latitude),
  ];
  const equatorial = [0, 1, 2].map((column) => (
    EQUATORIAL_TO_GALACTIC[0][column] * galactic[0]
    + EQUATORIAL_TO_GALACTIC[1][column] * galactic[1]
    + EQUATORIAL_TO_GALACTIC[2][column] * galactic[2]
  ));
  return {
    rightAscensionDegrees: normalizeDegrees(Math.atan2(equatorial[1], equatorial[0]) * RAD),
    declinationDegrees: Math.asin(equatorial[2]) * RAD,
  };
}

function precessJ2000({ rightAscensionDegrees, declinationDegrees }, jd) {
  const centuries = (jd - 2451545) / 36525;
  const zeta = (2306.2181 * centuries + 0.30188 * centuries ** 2 + 0.017998 * centuries ** 3) / 3600 * DEG;
  const z = (2306.2181 * centuries + 1.09468 * centuries ** 2 + 0.018203 * centuries ** 3) / 3600 * DEG;
  const theta = (2004.3109 * centuries - 0.42665 * centuries ** 2 - 0.041833 * centuries ** 3) / 3600 * DEG;
  const rightAscension = rightAscensionDegrees * DEG;
  const declination = declinationDegrees * DEG;
  const a = Math.cos(declination) * Math.sin(rightAscension + zeta);
  const b = Math.cos(theta) * Math.cos(declination) * Math.cos(rightAscension + zeta) - Math.sin(theta) * Math.sin(declination);
  const c = Math.sin(theta) * Math.cos(declination) * Math.cos(rightAscension + zeta) + Math.cos(theta) * Math.sin(declination);
  return {
    rightAscensionDegrees: normalizeDegrees((Math.atan2(a, b) + z) * RAD),
    declinationDegrees: Math.asin(c) * RAD,
  };
}

function equatorialToHorizontal(equatorialJ2000, date, location) {
  const jd = julianDate(date);
  const equatorial = precessJ2000(equatorialJ2000, jd);
  const centuries = (jd - 2451545) / 36525;
  const gmst = normalizeDegrees(280.46061837 + 360.98564736629 * (jd - 2451545)
    + 0.000387933 * centuries ** 2 - centuries ** 3 / 38710000);
  const hourAngle = normalizeDegrees(gmst + Number(location.longitude) - equatorial.rightAscensionDegrees) * DEG;
  const latitude = Number(location.latitude) * DEG;
  const declination = equatorial.declinationDegrees * DEG;
  const altitude = Math.asin(
    Math.sin(latitude) * Math.sin(declination)
    + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle),
  );
  const azimuth = Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(latitude) - Math.tan(declination) * Math.cos(latitude),
  ) * RAD + 180;
  return {
    azimuth: normalizeDegrees(azimuth),
    altitude: altitude * RAD,
  };
}

function signedAzimuthDifference(from, to) {
  const difference = normalizeDegrees(to) - normalizeDegrees(from);
  return ((difference + 540) % 360) - 180;
}

function forwardLongitudeDistance(from, to) {
  return normalizeDegrees(Number(to) - Number(from));
}

function skyVector(point) {
  const altitude = Number(point.altitude) * DEG;
  const azimuth = Number(point.azimuth) * DEG;
  const horizontal = Math.cos(altitude);
  return [
    horizontal * Math.sin(azimuth),
    horizontal * Math.cos(azimuth),
    Math.sin(altitude),
  ];
}

function sphericalDistanceDegrees(first, second) {
  const a = skyVector(first);
  const b = skyVector(second);
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return Math.acos(dot) * RAD;
}

function sphericalPointAt(from, to, fraction) {
  const t = Math.max(0, Math.min(1, fraction));
  const first = skyVector(from);
  const second = skyVector(to);
  const dot = Math.max(-1, Math.min(1, first[0] * second[0] + first[1] * second[1] + first[2] * second[2]));
  const omega = Math.acos(dot);
  const sinOmega = Math.sin(omega);
  const vector = sinOmega < 1e-9
    ? first.map((value, index) => value * (1 - t) + second[index] * t)
    : first.map((value, index) => (
      value * Math.sin((1 - t) * omega) / sinOmega
      + second[index] * Math.sin(t * omega) / sinOmega
    ));
  const magnitude = Math.hypot(...vector) || 1;
  const [east, north, up] = vector.map((value) => value / magnitude);
  const horizontalMagnitude = Math.hypot(east, north);
  const isZenith = horizontalMagnitude <= MILKY_WAY_ZENITH_VECTOR_EPSILON;
  const azimuth = isZenith ? Number(from.azimuth) : normalizeDegrees(Math.atan2(east, north) * RAD);
  const altitude = Math.asin(Math.max(-1, Math.min(1, up))) * RAD;
  const longitude = normalizeDegrees(from.longitude + forwardLongitudeDistance(from.longitude, to.longitude) * t);
  return Object.freeze({
    longitude,
    azimuth,
    altitude,
    ...(isZenith ? { isZenith: true } : {}),
  });
}

function isZenithPoint(point) {
  return Boolean(point?.isZenith) || Math.abs(90 - Number(point?.altitude)) < 1e-7;
}

function sampleSphericalEdge(from, to) {
  const samples = [{ t: 0, point: sphericalPointAt(from, to, 0) }];
  const visit = (startT, startPoint, endT, endPoint, depth) => {
    const middleT = (startT + endT) / 2;
    const middlePoint = sphericalPointAt(from, to, middleT);
    const angularSpan = sphericalDistanceDegrees(startPoint, endPoint);
    const azimuthSpan = isZenithPoint(startPoint) || isZenithPoint(endPoint) || isZenithPoint(middlePoint)
      ? Infinity
      : Math.abs(signedAzimuthDifference(startPoint.azimuth, endPoint.azimuth));
    const shouldSplit = depth < MILKY_WAY_ADAPTIVE_MAX_DEPTH
      && (angularSpan > MILKY_WAY_ADAPTIVE_ANGULAR_STEP_DEGREES
        || azimuthSpan > MILKY_WAY_ADAPTIVE_AZIMUTH_STEP_DEGREES
        || isZenithPoint(middlePoint));
    if (shouldSplit) {
      visit(startT, startPoint, middleT, middlePoint, depth + 1);
      visit(middleT, middlePoint, endT, endPoint, depth + 1);
      return;
    }
    samples.push({ t: endT, point: endPoint });
  };
  visit(0, samples[0].point, 1, sphericalPointAt(from, to, 1), 0);
  return samples;
}

function horizonCrossing(from, to) {
  const fromAbove = from.altitude >= 0;
  let start = 0;
  let end = 1;
  for (let iteration = 0; iteration < 30; iteration += 1) {
    const middle = (start + end) / 2;
    const point = sphericalPointAt(from, to, middle);
    if ((point.altitude >= 0) === fromAbove) start = middle;
    else end = middle;
  }
  return Object.freeze({
    ...sphericalPointAt(from, to, (start + end) / 2),
    altitude: 0,
    isHorizonIntersection: true,
  });
}

function clipSamplePair(from, to) {
  if (isZenithPoint(from) || isZenithPoint(to)) return null;
  const fromAbove = from.altitude >= 0;
  const toAbove = to.altitude >= 0;
  if (!fromAbove && !toAbove) return null;
  if (fromAbove && toAbove) return [from, to];
  const crossing = horizonCrossing(from, to);
  return fromAbove ? [from, crossing] : [crossing, to];
}

function centralEmphasisWeight(longitude) {
  const distance = Math.min(normalizeDegrees(longitude), normalizeDegrees(-longitude));
  const extent = MILKY_WAY_CORE_EMPHASIS_EXTENT_DEGREES;
  const normalized = Math.max(0, Math.min(1, distance / extent));
  // 1 at galactic longitude 0, easing to 0 at +/- the chosen extent.
  const smooth = normalized * normalized * (3 - 2 * normalized);
  return 1 - smooth;
}

/**
 * Clip the sampled galactic plane to its geometric horizon.
 *
 * Each returned segment represents one adaptively sampled plane edge.  Its
 * points are spherical samples above the horizon or an interpolated
 * altitude=0 crossing, so consumers can safely draw only the returned
 * geometry.  The centralWeight field applies the documented 0 +/- 45 degree
 * emphasis and handles the 350 -> 0 degree closure without a false wrap.
 */
export function clipMilkyWayPlane(plane) {
  if (!Array.isArray(plane) || plane.length < 2) return Object.freeze([]);
  const segments = [];
  for (let index = 0; index < plane.length; index += 1) {
    const from = plane[index];
    const to = plane[(index + 1) % plane.length];
    const samples = sampleSphericalEdge(from, to);
    let points = [];
    let groupIndex = 0;
    const appendSegment = () => {
      if (points.length < 2) {
        points = [];
        return;
      }
      const [start, end] = [points[0], points.at(-1)];
      const midpointLongitude = normalizeDegrees(
        start.longitude + forwardLongitudeDistance(start.longitude, end.longitude) / 2,
      );
      segments.push(Object.freeze({
        points: Object.freeze(points),
        centralWeight: centralEmphasisWeight(midpointLongitude),
        galacticLongitude: midpointLongitude,
        edgeIndex: index,
        id: `${index}:${groupIndex}`,
      }));
      groupIndex += 1;
      points = [];
    };
    for (let sampleIndex = 0; sampleIndex < samples.length - 1; sampleIndex += 1) {
      const clipped = clipSamplePair(samples[sampleIndex].point, samples[sampleIndex + 1].point);
      if (!clipped) {
        appendSegment();
        continue;
      }
      const [start, end] = clipped;
      if (!points.length) points = [start, end];
      else if (points.at(-1) === start) points.push(end);
      else {
        appendSegment();
        points = [start, end];
      }
    }
    appendSegment();
  }
  return Object.freeze(segments);
}

export function calculateMilkyWay(dateValue, location) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) throw new Error("日時が正しくありません");
  if (!Number.isFinite(Number(location?.latitude)) || !Number.isFinite(Number(location?.longitude))) {
    throw new Error("地点が正しくありません");
  }
  const core = equatorialToHorizontal(galacticToEquatorial(0), date, location);
  const plane = [];
  for (let longitude = 0; longitude < 360; longitude += 10) {
    plane.push({ longitude, ...equatorialToHorizontal(galacticToEquatorial(longitude), date, location) });
  }
  const visiblePlane = plane.filter((point) => point.altitude >= 0);
  const peak = (visiblePlane.length ? visiblePlane : plane).reduce((highest, point) => (
    point.altitude > highest.altitude ? point : highest
  ));
  let visibleSegments;
  const result = {
    azimuth: peak.azimuth,
    altitude: peak.altitude,
    direction: degreesToDirection(peak.azimuth),
    isAboveHorizon: visiblePlane.length > 0,
    core: Object.freeze({
      ...core,
      direction: degreesToDirection(core.azimuth),
      isAboveHorizon: core.altitude >= 0,
    }),
    peak: Object.freeze(peak),
    plane: Object.freeze(plane),
  };
  // The map is the only consumer that needs adaptive spherical geometry.
  // Lazily caching it keeps peak calculations and date searches at their
  // previous coarse-sample cost while still giving the map a precise fan.
  Object.defineProperty(result, "visibleSegments", {
    enumerable: true,
    get() {
      visibleSegments ??= clipMilkyWayPlane(plane);
      return visibleSegments;
    },
  });
  return Object.freeze(result);
}

export const milkyWayInternals = Object.freeze({
  galacticToEquatorial,
  equatorialToHorizontal,
  clipMilkyWayPlane,
  centralEmphasisWeight,
});
