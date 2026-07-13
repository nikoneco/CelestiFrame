const DATABASE_NAME = "celestiframe";
const DATABASE_VERSION = 2;
const LEGACY_STORE_NAME = "plans";
const STORE_NAME = "scoped-plans";
const TOMBSTONE_STORE_NAME = "scoped-plan-tombstones";
const OWNER_INDEX = "ownerId";

export const GUEST_PLAN_OWNER = "guest";

const normalizeOwner = (ownerId) => String(ownerId || GUEST_PLAN_OWNER);
export const scopedPlanKey = (ownerId, planId) => `${normalizeOwner(ownerId)}:${String(planId)}`;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("保存領域を操作できません"));
  });
}

function transactionResult(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error("保存処理が中断されました"));
    transaction.onerror = () => reject(transaction.error || new Error("保存領域を操作できません"));
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(LEGACY_STORE_NAME)) {
        database.createObjectStore(LEGACY_STORE_NAME, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const scopedStore = database.createObjectStore(STORE_NAME, { keyPath: "key" });
        scopedStore.createIndex(OWNER_INDEX, OWNER_INDEX, { unique: false });
        const legacyStore = request.transaction.objectStore(LEGACY_STORE_NAME);
        legacyStore.openCursor().onsuccess = (event) => {
          const cursor = event.target.result;
          if (!cursor) return;
          const plan = cursor.value;
          scopedStore.put({
            key: scopedPlanKey(GUEST_PLAN_OWNER, plan.id),
            ownerId: GUEST_PLAN_OWNER,
            plan,
          });
          cursor.continue();
        };
      }
      if (!database.objectStoreNames.contains(TOMBSTONE_STORE_NAME)) {
        const tombstoneStore = database.createObjectStore(TOMBSTONE_STORE_NAME, { keyPath: "key" });
        tombstoneStore.createIndex(OWNER_INDEX, OWNER_INDEX, { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("保存領域を開けません"));
  });
}

async function runTransaction(storeNames, mode, operation) {
  const database = await openDatabase();
  const transaction = database.transaction(storeNames, mode);
  const completion = transactionResult(transaction);
  try {
    const result = await operation(transaction);
    await completion;
    return result;
  } finally {
    database.close();
  }
}

const unwrapPlan = (record) => structuredClone(record.plan);

export function createPlanRepository(initialOwner = GUEST_PLAN_OWNER) {
  let ownerId = normalizeOwner(initialOwner);

  async function listForOwner(targetOwner = ownerId) {
    const normalizedOwner = normalizeOwner(targetOwner);
    return runTransaction([STORE_NAME], "readonly", async (transaction) => {
      const records = await requestResult(transaction.objectStore(STORE_NAME).index(OWNER_INDEX).getAll(normalizedOwner));
      return records
        .map(unwrapPlan)
        .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.updatedAt.localeCompare(a.updatedAt));
    });
  }

  async function putForOwner(plan, targetOwner = ownerId) {
    const normalizedOwner = normalizeOwner(targetOwner);
    const key = scopedPlanKey(normalizedOwner, plan.id);
    await runTransaction([STORE_NAME, TOMBSTONE_STORE_NAME], "readwrite", async (transaction) => {
      transaction.objectStore(STORE_NAME).put({ key, ownerId: normalizedOwner, plan: structuredClone(plan) });
      transaction.objectStore(TOMBSTONE_STORE_NAME).delete(key);
    });
    return plan;
  }

  return {
    setOwner(nextOwner) { ownerId = normalizeOwner(nextOwner); },
    getOwner() { return ownerId; },
    list: () => listForOwner(ownerId),
    listForOwner,
    put: (plan) => putForOwner(plan, ownerId),
    putForOwner,
    async delete(id, deletedAt = new Date().toISOString()) {
      const key = scopedPlanKey(ownerId, id);
      await runTransaction([STORE_NAME, TOMBSTONE_STORE_NAME], "readwrite", async (transaction) => {
        transaction.objectStore(STORE_NAME).delete(key);
        if (ownerId !== GUEST_PLAN_OWNER) {
          transaction.objectStore(TOMBSTONE_STORE_NAME).put({ key, ownerId, id: String(id), deletedAt });
        }
      });
    },
    async listTombstones(targetOwner = ownerId) {
      const normalizedOwner = normalizeOwner(targetOwner);
      return runTransaction([TOMBSTONE_STORE_NAME], "readonly", (transaction) => (
        requestResult(transaction.objectStore(TOMBSTONE_STORE_NAME).index(OWNER_INDEX).getAll(normalizedOwner))
      ));
    },
    async clearTombstone(id, targetOwner = ownerId) {
      await runTransaction([TOMBSTONE_STORE_NAME], "readwrite", async (transaction) => {
        transaction.objectStore(TOMBSTONE_STORE_NAME).delete(scopedPlanKey(targetOwner, id));
      });
    },
    async copyOwnerPlans(fromOwner, toOwner) {
      const sourcePlans = await listForOwner(fromOwner);
      for (const plan of sourcePlans) await putForOwner(plan, toOwner);
      return sourcePlans.length;
    },
  };
}
