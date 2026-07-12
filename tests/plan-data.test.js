import test from "node:test";
import assert from "node:assert/strict";
import { buildShareUrl, createPlan, parsePlansFile, parseSharedState, serializePlans, snapshotPlanState } from "../js/plans/plan-data.js";

const state = {
  selectedDateTime: "2026-08-13T15:30:00.000Z",
  selectedBody: "moon",
  cameraLocation: { latitude: 35.681236, longitude: 139.767125 },
  subjectLocation: { latitude: 35.710063, longitude: 139.8107 },
  subject: { name: "東京スカイツリー", heightMeters: null },
  map: { zoom: 16, center: { latitude: 35.7, longitude: 139.8 } },
};

test("snapshotPlanState keeps planning data without display settings", () => {
  const snapshot = snapshotPlanState({ ...state, settings: { theme: "red" } });
  assert.equal(snapshot.subject.name, "東京スカイツリー");
  assert.equal(snapshot.settings, undefined);
});

test("plan JSON export and import round trips", () => {
  const plan = createPlan({ state, name: "月とスカイツリー", notes: "望遠", id: "plan-1", now: "2026-07-12T00:00:00.000Z" });
  const parsed = parsePlansFile(serializePlans([plan], "2026-07-12T01:00:00.000Z"));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].name, "月とスカイツリー");
  assert.equal(parsed[0].state.cameraLocation.latitude, state.cameraLocation.latitude);
  assert.equal(parsed[0].state.composition.focalLengthMm, 50);
});

test("legacy plans receive Phase 8 composition defaults", () => {
  const legacy = createPlan({ state, name: "旧計画", id: "legacy", now: "2026-07-12T00:00:00.000Z" });
  delete legacy.state.composition;
  delete legacy.state.subject.groundElevationMeters;
  const parsed = parsePlansFile(JSON.stringify({ app: "CelestiFrame", version: 1, plans: [legacy] }));
  assert.equal(parsed[0].state.composition.sensorPreset, "full-frame");
  assert.equal(parsed[0].state.subject.groundElevationMeters, 0);
});

test("share URL restores locations, date, body and subject name", () => {
  const url = buildShareUrl(state, "https://nikoneco.github.io/CelestiFrame/?old=1#map");
  const restored = parseSharedState(url);
  assert.equal(restored.selectedBody, "moon");
  assert.equal(restored.subject.name, "東京スカイツリー");
  assert.deepEqual(restored.cameraLocation, state.cameraLocation);
  assert.deepEqual(restored.subjectLocation, state.subjectLocation);
});

test("invalid share coordinates are rejected", () => {
  assert.throws(() => parseSharedState("https://example.com/?plan=1&lat=999&lng=0&at=2026-01-01T00:00:00Z"), /緯度/);
});
