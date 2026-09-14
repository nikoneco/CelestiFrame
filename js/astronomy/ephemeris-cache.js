import { createLruCache } from "../utils/lru-cache.js?v=1.9.2";

// Keep calculators (including test doubles) isolated, and bound long search sessions.
const caches = new WeakMap();
export function cachedEphemeris(calculator, key, calculate) {
  let cache = caches.get(calculator);
  if (!cache) { cache = createLruCache(128); caches.set(calculator, cache); }
  let result = cache.get(key);
  if (result === undefined) result = cache.set(key, calculate());
  return result;
}
