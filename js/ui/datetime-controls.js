const pad = (value) => String(value).padStart(2, "0");

function toInputValues(date) {
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

function dateFromInputs(dateValue, timeValue) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hours, minutes] = timeValue.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

export function dateWithWrappedMinutes(currentDate, targetMinutes) {
  const currentMinutes = currentDate.getHours() * 60 + currentDate.getMinutes();
  const difference = targetMinutes - currentMinutes;
  const next = new Date(currentDate);
  next.setHours(0, targetMinutes, 0, 0);
  if (difference < -720) next.setDate(next.getDate() + 1);
  if (difference > 720) next.setDate(next.getDate() - 1);
  return next;
}

export function bindDateTimeControls(store) {
  const dateInput = document.querySelector("#date-input");
  const timeInput = document.querySelector("#time-input");
  const slider = document.querySelector("#time-slider");
  const shiftIndicator = document.querySelector("#date-shift-indicator");
  let shiftTimer;

  function announceDateShift(from, to) {
    const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const toDay = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    const difference = Math.round((toDay - fromDay) / 86400000);
    if (!difference) return;
    shiftIndicator.textContent = difference > 0 ? "翌日へ" : "前日へ";
    shiftIndicator.hidden = false;
    clearTimeout(shiftTimer);
    shiftTimer = setTimeout(() => { shiftIndicator.hidden = true; }, 1800);
  }

  function setDateTime(date) {
    if (Number.isNaN(date.getTime())) return;
    store.setState((state) => ({ ...state, selectedDateTime: date.toISOString() }));
  }

  function commitInputs(inferWrap) {
    if (!dateInput.value || !timeInput.value) return;
    const current = new Date(store.getState().selectedDateTime);
    const exact = dateFromInputs(dateInput.value, timeInput.value);
    const currentDateValue = toInputValues(current).date;
    const targetMinutes = exact.getHours() * 60 + exact.getMinutes();
    const next = inferWrap && dateInput.value === currentDateValue
      ? dateWithWrappedMinutes(current, targetMinutes)
      : exact;
    announceDateShift(current, next);
    setDateTime(next);
  }

  dateInput.addEventListener("change", () => commitInputs(false));
  timeInput.addEventListener("change", () => commitInputs(true));
  document.querySelector("#now-button").addEventListener("click", () => setDateTime(new Date()));

  document.querySelectorAll("[data-minutes]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = new Date(store.getState().selectedDateTime);
      next.setMinutes(next.getMinutes() + Number(button.dataset.minutes));
      setDateTime(next);
    });
  });

  slider.addEventListener("input", () => {
    const current = new Date(store.getState().selectedDateTime);
    const next = dateWithWrappedMinutes(current, Number(slider.value));
    announceDateShift(current, next);
    setDateTime(next);
  });

  store.subscribe((state) => {
    const selected = new Date(state.selectedDateTime);
    const values = toInputValues(selected);
    dateInput.value = values.date;
    timeInput.value = values.time;
    slider.value = String(selected.getHours() * 60 + selected.getMinutes());
    document.querySelector("#slider-output").value = values.time;
    document.querySelector("#date-summary").textContent = new Intl.DateTimeFormat("ja-JP", {
      month: "long",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(selected);
  });
}
