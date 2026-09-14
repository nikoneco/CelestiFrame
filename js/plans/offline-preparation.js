import { createOfflineStore, offlineRecordKey } from "./offline-store.js?v=1.9.1";

export const OFFLINE_PARTS = Object.freeze([
  "elevation",
  "terrain",
  "lightPollution",
  "forecast",
]);
export const OFFLINE_PART_STATUSES = Object.freeze(["pending", "ready", "unavailable", "failed"]);
export const OFFLINE_PREPARATION_VERSION = 1;

const DEFAULT_OWNER = "guest";

const isObject = (value) => value && typeof value === "object";
const normalizeOwner = (ownerId) => String(ownerId || DEFAULT_OWNER);
const normalizePlanId = (planId) => String(planId || "");

function cloneValue(value) {
  if (value == null) return value;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  if (typeof value === "number" && Object.is(value, -0)) return 0;
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

// A compact deterministic signature is sufficient here: it is a lookup guard,
// not a cryptographic identity.  The complete state is also retained in the
// plan itself and is revalidated before an offline snapshot is applied.
export function offlineStateSignature(planOrState) {
  const state = isObject(planOrState?.state) ? planOrState.state : planOrState;
  const text = stableStringify(state || {});
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function offlineStateKey(planOrState) {
  const state = isObject(planOrState?.state) ? planOrState.state : planOrState;
  return stableStringify(state || {});
}

function dateOrNow(value, now) {
  const parsed = new Date(value || now()).getTime();
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date(now()).toISOString();
}

function planContext(plan) {
  const state = plan?.state || {};
  const copyLocation = (location) => location && {
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
  };
  return {
    selectedDateTime: String(state.selectedDateTime || ""),
    cameraLocation: copyLocation(state.cameraLocation),
    subjectLocation: copyLocation(state.subjectLocation),
  };
}

function emptyParts() {
  return Object.fromEntries(OFFLINE_PARTS.map((name) => [name, { status: "pending" }]));
}

function normalizePart(value, now) {
  if (value == null) return { status: "failed", error: "この項目の取得結果がありません" };
  const source = isObject(value) ? value : { data: value };
  const status = OFFLINE_PART_STATUSES.includes(source.status)
    ? source.status
    : "ready";
  const normalized = {
    ...cloneValue(source),
    status,
    fetchedAt: status === "ready" || source.fetchedAt ? dateOrNow(source.fetchedAt, now) : null,
  };
  if (normalized.error != null) normalized.error = String(normalized.error).slice(0, 500);
  if (normalized.lastError != null) normalized.lastError = String(normalized.lastError).slice(0, 500);
  if (normalized.error == null && normalized.lastError != null) normalized.error = normalized.lastError;
  return normalized;
}

function normalizeParts(value, now) {
  const parts = isObject(value?.parts) ? value.parts : value;
  return Object.fromEntries(OFFLINE_PARTS.map((name) => [name, normalizePart(parts?.[name], now)]));
}

function completedStatus(parts) {
  const complete = OFFLINE_PARTS.every((name) => {
    const part = parts[name];
    return part?.status === "ready" && !part.error && !part.lastError;
  });
  return complete
    ? "ready"
    : "partial";
}

function partError(part) {
  const value = part?.error || part?.lastError;
  return value == null ? "この項目の更新に失敗しました" : String(value).slice(0, 500);
}

function mergePart(existing, incoming) {
  const next = cloneValue(incoming) || { status: "failed", error: "この項目の取得結果がありません" };
  // A retry must not throw away a usable local snapshot just because one
  // source failed.  Keep the old value/fetchedAt, while recording the new
  // failure so the result remains visibly partial and is never presented as
  // a completely fresh preparation.
  if (next.status === "failed" && existing?.status === "ready") {
    const refreshError = partError(next);
    return {
      ...cloneValue(existing),
      status: "ready",
      reused: true,
      error: refreshError,
      lastError: refreshError,
    };
  }
  return { ...next, reused: false };
}

function isCancellation(error) {
  return error?.name === "AbortError" || error?.code === "OFFLINE_PREPARATION_STALE";
}

function cancellationError(message = "オフライン準備が取り消されました") {
  const error = new Error(message);
  error.name = "AbortError";
  error.code = "OFFLINE_PREPARATION_STALE";
  return error;
}

function emitProgress(listener, value) {
  if (typeof listener !== "function") return;
  try {
    listener(Object.freeze({ ...value }));
  } catch (error) {
    // Progress display code must never break data preparation.
    console.warn("Offline preparation progress listener failed", error);
  }
}

function baseRecord(plan, ownerId, signature, now) {
  const timestamp = new Date(now()).toISOString();
  return {
    key: offlineRecordKey({ ownerId, planId: plan.id, stateSignature: signature }),
    schemaVersion: OFFLINE_PREPARATION_VERSION,
    ownerId,
    planId: normalizePlanId(plan.id),
    stateSignature: signature,
    stateKey: offlineStateKey(plan),
    planUpdatedAt: dateOrNow(plan.updatedAt, now),
    context: planContext(plan),
    status: "partial",
    preparing: true,
    preparationStartedAt: timestamp,
    lastError: null,
    updatedAt: timestamp,
    parts: emptyParts(),
  };
}

function getPartSummary(parts) {
  return Object.fromEntries(OFFLINE_PARTS.map((name) => {
    const part = parts?.[name] || { status: "pending" };
    return [name, {
      status: OFFLINE_PART_STATUSES.includes(part.status) ? part.status : "failed",
      fetchedAt: part.fetchedAt || null,
      reused: Boolean(part.reused),
      source: part.source || part.descriptor?.source || null,
      error: part.error || null,
      lastError: part.lastError || null,
    }];
  }));
}

/**
 * Coordinate local persistence of data acquired by the app's field-data
 * collector.  The collector remains outside this module so its network and
 * browser-cache policy can evolve independently from the plan store.
 */
export function createOfflinePreparation({
  store = createOfflineStore(),
  sources = {},
  now = () => new Date(),
} = {}) {
  const active = new Map();
  const writes = new Map();

  // IndexedDB writes cannot be aborted once their request has started.  Keep
  // writes for one owner/plan in order so an old generation cannot finish
  // after a newer retry and overwrite its snapshot.
  function enqueueWrite(key, task) {
    const previous = writes.get(key) || Promise.resolve();
    const current = previous.catch(() => {}).then(task);
    writes.set(key, current);
    current.then(
      () => { if (writes.get(key) === current) writes.delete(key); },
      () => { if (writes.get(key) === current) writes.delete(key); },
    );
    return current;
  }

  function operationKey(ownerId, planId) {
    return `${normalizeOwner(ownerId)}\u001f${normalizePlanId(planId)}`;
  }

  function cancel(plan, { ownerId = DEFAULT_OWNER } = {}) {
    const key = operationKey(ownerId, plan?.id);
    const operation = active.get(key);
    if (operation) {
      operation.cancelRequested = true;
      operation.controller.abort(cancellationError());
    }
    return Boolean(operation);
  }

  async function remove(plan, { ownerId = DEFAULT_OWNER } = {}) {
    const key = operationKey(ownerId, plan?.id);
    const operation = active.get(key);
    if (operation) {
      operation.discard = true;
      operation.cancelRequested = true;
      operation.controller.abort(cancellationError());
      // Wait for an in-flight IndexedDB write to settle before deleting.  A
      // delete issued first could otherwise be followed by the old prepare's
      // final put, leaving a misleading `preparing` record behind.
      await operation.done;
    }
    await store.delete({ ownerId, planId: plan?.id });
  }

  async function get(plan, { ownerId = DEFAULT_OWNER } = {}) {
    if (!plan?.id) return null;
    const signature = offlineStateSignature(plan);
    const stateKey = offlineStateKey(plan);
    const record = await store.get({ ownerId, planId: plan.id, stateSignature: signature });
    if (!record || record.stateSignature !== signature || record.stateKey !== stateKey || record.ownerId !== normalizeOwner(ownerId)) return null;
    return cloneValue(record);
  }

  async function getStatus(plan, { ownerId = DEFAULT_OWNER } = {}) {
    if (!plan?.id) return null;
    const normalizedOwner = normalizeOwner(ownerId);
    const signature = offlineStateSignature(plan);
    const stateKey = offlineStateKey(plan);
    const key = operationKey(normalizedOwner, plan.id);
    const running = active.get(key);
    if (running?.signature === signature && running.record?.stateKey === stateKey) {
      return {
        status: running.record.status,
        preparing: true,
        lastError: running.record.lastError || running.record.error || null,
        updatedAt: running.record.updatedAt,
        planUpdatedAt: running.record.planUpdatedAt,
        stateSignature: running.record.stateSignature,
        stateKey: running.record.stateKey,
        parts: getPartSummary(running.record.parts),
      };
    }
    const record = await store.get({ ownerId: normalizedOwner, planId: plan.id, stateSignature: signature, includeData: false });
    if (!record) return null;
    if (record.stateSignature !== signature || record.stateKey !== stateKey || record.ownerId !== normalizedOwner) return null;
    return {
      status: record.status,
      preparing: Boolean(record.preparing),
      lastError: record.lastError || record.error || null,
      updatedAt: record.updatedAt,
      planUpdatedAt: record.planUpdatedAt,
      stateSignature: record.stateSignature,
      stateKey: record.stateKey,
      parts: getPartSummary(record.parts),
    };
  }

  async function prepare(plan, {
    ownerId = DEFAULT_OWNER,
    signal,
    onProgress,
    isCurrent,
    collect,
    sources: localSources = {},
    timeoutMs = 60_000,
  } = {}) {
    if (!plan?.id || !isObject(plan.state)) throw new TypeError("オフライン準備には計画が必要です");
    const normalizedOwner = normalizeOwner(ownerId);
    const planId = normalizePlanId(plan.id);
    const signature = offlineStateSignature(plan);
    const stateKey = offlineStateKey(plan);
    const key = operationKey(normalizedOwner, planId);
    const previous = active.get(key);
    if (previous) {
      previous.superseded = true;
      previous.controller.abort(cancellationError());
    }
    const controller = new AbortController();
    const timeout = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
      ? setTimeout(() => {
        const error = new Error("オフライン準備がタイムアウトしました。再試行してください");
        error.name = "TimeoutError";
        controller.abort(error);
      }, Number(timeoutMs))
      : null;
    const abortExternal = () => controller.abort(signal.reason || cancellationError());
    if (signal?.aborted) controller.abort(signal.reason || cancellationError());
    else signal?.addEventListener("abort", abortExternal, { once: true });
    let resolveDone;
    const done = new Promise((resolve) => { resolveDone = resolve; });
    const operation = {
      controller,
      signature,
      done,
      superseded: false,
      discard: false,
      cancelRequested: false,
      record: null,
    };
    active.set(key, operation);
    const current = () => active.get(key) === operation && !controller.signal.aborted;
    const ensureCurrent = async () => {
      if (!current()) throw cancellationError();
      if (typeof isCurrent === "function") {
        const stillCurrent = await isCurrent({ plan, ownerId: normalizedOwner, stateSignature: signature });
        // The repository check itself is asynchronous.  A delete or retry
        // may have superseded this operation while it was waiting.
        if (!stillCurrent || !current()) {
          throw cancellationError("計画が変更または削除されたため、オフライン準備を破棄しました");
        }
      }
    };
    const timestamp = () => new Date(now()).toISOString();
    let record = baseRecord(plan, normalizedOwner, signature, now);
    operation.record = record;
    let previousRecord = null;
    let persistedCandidate = false;
    let storageFailure = null;
    const persistRecord = async () => {
      await ensureCurrent();
      try {
        const stored = await enqueueWrite(key, async () => {
          if (!current()) throw cancellationError();
          return store.put(record);
        });
        persistedCandidate = true;
        return stored;
      } catch (error) {
        if (!isCancellation(error)) storageFailure = error;
        throw error;
      }
    };
    const persistFailureRecord = async () => {
      try {
        const stored = await enqueueWrite(key, async () => {
          if (active.get(key) !== operation || operation.superseded || operation.discard) throw cancellationError();
          return store.put(record);
        });
        persistedCandidate = true;
        return stored;
      } catch (error) {
        if (!isCancellation(error)) storageFailure = error;
        throw error;
      }
    };
    const deleteCandidate = async () => {
      if (!persistedCandidate || previousRecord || operation.superseded) return;
      try {
        await enqueueWrite(key, async () => {
          if (active.get(key) !== operation) return;
          await store.delete({ ownerId: normalizedOwner, planId, stateSignature: signature });
        });
      } catch (error) {
        record.storageError = String(error?.message || error).slice(0, 500);
      }
    };
    const report = (phase, extra = {}) => emitProgress(onProgress, {
      phase,
      part: null,
      completed: 0,
      total: OFFLINE_PARTS.length,
      status: record.status,
      fetchedAt: null,
      ...extra,
    });
    try {
      await ensureCurrent();
      const storedPrevious = await store.get({ ownerId: normalizedOwner, planId, stateSignature: signature });
      await ensureCurrent();
      if (storedPrevious?.stateKey === stateKey && !storedPrevious.preparing && storedPrevious.parts) {
        previousRecord = storedPrevious;
        record.parts = cloneValue(storedPrevious.parts);
        Object.values(record.parts).forEach((part) => {
          if (part?.status === "ready") part.reused = true;
        });
        record.previousUpdatedAt = storedPrevious.updatedAt || null;
      }
      // While a settled snapshot exists, keep it intact until this retry has
      // a complete result.  This is what makes a quota error or cancellation
      // safe: the last usable data remains available for field mode.
      if (!previousRecord) await persistRecord();
      report("start");
      const sourceOptions = { ...sources, ...localSources };
      const prepareParts = collect || sourceOptions.prepareParts;
      if (typeof prepareParts !== "function") throw new Error("オフライン準備の取得処理が設定されていません");
      const onPart = async (partName, value) => {
        if (!OFFLINE_PARTS.includes(partName)) throw new Error(`未知のオフライン準備項目です: ${partName}`);
        await ensureCurrent();
        record.parts[partName] = mergePart(record.parts[partName], normalizePart(value, now));
        record.status = completedStatus(record.parts);
        record.updatedAt = timestamp();
        if (!previousRecord) await persistRecord();
        const completed = OFFLINE_PARTS.filter((name) => record.parts[name].status !== "pending").length;
        emitProgress(onProgress, {
          phase: "part",
          part: partName,
          completed,
          total: OFFLINE_PARTS.length,
          status: record.parts[partName].status,
          fetchedAt: record.parts[partName].fetchedAt,
        });
      };
      const collected = await prepareParts(plan, {
        signal: controller.signal,
        ownerId: normalizedOwner,
        stateSignature: signature,
        onProgress: (progress = {}) => emitProgress(onProgress, {
          phase: progress.phase || (progress.part && progress.status && progress.status !== "loading" ? "part" : "collect"),
          part: progress.part || null,
          completed: Number(progress.completed) || 0,
          total: Number(progress.total) || OFFLINE_PARTS.length,
          status: progress.status || record.status,
          fetchedAt: progress.fetchedAt || null,
        }),
        onPart,
      });
      await ensureCurrent();
      if (collected) {
        const collectedParts = isObject(collected?.parts) ? collected.parts : collected;
        for (const partName of OFFLINE_PARTS) {
          // Collectors that stream through onPart may intentionally omit a
          // part from their aggregate return.  Do not turn that omission into
          // a new failure when an earlier callback already supplied data.
          if (collectedParts?.[partName] == null && record.parts[partName]?.status !== "pending") continue;
          record.parts[partName] = mergePart(record.parts[partName], normalizePart(collectedParts?.[partName], now));
        }
      }
      record.status = completedStatus(record.parts);
      record.preparing = false;
      record.lastError = null;
      record.updatedAt = timestamp();
      await persistRecord();
      emitProgress(onProgress, {
        phase: "complete",
        completed: OFFLINE_PARTS.filter((name) => record.parts[name].status !== "pending").length,
        total: OFFLINE_PARTS.length,
        status: record.status,
        fetchedAt: timestamp(),
      });
      return cloneValue(record);
    } catch (error) {
      const timeoutFailure = error?.name === "TimeoutError" || controller.signal.reason?.name === "TimeoutError";
      const cancelled = isCancellation(error) || (!current() && !timeoutFailure);
      if (cancelled) {
        await deleteCandidate();
        return { status: "cancelled", key: record.key, stateSignature: signature };
      }
      record.status = "failed";
      record.error = String(error?.message || error).slice(0, 500);
      record.lastError = record.error;
      record.preparing = false;
      record.updatedAt = timestamp();
      if (storageFailure) {
        record.storageError = String(storageFailure?.message || storageFailure).slice(0, 500);
        await deleteCandidate();
      } else if (active.get(key) === operation && !operation.superseded && !operation.discard) {
        try {
          await persistFailureRecord();
        } catch (failureStorageError) {
          storageFailure = failureStorageError;
          record.storageError = String(failureStorageError?.message || failureStorageError).slice(0, 500);
          await deleteCandidate();
        }
      }
      emitProgress(onProgress, { phase: "failed", status: "failed", error: record.error });
      return cloneValue(record);
    } finally {
      if (timeout) clearTimeout(timeout);
      signal?.removeEventListener("abort", abortExternal);
      if (active.get(key) === operation) active.delete(key);
      resolveDone();
    }
  }

  return {
    prepare,
    get,
    getStatus,
    remove,
    cancel,
    store,
  };
}
