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

export function bindDateTimeControls(store) {
  const dateInput = document.querySelector("#date-input");
  const timeInput = document.querySelector("#time-input");
  const slider = document.querySelector("#time-slider");

  function setDateTime(date) {
    if (Number.isNaN(date.getTime())) return;
    store.setState((state) => ({ ...state, selectedDateTime: date.toISOString() }));
  }

  function commitInputs() {
    if (!dateInput.value || !timeInput.value) return;
    setDateTime(dateFromInputs(dateInput.value, timeInput.value));
  }

  dateInput.addEventListener("change", commitInputs);
  timeInput.addEventListener("change", commitInputs);
  document.querySelector("#now-button").addEventListener("click", () => setDateTime(new Date()));

  document.querySelectorAll("[data-minutes]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = new Date(store.getState().selectedDateTime);
      next.setMinutes(next.getMinutes() + Number(button.dataset.minutes));
      setDateTime(next);
    });
  });

  slider.addEventListener("input", () => {
    const next = new Date(store.getState().selectedDateTime);
    next.setHours(0, Number(slider.value), 0, 0);
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
