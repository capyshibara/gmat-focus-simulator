import { initializeApp } from "firebase/app";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut, setPersistence,
  browserLocalPersistence, type User,
} from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCLr6E1UzWt6BL74aqfSbJpMxMEnmznz5E",
  authDomain: "gmat-focus-simulator.firebaseapp.com",
  projectId: "gmat-focus-simulator",
  storageBucket: "gmat-focus-simulator.firebasestorage.app",
  messagingSenderId: "378265992317",
  appId: "1:378265992317:web:05e31985c75d0f39578514",
};

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

const AUTH_REDIRECT_FLAG = "gmat:auth-redirect-pending";
const isMobileDevice = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// The user closed/cancelled the popup themselves — not a failure, never fall
// back to a full-page redirect for these (that would yank them out of the
// app for something they chose to back out of).
const SILENT_CANCEL_CODES = new Set(["auth/popup-closed-by-user", "auth/cancelled-popup-request"]);
// The popup mechanism itself didn't work (blocked, unsupported webview) —
// these are worth retrying via redirect.
const POPUP_UNAVAILABLE_CODES = new Set(["auth/popup-blocked", "auth/operation-not-supported-in-this-environment"]);

// Single source of truth for auth error codes → user-facing copy, shared by
// the popup path (thrown synchronously to the caller) and the redirect path
// (surfaced via subscribeAuth's onRedirectError).
export function authErrorMessage(code: string): string | null {
  const known: Record<string, string | null> = {
    "auth/configuration-not-found": "Google sign-in isn't turned on for this app yet (Firebase Console → Authentication).",
    "auth/unauthorized-domain": "This site's domain isn't on the Firebase auth allow-list yet (Firebase Console → Authentication → Settings → Authorized domains).",
    "auth/popup-closed-by-user": null, // user closed it themselves, not an error worth surfacing
    "auth/cancelled-popup-request": null,
  };
  if (code in known) return known[code];
  return `Sign-in failed${code ? ` (${code})` : ""}. Please try again.`;
}

export function subscribeAuth(callback: (user: User | null) => void, onRedirectError?: (err: any) => void) {
  setPersistence(auth, browserLocalPersistence).catch(() => {});
  getRedirectResult(auth).catch((err) => { if (onRedirectError) onRedirectError(err); });
  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth, provider);
    sessionStorage.removeItem(AUTH_REDIRECT_FLAG);
  } catch (err: any) {
    if (SILENT_CANCEL_CODES.has(err?.code)) throw err;
    if (!POPUP_UNAVAILABLE_CODES.has(err?.code) && !isMobileDevice()) throw err;
    sessionStorage.setItem(AUTH_REDIRECT_FLAG, "1");
    await signInWithRedirect(auth, provider);
  }
}

export async function signOutUser() {
  await signOut(auth);
}

function stateDoc(uid: string, key: "attempts" | "questionLog") {
  return doc(db, "users", uid, "state", key);
}

export async function pullUserState(uid: string) {
  const [a, q] = await Promise.all([getDoc(stateDoc(uid, "attempts")), getDoc(stateDoc(uid, "questionLog"))]);
  return {
    attempts: (a.exists() ? a.data().list : []) ?? [],
    questionLog: (q.exists() ? q.data().list : []) ?? [],
  };
}

export async function pushAttempts(uid: string, list: unknown[]) {
  await setDoc(stateDoc(uid, "attempts"), { list, updatedAt: Date.now() });
}

export async function pushQuestionLog(uid: string, list: unknown[]) {
  await setDoc(stateDoc(uid, "questionLog"), { list, updatedAt: Date.now() });
}

export function subscribeUserState(
  uid: string,
  onAttempts: (list: any[]) => void,
  onQuestionLog: (list: any[]) => void
) {
  const unsubA = onSnapshot(stateDoc(uid, "attempts"), (snap) => onAttempts(snap.exists() ? snap.data().list ?? [] : []));
  const unsubQ = onSnapshot(stateDoc(uid, "questionLog"), (snap) => onQuestionLog(snap.exists() ? snap.data().list ?? [] : []));
  return () => { unsubA(); unsubQ(); };
}
