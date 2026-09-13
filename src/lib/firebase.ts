import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, doc, onSnapshot } from "firebase/firestore";

export const firebaseConfig = {
  projectId: "nahj-a27a4",
  appId: "1:447946287034:web:42b4a0a7fa902fcc7d1f83",
  apiKey: "AIzaSyChj-6_KFBi0ag7XidqKkxp1Fxx7GuDit0",
  authDomain: "nahj-a27a4.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-nahj-e90f35fb-7117-4f9a-abe6-290a5889fc88",
  storageBucket: "nahj-a27a4.firebasestorage.app",
  messagingSenderId: "447946287034",
};

export function getClientFirebase() {
  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  let db;
  try {
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  } catch {
    db = getFirestore(app);
  }
  return { app, db };
}
