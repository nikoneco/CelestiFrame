import test from "node:test";
import assert from "node:assert/strict";
import {
  OFFLINE_PARTS,
  createOfflinePreparation,
  offlineStateKey,
  offlineStateSignature,
} from "../js/plans/offline-preparation.js";

const plan = (overrides = {}) => ({
  id: "plan-1",
  updatedAt: "2026-09-14T00:00:00.000Z",
  state: {
    selectedDateTime: "2026-09-14T12:00:00.000Z",
    cameraLocation: { latitude: 35.681236, longitude: 139.767125 },
    subjectLocation: { latitude: 35.710063, longitude: 139.8107 },
    subject: { name: "被写体", heightMeters: 20 },
    composition: { cameraHeightMeters: 1.5 },
    map: { zoom: 14, center: { latitude: 35.68, longitude: 139.76 } },
    ...overrides,
  },
});

function clone(value) {
  return structuredClone(value);
}

function createMemoryStore({ failPuts = false, failAfter = Infinity } = {}) {
  const records = new Map();
  const getCalls = [];
  let putCount = 0;
  return {
    records,
    getCalls,
    async get({ ownerId, planId, stateSignature, includeData = true }) {
      getCalls.push({ ownerId, planId, stateSignature, includeData });
      const key = JSON.stringify([String(ownerId || "guest"), String(planId || ""), String(stateSignature || "")]);
      if (!records.has(key)) return null;
      const value = clone(records.get(key));
      if (includeData !== false) return value;
      value.parts = Object.fromEntries(Object.entries(value.parts || {}).map(([name, part]) => [name, {
        status: part.status,
        fetchedAt: part.fetchedAt || null,
        reused: Boolean(part.reused),
        source: part.source || null,
        error: part.error || null,
        lastError: part.lastError || null,
      }]));
      return value;
    },
    async put(record) {
      putCount += 1;
      if (failPuts || putCount > failAfter) throw new DOMException("quota", "QuotaExceededError");
      records.set(record.key, clone(record));
      return clone(record);
    },
    async delete({ ownerId, planId }) {
      const prefix = JSON.stringify([String(ownerId || "guest"), String(planId || "")]).slice(0, -1);
      for (const [key, record] of records) {
        if (`${record.ownerId}\u001f${record.planId}` === `${ownerId || "guest"}\u001f${planId || ""}`) records.delete(key);
      }
      return prefix;
    },
  };
}

const parts = (stamp = "2026-09-14T00:00:00.000Z") => Object.fromEntries(OFFLINE_PARTS.map((name) => [name, {
  status: "ready",
  fetchedAt: stamp,
  source: name,
  data: { name },
}]));

test("offline preparation keeps a full state key and isolates owners", async () => {
  const store = createMemoryStore();
  const preparation = createOfflinePreparation({
    store,
    now: () => new Date("2026-09-14T01:00:00.000Z"),
    sources: { prepareParts: async () => parts() },
  });
  const current = plan();
  const result = await preparation.prepare(current, { ownerId: "user-a" });
  assert.equal(result.status, "ready");
  assert.equal(result.stateSignature, offlineStateSignature(current));
  assert.equal(result.stateKey, offlineStateKey(current));
  assert.deepEqual((await preparation.get(current, { ownerId: "user-a" })).parts.forecast.data, { name: "forecast" });
  assert.equal(await preparation.get(current, { ownerId: "user-b" }), null);
  assert.equal(await preparation.get({ ...current, state: { ...current.state, cameraLocation: { latitude: 35, longitude: 139 } } }, { ownerId: "user-a" }), null);
});

test("preparation progress identifies start, parts and completion with timestamps", async () => {
  const events = [];
  const preparation = createOfflinePreparation({
    store: createMemoryStore(),
    now: () => new Date("2026-09-14T02:00:00.000Z"),
    sources: {
      prepareParts: async (_plan, { onPart }) => {
        await onPart("elevation", { status: "ready", data: { meters: 12 }, fetchedAt: "2026-09-14T01:59:00.000Z" });
        return { parts: { ...parts(), elevation: undefined } };
      },
    },
  });
  const result = await preparation.prepare(plan(), { onProgress: (event) => events.push(event) });
  assert.equal(result.status, "ready");
  assert.deepEqual(events.map((event) => event.phase), ["start", "part", "complete"]);
  assert.equal(events[1].part, "elevation");
  assert.equal(events.at(-1).fetchedAt, "2026-09-14T02:00:00.000Z");
});

test("a failed retry preserves prior data and marks it as reused", async () => {
  const store = createMemoryStore();
  let shouldFail = false;
  const preparation = createOfflinePreparation({
    store,
    now: () => new Date("2026-09-14T03:00:00.000Z"),
    sources: { prepareParts: async () => {
      if (shouldFail) throw new Error("予報API停止");
      return parts("2026-09-14T02:30:00.000Z");
    } },
  });
  const current = plan();
  await preparation.prepare(current);
  shouldFail = true;
  const retry = await preparation.prepare(current);
  assert.equal(retry.status, "failed");
  assert.equal(retry.lastError, "予報API停止");
  assert.equal(retry.parts.forecast.data.name, "forecast");
  assert.equal(retry.parts.forecast.fetchedAt, "2026-09-14T02:30:00.000Z");
  assert.equal(retry.parts.forecast.reused, true);
  assert.equal((await preparation.getStatus(current)).parts.forecast.reused, true);
});

