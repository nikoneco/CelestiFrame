import { degreesToDirection, normalizeDegrees } from "../geometry/angle.js";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
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
  return Object.freeze({
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
  });
}

export const milkyWayInternals = Object.freeze({ galacticToEquatorial, equatorialToHorizontal });
