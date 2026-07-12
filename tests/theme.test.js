import test from "node:test";
import assert from "node:assert/strict";
import { normalizeThemePreference, resolveThemePreference, themeColor } from "../js/ui/theme.js";

test("resolveThemePreference follows system light and dark preferences", () => {
  assert.equal(resolveThemePreference("system", true), "light");
  assert.equal(resolveThemePreference("system", false), "dark");
});

test("theme preferences are normalized and have matching theme colors", () => {
  assert.equal(normalizeThemePreference("unknown"), "system");
  assert.equal(resolveThemePreference("red", true), "red");
  assert.equal(themeColor("light"), "#eaf0f5");
  assert.equal(themeColor("red"), "#100304");
  assert.equal(themeColor("dark"), "#07111f");
});
