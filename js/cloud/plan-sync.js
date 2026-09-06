import { GUEST_PLAN_OWNER } from "../plans/plan-repository.js?v=1.7.0";

const timestamp = (value) => {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

export function buildPlanSyncActions(localPlans, cloudPlans, tombstones, cloudTombstones = []) {
  const local = new Map(localPlans.map((plan) => [plan.id, plan]));
  const cloud = new Map(cloudPlans.map((plan) => [plan.id, plan]));
  const localDeleted = new Map(tombstones.map((item) => [item.id, item]));
  const cloudDeleted = new Map(cloudTombstones.map((item) => [item.id, item]));
  const actions = { upload: [], download: [], deleteCloud: [], deleteLocal: [], clearTombstone: [] };
  const ids = new Set([...local.keys(), ...cloud.keys(), ...localDeleted.keys(), ...cloudDeleted.keys()]);
  for (const id of ids) {
    const localPlan = local.get(id);
    const cloudPlan = cloud.get(id);
    const localDeletion = localDeleted.get(id);
    const cloudDeletion = cloudDeleted.get(id);
    const deletion = timestamp(localDeletion?.deletedAt) > timestamp(cloudDeletion?.deletedAt) ? localDeletion : cloudDeletion;
    const newestEdit = Math.max(timestamp(localPlan?.updatedAt), timestamp(cloudPlan?.updatedAt));
    if (deletion && timestamp(deletion.deletedAt) >= newestEdit) {
      if (!cloudDeletion || timestamp(localDeletion?.deletedAt) > timestamp(cloudDeletion.deletedAt) || cloudPlan) actions.deleteCloud.push(id);
      if (localPlan) actions.deleteLocal.push({ id, deletedAt: deletion.deletedAt });
    } else {
      if (localPlan && (!cloudPlan || timestamp(localPlan.updatedAt) > timestamp(cloudPlan.updatedAt))) actions.upload.push(localPlan);
      if (cloudPlan && (!localPlan || timestamp(cloudPlan.updatedAt) > timestamp(localPlan.updatedAt))) actions.download.push(cloudPlan);
    }
    if (localDeletion) actions.clearTombstone.push(id);
  }
  return actions;
}

export function createPlanSyncCoordinator(localRepository) {
  let status = "local";
  const listeners = new Set();
  const makeSession = (owner, cloud = null) => ({ owner, cloud, local: localRepository.forOwner(owner), queue: Promise.resolve(), localQueue: Promise.resolve(), revision: 0 });
  let session = makeSession(GUEST_PLAN_OWNER);
  const active = (context) => context === session;
  const emit = (context, nextStatus, detail = "") => {
    if (!active(context)) return;
    status = nextStatus;
    listeners.forEach((listener) => listener({ status, detail, userId: context.cloud ? context.owner : null }));
  };
  const enqueue = (context, operation) => {
    const result = context.queue.then(operation);
    context.queue = result.catch(() => {});
    return result;
  };
  const enqueueLocal = (context, operation) => {
    const result = context.localQueue.then(operation);
    context.localQueue = result.catch(() => {});
    return result;
  };

  async function synchronize(context) {
    if (!active(context)) return { status: "cancelled" };
    const revision = context.revision;
    const current = () => active(context) && context.revision === revision;
    const writeLocal = (operation) => enqueueLocal(context, () => current() ? operation() : undefined);
    const { local, cloud } = context;
    if (!cloud) return { status: "local", count: (await local.list()).length };
    emit(context, "syncing");
    try {
      await context.localQueue;
      const [localPlans, cloudPlans, tombstones, cloudTombstones] = await Promise.all([
        local.list(), cloud.list(), local.listTombstones(), cloud.listTombstones(),
      ]);
      if (!current()) return { status: "cancelled" };
      const actions = buildPlanSyncActions(localPlans, cloudPlans, tombstones, cloudTombstones);
      const deletions = new Map();
      for (const item of [...cloudTombstones, ...tombstones]) {
        if (!deletions.has(item.id) || timestamp(item.deletedAt) > timestamp(deletions.get(item.id))) deletions.set(item.id, item.deletedAt);
      }
      const reconcile = async (id, result) => {
        if (!current() || !result) return;
        if (result.plan) await writeLocal(() => local.put(result.plan));
        else if (result.deletedAt) {
          await writeLocal(async () => {
            await local.delete(id, result.deletedAt);
            await local.clearTombstone(id);
          });
        }
      };
      const tasks = [
        ...actions.deleteCloud.map((id) => async () => reconcile(id, await cloud.delete(id, deletions.get(id)))),
        ...actions.upload.map((plan) => async () => reconcile(plan.id, await cloud.put(plan))),
        ...actions.download.map((plan) => () => writeLocal(() => local.put(plan))),
        ...actions.deleteLocal.map(({ id, deletedAt }) => () => writeLocal(async () => {
          const current = (await local.list()).find((plan) => plan.id === id);
          if (current && timestamp(current.updatedAt) > timestamp(deletedAt)) return;
          await local.delete(id, deletedAt);
          await local.clearTombstone(id);
        })),
        ...actions.clearTombstone.map((id) => () => writeLocal(() => local.clearTombstone(id))),
      ];
      for (const task of tasks) {
        if (!current()) return { status: "cancelled" };
        await task();
      }
      const plans = await local.list();
      if (!current()) return { status: "cancelled" };
      emit(context, "synced", `${plans.length}件`);
      return { status: active(context) ? "synced" : "cancelled", count: plans.length, actions };
    } catch (error) {
      if (!current()) return { status: "cancelled" };
      emit(context, globalThis.navigator?.onLine === false ? "offline" : "pending", error.message || "同期を完了できませんでした");
      throw error;
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      listener({ status, detail: "", userId: session.cloud ? session.owner : null });
      return () => listeners.delete(listener);
    },
    getUserId: () => session.cloud ? session.owner : null,
    connect(userId, cloud, { syncNow = true } = {}) {
      session = makeSession(String(userId), cloud);
      localRepository.setOwner(session.owner);
      emit(session, "pending");
      const context = session;
      return syncNow ? enqueue(context, () => synchronize(context)) : Promise.resolve(null);
    },
    disconnect() {
      session = makeSession(GUEST_PLAN_OWNER);
      localRepository.setOwner(GUEST_PLAN_OWNER);
      emit(session, "local");
    },
    list: () => session.local.list(),
    listGuestPlans: () => localRepository.listForOwner(GUEST_PLAN_OWNER),
    copyGuestPlans: (userId) => localRepository.copyOwnerPlans(GUEST_PLAN_OWNER, userId),
    async put(plan) {
      const context = session;
      const savedPlan = structuredClone(plan);
      context.revision += 1;
      await enqueueLocal(context, () => context.local.put(savedPlan));
      if (context.cloud && active(context)) {
        emit(context, "pending");
        enqueue(context, () => synchronize(context)).catch(() => {});
      }
      return savedPlan;
    },
    async delete(id) {
      const context = session;
      const deletedAt = new Date().toISOString();
      context.revision += 1;
      await enqueueLocal(context, () => context.local.delete(id, deletedAt));
      if (context.cloud && active(context)) {
        emit(context, "pending");
        enqueue(context, () => synchronize(context)).catch(() => {});
      }
    },
    sync() {
      const context = session;
      return enqueue(context, () => synchronize(context));
    },
  };
}
