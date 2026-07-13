import { subjectGeometry } from "../geometry/bearing.js";
import { fetchElevation } from "../elevation/elevation-service.js";

const EFFECTIVE_EARTH_RADIUS_METERS = 6371008.8 * (7 / 6);

export function interpolateLocation(start, end, fraction) {
  const t = Math.min(1, Math.max(0, Number(fraction)));
  return {
    latitude: Number(start.latitude) + (Number(end.latitude) - Number(start.latitude)) * t,
    longitude: Number(start.longitude) + (Number(end.longitude) - Number(start.longitude)) * t,
  };
}

export function analyzeTerrainProfile(points, {
  cameraHeightMeters = 1.5,
  targetHeightMeters = 0,
} = {}) {
  if (!Array.isArray(points) || points.length < 2) throw new Error("地形断面には2点以上必要です");
  const totalDistance = Number(points.at(-1).distanceMeters);
  const cameraAbsolute = Number(points[0].elevationMeters) + Number(cameraHeightMeters);
  const targetAbsolute = Number(points.at(-1).elevationMeters) + Number(targetHeightMeters);
  const analyzed = points.map((point, index) => {
    const fraction = totalDistance > 0 ? Number(point.distanceMeters) / totalDistance : index / (points.length - 1);
    const sightlineMeters = cameraAbsolute + (targetAbsolute - cameraAbsolute) * fraction;
    const earthBulgeMeters = index === 0 || index === points.length - 1
      ? 0
      : Number(point.distanceMeters) * (totalDistance - Number(point.distanceMeters)) / (2 * EFFECTIVE_EARTH_RADIUS_METERS);
    const apparentTerrainMeters = Number(point.elevationMeters) + earthBulgeMeters;
    return Object.freeze({
      ...point,
      sightlineMeters,
      earthBulgeMeters,
      clearanceMeters: sightlineMeters - apparentTerrainMeters,
    });
  });
  const interior = analyzed.slice(1, -1);
  const worst = interior.length
    ? interior.reduce((current, point) => point.clearanceMeters < current.clearanceMeters ? point : current)
    : null;
  return Object.freeze({
    points: Object.freeze(analyzed),
    totalDistanceMeters: totalDistance,
    isClear: !worst || worst.clearanceMeters > 0,
    minimumClearanceMeters: worst?.clearanceMeters ?? Infinity,
    obstruction: worst && worst.clearanceMeters <= 0 ? worst : null,
  });
}

export async function fetchTerrainProfile(start, end, {
  sampleCount = 21,
  signal,
  onProgress = () => {},
  fetchElevationImpl = fetchElevation,
  cameraElevationMeters,
  subjectElevationMeters,
  cameraHeightMeters = 1.5,
  targetHeightMeters = 0,
} = {}) {
  const count = Math.min(31, Math.max(3, Math.round(sampleCount)));
  const totalDistanceMeters = subjectGeometry(start, end).distanceMeters;
  const points = [];
  for (let index = 0; index < count; index += 1) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const fraction = index / (count - 1);
    const location = interpolateLocation(start, end, fraction);
    let elevationMeters;
    let source;
    if (index === 0 && Number.isFinite(Number(cameraElevationMeters))) {
      elevationMeters = Number(cameraElevationMeters);
      source = "撮影計画";
    } else if (index === count - 1 && Number.isFinite(Number(subjectElevationMeters))) {
      elevationMeters = Number(subjectElevationMeters);
      source = "撮影計画";
    } else {
      const elevation = await fetchElevationImpl(location, { signal });
      elevationMeters = elevation.meters;
      source = elevation.source;
    }
    points.push({
      location,
      distanceMeters: totalDistanceMeters * fraction,
      elevationMeters,
      source,
    });
    onProgress((index + 1) / count);
  }
  return analyzeTerrainProfile(points, { cameraHeightMeters, targetHeightMeters });
}
