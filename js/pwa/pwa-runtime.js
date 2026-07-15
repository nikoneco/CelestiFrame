const SHORTCUTS = new Set(["plans", "field"]);

export function launchShortcutFromUrl(value, base = "https://celestiframe.local/") {
  const url = new URL(value, base);
  const shortcut = url.searchParams.get("shortcut");
  return SHORTCUTS.has(shortcut) ? shortcut : null;
}

export function shortcutFreeUrl(value, base = "https://celestiframe.local/") {
  const url = new URL(value, base);
  url.searchParams.delete("shortcut");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function resolveDisplayMode({ matchMedia, navigator }) {
  return matchMedia?.("(display-mode: standalone)")?.matches || navigator?.standalone === true
    ? "standalone"
    : "browser";
}

export function bindPwaRuntime({
  windowRef = window,
  documentRef = document,
  onLaunchShortcut = () => {},
} = {}) {
  const { navigator, history, location } = windowRef;
  const networkStatus = documentRef.querySelector("#network-status");

  const syncNetworkState = () => {
    const offline = navigator.onLine === false;
    documentRef.documentElement.dataset.network = offline ? "offline" : "online";
    documentRef.body.classList.toggle("is-offline", offline);
    if (networkStatus) networkStatus.hidden = !offline;
  };

  documentRef.documentElement.dataset.displayMode = resolveDisplayMode({
    matchMedia: windowRef.matchMedia?.bind(windowRef),
    navigator,
  });
  syncNetworkState();
  windowRef.addEventListener("online", syncNetworkState);
  windowRef.addEventListener("offline", syncNetworkState);

  const shortcut = launchShortcutFromUrl(location.href);
  if (shortcut) {
    windowRef.setTimeout(() => {
      onLaunchShortcut(shortcut);
      history.replaceState(history.state, "", shortcutFreeUrl(location.href));
    }, 0);
  }

  return () => {
    windowRef.removeEventListener("online", syncNetworkState);
    windowRef.removeEventListener("offline", syncNetworkState);
  };
}
