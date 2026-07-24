import { EARTH_RADIUS_METERS } from "../geometry/target-altitude.js?v=24";

export const SHORT_DISTANCE_THRESHOLD_METERS = 50;
export const DEFAULT_REFRACTION_COEFFICIENT = 0.13;

const toRadians = (degrees) => Number(degrees) * Math.PI / 180;
const toDegrees = (radians) => radians * 180 / Math.PI;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function median(values) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function robustAngleEstimate(values) {
  const numeric = values.map(Number).filter(Number.isFinite);
  if (!numeric.length) throw new Error("測定サンプルがありません");
  const center = median(numeric);
  const mad = median(numeric.map((value) => Math.abs(value - center)));
  const limit = Math.max(0.35, mad * 3.5);
  const inliers = numeric.filter((value) => Math.abs(value - center) <= limit);
  return inliers.reduce((sum, value) => sum + value, 0) / inliers.length;
}

export function calculateObservationHeight({
  distanceMeters,
  cameraGroundElevationMeters,
  targetGroundElevationMeters,
  angleDegrees,
  applyCurvature = true,
  refractionCoefficient = DEFAULT_REFRACTION_COEFFICIENT,
}) {
  const distance = Number(distanceMeters);
  const cameraGround = Number(cameraGroundElevationMeters);
  const targetGround = Number(targetGroundElevationMeters);
  const angle = Number(angleDegrees);
  const refraction = Number(refractionCoefficient);
  if (!Number.isFinite(distance) || distance <= 0) throw new Error("撮影地点と被写体地点を離して設定してください");
  if (![cameraGround, targetGround, angle, refraction].every(Number.isFinite)) throw new Error("距離、角度、標高を確認してください");
  if (angle <= -89 || angle >= 89) throw new Error("端末の角度が測定範囲外です");
  if (refraction < 0 || refraction >= 1) throw new Error("大気差係数を確認してください");

  let cameraAbsoluteMeters;
  if (applyCurvature) {
    const centralAngle = distance / EARTH_RADIUS_METERS;
    const effectiveRadius = EARTH_RADIUS_METERS / (1 - refraction);
    const targetRadius = effectiveRadius + targetGround;
    const horizontal = targetRadius * Math.sin(centralAngle);
    const cameraRadius = targetRadius * Math.cos(centralAngle) - horizontal * Math.tan(toRadians(angle));
    cameraAbsoluteMeters = cameraRadius - effectiveRadius;
  } else {
    cameraAbsoluteMeters = targetGround - distance * Math.tan(toRadians(angle));
  }

  const heightMeters = cameraAbsoluteMeters - cameraGround;
  return {
    heightMeters,
    cameraAbsoluteMeters,
    angleDegrees: angle,
    distanceMeters: distance,
    isShortDistance: distance < SHORT_DISTANCE_THRESHOLD_METERS,
    applyCurvature: Boolean(applyCurvature),
    refractionCoefficient: refraction,
  };
}

export function calculateStructureHeight({
  distanceMeters,
  cameraGroundElevationMeters,
  cameraHeightMeters,
  targetGroundElevationMeters,
  angleDegrees,
  applyCurvature = true,
  refractionCoefficient = DEFAULT_REFRACTION_COEFFICIENT,
}) {
  const distance = Number(distanceMeters);
  const cameraGround = Number(cameraGroundElevationMeters);
  const cameraHeight = Number(cameraHeightMeters);
  const targetGround = Number(targetGroundElevationMeters);
  const angle = Number(angleDegrees);
  const refraction = Number(refractionCoefficient);
  if (!Number.isFinite(distance) || distance <= 0) throw new Error("撮影地点と被写体地点を離して設定してください");
  if (![cameraGround, cameraHeight, targetGround, angle, refraction].every(Number.isFinite)) throw new Error("距離、角度、標高、高さを確認してください");
  if (cameraHeight < 0) throw new Error("カメラ高を確認してください");
  if (angle <= -89 || angle >= 89) throw new Error("端末の角度が測定範囲外です");
  if (refraction < 0 || refraction >= 1) throw new Error("大気差係数を確認してください");

  let targetAbsoluteMeters;
  const cameraAbsoluteMeters = cameraGround + cameraHeight;
  if (applyCurvature) {
    const centralAngle = distance / EARTH_RADIUS_METERS;
    const effectiveRadius = EARTH_RADIUS_METERS / (1 - refraction);
    const cameraRadius = effectiveRadius + cameraAbsoluteMeters;
    const denominator = Math.cos(centralAngle) - Math.tan(toRadians(angle)) * Math.sin(centralAngle);
    if (!Number.isFinite(denominator) || denominator <= 0) throw new Error("端末の角度から高さを計算できません");
    targetAbsoluteMeters = cameraRadius / denominator - effectiveRadius;
  } else {
    targetAbsoluteMeters = cameraAbsoluteMeters + distance * Math.tan(toRadians(angle));
  }

  return {
    heightMeters: targetAbsoluteMeters - targetGround,
    targetAbsoluteMeters,
    cameraAbsoluteMeters,
    angleDegrees: angle,
    distanceMeters: distance,
    isShortDistance: distance < SHORT_DISTANCE_THRESHOLD_METERS,
    applyCurvature: Boolean(applyCurvature),
    refractionCoefficient: refraction,
  };
}

