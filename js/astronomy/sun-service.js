import { degreesToDirection, normalizeDegrees } from "../geometry/angle.js?v=1.7.0";
import { cachedEphemeris } from "./ephemeris-cache.js?v=1.7.0";

const toDegrees = (radians) => radians * 180 / Math.PI;

function validDateOrNull(value) {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? new Date(value) : null;
}

export function calculateSunData(date, location, calculator = globalThis.SunCalc) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError("A valid date is required for solar calculation");
  }
  if (!calculator?.getPosition || !calculator?.getTimes) {
    throw new Error("SunCalc is unavailable");
  }

  const { latitude, longitude } = location;
  const point = `${latitude}:${longitude}`;
  const position = cachedEphemeris(calculator, `sun-position:${+date}:${point}`, () => calculator.getPosition(date, latitude, longitude));
  // Same Julian cycle used by the pinned SunCalc 1.9.0, including longitude boundaries.
  const cycle = Math.round(+date / 86400000 - 10957.5 - 0.0009 + longitude / 360);
  const times = cachedEphemeris(calculator, `sun-times:${cycle}:${point}`, () => calculator.getTimes(date, latitude, longitude));
  const azimuth = normalizeDegrees(toDegrees(position.azimuth) + 180);
  const altitude = toDegrees(position.altitude);

  return {
    azimuth,
    altitude,
    direction: degreesToDirection(azimuth),
    isAboveHorizon: altitude >= 0,
    sunrise: validDateOrNull(times.sunrise),
    solarNoon: validDateOrNull(times.solarNoon),
    sunset: validDateOrNull(times.sunset),
  };
}
