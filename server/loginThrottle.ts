import { openDatabase } from "./persistence.ts";

/*
 * حدّ محاولات الدخول الفاشلة لكل عنوان IP — محفوظٌ في قاعدة البيانات.
 *
 * كان العدّاد خريطةً في الذاكرة، فكل إعادة تشغيلٍ للخادم (نشرٌ، أو انهيارٌ
 * يُعيده Docker) تُصفّر العدّ. ومن يخمّن كلمات المرور يكفيه أن ينتظر إعادة
 * التشغيل التالية — أو أن يتسبّب فيها. صار العدّ صفّاً في SQLite يبقى بعدها.
 */
export const LOGIN_IP_WINDOW_MS = 15 * 60_000;
export const LOGIN_IP_MAX_FAILURES = 30;

let schemaReady = false;
function ensureSchema(): void {
  if (schemaReady) return;
  openDatabase().exec(`
    CREATE TABLE IF NOT EXISTS login_throttle (
      ip TEXT PRIMARY KEY,
      failures INTEGER NOT NULL,
      reset_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_login_throttle_reset ON login_throttle(reset_at);
  `);
  schemaReady = true;
}

/** للاختبارات: بعد إغلاق القاعدة وفتح غيرها يُعاد إنشاء الجدول. */
export function resetLoginThrottleSchemaCache(): void { schemaReady = false; }

export function ipBlocked(ip: string, now = Date.now()): boolean {
  ensureSchema();
  const row = openDatabase().prepare("SELECT failures, reset_at FROM login_throttle WHERE ip = ?").get(ip) as
    | { failures: number; reset_at: number }
    | undefined;
  if (!row) return false;
  if (Number(row.reset_at) <= now) {
    openDatabase().prepare("DELETE FROM login_throttle WHERE ip = ?").run(ip);
    return false;
  }
  return Number(row.failures) >= LOGIN_IP_MAX_FAILURES;
}

export function recordIpFailure(ip: string, now = Date.now()): number {
  ensureSchema();
  const db = openDatabase();
  db.prepare(
    `INSERT INTO login_throttle(ip, failures, reset_at) VALUES(?, 1, ?)
     ON CONFLICT(ip) DO UPDATE SET
       failures = CASE WHEN login_throttle.reset_at <= ? THEN 1 ELSE login_throttle.failures + 1 END,
       reset_at = CASE WHEN login_throttle.reset_at <= ? THEN excluded.reset_at ELSE login_throttle.reset_at END`,
  ).run(ip, now + LOGIN_IP_WINDOW_MS, now, now);
  /* تنظيفٌ دوري رخيص: المنتهي لا يُحتفظ به. */
  db.prepare("DELETE FROM login_throttle WHERE reset_at <= ?").run(now);
  const row = db.prepare("SELECT failures FROM login_throttle WHERE ip = ?").get(ip) as { failures: number } | undefined;
  return Number(row?.failures || 0);
}
