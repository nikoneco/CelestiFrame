import { FIREBASE_CONFIG } from "../config/firebase-config.js?v=1.8.0";
import { createFirestorePlanRepository } from "./firestore-plan-repository.js?v=1.8.0";

const SDK_VERSION = "12.16.0";
const sdkUrl = (name) => `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-${name}.js`;

export async function createFirebaseClient() {
  const [appSdk, authSdk, firestoreSdk] = await Promise.all([
    import(sdkUrl("app")),
    import(sdkUrl("auth")),
    import(sdkUrl("firestore-lite")),
  ]);
  const app = appSdk.getApps().length ? appSdk.getApp() : appSdk.initializeApp(FIREBASE_CONFIG);
  const auth = authSdk.getAuth(app);
  await authSdk.setPersistence(auth, authSdk.browserLocalPersistence);
  authSdk.useDeviceLanguage(auth);
  const database = firestoreSdk.getFirestore(app);
  const provider = new authSdk.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  const plansFor = (userId) => createFirestorePlanRepository(firestoreSdk, database, userId);

  return {
    onAuthStateChanged(listener) { return authSdk.onAuthStateChanged(auth, listener); },
    signIn() { return authSdk.signInWithPopup(auth, provider); },
    signOut() { return authSdk.signOut(auth); },
    plansFor,
    async getPreferences(userId) {
      const snapshot = await firestoreSdk.getDoc(firestoreSdk.doc(database, "users", userId, "preferences", "app"));
      return snapshot.exists() ? snapshot.data() : null;
    },
    putPreferences(userId, preferences) {
      return firestoreSdk.setDoc(
        firestoreSdk.doc(database, "users", userId, "preferences", "app"),
        structuredClone(preferences),
      );
    },
  };
}
