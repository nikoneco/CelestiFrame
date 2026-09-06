import test from "node:test";
import assert from "node:assert/strict";
import { createFirestorePlanRepository } from "../js/cloud/firestore-plan-repository.js";
import { createPlan } from "../js/plans/plan-data.js";
import { normalizeState } from "../js/state.js";

function fixture() {
  const records = new Map();
  const deletions = [];
  const sdk = {
    collection: (_database, ...parts) => parts.join("/"),
    doc: (collection, id) => `${collection}/${id}`,
    getDocs: async (collection) => ({ docs: [...records].filter(([key]) => key.startsWith(`${collection}/`)).map(([, data]) => ({ data: () => structuredClone(data) })) }),
    runTransaction: async (_database, operation) => {
      const writes = [];
      const result = await operation({
        get: async (key) => ({ exists: () => records.has(key), data: () => structuredClone(records.get(key)) }),
        set: (key, value) => writes.push(() => records.set(key, structuredClone(value))),
        delete: (key) => writes.push(() => { deletions.push(key); records.delete(key); }),
      });
      writes.forEach((write) => write());
      return result;
    },
  };
  return { records, deletions, repository: createFirestorePlanRepository(sdk, {}, "owner") };
}
const plan = (updatedAt) => ({ ...createPlan({ state: normalizeState(null), id: "test-plan", now: "2026-09-06T00:00:00.000Z" }), updatedAt });

test("cloud deletion persists across stale uploads and repeated deletion", async () => {
  const { repository, records, deletions } = fixture();
  const original = plan("2026-09-06T01:00:00.000Z");
  const deletedAt = "2026-09-06T02:00:00.000Z";
  await repository.put(original);
  await repository.delete(original.id, deletedAt);
  const staleResult = await repository.put(original);
  assert.equal(staleResult.deletedAt, deletedAt);
  assert.deepEqual(await repository.list(), []);
  assert.deepEqual(await repository.listTombstones(), [{ id: original.id, deletedAt }]);
  await repository.delete(original.id, "2026-09-06T01:30:00.000Z");
  assert.equal(deletions.length, 1, "an already-absent document must not require a delete rule on nonexistent resource.data");
  assert.equal((await repository.listTombstones())[0].deletedAt, deletedAt);
  assert.ok([...records.keys()].every((key) => key.startsWith("users/owner/")));
});

test("cloud transactions keep a newer edit and allow a deliberate edit after deletion", async () => {
  const { repository } = fixture();
  const current = plan("2026-09-06T03:00:00.000Z");
  await repository.put(current);
  const staleSave = await repository.put(plan("2026-09-06T02:00:00.000Z"));
  assert.equal(staleSave.plan.updatedAt, current.updatedAt);
  const staleDelete = await repository.delete(current.id, "2026-09-06T02:30:00.000Z");
  assert.equal(staleDelete.plan.updatedAt, current.updatedAt);
  await repository.delete(current.id, "2026-09-06T04:00:00.000Z");
  const edited = plan("2026-09-06T05:00:00.000Z");
  await repository.put(edited);
  assert.equal((await repository.list())[0].updatedAt, edited.updatedAt);
  assert.equal((await repository.listTombstones()).length, 1, "deletion history remains available to stale devices");
});
