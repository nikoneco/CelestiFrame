import test from "node:test";
import assert from "node:assert/strict";
import { createPlanSharePayload, sharePlan, createPlanRestoreRunner } from "../js/plans/plan-manager.js";

const plan = {
  name: "月とスカイツリー",
  notes: "望遠レンズを持参",
  state: {
    selectedDateTime: "2026-08-13T15:30:00.000Z",
    selectedTargets: ["moon"],
    cameraLocation: { latitude: 35.681236, longitude: 139.767125 },
    subjectLocation: { latitude: 35.710063, longitude: 139.8107 },
    subject: { name: "東京スカイツリー", heightMeters: 634 },
    composition: { focalLengthMm: 200, sensorPreset: "full-frame", orientation: "landscape" },
    map: { zoom: 16, center: { latitude: 35.7, longitude: 139.8 } },
  },
};

test("a delayed earlier plan read cannot replace the last clicked plan", async () => {
  let releaseFirst;
  const applied = [];
  const restore = createPlanRestoreRunner({
    getOwnerId: () => "alice",
    readOffline: (plan) => plan.id === "A" ? new Promise((resolve) => { releaseFirst = resolve; }) : Promise.resolve(null),
    applyState: async (state) => { applied.push(state.id); return true; },
  });
  const first = restore({ id: "A", state: { id: "A" } });
  const second = await restore({ id: "B", state: { id: "B" } });
  releaseFirst(null);
  assert.ok(second);
  assert.equal(await first, false);
  assert.deepEqual(applied, ["B"]);
});

test("the owner guard remains valid through asynchronous cache restoration", async () => {
  let owner = "alice";
  let releaseCache;
  let enteredCache;
  const entered = new Promise((resolve) => { enteredCache = resolve; });
  let applied = false;
  const restore = createPlanRestoreRunner({
    getOwnerId: () => owner,
    readOffline: async () => null,
    applyState: async (_state, { isCurrent }) => {
      enteredCache();
      await new Promise((resolve) => { releaseCache = resolve; });
      if (!isCurrent()) return false;
      applied = true;
      return true;
    },
  });
  const pending = restore({ state: {} });
  await entered;
  owner = "guest";
  releaseCache();
  assert.equal(await pending, false);
  assert.equal(applied, false);
});

test("plan share payload includes its summary and restorable URL", () => {
  const payload = createPlanSharePayload(plan, "https://nikoneco.github.io/CelestiFrame/");
  assert.equal(payload.title, "月とスカイツリー | CelestiFrame");
  assert.match(payload.text, /東京スカイツリー・月/);
  assert.match(payload.text, /望遠レンズを持参/);
  assert.match(payload.url, /[?&]plan=1(?:&|$)/);
  assert.match(payload.url, /[?&]slat=35\.710063(?:&|$)/);
});

test("native sharing receives the plan payload without clipboard fallback", async () => {
  let shared;
  let copied = false;
  const result = await sharePlan(plan, {
    baseUrl: "https://example.com/CelestiFrame/",
    share: async (payload) => { shared = payload; },
    copy: async () => { copied = true; },
  });
  assert.equal(result, "shared");
  assert.equal(shared.title, "月とスカイツリー | CelestiFrame");
  assert.equal(copied, false);
});

test("cancelling native sharing does not copy anything", async () => {
  let copied = false;
  const result = await sharePlan(plan, {
    baseUrl: "https://example.com/CelestiFrame/",
    share: async () => { throw Object.assign(new Error("cancelled"), { name: "AbortError" }); },
    copy: async () => { copied = true; },
  });
  assert.equal(result, "cancelled");
  assert.equal(copied, false);
});

test("failed or unavailable native sharing copies summary and URL", async () => {
  let copied = "";
  const result = await sharePlan(plan, {
    baseUrl: "https://example.com/CelestiFrame/",
    share: async () => { throw Object.assign(new Error("blocked"), { name: "NotAllowedError" }); },
    copy: async (value) => { copied = value; },
    warn: () => {},
  });
  assert.equal(result, "copied");
  assert.match(copied, /撮影計画「月とスカイツリー」/);
  assert.match(copied, /https:\/\/example\.com\/CelestiFrame\/\?plan=1/);
});
