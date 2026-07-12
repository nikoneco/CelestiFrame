import { subjectGeometry } from "../geometry/bearing.js?v=7";

const DAY_MS = 86400000;
const pad = (value) => String(value).padStart(2, "0");

function localDateValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function minutesFromTime(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function normalizeOvernightEndMinute(startMinute, endMinute) {
  return endMinute < startMinute ? endMinute + 1440 : endMinute;
}

export function validateSearchInput(input) {
  const errors = [];
  const start = new Date(`${input.startDate}T00:00:00`);
  const end = new Date(`${input.endDate}T00:00:00`);
  const days = Math.round((end - start) / DAY_MS) + 1;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) errors.push("検索期間を入力してください");
  else if (start > end) errors.push("開始日は終了日以前にしてください");
  else if (days > 93) errors.push("検索期間は93日以内にしてください");
  if (input.toleranceDegrees < 0.1 || input.toleranceDegrees > 180) errors.push("許容方位差は0.1〜180°にしてください");
  if (input.minAltitude < -90 || input.maxAltitude > 90 || input.minAltitude > input.maxAltitude) errors.push("高度範囲を確認してください");
  if (input.minIllumination < 0 || input.minIllumination > 100) errors.push("月照度は0〜100%にしてください");
  return errors;
}

function formatDifference(value) {
  if (Math.abs(value) < 0.05) return "正面";
  return `${Math.abs(value).toFixed(1)}°${value > 0 ? "右" : "左"}`;
}

function renderResults(results, container, onSelect) {
  container.replaceChildren();
  if (!results.length) {
    const empty = document.createElement("p");
    empty.className = "search-empty";
    empty.textContent = "一致する日時がありません。方位差や高度の範囲を少し広げてください。";
    container.append(empty);
    return;
  }

  results.slice(0, 100).forEach((result) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-result";
    button.style.setProperty("--score", `${Math.round(result.score)}%`);
    const date = new Date(result.iso);
    const dateText = new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", weekday: "short" }).format(date);
    const timeText = new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
    const illuminationText = result.illumination === null ? "" : `照度 ${result.illumination.toFixed(0)}%`;
    button.innerHTML = `
      <span class="result-date"><b>${dateText}</b><strong>${timeText}</strong></span>
      <span class="result-metrics"><b>方位差 ${formatDifference(result.difference)}</b><span>高度 ${result.altitude.toFixed(1)}° ${illuminationText}</span></span>
      <span class="result-score">${Math.round(result.score)}</span>
    `;
    button.addEventListener("click", () => onSelect(result));
    container.append(button);
  });
}

