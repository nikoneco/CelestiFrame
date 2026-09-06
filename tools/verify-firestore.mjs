// Setup: npm install --prefix tmp/firebase-qa firebase-tools @firebase/rules-unit-testing firebase@12.16.0
// Run through firebase emulators:exec using firebase.emulator.json and project demo-celestiframe.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createFirestorePlanRepository } from "../js/cloud/firestore-plan-repository.js";
import { createPlan } from "../js/plans/plan-data.js";
import { normalizeState } from "../js/state.js";

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Run this verification inside the Firestore emulator; production is never a test target.");
const require = createRequire(new URL("../tmp/firebase-qa/package.json", import.meta.url));
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const sdk = require("firebase/firestore");
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
const environment = await initializeTestEnvironment({ projectId: "demo-celestiframe", firestore: {
  host, port: Number(port), rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
} });
try {
  const owner = environment.authenticatedContext("owner").firestore();
  const other = environment.authenticatedContext("other").firestore();
  const guest = environment.unauthenticatedContext().firestore();
  const repository = createFirestorePlanRepository(sdk, owner, "owner");
  const state = normalizeState(null);
  state.composition.cameraHeightMeters = 1000;
  const original = createPlan({ state, id: "integrity-test", now: "2026-09-06T01:00:00.000Z" });
  await assertSucceeds(repository.put(original));
  assert.equal((await repository.list())[0].state.composition.cameraHeightMeters, 1000);
  assert.equal((await repository.list())[0].state.composition.cameraElevationStatus, "error");
  const ref = (database) => sdk.doc(database, "users/owner/plans/integrity-test");
  await assertFails(sdk.getDoc(ref(other)));
  await assertFails(sdk.getDoc(ref(guest)));
  await assertFails(sdk.setDoc(ref(other), original));
  await assertFails(sdk.setDoc(ref(guest), original));
  await assertFails(sdk.deleteDoc(ref(owner))); // Legacy deletion without a tombstone must not erase deletion history.
  await assertSucceeds(repository.delete(original.id, "2026-09-06T02:00:00.000Z"));
  await assertSucceeds(repository.delete(original.id, "2026-09-06T02:00:00.000Z"));
  await assertFails(sdk.setDoc(ref(owner), original)); // Old clients cannot resurrect a deleted plan.
  assert.equal((await repository.put(original)).deletedAt, "2026-09-06T02:00:00.000Z");
  assert.deepEqual(await repository.list(), []);
  const deletionRef = sdk.doc(owner, "users/owner/plan-tombstones/integrity-test");
  await assertFails(sdk.deleteDoc(deletionRef));
  await assertFails(sdk.setDoc(deletionRef, { id: original.id, deletedAt: "2026-09-06T00:00:00.000Z" }));
  await assertFails(sdk.getDoc(sdk.doc(other, "users/owner/plan-tombstones/integrity-test")));
  const edited = { ...original, updatedAt: "2026-09-06T03:00:00.000Z" };
  await assertSucceeds(repository.put(edited));
  assert.equal((await repository.delete(original.id, "2026-09-06T02:30:00.000Z")).plan.updatedAt, edited.updatedAt);
  const invalid = structuredClone(edited);
  invalid.state.composition.cameraHeightMeters = 1001;
  await assertFails(sdk.setDoc(ref(owner), invalid));
  const appSdk = require("firebase/app");
  const lite = require("firebase/firestore/lite");
  const liteApp = appSdk.initializeApp({ projectId: "demo-celestiframe", apiKey: "emulator-only" }, "lite-integrity");
  try {
    const liteDatabase = lite.getFirestore(liteApp);
    lite.connectFirestoreEmulator(liteDatabase, host, Number(port), { mockUserToken: { sub: "owner", user_id: "owner" } });
    const liteRepository = createFirestorePlanRepository(lite, liteDatabase, "owner");
    assert.equal((await liteRepository.list())[0].id, original.id);
    await liteRepository.delete(original.id, "2026-09-06T04:00:00.000Z");
    assert.equal((await liteRepository.put(edited)).deletedAt, "2026-09-06T04:00:00.000Z");
    assert.deepEqual(await liteRepository.list(), []);
  } finally { await appSdk.deleteApp(liteApp); }
  console.log("FIRESTORE INTEGRITY PASS: 1000m/unresolved elevation, ownership, atomic deletion, stale upload, repeated delete, newer edit, height limit");
} finally {
  await environment.cleanup();
}
