import { normalizeDegrees } from "../geometry/angle.js";

const DEGREE = Math.PI / 180;
const J2000 = 2451545.0;
// HIP 11767 (Polaris), J2000.  The precession below is sufficient for a
// field finder; final polar alignment should still use the mount's reticle.
const POLARIS_J2000 = { rightAscension: 37.95456067, declination: 89.26410897 };

const toRadians = (degrees) => degrees * DEGREE;
const toDegrees = (radians) => radians / DEGREE;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function assertLocation(location) {
  if (!Number.isFinite(location?.latitude) || !Number.isFinite(location?.longitude)) {
    throw new TypeError("A finite latitude and longitude are required");
  }
}

export function julianDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new TypeError("A valid date is required");
  return date.getTime() / 86400000 + 2440587.5;
}

export function localSiderealTime(date, longitude) {
  const days = julianDate(date) - J2000;
  const centuries = days / 36525;
  const gmst = 280.46061837 + 360.98564736629 * days + 0.000387933 * centuries ** 2 - centuries ** 3 / 38710000;
  return normalizeDegrees(gmst + longitude);
}

export function precessEquatorialCoordinates({ rightAscension, declination }, date) {
  const centuries = (julianDate(date) - J2000) / 36525;
  const zeta = toRadians((2306.2181 * centuries + 0.30188 * centuries ** 2 + 0.017998 * centuries ** 3) / 3600);
  const z = toRadians((2306.2181 * centuries + 1.09468 * centuries ** 2 + 0.018203 * centuries ** 3) / 3600);
  const theta = toRadians((2004.3109 * centuries - 0.42665 * centuries ** 2 - 0.041833 * centuries ** 3) / 3600);
  const ra = toRadians(rightAscension);
  const dec = toRadians(declination);
  const a = Math.cos(dec) * Math.sin(ra + zeta);
  const b = Math.cos(theta) * Math.cos(dec) * Math.cos(ra + zeta) - Math.sin(theta) * Math.sin(dec);
  const c = Math.sin(theta) * Math.cos(dec) * Math.cos(ra + zeta) + Math.cos(theta) * Math.sin(dec);
  return { rightAscension: normalizeDegrees(toDegrees(Math.atan2(a, b) + z)), declination: toDegrees(Math.asin(clamp(c, -1, 1))) };
}

export function equatorialToHorizontal({ rightAscension, declination }, date, location) {
  assertLocation(location);
  const latitude = toRadians(location.latitude);
  const declinationRadians = toRadians(declination);
  const hourAngle = toRadians(normalizeDegrees(localSiderealTime(date, location.longitude) - rightAscension + 180) - 180);
  const altitude = Math.asin(
    Math.sin(latitude) * Math.sin(declinationRadians)
      + Math.cos(latitude) * Math.cos(declinationRadians) * Math.cos(hourAngle),
    -1,
    1,
  );
  const azimuth = Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(latitude) - Math.tan(declinationRadians) * Math.cos(latitude),
  );
  return {
    azimuth: normalizeDegrees(toDegrees(azimuth) + 180),
    altitude: toDegrees(altitude),
    hourAngle: normalizeDegrees(toDegrees(hourAngle)),
  };
}

export function calculatePolarisData(date, location) {
  assertLocation(location);
  const equatorial = precessEquatorialCoordinates(POLARIS_J2000, date);
  const horizontal = equatorialToHorizontal(equatorial, date, location);
  const separationDegrees = 90 - equatorial.declination;
  const skyClockMinutes = Math.round(normalizeDegrees(180 - horizontal.hourAngle) / 360 * 24 * 60);
  return {
    ...horizontal,
    rightAscension: equatorial.rightAscension,
    declination: equatorial.declination,
    separationDegrees,
    skyClockMinutes: skyClockMinutes % (24 * 60),
    northCelestialPole: { azimuth: 0, altitude: location.latitude },
  };
}
