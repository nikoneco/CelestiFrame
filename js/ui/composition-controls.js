export function bindCompositionControls(store) {
  const form = document.querySelector("#composition-form");
  const orientationButtons = document.querySelectorAll("[data-composition-orientation]");

  function updateField(event) {
    const input = event.target;
    if (input.dataset.compositionField) {
      const field = input.dataset.compositionField;
      const value = input.type === "number" ? Number(input.value) : input.value;
      if (input.type === "number" && !Number.isFinite(value)) return;
      store.setState((state) => ({
        ...state,
        composition: {
          ...state.composition,
          [field]: value,
          ...(field === "cameraElevationMeters" ? { cameraElevationMode: "manual", cameraElevationStatus: "manual", cameraElevationSource: "手入力" } : {}),
        },
      }));
    }
    if (input.dataset.subjectField) {
      const value = Number(input.value);
      if (!Number.isFinite(value)) return;
      const field = input.dataset.subjectField;
      store.setState((state) => ({
        ...state,
        subject: {
          ...state.subject,
          [field]: value,
          ...(field === "groundElevationMeters" ? { groundElevationMode: "manual", groundElevationStatus: "manual", groundElevationSource: "手入力" } : {}),
        },
      }));
    }
  }

  form.addEventListener("input", updateField);
  form.addEventListener("change", updateField);

  orientationButtons.forEach((button) => {
    button.addEventListener("click", () => {
      store.setState((state) => ({
        ...state,
        composition: { ...state.composition, orientation: button.dataset.compositionOrientation },
      }));
    });
  });

  document.querySelectorAll("[data-target-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      store.setState((state) => ({
        ...state,
        subject: { ...state.subject, targetMode: button.dataset.targetMode },
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
      document.querySelectorAll("[data-target-mode]").forEach((button) => {
        const active = button.dataset.targetMode === state.subject.targetMode;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      form.classList.toggle("is-terrain-target", state.subject.targetMode === "terrain");
    },
  };
}
