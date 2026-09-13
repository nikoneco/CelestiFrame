import { normalizePlan } from "../plans/plan-data.js?v=1.8.0";

const timestamp = (value) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;

export function createFirestorePlanRepository(sdk, database, userId) {
  const plans = sdk.collection(database, "users", userId, "plans");
  const tombstones = sdk.collection(database, "users", userId, "plan-tombstones");
  const mutate = (id, plan, deletedAt) => sdk.runTransaction(database, async (transaction) => {
    const planRef = sdk.doc(plans, String(id));
    const deletionRef = sdk.doc(tombstones, String(id));
    const [existing, deletion] = await Promise.all([transaction.get(planRef), transaction.get(deletionRef)]);
    const current = existing.exists() ? existing.data() : null;
    const previousDeletion = deletion.exists() ? deletion.data().deletedAt : null;
    if (plan) {
      if (timestamp(previousDeletion) >= timestamp(plan.updatedAt)) return { deletedAt: previousDeletion };
      if (current && timestamp(current.updatedAt) >= timestamp(plan.updatedAt)) return { plan: normalizePlan(current) };
      transaction.set(planRef, structuredClone(plan));
      return { plan };
    }
    const effectiveDeletion = timestamp(previousDeletion) > timestamp(deletedAt) ? previousDeletion : deletedAt;
    if (current && timestamp(current.updatedAt) > timestamp(effectiveDeletion)) return { plan: normalizePlan(current) };
    transaction.set(deletionRef, { id: String(id), deletedAt: effectiveDeletion });
    if (current) transaction.delete(planRef);
    return { deletedAt: effectiveDeletion };
  });
  return {
    async list() {
      const snapshot = await sdk.getDocs(plans);
      return snapshot.docs.map((item) => normalizePlan(item.data()));
    },
    async listTombstones() {
      const snapshot = await sdk.getDocs(tombstones);
      return snapshot.docs.map((item) => item.data());
    },
    put: (plan) => mutate(plan.id, plan),
    delete: (id, deletedAt = new Date().toISOString()) => mutate(id, null, deletedAt),
  };
}
