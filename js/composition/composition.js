const TO_DEGREES = 180 / Math.PI;
const TO_RADIANS = Math.PI / 180;

export const SENSOR_PRESETS = Object.freeze({
  "full-frame": { name: "フルサイズ", widthMm: 36, heightMm: 24 },
  "aps-c": { name: "APS-C", widthMm: 23.5, heightMm: 15.6 },
  mft: { name: "マイクロフォーサーズ", widthMm: 17.3, heightMm: 13 },
  "one-inch": { name: "1型", widthMm: 13.2, heightMm: 8.8 },
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const degrees = (radians) => radians * TO_DEGREES;

export function fieldOfView({ sensorWidthMm, sensorHeightMm, focalLengthMm, orientation = "landscape" }) {
  const focal = Number(focalLengthMm);
  let width = Number(sensorWidthMm);
  let height = Number(sensorHeightMm);
  if (![focal, width, height].every((value) => Number.isFinite(value) && value > 0)) throw new Error("センサーサイズと焦点距離を確認してください");
  if (orientation === "portrait") [width, height] = [height, width];
  return {
    horizontalDegrees: degrees(2 * Math.atan(width / (2 * focal))),
    verticalDegrees: degrees(2 * Math.atan(height / (2 * focal))),
  };
}

export function calculateComposition({
  distanceMeters,
  subjectHeightMeters,
  cameraElevationMeters = 0,
  subjectElevationMeters = 0,
  focalLengthMm,
  sensorWidthMm,
  sensorHeightMm,
  orientation = "landscape",
  celestialBodies = [],
}) {
  const distance = Number(distanceMeters);
  const height = Number(subjectHeightMeters);
  const cameraElevation = Number(cameraElevationMeters);
  const subjectElevation = Number(subjectElevationMeters);
  if (!Number.isFinite(distance) || distance <= 0.1) throw new Error("撮影地点と被写体地点を離して設定してください");
  if (!Number.isFinite(height) || height <= 0) throw new Error("被写体の高さを入力してください");
  if (![cameraElevation, subjectElevation].every(Number.isFinite)) throw new Error("標高を確認してください");

  const fov = fieldOfView({ sensorWidthMm, sensorHeightMm, focalLengthMm, orientation });
  const bottomAngleDegrees = degrees(Math.atan2(subjectElevation - cameraElevation, distance));
  const topAngleDegrees = degrees(Math.atan2(subjectElevation + height - cameraElevation, distance));
  const angularHeightDegrees = topAngleDegrees - bottomAngleDegrees;
  const centerAltitudeDegrees = (topAngleDegrees + bottomAngleDegrees) / 2;
  const verticalFillPercent = angularHeightDegrees / fov.verticalDegrees * 100;
  const subjectTopPercent = 50 - verticalFillPercent / 2;
  const subjectBottomPercent = 50 + verticalFillPercent / 2;
  const horizonPercent = 50 + centerAltitudeDegrees / fov.verticalDegrees * 100;

  const bodyPositions = celestialBodies.map((body) => {
    const rawX = 50 + Number(body.azimuthDifferenceDegrees) / fov.horizontalDegrees * 100;
    const rawY = 50 - (Number(body.altitudeDegrees) - centerAltitudeDegrees) / fov.verticalDegrees * 100;
    return {
      ...body,
      xPercent: clamp(rawX, 3, 97),
      yPercent: clamp(rawY, 4, 96),
      isInsideFrame: rawX >= 0 && rawX <= 100 && rawY >= 0 && rawY <= 100,
      horizontalOutside: rawX < 0 ? "left" : rawX > 100 ? "right" : null,
      verticalOutside: rawY < 0 ? "above" : rawY > 100 ? "below" : null,
    };
  });

  return {
    ...fov,
    bottomAngleDegrees,
    topAngleDegrees,
    centerAltitudeDegrees,
    angularHeightDegrees,
    verticalFillPercent,
    subjectTopPercent,
    subjectBottomPercent,
    horizonPercent,
    bodyPositions,
    framing: verticalFillPercent > 100
      ? "被写体が縦に収まりません"
      : verticalFillPercent >= 75 ? "画面いっぱい"
        : verticalFillPercent >= 20 ? "構図に収まります" : "被写体は小さめです",
  };
}

export function focalLengthForFill({ angularHeightDegrees, sensorHeightMm, targetFill = 0.7 }) {
  const angularHeight = Number(angularHeightDegrees);
  const sensorHeight = Number(sensorHeightMm);
  if (!Number.isFinite(angularHeight) || angularHeight <= 0 || !Number.isFinite(sensorHeight) || sensorHeight <= 0) return null;
  const requiredVerticalFov = angularHeight / clamp(Number(targetFill), 0.05, 1);
  return sensorHeight / (2 * Math.tan(requiredVerticalFov * TO_RADIANS / 2));
}
