import test from "node:test";
import assert from "node:assert/strict";
import { buildPlanSyncActions } from "../js/cloud/plan-sync.js";

const plan = (id, updatedAt) => ({ id, updatedAt });

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
