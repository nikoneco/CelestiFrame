import test from "node:test";
import assert from "node:assert/strict";
import { normalizeState } from "../js/state.js";

test("normalizeState keeps valid persisted values", () => {
  const state = normalizeState({
    selectedDateTime: "2026-08-28T03:50:00+09:00",
    selectedTargets: ["sun", "mars", "andromeda"],
    cameraLocation: { latitude: "35.4", longitude: "138.7" },
    subjectLocation: { latitude: 35.36, longitude: 138.73 },
    subject: { name: "富士山", heightMeters: 3776, targetMode: "terrain" },
    composition: { focalLengthMm: 200, sensorPreset: "aps-c", orientation: "portrait" },
    map: { zoom: 16, center: { latitude: 35.36, longitude: 138.73 } },
    settings: { theme: "red", directionLineOrigin: "subject", timeStepMinutes: 10, coordinateFormat: "dms" },
  });
  assert.deepEqual(state.cameraLocation, { latitude: 35.4, longitude: 138.7 });
  assert.deepEqual(state.subjectLocation, { latitude: 35.36, longitude: 138.73 });
  assert.equal(state.subject.name, "富士山");
  assert.equal(state.subject.heightMeters, 3776);
  assert.equal(state.composition.focalLengthMm, 200);
  assert.equal(state.map.zoom, 16);
  assert.equal(state.settings.theme, "red");
  assert.deepEqual(state.selectedTargets, ["sun", "mars", "andromeda"]);
});

test("normalizeState replaces only corrupted persisted fields", () => {
  const state = normalizeState({
    selectedDateTime: "invalid",
    selectedBody: "server",
    cameraLocation: { latitude: "broken", longitude: 139.7 },
    subjectLocation: { latitude: 91, longitude: 0 },
    subject: { name: "A".repeat(200), heightMeters: -1, groundElevationMeters: 99999 },
    composition: { focalLengthMm: 0, cameraHeightMeters: 999, sensorPreset: "unknown" },
    map: { zoom: 99, center: { latitude: "broken", longitude: 0 } },
    settings: { theme: "neon", timeStepMinutes: 999 },
  });
  assert.deepEqual(state.cameraLocation, { latitude: 35.681236, longitude: 139.767125 });
  assert.equal(state.subjectLocation, null);
  assert.deepEqual(state.selectedTargets, ["moon"]);
  assert.equal(state.subject.name.length, 120);
  assert.equal(state.subject.heightMeters, 10);
  assert.equal(state.composition.focalLengthMm, 50);
  assert.equal(state.map.zoom, 13);
  assert.deepEqual(state.map.center, state.cameraLocation);
  assert.equal(state.settings.theme, "dark");
  assert.ok(Number.isFinite(new Date(state.selectedDateTime).getTime()));
});

test("normalizeState migrates legacy body selections and caps targets at five", () => {
  assert.deepEqual(normalizeState({ selectedBody: "all" }).selectedTargets, ["sun", "moon", "milkyway"]);
  const selectedTargets = normalizeState({ selectedTargets: ["sun", "moon", "mars", "jupiter", "saturn", "venus", "unknown", "sun"] }).selectedTargets;
  assert.deepEqual(selectedTargets, ["sun", "moon", "mars", "jupiter", "saturn"]);
});
