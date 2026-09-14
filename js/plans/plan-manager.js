import { MAX_PLAN_IMPORT_BYTES, buildShareUrl, createPlan, defaultPlanName, normalizePlan, parsePlansFile, serializePlans } from "./plan-data.js?v=1.9.1";
import { createPlanRepository, GUEST_PLAN_OWNER } from "./plan-repository.js?v=1.9.1";
import { buildGoogleMapsDirectionsUrl, buildGoogleMapsSearchUrl } from "../map/google-maps-url.js?v=1.9.1";
import { targetLabelList } from "../astronomy/target-catalog.js?v=1.9.1";
import { offlineStateSignature } from "./offline-preparation.js?v=1.9.1";

const formatDateTime = (value) => new Intl.DateTimeFormat("ja-JP", {
  year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
}).format(new Date(value));
const bodyLabel = (state) => targetLabelList(state.selectedTargets, { short: true }).join("＋");

function downloadText(filename, text) {
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch (error) {
      console.warn("Clipboard API failed; trying legacy copy", error);
    }
  }
  const input = document.createElement("textarea");
  input.value = value;
  document.body.append(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("共有内容をクリップボードへコピーできませんでした");
}

export function createPlanSharePayload(plan, baseUrl = location.href) {
  const subjectLabel = plan.state.subjectLocation
    ? `${plan.state.subject.name || "被写体"}・${bodyLabel(plan.state)}`
    : `撮影地点のみ・${bodyLabel(plan.state)}`;
  const lines = [
    `撮影計画「${plan.name}」`,
    `撮影日時: ${formatDateTime(plan.state.selectedDateTime)}`,
    `対象: ${subjectLabel}`,
  ];
  if (plan.notes) lines.push(`メモ: ${plan.notes}`);
  return {
    title: `${plan.name} | CelestiFrame`,
    text: lines.join("\n"),
    url: buildShareUrl(plan.state, baseUrl),
  };
}

export async function sharePlan(plan, options = {}) {
  const runtimeNavigator = typeof navigator === "undefined" ? {} : navigator;
  const share = options.share ?? (typeof runtimeNavigator.share === "function" ? runtimeNavigator.share.bind(runtimeNavigator) : null);
  const copy = options.copy ?? copyText;
  const warn = options.warn ?? console.warn;
  const payload = createPlanSharePayload(plan, options.baseUrl);
  if (share) {
    try {
      await share(payload);
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
      warn("Native plan sharing failed; falling back to clipboard", error);
    }
  }
  await copy(`${payload.text}\n\n${payload.url}`);
  return "copied";
}

export async function deletePlanData(plan, { repository, offlinePreparation, ownerId }) {
  // The coordinator captures its session at invocation. Do not put any await
  // before this call: guest and signed-in copies can share a plan id.
  await repository.delete(plan.id);
  try {
    await offlinePreparation?.remove?.(plan, { ownerId });
    return null;
  } catch (error) {
    return error;
  }
}

export function createPlanRestoreRunner({ readOffline, applyState, getOwnerId }) {
  let generation = 0;
  async function restore(plan) {
    const currentGeneration = ++generation;
    const ownerId = getOwnerId();
    const isCurrent = () => generation === currentGeneration && getOwnerId() === ownerId;
    const offline = await readOffline(plan, { ownerId });
    if (!isCurrent()) return false;
    const applied = await applyState(plan.state, { plan, offline, isCurrent });
    return applied !== false && isCurrent() ? { offline } : false;
  }
  restore.cancel = () => { generation++; };
  return restore;
}

