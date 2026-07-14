import { degreesToDirection } from "../geometry/angle.js";
import { calculateSunData } from "./sun-service.js";
import { calculateMoonData } from "./moon-service.js?v=5";
import { calculateMilkyWay, milkyWayInternals } from "./milky-way-service.js?v=41";
import { getTarget } from "./target-catalog.js?v=1";

function validateInput(date, location) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error("日時が正しくありません");
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("地点が正しくありません");
  }
  return { latitude, longitude };
}

function calculatePlanet(target, date, location, astronomy) {
  if (!astronomy?.Observer || !astronomy?.Equator || !astronomy?.Horizon || !astronomy?.Body) {
    throw new Error("惑星計算エンジンを読み込めませんでした");
  }
  const observer = new astronomy.Observer(location.latitude, location.longitude, 0);
  const body = astronomy.Body[target.body];
  const equatorial = astronomy.Equator(body, date, observer, true, true);
  const horizontal = astronomy.Horizon(date, observer, equatorial.ra, equatorial.dec, "normal");
  return {
    azimuth: horizontal.azimuth,
    altitude: horizontal.altitude,
    direction: degreesToDirection(horizontal.azimuth),
    isAboveHorizon: horizontal.altitude >= 0,
  };
}

function calculateFixed(target, date, location) {
  const horizontal = milkyWayInternals.equatorialToHorizontal({
    rightAscensionDegrees: target.raDegrees,
    declinationDegrees: target.decDegrees,
  }, date, location);
  return {
    ...horizontal,
    direction: degreesToDirection(horizontal.azimuth),
    isAboveHorizon: horizontal.altitude >= 0,
  };
}

export function calculateTargetData(targetId, dateValue, locationValue, astronomy = globalThis.Astronomy) {
  const target = getTarget(targetId);
  if (!target) throw new Error("未対応の撮影対象です");
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const location = validateInput(date, locationValue);
  if (target.kind === "sun") return { ...calculateSunData(date, location), target };
  if (target.kind === "moon") return { ...calculateMoonData(date, location), target };
  if (target.kind === "milkyway") return { ...calculateMilkyWay(date, location), target };
  const data = target.kind === "planet"
    ? calculatePlanet(target, date, location, astronomy)
    : calculateFixed(target, date, location);
  return { ...data, target };
}

export function calculateSelectedTargets(targetIds, dateValue, location, astronomy = globalThis.Astronomy) {
  return targetIds.map((targetId) => calculateTargetData(targetId, dateValue, location, astronomy));
}
