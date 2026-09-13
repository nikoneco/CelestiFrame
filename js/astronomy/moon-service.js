import { degreesToDirection, normalizeDegrees } from "../geometry/angle.js?v=1.8.0";
import { cachedEphemeris } from "./ephemeris-cache.js?v=1.8.0";

const SYNODIC_MONTH_DAYS = 29.530588853;
const toDegrees = (radians) => radians * 180 / Math.PI;

function validDateOrNull(value) {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? new Date(value) : null;
}

export function moonPhaseName(phase) {
  if (phase < 0.03 || phase >= 0.97) return "新月";
  if (phase < 0.22) return "満ちていく細い月";
  if (phase < 0.28) return "上弦";
  if (phase < 0.47) return "満ちていく月";
  if (phase < 0.53) return "満月";
  if (phase < 0.72) return "欠けていく月";
  if (phase < 0.78) return "下弦";
  return "欠けていく細い月";
}

export function calculateMoonData(date, location, calculator = globalThis.SunCalc) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError("A valid date is required for lunar calculation");
  }
  if (!calculator?.getMoonPosition || !calculator?.getMoonIllumination || !calculator?.getMoonTimes) {
    throw new Error("SunCalc moon functions are unavailable");
  }

  const { latitude, longitude } = location;
  const point = `${latitude}:${longitude}`;
  const midnight = new Date(date);
  midnight.setHours(0, 0, 0, 0);
  const position = cachedEphemeris(calculator, `moon-position:${+date}:${point}`, () => calculator.getMoonPosition(date, latitude, longitude));
  const illumination = cachedEphemeris(calculator, `moon-light:${+date}`, () => calculator.getMoonIllumination(date));
  const times = cachedEphemeris(calculator, `moon-times:${+midnight}:${point}`, () => calculator.getMoonTimes(date, latitude, longitude));
  const azimuth = normalizeDegrees(toDegrees(position.azimuth) + 180);
  const altitude = toDegrees(position.altitude);

  return {
    azimuth,
    altitude,
    direction: degreesToDirection(azimuth),
    isAboveHorizon: altitude >= 0,
    distanceKilometers: position.distance,
    illuminationFraction: illumination.fraction,
    phase: illumination.phase,
    phaseName: moonPhaseName(illumination.phase),
    ageDays: illumination.phase * SYNODIC_MONTH_DAYS,
    moonrise: validDateOrNull(times.rise),
    moonset: validDateOrNull(times.set),
    alwaysUp: Boolean(times.alwaysUp),
    alwaysDown: Boolean(times.alwaysDown),
  };
}
