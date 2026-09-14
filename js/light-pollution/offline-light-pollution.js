// Only our bundled, redistributable VIIRS layer is eligible. Basemap providers
// are deliberately never passed to this module.
export const OFFLINE_LIGHT_CACHE = "celestiframe-field-light-v1";
const BUNDLED_TEMPLATE = "assets/light-pollution/vnp46a4-2025/{z}/{x}/{y}.webp";

export function offlineLightTileUrls(state, template, baseUrl) {
  const base = new URL("./", baseUrl);
  const expected = new URL(BUNDLED_TEMPLATE, base).href;
  if (new URL(template, base).href !== expected) throw new Error("この光害提供元はオフライン保存に未対応です");
  const locations = [state.cameraLocation, state.subjectLocation].filter(Boolean);
  if (locations.some(({ latitude, longitude }) => latitude < 20 || latitude > 50 || longitude < 120 || longitude > 160)) {
    throw new Error("光害データの対象地域外です");
  }
  const zooms = new Set([Math.max(0, Math.min(8, Math.round(state.map?.zoom ?? 8))), 8]);
  const urls = new Set();
  for (const z of zooms) for (const location of locations) {
    const n = 2 ** z;
    const radians = location.latitude * Math.PI / 180;
    const centerX = Math.floor((location.longitude + 180) / 360 * n);
    const centerY = Math.floor((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * n);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const x = centerX + dx; const y = centerY + dy;
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      const west = x / n * 360 - 180; const east = (x + 1) / n * 360 - 180;
      const north = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
      const south = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n))) * 180 / Math.PI;
      if (east <= 120 || west >= 160 || north <= 20 || south >= 50) continue;
      urls.add(expected.replace("%7Bz%7D", z).replace("%7Bx%7D", x).replace("%7By%7D", y).replace("{z}", z).replace("{x}", x).replace("{y}", y));
    }
  }
  return [...urls];
}

export async function collectOfflineLight(state, { template, baseUrl = location.href, fetchImpl = fetch, signal } = {}) {
  const urls = offlineLightTileUrls(state, template, baseUrl);
  const tiles = [];
  for (const url of urls) {
    const response = await fetchImpl(url, { signal });
    if (!response.ok) throw new Error(`光害タイルを取得できません (${response.status})`);
    const blob = await response.blob();
    if (!blob.type.startsWith("image/") || blob.size > 1024 * 1024) throw new Error("光害タイルの形式が正しくありません");
    tiles.push({ url, blob });
  }
  return { tiles, dataYear: 2025, fetchedAt: new Date().toISOString(), template };
}

export async function restoreOfflineLight(snapshot, { cacheStorage = caches, baseUrl = location.href } = {}) {
  const cache = await cacheStorage.open(OFFLINE_LIGHT_CACHE);
  // Keep just the active plan's public overlay, bounded to at most 36 tiles.
  await Promise.all((await cache.keys()).map((request) => cache.delete(request)));
  if (!snapshot) return;
  const prefix = new URL("assets/light-pollution/vnp46a4-2025/", new URL("./", baseUrl)).href;
  if (!Array.isArray(snapshot.tiles) || snapshot.tiles.length > 36) throw new Error("光害保存データの形式が正しくありません");
  for (const { url, blob } of snapshot.tiles) {
    if (!url.startsWith(prefix) || !/^\d+\/\d+\/\d+\.webp$/.test(url.slice(prefix.length)) || !(blob instanceof Blob)) throw new Error("光害保存データの形式が正しくありません");
    await cache.put(url, new Response(blob, { headers: { "Content-Type": "image/webp" } }));
  }
}
