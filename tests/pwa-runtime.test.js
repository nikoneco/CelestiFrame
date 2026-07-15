import test from "node:test";
import assert from "node:assert/strict";
import { launchShortcutFromUrl, resolveDisplayMode, shortcutFreeUrl } from "../js/pwa/pwa-runtime.js";

test("PWA shortcuts open only supported CelestiFrame tasks", () => {
  assert.equal(launchShortcutFromUrl("https://example.test/app/?shortcut=plans"), "plans");
  assert.equal(launchShortcutFromUrl("https://example.test/app/?shortcut=field"), "field");
  assert.equal(launchShortcutFromUrl("https://example.test/app/?shortcut=unknown"), null);
});

test("shortcut cleanup preserves the deployed path, other queries, and hash", () => {
  assert.equal(
    shortcutFreeUrl("https://example.test/CelestiFrame/?shortcut=plans&theme=red#map"),
    "/CelestiFrame/?theme=red#map",
  );
});

test("standalone display mode accepts browser media state and iOS navigator state", () => {
  assert.equal(resolveDisplayMode({ matchMedia: () => ({ matches: true }), navigator: {} }), "standalone");
  assert.equal(resolveDisplayMode({ matchMedia: () => ({ matches: false }), navigator: { standalone: true } }), "standalone");
  assert.equal(resolveDisplayMode({ matchMedia: () => ({ matches: false }), navigator: {} }), "browser");
});
