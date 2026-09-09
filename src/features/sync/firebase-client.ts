import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getDatabase, ref, set, type Database } from "firebase/database";

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAzbwk2ZJj2jmtKRFjzDJyPk4ePmF3Q04M",
  authDomain: "curve-tour-app.firebaseapp.com",
  databaseURL:
    "https://curve-tour-app-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "curve-tour-app",
  storageBucket: "curve-tour-app.firebasestorage.app",
  messagingSenderId: "840551568118",
  appId: "1:840551568118:web:40e3c22de01e2587e8d2d7",
} as const;

let database: Database | null | undefined;

function firebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
}

export function getFirebaseDatabase(): Database | null {
  if (database !== undefined) return database;
  try {
    database = getDatabase(firebaseApp());
  } catch (error) {
    console.warn("Live sync unavailable — Firebase failed to initialize", error);
    database = null;
  }
  return database;
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export class AdminVerificationOfflineError extends Error {
  readonly code = "OFFLINE";
}

export async function verifyAdminSecret(secret: string): Promise<string> {
  const db = getFirebaseDatabase();
  if (!db) throw new AdminVerificationOfflineError("Live sync unavailable");
  const hash = await sha256Hex(secret);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      set(ref(db, "adminAuth/verify"), hash),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new AdminVerificationOfflineError("Verification timed out")),
          5_000,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  return hash;
}
