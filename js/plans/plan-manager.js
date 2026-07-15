import { MAX_PLAN_IMPORT_BYTES, buildShareUrl, createPlan, defaultPlanName, normalizePlan, parsePlansFile, serializePlans } from "./plan-data.js?v=41";
import { createPlanRepository } from "./plan-repository.js?v=16";
import { buildGoogleMapsDirectionsUrl, buildGoogleMapsSearchUrl } from "../map/google-maps-url.js?v=1";
import { targetLabelList } from "../astronomy/target-catalog.js?v=1";

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

export function bindPlanManager(store, { applyState, showToast, repository = createPlanRepository() }) {
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
  let editingId = null;
  let visiblePlans = [];
  let morePlanId = null;

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
    try {
      const plans = await repository.list();
      visiblePlans = plans;
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
    await repository.delete(plan.id);
    if (editingId === plan.id) resetForm();
    await refresh();
    showToast("撮影計画を削除しました");
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
    const plan = visiblePlans.find((item) => item.id === card.dataset.planId);
    if (!plan) return showToast("撮影計画が見つかりません");

    if (button.dataset.action === "open") {
      applyState(plan.state);
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