export function bindSearchControls(store, showToast) {
  const dialog = document.querySelector("#search-dialog");
  const form = document.querySelector("#search-form");
  const progressPanel = document.querySelector("#search-progress-panel");
  const progress = document.querySelector("#search-progress");
  const progressLabel = document.querySelector("#search-progress-label");
  const resultsContainer = document.querySelector("#search-results");
  const submitButton = document.querySelector("#search-submit");
  const cancelButton = document.querySelector("#search-cancel");
  const overnightBadge = document.querySelector("#overnight-badge");
  let worker = null;

  function updateOvernightBadge() {
    if (!form.elements.startTime.value || !form.elements.endTime.value) return;
    const startMinute = minutesFromTime(form.elements.startTime.value);
    const endMinute = minutesFromTime(form.elements.endTime.value);
    overnightBadge.hidden = endMinute >= startMinute;
  }

  document.querySelector("#alignment-search-button").addEventListener("click", () => {
    const state = store.getState();
    if (!state.subjectLocation) return showToast("先に被写体地点を設定してください");
    const selected = new Date(state.selectedDateTime);
    const end = new Date(selected);
    end.setDate(end.getDate() + 30);
    form.elements.startDate.value = localDateValue(selected);
    form.elements.endDate.value = localDateValue(end);
    const target = state.selectedBody === "sun" ? "sun" : "moon";
    form.elements.target.value = target;
    form.elements.minIllumination.disabled = target !== "moon";
    form.elements.startTime.value = target === "moon" ? "18:00" : "04:00";
    form.elements.endTime.value = target === "moon" ? "06:00" : "20:00";
    updateOvernightBadge();
    resultsContainer.replaceChildren();
    progressPanel.hidden = true;
    dialog.showModal();
  });

  Array.from(form.elements.target).forEach((input) => {
    input.addEventListener("change", () => {
      form.elements.minIllumination.disabled = input.value !== "moon";
    });
  });

  form.elements.startTime.addEventListener("change", updateOvernightBadge);
  form.elements.endTime.addEventListener("change", updateOvernightBadge);

  document.querySelector("#search-close").addEventListener("click", () => {
    worker?.terminate();
    worker = null;
    dialog.close();
  });

  dialog.addEventListener("cancel", () => {
    worker?.terminate();
    worker = null;
    submitButton.disabled = false;
    cancelButton.hidden = true;
  });

  cancelButton.addEventListener("click", () => {
    worker?.terminate();
    worker = null;
    submitButton.disabled = false;
    cancelButton.hidden = true;
    progressLabel.textContent = "検索をキャンセルしました";
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const state = store.getState();
    const geometry = subjectGeometry(state.cameraLocation, state.subjectLocation);
    const data = new FormData(form);
    const startMinute = minutesFromTime(data.get("startTime"));
    const input = {
      target: data.get("target"),
      cameraLocation: state.cameraLocation,
      subjectBearing: geometry.bearingDegrees,
      startDate: data.get("startDate"),
      endDate: data.get("endDate"),
      startMinute,
      endMinute: normalizeOvernightEndMinute(startMinute, minutesFromTime(data.get("endTime"))),
      stepMinutes: Number(data.get("stepMinutes")),
      toleranceDegrees: Number(data.get("toleranceDegrees")),
      minAltitude: Number(data.get("minAltitude")),
      maxAltitude: Number(data.get("maxAltitude")),
      minIllumination: Number(data.get("minIllumination") || 0),
    };
    const errors = validateSearchInput(input);
    if (errors.length) return showToast(errors[0]);

    worker?.terminate();
    worker = new Worker(new URL("./search-worker.js?v=10", import.meta.url));
    submitButton.disabled = true;
    cancelButton.hidden = false;
    progressPanel.hidden = false;
    progress.value = 0;
    progressLabel.textContent = "方位を走査しています…";
    resultsContainer.replaceChildren();
    const handleWorkerFailure = (message) => {
      console.error("Alignment search worker failed", message);
      submitButton.disabled = false;
      cancelButton.hidden = true;
      progressLabel.textContent = "検索Workerを起動できませんでした";
      showToast(`日時検索を開始できません: ${message}`);
      worker?.terminate();
      worker = null;
    };
    worker.addEventListener("error", (error) => {
      error.preventDefault();
      handleWorkerFailure(error.message || "Worker script error");
    });
    worker.addEventListener("messageerror", () => {
      handleWorkerFailure("Worker message error");
    });
    worker.addEventListener("message", (message) => {
      if (message.data.type === "progress") {
        const percent = Math.round(message.data.progress * 100);
        progress.value = percent;
        progressLabel.textContent = `${percent}% 走査済み`;
      }
      if (message.data.type === "done") {
        submitButton.disabled = false;
        cancelButton.hidden = true;
        progress.value = 100;
        progressLabel.textContent = `${message.data.results.length}件の候補を検出`;
        renderResults(message.data.results, resultsContainer, (result) => {
          store.setState((current) => ({ ...current, selectedDateTime: result.iso }));
          dialog.close();
          showToast("検索結果の日時を地図へ反映しました");
        });
        worker.terminate();
        worker = null;
      }
      if (message.data.type === "error") {
        submitButton.disabled = false;
        cancelButton.hidden = true;
        progressLabel.textContent = "検索に失敗しました";
        showToast(message.data.message);
        worker?.terminate();
        worker = null;
      }
    });
    worker.postMessage(input);
  });
}
