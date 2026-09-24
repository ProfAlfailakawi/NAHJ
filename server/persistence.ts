import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { restoreFromNeonSync, startNeonMirror } from "./neonMirror.ts";

/*
 * التخزين الدائم للذاكرة التشغيلية.
 *
 * كانت حالة المنصة كائناً في الذاكرة يُبذَر من بيانات العرض عند كل إقلاع: أي إعادة تشغيل
 * تمحو كل مهارة رُقّيت وكل موافقة صدرت وكل أثر تدقيق. والمزامنة مع Firestore كانت باتجاه
 * واحد — تكتب ولا تقرأ — فلم تكن تستعيد شيئاً.
 *
 * التصميم هنا مقصود البساطة: الحالة تبقى كائناً واحداً في الذاكرة (وهو ما بُنيت عليه كل
 * المسارات)، ويُحفظ كل مجموعة كـJSON في SQLite. الحفظ دوري ويقارن بصمة المحتوى، فلا
 * يحتاج تعديل ٤٣ مساراً ليستدعي حفظاً يدوياً قد يُنسى في واحد منها.
 */

const FLUSH_INTERVAL_MS = 3_000;
/* سجل التدقيق ينمو بلا حدّ؛ نحتفظ بأحدث ما يسع ذاكرة ومراجعة معقولة. */
export const AUDIT_RETENTION = 5_000;

export function resolveDatabasePath() {
  const explicit = process.env.NAHJ_DATABASE_PATH;
  if (explicit) return explicit === ":memory:" ? explicit : path.resolve(explicit);
  const dataDirectory = path.resolve(process.env.NAHJ_DATA_DIR || path.join(process.cwd(), "var"));
  return path.join(dataDirectory, "nahj.sqlite");
}

let database: DatabaseSync | null = null;
/** مرآة Neon — تُبدأ مع أول فتحٍ للقاعدة، وتُفرَغ عند الإيقاف (server.ts). */
export let neonMirror: { syncNow: () => Promise<void>; stop: () => void } = { syncNow: async () => {}, stop: () => {} };

/*
 * WAL يحتاج ذاكرة مشتركة (mmap) بين العمليات، وهي غير متاحة على أنظمة الملفات
 * الشبكية: NFS/Filestore، وGCS FUSE. على تلك الأنظمة لا يفشل SQLite بصوت مرتفع —
 * يتجاهل الطلب ويبقى على الوضع القديم. فنقرأ الوضع الفعلي بعد الضبط بدل افتراضه.
 *
 * TRUNCATE هو البديل الآمن هناك: أبطأ في الكتابة، لكنه لا يعتمد على الذاكرة
 * المشتركة. الكتابة عندنا نادرة (دفقة كل ٣ ثوانٍ عند تغيّر المحتوى فقط)، فالفارق
 * غير محسوس — بخلاف قاعدة بيانات تالفة.
 */
function applyJournalMode(db: DatabaseSync, filename: string) {
  if (filename === ":memory:") return;
  let mode = "";
  try {
    const row = db.prepare("PRAGMA journal_mode = WAL").get() as { journal_mode?: string } | undefined;
    mode = String(row?.journal_mode ?? "").toLowerCase();
  } catch {
    mode = "";
  }
  if (mode === "wal") return;

  try {
    db.prepare("PRAGMA journal_mode = TRUNCATE").get();
  } catch {
    /* نُبقي الوضع الافتراضي؛ التحذير أدناه يبقى هو الإشارة. */
  }
  console.warn(
    `[NAHJ] تعذّر تفعيل WAL على ${filename} (الوضع الفعلي: ${mode || "غير معروف"}). ` +
      "هذا يعني غالباً أن القاعدة على نظام ملفات شبكي (NFS/Filestore أو GCS FUSE). " +
      "تعمل المنصة، لكن قرصاً كتلياً دائماً (Persistent Disk على VM) أكثر أماناً بكثير لـ SQLite.",
  );
}

export function openDatabase(): DatabaseSync {
  if (database) return database;
  const filename = resolveDatabasePath();
  if (filename !== ":memory:") fs.mkdirSync(path.dirname(filename), { recursive: true });
  restoreFromNeonSync(filename);
  const db = new DatabaseSync(filename);
  /*
   * انتظارٌ قصير عند القفل بدل الفشل الفوري.
   *
   * بدونه تفشل أي كتابةٍ تصادف لحظة قفلٍ — نسخةٌ احتياطية بـVACUUM INTO، أو
   * عمليةٌ ثانية على الملف — بـ«database is locked» فوراً. وهو ما كان يُسقط
   * الاختبارات أحياناً حين تتشارك ملفاً واحداً.
   */
  db.exec("PRAGMA busy_timeout = 5000");
  applyJournalMode(db, filename);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS operational_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      failed_login_count INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      csrf_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
  `);
  database = db;
  neonMirror = startNeonMirror(db, filename);
  return db;
}

/** يقرأ لقطة مجموعة واحدة. يعيد undefined إن لم تُحفظ بعد (إقلاع أول). */
export function readState<T>(key: string): T | undefined {
  const row = openDatabase().prepare("SELECT value FROM operational_state WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  if (!row) return undefined;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    // لقطة تالفة لا تُسقط الخادم: نتجاهلها ونعود للبذرة، مع تسجيل السبب.
    console.warn(`[NAHJ] Corrupt persisted state for "${key}" — falling back to seed.`);
    return undefined;
  }
}

export function writeState(key: string, value: unknown) {
  const serialized = JSON.stringify(value);
  openDatabase()
    .prepare(
      `INSERT INTO operational_state(key, value, updated_at) VALUES(?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, serialized, new Date().toISOString());
  return serialized;
}

export function hasPersistedState() {
  const row = openDatabase().prepare("SELECT COUNT(*) AS count FROM operational_state").get() as { count: number };
  return Number(row?.count ?? 0) > 0;
}

/**
 * يبدأ الحفظ الدوري. يقارن ما سُلسل آخر مرة بما هو الآن، فلا يكتب إلا عند تغيّر فعلي —
 * وهذا ما يجعل الاعتماد على الدورية بدل نداء حفظ في كل مسار آمناً.
 */
export function startPersistenceWorker(snapshot: () => Record<string, unknown>) {
  const lastSerialized = new Map<string, string>();

  const flush = () => {
    try {
      for (const [key, value] of Object.entries(snapshot())) {
        const serialized = JSON.stringify(value);
        if (lastSerialized.get(key) === serialized) continue;
        writeState(key, value);
        lastSerialized.set(key, serialized);
      }
    } catch (error) {
      console.error("[NAHJ] Persistence flush failed:", error instanceof Error ? error.message : error);
    }
  };

  // أول كتابة فورية حتى لا يضيع ما حدث قبل أول دورة.
  flush();
  const timer = setInterval(flush, FLUSH_INTERVAL_MS);
  timer.unref();
  return { flush, stop: () => clearInterval(timer) };
}

export function closeDatabase() {
  if (!database) return;
  database.close();
  database = null;
}
