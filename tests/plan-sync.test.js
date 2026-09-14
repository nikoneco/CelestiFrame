import test from "node:test";
import assert from "node:assert/strict";
import { buildPlanSyncActions, createPlanSyncCoordinator } from "../js/cloud/plan-sync.js";
import { deletePlanData } from "../js/plans/plan-manager.js";

const plan = (id, updatedAt) => ({ id, updatedAt });

function repositories(initial = {}) {
  const owners = new Map();
  function forOwner(owner) {
    if (!owners.has(owner)) owners.set(owner, { plans: new Map((initial[owner] || []).map((p) => [p.id, p])), deleted: new Map() });
    const data = owners.get(owner);
    return {
      list: async () => [...data.plans.values()],
      put: async (p) => { data.plans.set(p.id, p); data.deleted.delete(p.id); },
      delete: async (id, deletedAt) => { data.plans.delete(id); data.deleted.set(id, { id, deletedAt }); },
      listTombstones: async () => [...data.deleted.values()],
      clearTombstone: async (id) => data.deleted.delete(id),
    };
  }
  return { forOwner, setOwner() {}, listForOwner: (owner) => forOwner(owner).list() };
}

test("offline cleanup waiting across logout never deletes the guest copy of a signed-in plan", async () => {
  const shared = plan("same-id", "2026-09-14T00:00:00Z");
  const local = repositories({ alice: [shared], guest: [shared] });
  const coordinator = createPlanSyncCoordinator(local);
  await coordinator.connect("alice", repositories({ alice: [shared] }).forOwner("alice"), { syncNow: false });
  let releaseCleanup;
  let enteredCleanup;
  const entered = new Promise((resolve) => { enteredCleanup = resolve; });
  let cleanupOwner;
  const deleting = deletePlanData(shared, {
    repository: coordinator, ownerId: coordinator.getUserId(),
    offlinePreparation: { remove: async (_plan, { ownerId }) => {
      cleanupOwner = ownerId;
      enteredCleanup();
      await new Promise((resolve) => { releaseCleanup = resolve; });
    } },
  });
  await entered;
  coordinator.disconnect();
  releaseCleanup();
  assert.equal(await deleting, null);
  assert.equal(cleanupOwner, "alice");
  assert.deepEqual(await local.forOwner("alice").list(), []);
  assert.deepEqual(await local.forOwner("guest").list(), [shared]);
});

test("a cloud deletion removes an unchanged plan on another device", () => {
  const deletedAt = "2026-09-06T02:00:00Z";
  const actions = buildPlanSyncActions([plan("gone", "2026-09-06T01:00:00Z")], [], [], [{ id: "gone", deletedAt }]);
  assert.deepEqual(actions.upload, []);
  assert.deepEqual(actions.deleteLocal, [{ id: "gone", deletedAt }]);
});

test("deletion is published even when the cloud record is already absent", () => {
  assert.deepEqual(buildPlanSyncActions([], [], [{ id: "gone", deletedAt: "2026-09-06T02:00:00Z" }]).deleteCloud, ["gone"]);
});

test("a plan deleted on device A stays deleted after device B synchronizes", async () => {
  const original = plan("gone", "2026-01-01T00:00:00.000Z");
  const cloud = repositories({ account: [original] }).forOwner("account");
  const localA = repositories({ account: [original] });
  const localB = repositories({ account: [original] });
  const deviceA = createPlanSyncCoordinator(localA);
  const deviceB = createPlanSyncCoordinator(localB);
  await deviceA.connect("account", cloud, { syncNow: false });
  await deviceB.connect("account", cloud, { syncNow: false });
  await deviceA.delete("gone");
  await deviceA.sync();
  await deviceB.sync();
  assert.deepEqual(await cloud.list(), []);
  assert.deepEqual(await localB.forOwner("account").list(), []);
  assert.equal((await cloud.listTombstones()).length, 1);
});

test("switching accounts during a pending sync cancels all subsequent writes", async () => {
  const local = repositories({ A: [plan("private-A", "2026-09-06T01:00:00Z")] });
  const remoteA = repositories().forOwner("A");
  const remoteB = repositories().forOwner("B");
  let release;
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  remoteA.list = () => { entered(); return new Promise((resolve) => { release = resolve; }); };
  const coordinator = createPlanSyncCoordinator(local);
  const first = coordinator.connect("A", remoteA);
  await started;
  await coordinator.connect("B", remoteB);
  release([]);
  assert.equal((await first).status, "cancelled");
  assert.deepEqual(await remoteB.list(), []);
  assert.deepEqual(await local.forOwner("B").list(), []);
  assert.equal((await local.forOwner("A").list())[0].id, "private-A");
});

test("saving finishes locally while the network is stalled and its snapshot cannot overwrite the edit", async () => {
  const old = plan("one", "2026-09-06T01:00:00Z");
  const edited = plan("one", "2026-09-06T03:00:00Z");
  const local = repositories({ A: [old] });
  const remote = repositories({ A: [plan("one", "2026-09-06T02:00:00Z")] }).forOwner("A");
  const originalList = remote.list;
  let release;
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  remote.list = () => { remote.list = originalList; entered(); return new Promise((resolve) => { release = resolve; }); };
  const coordinator = createPlanSyncCoordinator(local);
  const syncing = coordinator.connect("A", remote);
  await started;
  const saving = coordinator.put(edited);
  await saving;
  assert.equal((await local.forOwner("A").list())[0].updatedAt, edited.updatedAt);
  release(await originalList());
  await Promise.all([syncing, saving]);
  await coordinator.sync();
  assert.equal((await local.forOwner("A").list())[0].updatedAt, edited.updatedAt);
  assert.equal((await remote.list())[0].updatedAt, edited.updatedAt);
});

test("plan sync uploads a newer local plan and downloads a newer cloud plan", () => {
  const actions = buildPlanSyncActions(
    [plan("local-new", "2026-07-14T02:00:00Z"), plan("cloud-new", "2026-07-14T01:00:00Z")],
    [plan("local-new", "2026-07-14T01:00:00Z"), plan("cloud-new", "2026-07-14T02:00:00Z")],
    [],
  );
  assert.deepEqual(actions.upload.map(({ id }) => id), ["local-new"]);
  assert.deepEqual(actions.download.map(({ id }) => id), ["cloud-new"]);
});

test("plan sync propagates deletion when the tombstone is newest", () => {
  const actions = buildPlanSyncActions([], [plan("deleted", "2026-07-14T01:00:00Z")], [
    { id: "deleted", deletedAt: "2026-07-14T02:00:00Z" },
  ]);
  assert.deepEqual(actions.deleteCloud, ["deleted"]);
  assert.deepEqual(actions.clearTombstone, ["deleted"]);
  assert.deepEqual(actions.download, []);
});

test("plan sync restores a cloud plan edited after local deletion", () => {
  const actions = buildPlanSyncActions([], [plan("restored", "2026-07-14T03:00:00Z")], [
    { id: "restored", deletedAt: "2026-07-14T02:00:00Z" },
  ]);
  assert.deepEqual(actions.download.map(({ id }) => id), ["restored"]);
  assert.deepEqual(actions.deleteCloud, []);
});

test("plan sync uploads and downloads records missing on the other side", () => {
  const actions = buildPlanSyncActions(
    [plan("only-local", "2026-07-14T01:00:00Z")],
    [plan("only-cloud", "2026-07-14T01:00:00Z")],
    [],
  );
  assert.deepEqual(actions.upload.map(({ id }) => id), ["only-local"]);
  assert.deepEqual(actions.download.map(({ id }) => id), ["only-cloud"]);
});
