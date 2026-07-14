export const MAX_SELECTED_TARGETS = 5;

const TARGETS = [
  { id: "sun", label: "太陽", shortLabel: "太陽", category: "basic", kind: "sun", color: "#ffb44a", symbol: "☀", search: true },
  { id: "moon", label: "月", shortLabel: "月", category: "basic", kind: "moon", color: "#91b8ec", symbol: "☾", search: true },
  { id: "milkyway", label: "天の川", shortLabel: "天の川", category: "deep-sky", kind: "milkyway", color: "#b58af2", symbol: "⌁", search: true },
  { id: "andromeda", label: "アンドロメダ銀河 M31", shortLabel: "M31", category: "deep-sky", kind: "fixed", color: "#75d5d0", symbol: "◉", raDegrees: 10.6847, decDegrees: 41.2692, search: true },
  { id: "orion-nebula", label: "オリオン大星雲 M42", shortLabel: "M42", category: "deep-sky", kind: "fixed", color: "#f28bc7", symbol: "✦", raDegrees: 83.8221, decDegrees: -5.3911, search: true },
  { id: "pleiades", label: "プレアデス星団 M45", shortLabel: "M45", category: "deep-sky", kind: "fixed", color: "#89c7ff", symbol: "⁙", raDegrees: 56.85, decDegrees: 24.1167, search: true },
  { id: "mercury", label: "水星", shortLabel: "水星", category: "planet", kind: "planet", body: "Mercury", color: "#b7bac5", symbol: "☿", search: true },
  { id: "venus", label: "金星", shortLabel: "金星", category: "planet", kind: "planet", body: "Venus", color: "#ffe5a3", symbol: "♀", search: true },
  { id: "mars", label: "火星", shortLabel: "火星", category: "planet", kind: "planet", body: "Mars", color: "#ff7b62", symbol: "♂", search: true },
  { id: "jupiter", label: "木星", shortLabel: "木星", category: "planet", kind: "planet", body: "Jupiter", color: "#d9b98c", symbol: "♃", search: true },
  { id: "saturn", label: "土星", shortLabel: "土星", category: "planet", kind: "planet", body: "Saturn", color: "#e9d08a", symbol: "♄", search: true },
  { id: "polaris", label: "北極星", shortLabel: "北極星", category: "star", kind: "fixed", color: "#b9ddff", symbol: "✧", raDegrees: 37.9546, decDegrees: 89.2641, search: true },
  { id: "sirius", label: "シリウス", shortLabel: "シリウス", category: "star", kind: "fixed", color: "#d8f2ff", symbol: "✷", raDegrees: 101.2872, decDegrees: -16.7161, search: true },
  { id: "orion", label: "オリオン座", shortLabel: "オリオン座", category: "constellation", kind: "fixed", color: "#7fc6ff", symbol: "⋈", raDegrees: 83.75, decDegrees: 0, search: true },
  { id: "scorpius", label: "さそり座", shortLabel: "さそり座", category: "constellation", kind: "fixed", color: "#ef7892", symbol: "♏", raDegrees: 253.25, decDegrees: -30, search: true },
  { id: "cassiopeia", label: "カシオペヤ座", shortLabel: "カシオペヤ", category: "constellation", kind: "fixed", color: "#d8a5ff", symbol: "W", raDegrees: 15, decDegrees: 60, search: true },
  { id: "summer-triangle", label: "夏の大三角", shortLabel: "夏の大三角", category: "constellation", kind: "fixed", color: "#76e0cf", symbol: "△", raDegrees: 297.75, decDegrees: 34, search: true },
];

export const TARGET_CATEGORIES = Object.freeze([
  { id: "basic", label: "基本" },
  { id: "deep-sky", label: "星景・深宇宙" },
  { id: "planet", label: "惑星" },
  { id: "star", label: "恒星" },
  { id: "constellation", label: "星座・星景" },
]);

export const CELESTIAL_TARGETS = Object.freeze(TARGETS.map((target) => Object.freeze(target)));
const TARGET_MAP = new Map(CELESTIAL_TARGETS.map((target) => [target.id, target]));

export function getTarget(targetId) {
  return TARGET_MAP.get(targetId) || null;
}

export function legacyBodyToTargets(value) {
  if (value === "sun") return ["sun"];
  if (value === "milkyway") return ["milkyway"];
  if (value === "all" || value === "both") return ["sun", "moon", "milkyway"];
  return ["moon"];
}

export function normalizeSelectedTargets(value, legacyBody = null) {
  const source = Array.isArray(value) ? value : legacyBodyToTargets(legacyBody);
  const unique = [];
  source.forEach((targetId) => {
    if (typeof targetId !== "string" || !TARGET_MAP.has(targetId) || unique.includes(targetId)) return;
    if (unique.length < MAX_SELECTED_TARGETS) unique.push(targetId);
  });
  return unique.length ? unique : ["moon"];
}

export function targetLabelList(targetIds, { short = false } = {}) {
  return normalizeSelectedTargets(targetIds).map((targetId) => {
    const target = getTarget(targetId);
    return short ? target.shortLabel : target.label;
  });
}