export function orientationSampleFromEvent(event, screenAngleDegrees = 0) {
  if (event?.beta == null || event?.gamma == null) return null;
  const beta = Number(event?.beta);
  const gamma = Number(event?.gamma);
  const screenAngle = Number(screenAngleDegrees);
  if (![beta, gamma, screenAngle].every(Number.isFinite)) return null;

  const betaRadians = toRadians(beta);
  const gammaRadians = toRadians(gamma);
  const gravityX = -Math.sin(gammaRadians) * Math.cos(betaRadians);
  const gravityY = Math.sin(betaRadians);
  const gravityZ = Math.cos(gammaRadians) * Math.cos(betaRadians);
  const angleDegrees = toDegrees(Math.asin(clamp(-gravityZ, -1, 1)));
  const rawRoll = toDegrees(Math.atan2(gravityX, gravityY)) + screenAngle;
  const rollDegrees = ((rawRoll + 180) % 360 + 360) % 360 - 180;
  return { angleDegrees, rollDegrees };
}

export class OrientationStabilityTracker {
  constructor({
    stableDurationMs = 1000,
    minSamples = 8,
    movementThresholdDegrees = 1.25,
    maxRollDegrees = 10,
  } = {}) {
    this.stableDurationMs = stableDurationMs;
    this.minSamples = minSamples;
    this.movementThresholdDegrees = movementThresholdDegrees;
    this.maxRollDegrees = maxRollDegrees;
    this.reset();
  }

  reset() {
    this.samples = [];
    this.completed = false;
  }

  addSample({ angleDegrees, rollDegrees, timestamp = Date.now() }) {
    const angle = Number(angleDegrees);
    const roll = Number(rollDegrees);
    const time = Number(timestamp);
    if (![angle, roll, time].every(Number.isFinite)) {
      this.reset();
      return { status: "invalid", progress: 0 };
    }
    if (Math.abs(roll) > this.maxRollDegrees) {
      this.reset();
      return { status: "level", progress: 0 };
    }
    if (this.completed) {
      return {
        status: "complete",
        progress: 1,
        angleDegrees: robustAngleEstimate(this.samples.map((sample) => sample.angleDegrees)),
      };
    }

    const recent = this.samples.slice(-5).map((sample) => sample.angleDegrees);
    if (recent.length >= 3 && Math.abs(angle - median(recent)) > this.movementThresholdDegrees) {
      this.samples = [{ angleDegrees: angle, rollDegrees: roll, timestamp: time }];
      return { status: "moving", progress: 0 };
    }

    this.samples.push({ angleDegrees: angle, rollDegrees: roll, timestamp: time });
    const elapsed = time - this.samples[0].timestamp;
    const progress = clamp(elapsed / this.stableDurationMs, 0, 1);
    if (elapsed < this.stableDurationMs || this.samples.length < this.minSamples) {
      return { status: "stabilizing", progress };
    }

    this.completed = true;
    return {
      status: "complete",
      progress: 1,
      angleDegrees: robustAngleEstimate(this.samples.map((sample) => sample.angleDegrees)),
      sampleCount: this.samples.length,
    };
  }
}
