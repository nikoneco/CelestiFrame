import { buildShareUrl, createPlan, defaultPlanName, normalizePlan, parsePlansFile, serializePlans } from "./plan-data.js?v=24";
import { createPlanRepository } from "./plan-repository.js?v=14";

const formatDateTime = (value) => new Intl.DateTimeFormat("ja-JP", {
  year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
}).format(new Date(value));

function downloadText(filename, text) {
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const input = document.createElement("textarea");
  input.value = value;
  document.body.append(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

export function bindPlanManager(store, { applyState, showToast }) {
  const repository = createPlanRepository();
  const dialog = document.querySelector("#plans-dialog");
  const form = document.querySelector("#plan-form");
  const nameInput = document.querySelector("#plan-name");
  const notesInput = document.querySelector("#plan-notes");
  const saveButton = document.querySelector("#plan-save");
  const cancelEditButton = document.querySelector("#plan-cancel-edit");
  const list = document.querySelector("#plans-list");
  const count = document.querySelector("#plans-count");
  let editingId = null;

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
      ? `${plan.state.subject.name} ・ ${plan.state.selectedBody === "sun" ? "太陽" : plan.state.selectedBody === "moon" ? "月" : "太陽＋月"}`
      : `撮影地点のみ ・ ${plan.state.selectedBody === "sun" ? "太陽" : plan.state.selectedBody === "moon" ? "月" : "太陽＋月"}`;
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
      actionButton(plan.favorite ? "★" : "☆", "favorite", plan.favorite ? "お気に入りを解除" : "お気に入りに追加"),
      actionButton("共有", "share"),
      actionButton("編集", "edit"),
      actionButton("複製", "duplicate"),
      actionButton("削除", "delete"),
    );
    card.append(main, actions);
    return card;
  }

  async function refresh() {
    try {
      const plans = await repository.list();
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
    const plan = (await repository.list()).find((item) => item.id === card.dataset.planId);
    if (!plan) return showToast("撮影計画が見つかりません");

    if (button.dataset.action === "open") {
      applyState(plan.state);
      dialog.close();
      showToast(`「${plan.name}」を開きました`);
    } else if (button.dataset.action === "favorite") {
      await repository.put({ ...plan, favorite: !plan.favorite, updatedAt: new Date().toISOString() });
      await refresh();
    } else if (button.dataset.action === "share") {
      await copyText(buildShareUrl(plan.state));
      showToast("共有URLをコピーしました");
    } else if (button.dataset.action === "edit") {
      editingId = plan.id;
      nameInput.value = plan.name;
      notesInput.value = plan.notes;
      saveButton.textContent = "名前とメモを更新";
      cancelEditButton.hidden = false;
      nameInput.focus();
    } else if (button.dataset.action === "duplicate") {
      const duplicate = createPlan({ state: plan.state, name: `${plan.name} のコピー`, notes: plan.notes });
      await repository.put(duplicate);
      await refresh();
      showToast("撮影計画を複製しました");
    } else if (button.dataset.action === "delete" && window.confirm(`「${plan.name}」を削除しますか？`)) {
      await repository.delete(plan.id);
      if (editingId === plan.id) resetForm();
      await refresh();
      showToast("撮影計画を削除しました");
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
}
