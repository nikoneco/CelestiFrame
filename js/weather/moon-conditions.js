import { calculateMoonData } from "../astronomy/moon-service.js?v=1.9.1";
import { calculateMilkyWay } from "../astronomy/milky-way-service.js?v=1.9.1";
import { calculateTargetData } from "../astronomy/target-service.js?v=1.9.1";

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

function validateInput(dateValue, location) {
  const date = dateValue instanceof Date ? new Date(dateValue) : new Date(dateValue);
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  if (Number.isNaN(date.getTime())) throw new Error("日時が正しくありません");
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("地点が正しくありません");
  }
  return { date, location: { latitude, longitude } };
}

function skyVector(point) {
  const altitude = Number(point.altitude) * RAD;
  const azimuth = Number(point.azimuth) * RAD;
  const horizontal = Math.cos(altitude);
  return [
    horizontal * Math.sin(azimuth),
    horizontal * Math.cos(azimuth),
    Math.sin(altitude),
  ];
}

export function angularDistanceDegrees(first, second) {
  if (![first?.azimuth, first?.altitude, second?.azimuth, second?.altitude].every(Number.isFinite)) return null;
  const a = skyVector(first);
  const b = skyVector(second);
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return Math.acos(dot) * DEG;
}

function targetPoint(targetId, date, location, { milkyWayCalculator, targetCalculator }) {
  if (targetId === "moon") {
    return { label: "月", point: null };
  }
  if (targetId === "milkyway") {
    const data = milkyWayCalculator(date, location);
    return {
      label: "天の川（銀河中心）",
      point: data?.core || null,
    };
  }
  if (!targetId) return { label: "主対象なし", point: null };
  const data = targetCalculator(targetId, date, location);
  return {
    label: data?.target?.label || targetId,
    point: data,
  };
}

/**
 * Calculate the moon row for the first selected target at one instant and
 * camera location.  The Milky Way target is intentionally measured at its
 * galactic center.  A moon-to-moon comparison is undefined and stays null.
 */
export function calculateMoonConditions(
  dateValue,
  locationValue,
  targetId,
  {
    moonCalculator,
    milkyWayCalculator = calculateMilkyWay,
    targetCalculator = calculateTargetData,
  } = {},
) {
  const { date, location } = validateInput(dateValue, locationValue);
  const moon = calculateMoonData(date, location, moonCalculator);
  if (!Number.isFinite(moon.altitude) || !Number.isFinite(moon.azimuth)
    || !Number.isFinite(moon.illuminationFraction)) {
    throw new Error("月条件を計算できません");
  }
  const target = targetPoint(targetId, date, location, { milkyWayCalculator, targetCalculator });
  return Object.freeze({
    targetId: targetId || null,
    targetLabel: target.label,
    moonAltitudeDegrees: moon.altitude,
    moonIlluminationFraction: moon.illuminationFraction,
    moonIlluminationPercent: moon.illuminationFraction * 100,
    angularDistanceDegrees: targetId === "moon" ? null : angularDistanceDegrees(moon, target.point),
  });
}
