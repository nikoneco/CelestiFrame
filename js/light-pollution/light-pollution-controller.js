export function bindLightPollutionOverlay(getMapController, { tileUrl, dataYear } = {}) {
  const toggle = document.querySelector("#light-pollution-toggle");
  const legend = document.querySelector("#light-pollution-legend");
  const status = document.querySelector("#light-pollution-status");
  const dataLabel = document.querySelector("#light-pollution-data-label");
  let enabled = false;
  let savedSnapshot = null;

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
      dataYear,
      onLoad: () => {
        if (!enabled) return;
        status.textContent = savedSnapshot
          ? `保存した地点周辺の光害（${new Date(savedSnapshot.fetchedAt).toLocaleString("ja-JP")}取得・保存時の縮尺と拡大表示）`
          : `光害の目安を表示中です。VNP46A4 ${dataYear}年次合成を基にした参考表示です`;
        render();
      },
      onError: () => {
        if (!enabled) return;
        status.textContent = navigator.onLine ? "一部の光害タイルを読み込めません" : "この範囲・縮尺の光害タイルは端末に保存されていません";
        render({ error: true });
      },
    });
  }

  toggle.addEventListener("click", () => {
    if (enabled) disable();
    else enable();
  });

  dataLabel.textContent = `VNP46A4・${dataYear}`;
  render();
  return { enable, disable, isEnabled: () => enabled,
    restoreSnapshot(snapshot) {
      savedSnapshot = snapshot;
      if (snapshot) enable();
      else disable();
    },
  };
}
