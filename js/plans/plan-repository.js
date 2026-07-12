const DATABASE_NAME = "celestiframe";
const STORE_NAME = "plans";

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("保存領域を操作できません"));
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("保存領域を開けません"));
  });
}

export function createPlanRepository() {
  async function store(mode = "readonly") {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, mode);
    transaction.oncomplete = () => database.close();
    transaction.onabort = () => database.close();
    transaction.onerror = () => database.close();
    return transaction.objectStore(STORE_NAME);
  }

  return {
    async list() {
      const plans = await requestResult((await store()).getAll());
      return plans.sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.updatedAt.localeCompare(a.updatedAt));
    },
    async put(plan) { await requestResult((await store("readwrite")).put(plan)); return plan; },
    async delete(id) { await requestResult((await store("readwrite")).delete(id)); },
  };
}
