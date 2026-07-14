export function bindLightPollutionOverlay(getMapController, { tileUrl } = {}) {
  const toggle = document.querySelector("#light-pollution-toggle");
  const legend = document.querySelector("#light-pollution-legend");
  const status = document.querySelector("#light-pollution-status");
  let enabled = false;

  function render({ error = false } = {}) {
    toggle.setAttribute("aria-checked", String(enabled));
    toggle.classList.toggle("is-error", error);
    legend.hidden = !enabled;
    toggle.setAttribute("aria-label", enabled ? "光害の目安を地図から消す" : "光害の目安を地図に表示");
  }

  function disable(message = "光害の目安を非表示にしました") {
    enabled = false;
    getMapController()?.clearLightPollutionOverlay();
    status.textContent = message;
    render();
  }

  function enable() {
    const mapController = getMapController();
    if (!mapController || !tileUrl) {
      status.textContent = "光害レイヤーを読み込めません";
      render({ error: true });
      return;
    }
    enabled = true;
    status.textContent = "光害の目安を読み込んでいます";
    render();
    mapController.setLightPollutionOverlay(tileUrl, {
      onLoad: () => {
        if (!enabled) return;
        status.textContent = "光害の目安を表示中です。夜間光を基にした参考表示です";
        render();
      },
      onError: () => {
        if (!enabled) return;
        status.textContent = navigator.onLine ? "一部の光害タイルを読み込めません" : "オフラインでは光害レイヤーを表示できません";
        render({ error: true });
      },
    });
  }

  toggle.addEventListener("click", () => {
    if (enabled) disable();
    else enable();
  });

  render();
  return { enable, disable, isEnabled: () => enabled };
}
