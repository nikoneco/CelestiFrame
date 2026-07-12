import { normalizeDegrees } from "./angle.js";

const EARTH_RADIUS_METERS = 6371008.8;
const toRadians = (degrees) => degrees * Math.PI / 180;
const toDegrees = (radians) => radians * 180 / Math.PI;

export function distanceMeters(from, to) {
  const latitude1 = toRadians(from.latitude);
  const latitude2 = toRadians(to.latitude);
  const latitudeDelta = latitude2 - latitude1;
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

export function initialBearingDegrees(from, to) {
  if (from.latitude === to.latitude && from.longitude === to.longitude) return 0;
  const latitude1 = toRadians(from.latitude);
  const latitude2 = toRadians(to.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const y = Math.sin(longitudeDelta) * Math.cos(latitude2);
  const x = Math.cos(latitude1) * Math.sin(latitude2)
    - Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(longitudeDelta);
  return normalizeDegrees(toDegrees(Math.atan2(y, x)));
}

export function subjectGeometry(cameraLocation, subjectLocation) {
  return {
    distanceMeters: distanceMeters(cameraLocation, subjectLocation),
    bearingDegrees: initialBearingDegrees(cameraLocation, subjectLocation),
  };
}
