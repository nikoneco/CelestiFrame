export function bindCompositionControls(store) {
  const form = document.querySelector("#composition-form");
  const orientationButtons = document.querySelectorAll("[data-composition-orientation]");

  form.addEventListener("change", (event) => {
    const input = event.target;
    if (input.dataset.compositionField) {
      const field = input.dataset.compositionField;
      const value = input.type === "number" ? Number(input.value) : input.value;
      if (input.type === "number" && !Number.isFinite(value)) return;
      store.setState((state) => ({
        ...state,
        composition: { ...state.composition, [field]: value },
      }));
    }
    if (input.dataset.subjectField) {
      const value = Number(input.value);
      if (!Number.isFinite(value)) return;
      store.setState((state) => ({
        ...state,
        subject: { ...state.subject, [input.dataset.subjectField]: value },
      }));
    }
  });

  orientationButtons.forEach((button) => {
    button.addEventListener("click", () => {
      store.setState((state) => ({
        ...state,
        composition: { ...state.composition, orientation: button.dataset.compositionOrientation },
      }));
    });
  });

  return {
    sync(state) {
      form.querySelectorAll("[data-composition-field]").forEach((input) => {
        if (document.activeElement !== input) input.value = state.composition[input.dataset.compositionField];
      });
      form.querySelectorAll("[data-subject-field]").forEach((input) => {
        if (document.activeElement !== input) input.value = state.subject[input.dataset.subjectField] ?? "";
      });
      orientationButtons.forEach((button) => {
        const active = button.dataset.compositionOrientation === state.composition.orientation;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
    },
  };
}
