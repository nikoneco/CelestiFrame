import {
  CELESTIAL_TARGETS,
  TARGET_CATEGORIES,
  MAX_SELECTED_TARGETS,
  getTarget,
  normalizeSelectedTargets,
} from "../astronomy/target-catalog.js";

export function bindTargetSelector(store, showToast) {
  const dialog = document.querySelector("#target-selector-dialog");
  const openButton = document.querySelector("#target-selector-button");
  const closeButtons = dialog.querySelectorAll("[data-target-selector-close]");
  const list = document.querySelector("#target-selector-list");
  const summary = document.querySelector("#target-selection-summary");
  const count = document.querySelector("#target-selection-count");
  const feedback = document.querySelector("#target-selector-feedback");

  TARGET_CATEGORIES.forEach((category) => {
    const group = document.createElement("section");
    group.className = "target-category";
    const heading = document.createElement("h3");
    heading.textContent = category.label;
    const options = document.createElement("div");
    options.className = "target-option-grid";
    CELESTIAL_TARGETS.filter((target) => target.category === category.id).forEach((target) => {
      const label = document.createElement("label");
      label.className = "target-option";
      label.style.setProperty("--target-color", target.color);
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = target.id;
      input.name = "celestialTarget";
      const symbol = document.createElement("i");
      symbol.textContent = target.symbol;
      symbol.setAttribute("aria-hidden", "true");
      const name = document.createElement("span");
      name.textContent = target.label;
      label.append(input, symbol, name);
      options.append(label);
    });
    group.append(heading, options);
    list.append(group);
  });

  function sync(state) {
    const selected = normalizeSelectedTargets(state.selectedTargets);
    const atLimit = selected.length >= MAX_SELECTED_TARGETS;
    dialog.querySelectorAll('input[name="celestialTarget"]').forEach((input) => {
      const checked = selected.includes(input.value);
      input.checked = checked;
      input.disabled = atLimit && !checked;
      input.closest(".target-option").classList.toggle("is-selected", checked);
    });
    const labels = selected.map((targetId) => getTarget(targetId)?.shortLabel).filter(Boolean);
    summary.replaceChildren(...selected.map((targetId) => {
      const target = getTarget(targetId);
      const chip = document.createElement("span");
      chip.style.setProperty("--target-color", target.color);
      chip.textContent = target.shortLabel;
      return chip;
    }));
    count.textContent = `${selected.length}/${MAX_SELECTED_TARGETS}`;
    openButton.setAttribute("aria-label", `撮影対象を選択。現在${labels.join("、")}`);
    feedback.textContent = atLimit
      ? `最大${MAX_SELECTED_TARGETS}対象です。別の対象へ替えるときは、選択中の対象を1つ外してください。`
      : `あと${MAX_SELECTED_TARGETS - selected.length}対象を選べます。`;
  }

  list.addEventListener("change", (event) => {
    const input = event.target.closest('input[name="celestialTarget"]');
    if (!input) return;
    const selected = normalizeSelectedTargets(store.getState().selectedTargets);
    const next = input.checked
      ? [...selected, input.value]
      : selected.filter((targetId) => targetId !== input.value);
    if (input.checked && selected.length >= MAX_SELECTED_TARGETS) {
      input.checked = false;
      showToast(`撮影対象は最大${MAX_SELECTED_TARGETS}個です`);
      return;
    }
    if (!next.length) {
      input.checked = true;
      showToast("撮影対象を1つ以上選んでください");
      return;
    }
    store.setState((state) => ({ ...state, selectedTargets: normalizeSelectedTargets(next) }));
  });

  openButton.addEventListener("click", () => dialog.showModal());
  closeButtons.forEach((button) => button.addEventListener("click", () => dialog.close()));
  store.subscribe(sync);
  return { sync };
}

