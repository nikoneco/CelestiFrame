import { degreesToDirection, normalizeDegrees } from "../geometry/angle.js";

const toDegrees = (radians) => radians * 180 / Math.PI;

function validDateOrNull(value) {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value : null;
}

export function calculateSunData(date, location, calculator = globalThis.SunCalc) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError("A valid date is required for solar calculation");
  }
  if (!calculator?.getPosition || !calculator?.getTimes) {
    throw new Error("SunCalc is unavailable");
  }

  const { latitude, longitude } = location;
  const position = calculator.getPosition(date, latitude, longitude);
  const times = calculator.getTimes(date, latitude, longitude);
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
