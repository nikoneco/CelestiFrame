// Display preferences still work when the browser denies persistent storage.
const fallback = new Map();
export const safeStorage = {
  getItem(key) {
    if (fallback.has(key)) return fallback.get(key);
    try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
  },
  setItem(key, value) {
    const text = String(value);
    try {
      if (!globalThis.localStorage) throw new Error("Storage unavailable");
      globalThis.localStorage.setItem(key, text);
      fallback.delete(key);
    } catch { fallback.set(key, text); }
  },
  removeItem(key) {
    try { globalThis.localStorage?.removeItem(key); fallback.delete(key); }
    catch { fallback.set(key, null); }
  },
};
