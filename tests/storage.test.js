import test from "node:test";
import assert from "node:assert/strict";
import { safeStorage } from "../js/utils/storage.js";

test("preferences remain usable when accessing browser storage throws", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new DOMException("denied", "SecurityError"); } });
  try {
    assert.equal(safeStorage.getItem("blocked"), null);
    safeStorage.setItem("blocked", "light");
    assert.equal(safeStorage.getItem("blocked"), "light");
    safeStorage.removeItem("blocked");
    assert.equal(safeStorage.getItem("blocked"), null);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
});
