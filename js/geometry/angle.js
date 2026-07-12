export function normalizeDegrees(value) {
  if (!Number.isFinite(value)) throw new TypeError("Angle must be a finite number");
  return ((value % 360) + 360) % 360;
}

export function signedAngleDifference(from, to) {
  const difference = normalizeDegrees(to) - normalizeDegrees(from);
  return ((difference + 540) % 360) - 180;
}

const DIRECTIONS = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];

export function degreesToDirection(value) {
  const normalized = normalizeDegrees(value);
  return DIRECTIONS[Math.round(normalized / 45) % DIRECTIONS.length];
}
