/**
 * Local-only storage for the data prepared for a shooting plan.
 *
 * This database is intentionally separate from the plan repository.  A plan
 * may be synced to Firestore, while the potentially large, device-specific
 * preparation data must stay on the device that collected it.
 */

export const OFFLINE_DATABASE_NAME = "celestiframe-offline-v1";
export const OFFLINE_DATABASE_VERSION = 1;
export const OFFLINE_STORE_NAME = "prepared-plans";
export const OFFLINE_OWNER_PLAN_INDEX = "ownerPlan";

const normalizeOwner = (ownerId) => String(ownerId || "guest");
const normalizePlanId = (planId) => String(planId || "");

export function offlineOwnerPlanKey(ownerId, planId) {
  return `${normalizeOwner(ownerId)}\u001f${normalizePlanId(planId)}`;
}

export function offlineRecordKey({ ownerId, planId, stateSignature }) {
  return JSON.stringify([
    normalizeOwner(ownerId),
    normalizePlanId(planId),
    String(stateSignature || ""),
  ]);
}

function cloneValue(value) {
  if (value == null) return value;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function projectSummary(record) {
  if (!record) return null;
  const parts = Object.fromEntries(Object.entries(record.parts || {}).map(([name, part]) => [name, {
    status: part?.status,
    fetchedAt: part?.fetchedAt || null,
    reused: Boolean(part?.reused),
    source: part?.source || part?.descriptor?.source || null,
    error: part?.error || null,
    lastError: part?.lastError || null,
  }]));
  return { ...record, parts };
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("オフライン保存領域を操作できません"));
  });
}

function transactionResult(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error("オフライン保存処理が中断されました"));
    transaction.onerror = () => reject(transaction.error || new Error("オフライン保存領域を操作できません"));
  });
}

function openDatabase(indexedDBImpl, databaseName, databaseVersion) {
  if (!indexedDBImpl?.open) throw new Error("この端末ではオフライン保存を利用できません");
  return new Promise((resolve, reject) => {
    const request = indexedDBImpl.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const database = request.result;
      let store;
      if (!database.objectStoreNames.contains(OFFLINE_STORE_NAME)) {
        store = database.createObjectStore(OFFLINE_STORE_NAME, { keyPath: "key" });
      } else {
        store = request.transaction.objectStore(OFFLINE_STORE_NAME);
      }
      if (!store.indexNames.contains(OFFLINE_OWNER_PLAN_INDEX)) {
        store.createIndex(OFFLINE_OWNER_PLAN_INDEX, "ownerPlan", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("オフライン保存領域を開けません"));
    request.onblocked = () => reject(new Error("オフライン保存領域が別の画面で使用中です"));
  });
}

async function runTransaction({ indexedDBImpl, databaseName, databaseVersion }, mode, operation) {
  const database = await openDatabase(indexedDBImpl, databaseName, databaseVersion);
  const transaction = database.transaction([OFFLINE_STORE_NAME], mode);
  const completion = transactionResult(transaction);
  try {
    const result = await operation(transaction.objectStore(OFFLINE_STORE_NAME));
    await completion;
    return result;
  } finally {
    database.close();
  }
}

/**
 * Create the local preparation store.
 *
 * `indexedDBImpl` is injectable so storage behavior can be tested without a
 * browser.  The returned methods clone values at both boundaries so callers
 * cannot mutate an already stored preparation by retaining an object reference.
 */
export function createOfflineStore({
  indexedDBImpl = globalThis.indexedDB,
  databaseName = OFFLINE_DATABASE_NAME,
  databaseVersion = OFFLINE_DATABASE_VERSION,
} = {}) {
  const options = { indexedDBImpl, databaseName, databaseVersion };

  return {
    async get({ ownerId = "guest", planId, stateSignature, includeData = true }) {
      const key = offlineRecordKey({ ownerId, planId, stateSignature });
      return runTransaction(options, "readonly", async (store) => {
        const record = await requestResult(store.get(key));
        return record ? (includeData ? cloneValue(record) : projectSummary(record)) : null;
      });
    },

    async listByPlan({ ownerId = "guest", planId }) {
      const ownerPlan = offlineOwnerPlanKey(ownerId, planId);
      return runTransaction(options, "readonly", async (store) => {
        const records = await requestResult(store.index(OFFLINE_OWNER_PLAN_INDEX).getAll(ownerPlan));
        return records.map(cloneValue);
      });
    },

    async put(record) {
      if (!record || typeof record !== "object") throw new TypeError("オフライン準備データが正しくありません");
      const normalized = {
        ...cloneValue(record),
        ownerId: normalizeOwner(record.ownerId),
        planId: normalizePlanId(record.planId),
        stateSignature: String(record.stateSignature || ""),
        ownerPlan: offlineOwnerPlanKey(record.ownerId, record.planId),
        key: record.key || offlineRecordKey(record),
      };
      return runTransaction(options, "readwrite", async (store) => {
        await requestResult(store.put(normalized));
        return cloneValue(normalized);
      });
    },

    async delete({ ownerId = "guest", planId, stateSignature } = {}) {
      if (stateSignature) {
        const key = offlineRecordKey({ ownerId, planId, stateSignature });
        return runTransaction(options, "readwrite", async (store) => {
          await requestResult(store.delete(key));
        });
      }
      const ownerPlan = offlineOwnerPlanKey(ownerId, planId);
      return runTransaction(options, "readwrite", async (store) => {
        const keys = await requestResult(store.index(OFFLINE_OWNER_PLAN_INDEX).getAllKeys(ownerPlan));
        keys.forEach((key) => store.delete(key));
      });
    },
  };
}
