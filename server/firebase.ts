/*
 * مرآة Firestore — محجوبةٌ بالقواعد منذ ٢٠٢٦-٠٩-١٧ لكنها مستعملة (حالتها تُعرض
 * في شاشة الربط). لماذا لم تُحذف وما شرط حذفها: CONNECT.md، القسم الأول.
 */
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
/*
 * «موصول» تعني: نجحت عمليةٌ واحدة على الأقل ولم تفشل بعدها.
 *
 * كانت تُرفع بمجرّد إنشاء عميل SDK — وهو بناءُ كائنٍ في الذاكرة لا يلمس الشبكة،
 * ينجح بمفاتيح ملفَّقة وبلا إنترنت أصلاً. فكان النشر الذي ترفض قواعدُه كلَّ
 * كتابة يعرض «وصلة قائمة» وختمَ مزامنةٍ ناجحة، وهو بالضبط النشر القائم اليوم.
 *
 * فالإثبات صار من عملٍ نجح لا من كائنٍ أُنشئ.
 */
let isConnected = false;
let lastSyncTime: string | null = null;
let connectionError: string | null = null;

/*
 * غياب ملف الإعداد يعني «لا مزامنة»، لا «تواصل مع الإنتاج».
 *
 * كانت الدالة ترتدّ إلى معرّفات مشروع الإنتاج `nahj-a27a4` مكتوبةً هنا حرفيًا.
 * فنزعُ الملف — وهو ما يفعله أيُّ من يشغّل نسخةً محلية ليعزل نفسه — لا يفصل
 * شيئًا: يبقى الخادم موصولًا بمشروع المؤسسة الحقيقي ويكتب إليه. ولا يُعلَن ذلك
 * في أي مكان؛ السطر الوحيد في السجلّ يقول «Initialized connected to project».
 *
 * ورُئي عمليًا: تشغيلٌ محلي واحد بعد نزع الملف حاول اثنتين وثلاثين كتابة على
 * `nahj-a27a4`. ولم تنجح واحدة — قواعد Firestore ترفض عملاء غير مصرَّح لهم منذ
 * ٢٠٢٦-٠٩-١٧ (انظر CONNECT.md) — فلم يُمَسّ شيء. لكن الحاجز الذي أنقذ الموقف
 * هو آخر حاجز، والاعتماد عليه وحده سوء تصميم: كان يكفي أن تكون القواعد مفتوحة
 * كما كانت قبل ذلك التاريخ ليكتب جهازُ مطوّرٍ في قاعدة المؤسسة بلا أن يقصد.
 *
 * فبلا ملفٍ لا يُهيَّأ شيء. والنشر لا يتأثر: `Dockerfile` ينسخ الملف إلى الصورة،
 * فالحاوية تجده كما كانت دائمًا.
 */
export function getFirebaseConfig(): Record<string, any> | null {
  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn("[Firebase] Could not read firebase-applet-config.json:", err);
    return null;
  }
  return null;
}

export function initFirebase() {
  if (firestoreDb) return { app: firebaseApp, db: firestoreDb };
  try {
    /*
     * مفتاح إيقافٍ صريح، تضبطه الاختبارات على `off`.
     *
     * `npm test` كان يتصل بمشروع الإنتاج ويحاول الكتابة إليه: أيّ اختبارٍ يمرّ
     * بـ`auth.ts` يكتب حدث تدقيق، و`db.ts` يزامن كل حدث تدقيق. فرصدنا في تشغيلٍ
     * واحد أربعًا وستين محاولة كتابة على `nahj-a27a4`. رُفضت كلها بقواعد
     * Firestore فلم يُكتب شيء — لكن اختبارًا يعتمد على قواعد الإنتاج ليمتنع عن
     * إفساد الإنتاج ليس اختبارًا معزولًا، وإنما مصادفةٌ محظوظة.
     *
     * والمفتاح في هذه الدالة وحدها لا عند كل نداء: المزامنة تُنادى من مواضع
     * متفرّقة في `db.ts`، وحارسٌ عند كل موضع يُنسى واحدُه.
     */
    if (String(process.env.NAHJ_FIREBASE_SYNC || "").toLowerCase() === "off") {
      connectionError = "FIREBASE_SYNC_DISABLED";
      console.warn("[Firebase] المزامنة موقوفة بـ NAHJ_FIREBASE_SYNC=off.");
      return { app: null, db: null };
    }
    const config = getFirebaseConfig();
    if (!config?.projectId) {
      /* يُقال صراحةً، ولا يُترك صمتًا يُظنّ معه أن المزامنة تعمل. */
      connectionError = "FIREBASE_UNCONFIGURED";
      console.warn("[Firebase] لا ملف إعداد — المزامنة معطّلة. كل شيء يبقى في القاعدة المحلية.");
      return { app: null, db: null };
    }
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

    /*
     * لا تُرفع «موصول» هنا: العميل جاهز، ولا شيء أُثبت بعد. أول كتابةٍ ناجحة
     * هي التي ترفعها، وأول فشلٍ يُسقطها.
     */
    connectionError = null;
    console.log(`[Firebase] Client ready for project: ${config.projectId} (liveness unproven until first successful write)`);
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
    /* لا يكفي وجود عميل: يلزم عملٌ نجح ولم يُنقض بفشلٍ بعده. */
    connected: isConnected && !!firestoreDb && !!lastSyncTime && !connectionError,
    /** العميل مُنشأ وجاهز — وهذا غير كونه موصولاً. */
    clientReady: !!firestoreDb,
    /* بلا إعداد لا يُذكر مشروعٌ بعينه: ذكرُه يوحي بوصلٍ غير قائم. */
    projectId: config?.projectId || "",
    databaseId: config?.firestoreDatabaseId || "",
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
    /* كتابةٌ نجحت: هذا وحده ما يُثبت الوصل، ويمسح خطأً سابقاً. */
    isConnected = true;
    connectionError = null;
    lastSyncTime = new Date().toISOString();
    return true;
  } catch (err: any) {
    console.warn(`[Firebase] Failed to sync ${collectionName}/${docId}:`, err?.message || err);
    /*
     * وفشلٌ يُسقط الوصل ولا يكتفي بتسجيل السبب. وكان الفشل يُسجَّل بينما تبقى
     * «موصول» مرفوعة — فيتعايش على الشاشة وسمٌ أخضر مع خطأ منع صلاحية.
     */
    isConnected = false;
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
