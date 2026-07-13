import { GUEST_PLAN_OWNER } from "../plans/plan-repository.js?v=15";

const timestamp = (value) => {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

export function buildPlanSyncActions(localPlans, cloudPlans, tombstones) {
  const localById = new Map(localPlans.map((plan) => [plan.id, plan]));
  const cloudById = new Map(cloudPlans.map((plan) => [plan.id, plan]));
  const actions = { upload: [], download: [], deleteCloud: [], clearTombstone: [] };

  tombstones.forEach((tombstone) => {
    const cloudPlan = cloudById.get(tombstone.id);
    if (cloudPlan && timestamp(cloudPlan.updatedAt) > timestamp(tombstone.deletedAt)) {
      actions.download.push(cloudPlan);
    } else if (cloudPlan) {
      actions.deleteCloud.push(tombstone.id);
    }
    actions.clearTombstone.push(tombstone.id);
    localById.delete(tombstone.id);
    cloudById.delete(tombstone.id);
  });

  new Set([...localById.keys(), ...cloudById.keys()]).forEach((id) => {
    const localPlan = localById.get(id);
    const cloudPlan = cloudById.get(id);
    if (!cloudPlan) actions.upload.push(localPlan);
    else if (!localPlan) actions.download.push(cloudPlan);
    else if (timestamp(localPlan.updatedAt) > timestamp(cloudPlan.updatedAt)) actions.upload.push(localPlan);
    else if (timestamp(cloudPlan.updatedAt) > timestamp(localPlan.updatedAt)) actions.download.push(cloudPlan);
  });

  return actions;
}

export function createPlanSyncCoordinator(localRepository) {
  let cloudRepository = null;
  let userId = null;
  let status = "local";
  const listeners = new Set();

  const emit = (nextStatus, detail = "") => {
    status = nextStatus;
    listeners.forEach((listener) => listener({ status, detail, userId }));
  };

  async function sync() {
    if (!cloudRepository || !userId) return { status: "local", count: (await localRepository.list()).length };
    emit("syncing");
    try {
      const [localPlans, cloudPlans, tombstones] = await Promise.all([
        localRepository.list(),
        cloudRepository.list(),
        localRepository.listTombstones(),
      ]);
      const actions = buildPlanSyncActions(localPlans, cloudPlans, tombstones);
      for (const id of actions.deleteCloud) await cloudRepository.delete(id);
      for (const plan of actions.upload) await cloudRepository.put(plan);
      for (const plan of actions.download) await localRepository.put(plan);
      for (const id of actions.clearTombstone) await localRepository.clearTombstone(id);
      const plans = await localRepository.list();
      emit("synced", `${plans.length}件`);
      return { status: "synced", count: plans.length, actions };
    } catch (error) {
      emit(navigator.onLine === false ? "offline" : "pending", error.message || "同期を完了できませんでした");
      throw error;
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      listener({ status, detail: "", userId });
      return () => listeners.delete(listener);
    },
    getUserId: () => userId,
    async connect(nextUserId, nextCloudRepository, { syncNow = true } = {}) {
      userId = String(nextUserId);
      cloudRepository = nextCloudRepository;
      localRepository.setOwner(userId);
      emit("pending");
      return syncNow ? sync() : null;
    },
    disconnect() {
      userId = null;
      cloudRepository = null;
      localRepository.setOwner(GUEST_PLAN_OWNER);
      emit("local");
    },
    list: () => localRepository.list(),
    listGuestPlans: () => localRepository.listForOwner(GUEST_PLAN_OWNER),
    copyGuestPlans: (targetUserId) => localRepository.copyOwnerPlans(GUEST_PLAN_OWNER, targetUserId),
    async put(plan) {
      await localRepository.put(plan);
      if (!cloudRepository) return plan;
      emit("syncing");
      try {
        await cloudRepository.put(plan);
        emit("synced");
      } catch (error) {
        emit(navigator.onLine === false ? "offline" : "pending", error.message || "クラウドへ未送信");
      }
      return plan;
    },
    async delete(id) {
      await localRepository.delete(id);
      if (!cloudRepository) return;
      emit("syncing");
      try {
        await cloudRepository.delete(id);
        await localRepository.clearTombstone(id);
        emit("synced");
      } catch (error) {
        emit(navigator.onLine === false ? "offline" : "pending", error.message || "削除をクラウドへ未送信");
      }
    },
    sync,
  };
}
