import { normalizeDegrees } from "./angle.js";

const EARTH_RADIUS_METERS = 6371008.8;
const toRadians = (degrees) => degrees * Math.PI / 180;
const toDegrees = (radians) => radians * 180 / Math.PI;

export function destinationPoint(origin, bearingDegrees, distanceMeters) {
  const latitude = toRadians(origin.latitude);
  const longitude = toRadians(origin.longitude);
  const bearing = toRadians(normalizeDegrees(bearingDegrees));
  const angularDistance = distanceMeters / EARTH_RADIUS_METERS;

  const destinationLatitude = Math.asin(
    Math.sin(latitude) * Math.cos(angularDistance)
      + Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing),
  );

  const destinationLongitude = longitude + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
    Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(destinationLatitude),
  );

  return {
    latitude: toDegrees(destinationLatitude),
    longitude: ((toDegrees(destinationLongitude) + 540) % 360) - 180,
  };
}