export function bindPlanManager(store, {
  applyState,
  showToast,
  repository = createPlanRepository(),
  offlinePreparation = null,
  getOfflineOwnerId = () => repository.getUserId?.() || GUEST_PLAN_OWNER,
  onFieldMode = null,
}) {
  const dialog = document.querySelector("#plans-dialog");
  const form = document.querySelector("#plan-form");
  const nameInput = document.querySelector("#plan-name");
  const notesInput = document.querySelector("#plan-notes");
  const saveButton = document.querySelector("#plan-save");
  const cancelEditButton = document.querySelector("#plan-cancel-edit");
  const list = document.querySelector("#plans-list");
  const count = document.querySelector("#plans-count");
  const mapDialog = document.querySelector("#plan-map-dialog");
  const mapPlanName = document.querySelector("#plan-map-name");
  const mapDirections = document.querySelector("#plan-map-directions");
  const mapCamera = document.querySelector("#plan-map-camera");
  const mapSubject = document.querySelector("#plan-map-subject");
  const mapRouteSubject = document.querySelector("#plan-map-route-subject");
  const moreDialog = document.querySelector("#plan-more-dialog");
  const morePlanName = document.querySelector("#plan-more-name");
  const offlineDetails = document.querySelector("#plan-offline-details");
  let editingId = null;
  let visiblePlans = [];
  let visiblePlansOwner = null;
  let refreshGeneration = 0;
  let morePlanId = null;
  let offlineStatuses = new Map();

  function offlineOwnerId() {
    try {
      return getOfflineOwnerId() || GUEST_PLAN_OWNER;
    } catch (error) {
      console.warn("Offline plan owner lookup failed", error);
      return GUEST_PLAN_OWNER;
    }
  }
  const restorePlan = createPlanRestoreRunner({ readOffline, applyState, getOwnerId: offlineOwnerId });
  dialog.addEventListener("close", () => restorePlan.cancel());

  async function readOffline(plan, { ownerId = offlineOwnerId() } = {}) {
    if (!offlinePreparation?.get) return null;
    try {
      return await offlinePreparation.get(plan, { ownerId });
    } catch (error) {
      console.warn("Offline plan data could not be read", error);
      return null;
    }
  }

  async function readOfflineStatus(plan) {
    if (!offlinePreparation?.getStatus) return null;
    try {
      return await offlinePreparation.getStatus(plan, { ownerId: offlineOwnerId() });
    } catch (error) {
      console.warn("Offline plan status could not be read", error);
      return null;
    }
  }

  function offlineStatusLabel(status) {
    if (!status) return "";
    const labels = { ready: "オフライン準備済み", partial: "オフライン準備（一部）", failed: "オフライン準備に失敗" };
    const fetchedAt = Object.values(status.parts || {})
      .map((part) => part?.fetchedAt)
      .filter(Boolean)
      .sort()
      .at(-1);
    const dateLabel = fetchedAt ? `・取得 ${formatDateTime(fetchedAt)}` : "";
    const reused = Object.values(status.parts || {}).some((part) => part?.reused);
    return `${status.preparing ? "オフライン準備中" : labels[status.status] || "オフライン準備中"}${reused ? "・保存済みデータを再利用" : ""}${dateLabel}`;
  }

  function renderOfflineDetails(status) {
    if (!offlineDetails) return;
    offlineDetails.replaceChildren();
    const title = document.createElement("b");
    title.textContent = status ? offlineStatusLabel(status) : "オフライン未準備";
    offlineDetails.append(title);
    if (status?.lastError) {
      const error = document.createElement("small");
      error.textContent = `前回の失敗: ${status.lastError}`;
      offlineDetails.append(error);
    }
    const list = document.createElement("dl");
    const labels = { elevation: "標高", terrain: "地形断面", lightPollution: "光害", forecast: "最新予報" };
    Object.entries(status?.parts || Object.fromEntries(["elevation", "terrain", "lightPollution", "forecast"].map((name) => [name, { status: "pending" }]))).forEach(([name, part]) => {
      const row = document.createElement("div");
      const term = document.createElement("dt");
      term.textContent = labels[name] || name;
      const detail = document.createElement("dd");
      const stateLabels = { ready: "保存済み", unavailable: "利用対象外", failed: "取得失敗", pending: "未準備" };
      const fetched = part.fetchedAt ? `・${formatDateTime(part.fetchedAt)}` : "";
      const reused = part.reused ? "・保存済み再利用" : "";
      const source = part.source ? `・${part.source}` : "";
      const error = part.error || part.lastError;
      detail.textContent = `${stateLabels[part.status] || "未準備"}${source}${reused}${fetched}${error ? `・${error}` : ""}`;
      row.append(term, detail);
      list.append(row);
    });
    offlineDetails.append(list);
  }

  function resetForm() {
    editingId = null;
    nameInput.value = defaultPlanName(store.getState());
    notesInput.value = "";
    saveButton.textContent = "この計画を保存";
    cancelEditButton.hidden = true;
  }

  function actionButton(label, action, title = label) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = action;
    button.textContent = label;
    button.title = title;
    button.setAttribute("aria-label", title);
    return button;
  }

  function renderPlan(plan) {
    const card = document.createElement("article");
    card.className = `plan-card${plan.favorite ? " is-favorite" : ""}`;
    card.dataset.planId = plan.id;

    const main = document.createElement("button");
    main.type = "button";
    main.className = "plan-card-main";
    main.dataset.action = "open";
    const name = document.createElement("strong");
    name.textContent = plan.name;
    const date = document.createElement("span");
    date.textContent = formatDateTime(plan.state.selectedDateTime);
    const route = document.createElement("small");
    route.textContent = plan.state.subjectLocation
      ? `${plan.state.subject.name} ・ ${bodyLabel(plan.state)}`
      : `撮影地点のみ ・ ${bodyLabel(plan.state)}`;
    main.append(name, date, route);
    if (plan.notes) {
      const note = document.createElement("small");
      note.className = "plan-card-note";
      note.textContent = plan.notes;
      main.append(note);
    }
    const offlineStatus = offlineStatuses.get(plan.id);
    if (offlineStatus) {
      const status = document.createElement("small");
      status.className = `plan-card-offline-status is-${offlineStatus.status}`;
      status.textContent = offlineStatusLabel(offlineStatus);
      main.append(status);
    }

    const actions = document.createElement("div");
    actions.className = "plan-card-actions";
    actions.append(
      actionButton("地図", "map", "Googleマップで開く"),
      actionButton("共有", "share"),
      actionButton("…", "more", "その他の操作"),
    );
    card.append(main, actions);
    return card;
  }

  async function refresh() {
    const generation = ++refreshGeneration;
    const ownerId = offlineOwnerId();
    try {
      const plans = await repository.list();
      if (generation !== refreshGeneration || ownerId !== offlineOwnerId()) return;
      const nextStatuses = new Map();
      if (offlinePreparation?.getStatus) {
        const statuses = await Promise.all(plans.map(async (plan) => [plan.id, await readOfflineStatus(plan)]));
        statuses.forEach(([id, status]) => { if (status) nextStatuses.set(id, status); });
      }
      if (generation !== refreshGeneration || ownerId !== offlineOwnerId()) return;
      visiblePlans = plans;
      visiblePlansOwner = ownerId;
      offlineStatuses = nextStatuses;
      count.textContent = `${plans.length} PLANS`;
      list.replaceChildren();
      if (!plans.length) {
        const empty = document.createElement("p");
        empty.className = "plans-empty";
        empty.textContent = "まだ撮影計画はありません。現在の地点と日時を保存すると、ここからすぐ呼び出せます。";
        list.append(empty);
        return;
      }
      plans.forEach((plan) => list.append(renderPlan(plan)));
    } catch (error) {
      console.error(error);
      showToast("撮影計画の保存領域を開けませんでした");
    }
  }

  document.querySelector("#plans-button").addEventListener("click", async () => {
    resetForm();
    await refresh();
    dialog.showModal();
  });
  document.querySelector("#plans-close").addEventListener("click", () => dialog.close());
  cancelEditButton.addEventListener("click", resetForm);

  function openMapDialog(plan) {
    mapPlanName.textContent = plan.name;
    mapDirections.href = buildGoogleMapsDirectionsUrl(plan.state.cameraLocation);
    mapCamera.href = buildGoogleMapsSearchUrl(plan.state.cameraLocation);
    const hasSubject = Boolean(plan.state.subjectLocation);
    mapSubject.hidden = !hasSubject;
    mapRouteSubject.hidden = !hasSubject;
    if (hasSubject) {
      mapSubject.href = buildGoogleMapsSearchUrl(plan.state.subjectLocation);
      mapSubject.querySelector("small").textContent = plan.state.subject.name || "被写体地点にピンを立てる";
      mapRouteSubject.querySelector("b").textContent = plan.state.subject.name || "被写体";
    } else {
      mapSubject.removeAttribute("href");
    }
    mapDialog.showModal();
  }

  function openMoreDialog(plan) {
    morePlanId = plan.id;
    morePlanName.textContent = plan.name;
    renderOfflineDetails(offlineStatuses.get(plan.id));
    const favoriteAction = moreDialog.querySelector('[data-plan-more-action="favorite"]');
    favoriteAction.querySelector("b").textContent = plan.favorite ? "お気に入りを解除" : "お気に入りに追加";
    favoriteAction.querySelector("small").textContent = plan.favorite
      ? "通常の計画として一覧に戻す"
      : "大切な計画を一覧で目立たせる";
    moreDialog.showModal();
  }

  function editPlan(plan) {
    editingId = plan.id;
    nameInput.value = plan.name;
    notesInput.value = plan.notes;
    saveButton.textContent = "名前とメモを更新";
    cancelEditButton.hidden = false;
    nameInput.focus();
  }

  async function duplicatePlan(plan) {
    const duplicate = createPlan({ state: plan.state, name: `${plan.name} のコピー`, notes: plan.notes });
    await repository.put(duplicate);
    await refresh();
    showToast("撮影計画を複製しました");
  }

  async function deletePlan(plan) {
    if (!window.confirm(`「${plan.name}」を削除しますか？`)) return;
    restorePlan.cancel();
    let cleanupError;
    try {
      cleanupError = await deletePlanData(plan, { repository, offlinePreparation, ownerId: offlineOwnerId() });
    } catch (error) {
      console.warn("Plan deletion failed", error);
      showToast("撮影計画を削除できませんでした");
      return;
    }
    if (cleanupError) console.warn("Offline plan data could not be removed", cleanupError);
    if (editingId === plan.id) resetForm();
    await refresh();
    showToast(cleanupError ? "計画を削除しました。現地用データを削除できませんでした" : "撮影計画を削除しました");
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      if (editingId) {
        const existing = (await repository.list()).find((plan) => plan.id === editingId);
        if (!existing) throw new Error("編集する計画が見つかりません");
        await repository.put({
          ...existing,
          name: nameInput.value.trim().slice(0, 120) || existing.name,
          notes: notesInput.value.trim().slice(0, 2000),
          updatedAt: new Date().toISOString(),
        });
        showToast("撮影計画を更新しました");
      } else {
        await repository.put(createPlan({ state: store.getState(), name: nameInput.value, notes: notesInput.value }));
        showToast("撮影計画を保存しました");
      }
      resetForm();
      await refresh();
    } catch (error) {
      console.error(error);
      showToast(error.message || "撮影計画を保存できませんでした");
    }
  });

  list.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    const card = button?.closest("[data-plan-id]");
    if (!button || !card) return;
    if (visiblePlansOwner !== offlineOwnerId()) { await refresh(); return; }
    const plan = visiblePlans.find((item) => item.id === card.dataset.planId);
    if (!plan) return showToast("撮影計画が見つかりません");

    if (button.dataset.action === "open") {
      if (!await restorePlan(plan)) return;
      dialog.close();
      showToast(`「${plan.name}」を開きました`);
    } else if (button.dataset.action === "map") {
      openMapDialog(plan);
    } else if (button.dataset.action === "share") {
      const originalLabel = button.textContent;
      button.disabled = true;
      button.textContent = "共有中…";
      try {
        const result = await sharePlan(plan);
        if (result === "shared") showToast("撮影計画を共有しました");
        if (result === "copied") showToast("共有内容をコピーしました");
      } catch (error) {
        console.error(error);
        showToast("撮影計画を共有できませんでした");
      } finally {
        button.disabled = false;
        button.textContent = originalLabel;
      }
    } else if (button.dataset.action === "more") {
      openMoreDialog(plan);
    }
  });

  document.querySelectorAll("[data-plan-sheet-close]").forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog").close());
  });
  [mapDirections, mapCamera, mapSubject].forEach((link) => {
    link.addEventListener("click", () => mapDialog.close());
  });
  [mapDialog, moreDialog].forEach((sheet) => {
    sheet.addEventListener("click", (event) => {
      if (event.target === sheet) sheet.close();
    });
  });
  moreDialog.addEventListener("close", () => { morePlanId = null; });
  moreDialog.addEventListener("click", async (event) => {
    const action = event.target.closest("button[data-plan-more-action]")?.dataset.planMoreAction;
    if (!action) return;
    if (visiblePlansOwner !== offlineOwnerId()) { moreDialog.close(); await refresh(); return; }
    const plan = visiblePlans.find((item) => item.id === morePlanId);
    if (!plan) return showToast("撮影計画が見つかりません");
    moreDialog.close();
    if (action === "favorite") {
      await repository.put({ ...plan, favorite: !plan.favorite, updatedAt: new Date().toISOString() });
      await refresh();
    }
    if (action === "edit") editPlan(plan);
    if (action === "duplicate") await duplicatePlan(plan);
    if (action === "delete") await deletePlan(plan);
    if (action === "prepare-offline") {
      if (!offlinePreparation?.prepare) return showToast("オフライン準備を利用できません");
      const ownerId = offlineOwnerId();
      try {
        const result = await offlinePreparation.prepare(plan, {
          ownerId,
          isCurrent: async () => {
            try {
              if (offlineOwnerId() !== ownerId) return false;
              const current = (await repository.list()).find((item) => item.id === plan.id);
              return Boolean(offlineOwnerId() === ownerId && current && offlineStateSignature(current) === offlineStateSignature(plan));
            } catch {
              return false;
            }
          },
          onProgress: (progress) => {
            if (progress.phase === "part" && progress.part) {
              const labels = { elevation: "標高", terrain: "地形断面", lightPollution: "光害", forecast: "最新予報" };
              showToast(`${labels[progress.part] || progress.part}をオフライン保存中…`);
            }
          },
        });
        if (result?.status === "ready") showToast("この計画のオフライン準備が完了しました");
        else if (result?.status === "cancelled") showToast("オフライン準備を取り消しました");
        else if (result?.status === "failed") showToast(result.error || "オフライン準備に失敗しました");
        else showToast("オフライン準備は一部保存されました");
        await refresh();
      } catch (error) {
        console.error(error);
        showToast(error.message || "オフライン準備に失敗しました");
      }
    }
    if (action === "field") {
      if (typeof onFieldMode !== "function") return showToast("現地撮影モードを開けません");
      const restored = await restorePlan(plan);
      if (!restored) return;
      dialog.close();
      await onFieldMode(plan, restored);
    }
  });

  document.querySelector("#plans-export").addEventListener("click", async () => {
    const plans = await repository.list();
    if (!plans.length) return showToast("書き出す撮影計画がありません");
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(`CelestiFrame-plans-${stamp}.json`, serializePlans(plans));
    showToast(`${plans.length}件の撮影計画を書き出しました`);
  });

  const importInput = document.querySelector("#plans-import-input");
  document.querySelector("#plans-import").addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_PLAN_IMPORT_BYTES) throw new Error("撮影計画ファイルは5MB以内にしてください");
      const plans = parsePlansFile(await file.text());
      for (const plan of plans) await repository.put(normalizePlan(plan));
      await refresh();
      showToast(`${plans.length}件の撮影計画を読み込みました`);
    } catch (error) {
      console.error(error);
      showToast(error.message || "撮影計画を読み込めませんでした");
    } finally {
      importInput.value = "";
    }
  });

  return { refresh };
}
