import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import {
  getFirestore,
  Firestore,
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  limit,
} from "firebase/firestore";
import fs from "fs";
import path from "path";

let firebaseApp: FirebaseApp | null = null;
let firestoreDb: Firestore | null = null;
let isConnected = false;
let lastSyncTime: string | null = null;
let connectionError: string | null = null;

export function getFirebaseConfig() {
  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn("[Firebase] Could not read firebase-applet-config.json:", err);
  }
  return {
    projectId: "nahj-a27a4",
    appId: "1:447946287034:web:42b4a0a7fa902fcc7d1f83",
    apiKey: "AIzaSyChj-6_KFBi0ag7XidqKkxp1Fxx7GuDit0",
    authDomain: "nahj-a27a4.firebaseapp.com",
    firestoreDatabaseId: "ai-studio-nahj-e90f35fb-7117-4f9a-abe6-290a5889fc88",
    storageBucket: "nahj-a27a4.firebasestorage.app",
    messagingSenderId: "447946287034",
  };
}

export function initFirebase() {
  if (firestoreDb) return { app: firebaseApp, db: firestoreDb };
  try {
    const config = getFirebaseConfig();
    firebaseApp = getApps().length > 0 ? getApp() : initializeApp(config);
    
    // Attempt with specified custom database ID, fallback to default if not available
    const dbId = config.firestoreDatabaseId;
    try {
      firestoreDb = dbId && dbId !== "(default)"
        ? getFirestore(firebaseApp, dbId)
        : getFirestore(firebaseApp);
    } catch {
      firestoreDb = getFirestore(firebaseApp);
    }

    isConnected = true;
    lastSyncTime = new Date().toISOString();
    console.log(`[Firebase] Initialized connected to project: ${config.projectId}`);
  } catch (err: any) {
    connectionError = err?.message || String(err);
    console.error("[Firebase] Initialization error:", err);
  }
  return { app: firebaseApp, db: firestoreDb };
}

export function getFirestoreDb(): Firestore | null {
  if (!firestoreDb) {
    initFirebase();
  }
  return firestoreDb;
}

export function getFirebaseStatus() {
  const config = getFirebaseConfig();
  return {
    connected: isConnected && !!firestoreDb,
    projectId: config.projectId || "nahj-a27a4",
    databaseId: config.firestoreDatabaseId || "(default)",
    lastSyncTime,
    error: connectionError,
  };
}

/**
 * Persist or sync a document to Firestore collection
 */
export async function syncDocToFirestore(collectionName: string, docId: string, data: Record<string, any>) {
  try {
    const db = getFirestoreDb();
    if (!db) return false;
    const docRef = doc(db, collectionName, docId);
    // Sanitize undefined fields which Firestore rejects
    const cleanData = JSON.parse(JSON.stringify(data));
    await setDoc(docRef, cleanData, { merge: true });
    lastSyncTime = new Date().toISOString();
    return true;
  } catch (err: any) {
    console.warn(`[Firebase] Failed to sync ${collectionName}/${docId}:`, err?.message || err);
    connectionError = err?.message || String(err);
    return false;
  }
}

/**
 * Load collection from Firestore
 */
export async function fetchCollectionFromFirestore<T>(collectionName: string): Promise<T[]> {
  try {
    const db = getFirestoreDb();
    if (!db) return [];
    const colRef = collection(db, collectionName);
    const snap = await getDocs(colRef);
    const items: T[] = [];
    snap.forEach((d) => {
      items.push({ id: d.id, ...d.data() } as T);
    });
    return items;
  } catch (err: any) {
    console.warn(`[Firebase] Failed to fetch collection ${collectionName}:`, err?.message || err);
    return [];
  }
}