test("a stale operation cannot publish after the plan is changed", async () => {
  const store = createMemoryStore();
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  const preparation = createOfflinePreparation({ store, sources: {
    prepareParts: async () => {
      await waiting;
      return parts();
    },
  } });
  const current = plan();
  const pending = preparation.prepare(current, { isCurrent: async () => false });
  release();
  const result = await pending;
  assert.equal(result.status, "cancelled");
  assert.notEqual((await store.records.values().next().value)?.status, "ready");
});

test("a superseded generation cannot overwrite a newer retry after an async current check", async () => {
  const store = createMemoryStore();
  let entered;
  let release;
  const enteredCheck = new Promise((resolve) => { entered = resolve; });
  const waitingCheck = new Promise((resolve) => { release = resolve; });
  let checkCount = 0;
  const current = plan();
  const preparation = createOfflinePreparation({
    store,
    sources: { prepareParts: async () => parts("2026-09-14T04:00:00.000Z") },
  });
  const first = preparation.prepare(current, {
    isCurrent: async () => {
      checkCount += 1;
      if (checkCount === 1) {
        entered();
        await waitingCheck;
      }
      return true;
    },
  });
  await enteredCheck;
  const second = preparation.prepare(current, { isCurrent: async () => true });
  const secondResult = await second;
  assert.equal(secondResult.status, "ready");
  release();
  assert.equal((await first).status, "cancelled");
  const stored = [...store.records.values()];
  assert.equal(stored.length, 1);
  assert.equal(stored[0].status, "ready");
  assert.equal(stored[0].preparing, false);
});

test("deleting a plan while preparation is in flight leaves no preparing record", async () => {
  const store = createMemoryStore();
  let entered;
  let release;
  const enteredCollector = new Promise((resolve) => { entered = resolve; });
  const waitingCollector = new Promise((resolve) => { release = resolve; });
  const current = plan();
  const preparation = createOfflinePreparation({
    store,
    sources: {
      prepareParts: async (_plan, { signal }) => {
        entered();
        await waitingCollector;
        if (signal.aborted) throw signal.reason;
        return parts();
      },
    },
  });
  const pending = preparation.prepare(current);
  await enteredCollector;
  const removing = preparation.remove(current);
  release();
  await removing;
  assert.equal((await pending).status, "cancelled");
  assert.equal(store.records.size, 0);
  assert.equal(await preparation.getStatus(current), null);
});

test("a partial refresh keeps old data and timestamp while exposing the refresh error", async () => {
  const store = createMemoryStore();
  let refresh = false;
  let nowValue = "2026-09-14T05:00:00.000Z";
  const current = plan();
  const preparation = createOfflinePreparation({
    store,
    now: () => new Date(nowValue),
    sources: {
      prepareParts: async () => {
        if (!refresh) return parts("2026-09-14T04:30:00.000Z");
        return {
          parts: {
            ...parts("2026-09-14T05:30:00.000Z"),
            terrain: { status: "unavailable", error: "地形対象がありません" },
            forecast: { status: "failed", error: "予報API停止" },
          },
        };
      },
    },
  });
  await preparation.prepare(current);
  refresh = true;
  nowValue = "2026-09-14T06:00:00.000Z";
  const retry = await preparation.prepare(current);
  assert.equal(retry.status, "partial");
  assert.equal(retry.preparing, false);
  assert.equal(retry.parts.terrain.status, "unavailable");
  assert.equal(retry.parts.forecast.status, "ready");
  assert.equal(retry.parts.forecast.reused, true);
  assert.equal(retry.parts.forecast.fetchedAt, "2026-09-14T04:30:00.000Z");
  assert.equal(retry.parts.forecast.data.name, "forecast");
  assert.equal(retry.parts.forecast.error, "予報API停止");
  assert.equal(retry.parts.forecast.lastError, "予報API停止");
  const status = await preparation.getStatus(current);
  assert.equal(status.status, "partial");
  assert.equal(status.parts.forecast.fetchedAt, "2026-09-14T04:30:00.000Z");
  assert.equal(status.parts.forecast.lastError, "予報API停止");
});

test("a quota failure during refresh preserves the previous ready snapshot", async () => {
  const store = createMemoryStore({ failAfter: 2 });
  const current = plan();
  const preparation = createOfflinePreparation({
    store,
    sources: { prepareParts: async () => parts("2026-09-14T07:00:00.000Z") },
  });
  await preparation.prepare(current);
  const retry = await preparation.prepare(current);
  assert.equal(retry.status, "failed");
  assert.match(retry.storageError, /quota/);
  const saved = await preparation.get(current);
  assert.equal(saved.status, "ready");
  assert.equal(saved.preparing, false);
  assert.equal(saved.parts.forecast.fetchedAt, "2026-09-14T07:00:00.000Z");
  assert.equal(saved.parts.forecast.data.name, "forecast");
  const status = await preparation.getStatus(current);
  assert.equal(status.status, "ready");
  assert.equal(status.preparing, false);
  assert.equal(store.getCalls.at(-1).includeData, false);
});

test("storage quota failure is returned as a failed preparation", async () => {
  const preparation = createOfflinePreparation({
    store: createMemoryStore({ failPuts: true }),
    sources: { prepareParts: async () => parts() },
  });
  const result = await preparation.prepare(plan());
  assert.equal(result.status, "failed");
  assert.match(result.storageError, /quota/);
});

test("preparation has a bounded timeout and reports the failure", async () => {
  const preparation = createOfflinePreparation({
    store: createMemoryStore(),
    sources: { prepareParts: async (_plan, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason));
    }) },
  });
  const result = await preparation.prepare(plan(), { timeoutMs: 5 });
  assert.equal(result.status, "failed");
  assert.match(result.lastError, /タイムアウト/);
});
