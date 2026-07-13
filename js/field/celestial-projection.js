import { normalizeDegrees } from "../geometry/angle.js";

const DEGREE = Math.PI / 180;
const toRadians = (degrees) => degrees * DEGREE;
const toDegrees = (radians) => radians / DEGREE;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const scale = (vector, amount) => vector.map((value) => value * amount);
const add = (a, b) => a.map((value, index) => value + b[index]);
const length = (vector) => Math.hypot(...vector);
const normalize = (vector) => {
  const magnitude = length(vector);
  if (magnitude < 1e-8) throw new RangeError("A direction vector cannot be zero");
  return scale(vector, 1 / magnitude);
};

export function normalizeQuaternion(quaternion) {
  const magnitude = Math.hypot(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  if (magnitude < 1e-8) throw new RangeError("A quaternion cannot be zero");
  return {
    x: quaternion.x / magnitude,
    y: quaternion.y / magnitude,
    z: quaternion.z / magnitude,
    w: quaternion.w / magnitude,
  };
}

export function multiplyQuaternions(a, b) {
  return normalizeQuaternion({
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  });
}

export function quaternionFromAxisAngle(axis, degrees) {
  const normalizedAxis = normalize(axis);
  const halfAngle = toRadians(degrees) / 2;
  const sine = Math.sin(halfAngle);
  return normalizeQuaternion({
    x: normalizedAxis[0] * sine,
    y: normalizedAxis[1] * sine,
    z: normalizedAxis[2] * sine,
    w: Math.cos(halfAngle),
  });
}

export function rotateVectorByQuaternion(vector, quaternion) {
  const q = normalizeQuaternion(quaternion);
  const u = [q.x, q.y, q.z];
  const uv = cross(u, vector);
  const uuv = cross(u, uv);
  return add(vector, add(scale(uv, 2 * q.w), scale(uuv, 2)));
}

export function deviceOrientationQuaternion({ alpha, beta, gamma, screenAngle = 0 }) {
  if (![alpha, beta, gamma, screenAngle].every(Number.isFinite)) throw new TypeError("Finite orientation angles are required");
  // Device Orientation is an intrinsic Z-X'-Y'' rotation. The screen
  // correction is a final rotation in device space because the event axes
  // remain tied to the phone's natural (usually portrait) orientation.
  const zRotation = quaternionFromAxisAngle([0, 0, 1], alpha);
  const xRotation = quaternionFromAxisAngle([1, 0, 0], beta);
  const yRotation = quaternionFromAxisAngle([0, 1, 0], gamma);
  const screenRotation = quaternionFromAxisAngle([0, 0, 1], -screenAngle);
  return multiplyQuaternions(multiplyQuaternions(multiplyQuaternions(zRotation, xRotation), yRotation), screenRotation);
}

export function smoothQuaternion(previous, next, factor) {
  if (!previous) return normalizeQuaternion(next);
  const amount = Math.min(1, Math.max(0, factor));
  const current = normalizeQuaternion(previous);
  let target = normalizeQuaternion(next);
  const cosine = current.x * target.x + current.y * target.y + current.z * target.z + current.w * target.w;
  if (cosine < 0) target = { x: -target.x, y: -target.y, z: -target.z, w: -target.w };
  return normalizeQuaternion({
    x: current.x + (target.x - current.x) * amount,
    y: current.y + (target.y - current.y) * amount,
    z: current.z + (target.z - current.z) * amount,
    w: current.w + (target.w - current.w) * amount,
  });
}

export function cameraFrameFromQuaternion(quaternion) {
  return {
    // The rear camera looks through the back of the device (-Z). Screen
    // right and up are +X and +Y after screen-orientation correction.
    forward: normalize(rotateVectorByQuaternion([0, 0, -1], quaternion)),
    right: normalize(rotateVectorByQuaternion([1, 0, 0], quaternion)),
    up: normalize(rotateVectorByQuaternion([0, 1, 0], quaternion)),
  };
}

export function cameraPoseFromFrame(frame) {
  const altitude = toDegrees(Math.asin(Math.min(1, Math.max(-1, frame.forward[2]))));
  const azimuth = normalizeDegrees(toDegrees(Math.atan2(frame.forward[0], frame.forward[1])));
  const worldUp = [0, 0, 1];
  const baseRight = normalize(cross(frame.forward, Math.abs(dot(frame.forward, worldUp)) > 0.995 ? [0, 1, 0] : worldUp));
  const baseUp = normalize(cross(baseRight, frame.forward));
  const roll = toDegrees(Math.atan2(dot(frame.right, baseUp), dot(frame.right, baseRight)));
  return { azimuth, altitude, roll };
}

export function celestialVector({ azimuth, altitude }) {
  const azimuthRadians = toRadians(azimuth);
  const altitudeRadians = toRadians(altitude);
  const horizontal = Math.cos(altitudeRadians);
  return [horizontal * Math.sin(azimuthRadians), horizontal * Math.cos(azimuthRadians), Math.sin(altitudeRadians)];
}

export function createCameraFrame({ azimuth, altitude, roll = 0 }) {
  const forward = celestialVector({ azimuth, altitude });
  const worldUp = [0, 0, 1];
  const fallbackNorth = [0, 1, 0];
  const baseRight = normalize(cross(forward, Math.abs(dot(forward, worldUp)) > 0.995 ? fallbackNorth : worldUp));
  const baseUp = normalize(cross(baseRight, forward));
  const rollRadians = toRadians(roll);
  return {
    forward,
    right: normalize(add(scale(baseRight, Math.cos(rollRadians)), scale(baseUp, Math.sin(rollRadians)))),
    up: normalize(add(scale(baseUp, Math.cos(rollRadians)), scale(baseRight, -Math.sin(rollRadians)))),
  };
}

export function projectCelestialTargetFromFrame(target, frame, { horizontalFov = 60, verticalFov = 45 } = {}) {
  const vector = celestialVector(target);
  const depth = dot(vector, frame.forward);
  const horizontal = dot(vector, frame.right);
  const vertical = dot(vector, frame.up);
  const horizontalLimit = Math.tan(toRadians(horizontalFov / 2));
  const verticalLimit = Math.tan(toRadians(verticalFov / 2));
  const projectedX = depth > 0 ? horizontal / depth : Math.sign(horizontal || 1) * Infinity;
  const projectedY = depth > 0 ? vertical / depth : Math.sign(vertical || 1) * Infinity;
  const x = 50 + projectedX / horizontalLimit * 50;
  const y = 50 - projectedY / verticalLimit * 50;
  return {
    x,
    y,
    depth,
    horizontal,
    vertical,
    isInFront: depth > 0,
    isVisible: depth > 0 && x >= 0 && x <= 100 && y >= 0 && y <= 100,
  };
}

export function projectCelestialTarget(target, camera, options) {
  return projectCelestialTargetFromFrame(target, createCameraFrame(camera), options);
}
