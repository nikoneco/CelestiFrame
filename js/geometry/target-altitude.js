export const EARTH_RADIUS_METERS = 6371008.8;
export const SUN_ANGULAR_RADIUS_DEGREES = 0.2666;

const toDegrees = (radians) => radians * 180 / Math.PI;

export function apparentSolarAltitude(geometricAltitudeDegrees) {
  const altitude = Number(geometricAltitudeDegrees);
  if (!Number.isFinite(altitude)) throw new TypeError("太陽高度が正しくありません");
  if (altitude < -1 || altitude >= 89.9) return altitude;
  const denominator = Math.tan((altitude + 10.3 / (altitude + 5.11)) * Math.PI / 180);
  if (!Number.isFinite(denominator) || denominator <= 0) return altitude;
  return altitude + 1.02 / denominator / 60;
}

export function calculateTargetAltitude({
  distanceMeters,
  cameraElevationMeters,
  cameraHeightMeters = 1.5,
  targetElevationMeters,
  targetHeightMeters = 0,
  targetMode = "terrain",
  refractionCoefficient = 0.13,
}) {
  const distance = Number(distanceMeters);
  const cameraGround = Number(cameraElevationMeters);
  const cameraHeight = Number(cameraHeightMeters);
  const targetGround = Number(targetElevationMeters);
  const targetHeight = targetMode === "structure" ? Number(targetHeightMeters) : 0;
  const refraction = Number(refractionCoefficient);
  if (!Number.isFinite(distance) || distance <= 0) throw new Error("撮影地点と被写体地点を離して設定してください");
  if (![cameraGround, cameraHeight, targetGround, targetHeight, refraction].every(Number.isFinite)) throw new Error("標高と高さを確認してください");
  if (cameraHeight < 0 || targetHeight < 0 || refraction < 0 || refraction >= 1) throw new Error("高さと大気差係数を確認してください");

  const cameraAbsoluteMeters = cameraGround + cameraHeight;
  const targetAbsoluteMeters = targetGround + targetHeight;
  const centralAngle = distance / EARTH_RADIUS_METERS;
  const effectiveRadius = EARTH_RADIUS_METERS / (1 - refraction);
  const cameraRadius = effectiveRadius + cameraAbsoluteMeters;
  const targetRadius = effectiveRadius + targetAbsoluteMeters;
  const horizontal = targetRadius * Math.sin(centralAngle);
  const vertical = targetRadius * Math.cos(centralAngle) - cameraRadius;
  const geometricRadius = EARTH_RADIUS_METERS;
  const geometricVertical = (geometricRadius + targetAbsoluteMeters) * Math.cos(centralAngle)
    - (geometricRadius + cameraAbsoluteMeters);
  const geometricHorizontal = (geometricRadius + targetAbsoluteMeters) * Math.sin(centralAngle);

  return {
    altitudeDegrees: toDegrees(Math.atan2(vertical, horizontal)),
    geometricAltitudeDegrees: toDegrees(Math.atan2(geometricVertical, geometricHorizontal)),
    cameraAbsoluteMeters,
    targetAbsoluteMeters,
    curvatureDropMeters: distance ** 2 / (2 * EARTH_RADIUS_METERS),
  };
}

export function classifyDiamondAlignment({
  azimuthDifferenceDegrees,
  sunAltitudeDegrees,
  targetAltitudeDegrees,
  sunRadiusDegrees = SUN_ANGULAR_RADIUS_DEGREES,
  nearToleranceDegrees = 0.3,
}) {
  const horizontal = Number(azimuthDifferenceDegrees) * Math.cos(Number(targetAltitudeDegrees) * Math.PI / 180);
  const verticalDifference = Number(sunAltitudeDegrees) - Number(targetAltitudeDegrees);
  const angularSeparation = Math.hypot(horizontal, verticalDifference);
  const radius = Number(sunRadiusDegrees);
  const state = angularSeparation <= 0.08
    ? "center"
    : angularSeparation <= radius ? "disk"
      : angularSeparation <= radius + Number(nearToleranceDegrees) ? "near" : "azimuth-only";
  return { horizontalDifference: horizontal, verticalDifference, angularSeparation, state };
}
