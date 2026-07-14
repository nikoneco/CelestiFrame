export function createLruCache(maxEntries) {
  const limit = Number(maxEntries);
  if (!Number.isInteger(limit) || limit < 1) throw new TypeError("キャッシュ上限は1以上の整数で指定してください");
  const entries = new Map();

  return {
    get size() {
      return entries.size;
    },
    get(key) {
      if (!entries.has(key)) return undefined;
      const value = entries.get(key);
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, value);
      while (entries.size > limit) entries.delete(entries.keys().next().value);
      return value;
    },
    clear() {
      entries.clear();
    },
  };
}
