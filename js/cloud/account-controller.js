import { createFirebaseClient } from "./firebase-client.js?v=1";

const MIGRATION_KEY = "celestiframe:cloud-migration:v1:";
const SETTINGS_KEY = "celestiframe:cloud-settings:v1:";
export function normalizeCloudSettings(settings = {}) {
  const normalized = {};
  if (["system", "light", "dark", "red"].includes(settings.theme)) normalized.theme = settings.theme;
  if (["camera", "subject", "both"].includes(settings.directionLineOrigin)) normalized.directionLineOrigin = settings.directionLineOrigin;
  if (Number.isFinite(Number(settings.timeStepMinutes))) normalized.timeStepMinutes = Math.min(60, Math.max(1, Number(settings.timeStepMinutes)));
  if (["decimal", "dms"].includes(settings.coordinateFormat)) normalized.coordinateFormat = settings.coordinateFormat;
  return normalized;
}

const safeSettings = normalizeCloudSettings;
const timestamp = (value) => Number.isFinite(new Date(value).getTime()) ? new Date(value).getTime() : 0;

export function bindCloudAccount({ coordinator, store, showToast, onPlansChanged }) {
  const account = document.querySelector("#cloud-account");
  const plansButton = document.querySelector("#plans-button");
  const title = document.querySelector("#cloud-account-title");
  const detail = document.querySelector("#cloud-account-detail");
  const avatar = document.querySelector("#cloud-account-avatar");
  const signInButton = document.querySelector("#cloud-sign-in");
  const syncButton = document.querySelector("#cloud-sync-now");
  const signOutButton = document.querySelector("#cloud-sign-out");
  const migration = document.querySelector("#cloud-migration");
  const migrationText = document.querySelector("#cloud-migration-text");
  const mergeButton = document.querySelector("#cloud-migrate-merge");
  const skipButton = document.querySelector("#cloud-migrate-skip");
  let client = null;
  let currentUser = null;
  let applyingRemoteSettings = false;
  let settingsPushTimer;
  let lastSettings = JSON.stringify(safeSettings(store.getState().settings));

  function setState(nextState, nextTitle, nextDetail) {
    account.dataset.state = nextState;
    plansButton.dataset.cloudState = nextState;
    title.textContent = nextTitle;
    detail.textContent = nextDetail;
  }

  function renderSignedOut() {
    avatar.hidden = true;
    avatar.removeAttribute("src");
    signInButton.hidden = false;
    syncButton.hidden = true;
    signOutButton.hidden = true;
    migration.hidden = true;
    setState("local", "この端末に保存中", "ログインすると撮影計画を端末間で同期できます");
  }

  function renderUser(user) {
    avatar.hidden = !user.photoURL;
    if (user.photoURL) avatar.src = user.photoURL;
    signInButton.hidden = true;
    syncButton.hidden = false;
    signOutButton.hidden = false;
    setState("pending", user.displayName || "CelestiFrameアカウント", user.email || "同期を準備しています");
  }

  async function syncSettings(userId) {
    const key = `${SETTINGS_KEY}${userId}`;
    let localRecord = null;
    try { localRecord = JSON.parse(localStorage.getItem(key)); } catch { localRecord = null; }
    const cloudRecord = await client.getPreferences(userId);
    if (!localRecord && cloudRecord) {
      applyingRemoteSettings = true;
      store.setState((state) => ({
        ...state,
        settings: { ...state.settings, ...safeSettings(cloudRecord.settings) },
      }));
      applyingRemoteSettings = false;
      localStorage.setItem(key, JSON.stringify(cloudRecord));
      lastSettings = JSON.stringify(safeSettings(store.getState().settings));
      return;
    }
    if (!localRecord && !cloudRecord) {
      localRecord = { settings: safeSettings(store.getState().settings), updatedAt: new Date().toISOString() };
      localStorage.setItem(key, JSON.stringify(localRecord));
      await client.putPreferences(userId, localRecord);
      return;
    }
    if (!cloudRecord || timestamp(localRecord.updatedAt) > timestamp(cloudRecord.updatedAt)) {
      await client.putPreferences(userId, localRecord);
      return;
    }
    if (timestamp(cloudRecord.updatedAt) > timestamp(localRecord.updatedAt)) {
      applyingRemoteSettings = true;
      store.setState((state) => ({
        ...state,
        settings: { ...state.settings, ...safeSettings(cloudRecord.settings) },
      }));
      applyingRemoteSettings = false;
      localStorage.setItem(key, JSON.stringify(cloudRecord));
      lastSettings = JSON.stringify(safeSettings(store.getState().settings));
    }
  }

  async function syncAll({ announce = false } = {}) {
    if (!currentUser) return;
    try {
      await Promise.all([coordinator.sync(), syncSettings(currentUser.uid)]);
      await onPlansChanged();
      if (announce) showToast("撮影計画と設定を同期しました");
    } catch (error) {
      console.error(error);
      if (announce) showToast(navigator.onLine ? "同期を完了できませんでした" : "オフラインです。変更は端末に保存しました");
    }
  }

  async function finishMigration(mode) {
    if (!currentUser) return;
    mergeButton.disabled = true;
    skipButton.disabled = true;
    try {
      if (mode === "merge") {
        const copied = await coordinator.copyGuestPlans(currentUser.uid);
        showToast(`${copied}件の端末計画をアカウントへ追加します`);
      }
      localStorage.setItem(`${MIGRATION_KEY}${currentUser.uid}`, mode);
      migration.hidden = true;
      await syncAll({ announce: true });
    } finally {
      mergeButton.disabled = false;
      skipButton.disabled = false;
    }
  }

  async function handleUser(user) {
    currentUser = user;
    if (!user) {
      window.clearTimeout(settingsPushTimer);
      coordinator.disconnect();
      renderSignedOut();
      await onPlansChanged();
      return;
    }
    renderUser(user);
    await coordinator.connect(user.uid, client.plansFor(user.uid), { syncNow: false });
    await onPlansChanged();
    const guestPlans = await coordinator.listGuestPlans();
    const migrationChoice = localStorage.getItem(`${MIGRATION_KEY}${user.uid}`);
    if (guestPlans.length && !migrationChoice) {
      migrationText.textContent = `この端末にある${guestPlans.length}件の計画を、${user.email || "このアカウント"}へ追加できます。`;
      migration.hidden = false;
      setState("pending", "初回同期を選択", "端末の計画は、選択するまで変更しません");
      return;
    }
    migration.hidden = true;
    await syncAll();
  }

  coordinator.subscribe(({ status, detail: statusDetail }) => {
    if (!currentUser) return;
    const userLabel = currentUser.displayName || currentUser.email || "CelestiFrameアカウント";
    if (status === "syncing") setState("syncing", userLabel, "クラウドと照合しています…");
    if (status === "synced") setState("synced", userLabel, statusDetail ? `${statusDetail}・同期済み` : "同期済み");
    if (status === "offline") setState("offline", userLabel, "オフライン・変更は端末に保存済み");
    if (status === "pending") setState("pending", userLabel, statusDetail || "未同期の変更があります");
  });

  store.subscribe((state) => {
    const nextSettings = JSON.stringify(safeSettings(state.settings));
    if (nextSettings === lastSettings) return;
    lastSettings = nextSettings;
    if (!currentUser || applyingRemoteSettings) return;
    const userId = currentUser.uid;
    const record = { settings: JSON.parse(nextSettings), updatedAt: new Date().toISOString() };
    localStorage.setItem(`${SETTINGS_KEY}${userId}`, JSON.stringify(record));
    window.clearTimeout(settingsPushTimer);
    settingsPushTimer = window.setTimeout(() => {
      if (currentUser?.uid !== userId) return;
      client.putPreferences(userId, record).catch((error) => {
        console.warn("Settings sync deferred", error);
        setState(navigator.onLine ? "pending" : "offline", title.textContent, "設定は端末に保存済みです");
      });
    }, 600);
  });

  signInButton.disabled = true;
  signInButton.textContent = "同期準備中…";
  createFirebaseClient().then((nextClient) => {
    client = nextClient;
    signInButton.disabled = false;
    signInButton.textContent = "Googleで同期";
    client.onAuthStateChanged((user) => handleUser(user).catch((error) => {
      console.error(error);
      setState(navigator.onLine ? "pending" : "offline", "同期を開始できません", error.message || "通信を確認してください");
    }));
  }).catch((error) => {
    console.error(error);
    signInButton.textContent = "クラウドを利用できません";
    setState("offline", "この端末に保存中", "Firebaseへ接続できません。ローカル機能は使えます");
  });

  signInButton.addEventListener("click", () => {
    if (!client) return;
    client.signIn().catch((error) => {
      if (error.code === "auth/popup-closed-by-user" || error.code === "auth/cancelled-popup-request") return;
      console.error(error);
      showToast("Googleログインを完了できませんでした");
    });
  });
  syncButton.addEventListener("click", () => syncAll({ announce: true }));
  signOutButton.addEventListener("click", () => client?.signOut().catch((error) => {
    console.error(error);
    showToast("ログアウトできませんでした");
  }));
  mergeButton.addEventListener("click", () => finishMigration("merge"));
  skipButton.addEventListener("click", () => finishMigration("skip"));
  window.addEventListener("online", () => currentUser && syncAll());

  renderSignedOut();
}
