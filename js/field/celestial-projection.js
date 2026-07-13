const DEGREE = Math.PI / 180;
const toRadians = (degrees) => degrees * DEGREE;

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

export function celestialVector({ azimuth, altitude }) {
  const azimuthRadians = toRadians(azimuth);
  const altitudeRadians = toRadians(altitude);
  const horizontal = Math.cos(altitudeRadians);
  // East, north, up: azimuth is clockwise from north.
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

export function projectCelestialTarget(target, camera, { horizontalFov = 60, verticalFov = 45 } = {}) {
  const frame = createCameraFrame(camera);
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
    isInFront: depth > 0,
    isVisible: depth > 0 && x >= 0 && x <= 100 && y >= 0 && y <= 100,
  };
}
