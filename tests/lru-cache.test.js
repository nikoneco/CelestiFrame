import test from "node:test";
import assert from "node:assert/strict";
import { createLruCache } from "../js/utils/lru-cache.js";

test("LRU cache evicts the least recently used entry", () => {
  const cache = createLruCache(2);
  cache.set("a", 1);
  cache.set("b", 2);
  assert.equal(cache.get("a"), 1);
  cache.set("c", 3);
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a"), 1);
  assert.equal(cache.get("c"), 3);
  assert.equal(cache.size, 2);
});

test("LRU cache validates its entry limit and can be cleared", () => {
  assert.throws(() => createLruCache(0), /1以上/);
  const cache = createLruCache(1);
  cache.set("a", 1);
  cache.clear();
  assert.equal(cache.size, 0);
});
