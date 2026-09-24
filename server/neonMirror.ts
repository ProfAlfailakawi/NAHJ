import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

/*
 * Neon هو المخزن الدائم؛ SQLite يبقى محرّك العمل داخل الخادم.
 *
 * نهج يعمل على Cloud Run، وقرص الحاوية يُمحى مع كل إعادة تشغيل أو نشر. فبدل
 * إعادة كتابة كل المسارات لقاعدة غير متزامنة، نُبقي SQLite كما هو، ونعكس ملفه
 * كاملاً إلى Neon (لقطة `VACUUM INTO` متّسقة) عند كل تغيّر، ونستعيد أحدث لقطة
 * عند الإقلاع قبل أن تُفتح القاعدة.
 *
 * القاعدة الذهبية: إن ضُبط NAHJ_NEON_URL وتعذّرت الاستعادة، يسقط الإقلاع ولا
 * يبدأ فارغاً — فالبدء فارغاً ثم عكس الفراغ إلى Neon يمحو البيانات الحقيقية.
 *
 * يعمل خادمٌ واحد فقط (max-instances=1): كاتبان على لقطة واحدة يتبادلان الدهس.
 */

const MIRROR_INTERVAL_MS = 20_000;
const SNAPSHOTS_KEPT = 20;

export const neonUrl = () => (process.env.NAHJ_NEON_URL || "").trim();

const RESTORE_SCRIPT = `
const { Client } = require("pg");
const fs = require("node:fs");
(async () => {
  const client = new Client({ connectionString: process.env.NAHJ_NEON_URL });
  await client.connect();
  await client.query("CREATE TABLE IF NOT EXISTS nahj_snapshots (id BIGSERIAL PRIMARY KEY, taken_at TIMESTAMPTZ NOT NULL DEFAULT now(), sha256 TEXT NOT NULL, bytes BYTEA NOT NULL)");
  const { rows } = await client.query("SELECT bytes, taken_at FROM nahj_snapshots ORDER BY id DESC LIMIT 1");
  await client.end();
  if (!rows.length) { console.log("[NAHJ] Neon: no snapshot yet — first start, beginning fresh."); return; }
  fs.writeFileSync(process.argv[1], rows[0].bytes);
  console.log("[NAHJ] Neon: restored snapshot from " + new Date(rows[0].taken_at).toISOString() + " (" + rows[0].bytes.length + " bytes).");
})().catch((e) => { console.error("[NAHJ] Neon restore FAILED:", e && e.message ? e.message : e); process.exit(1); });
`;

/** يُستدعى قبل فتح القاعدة. متزامن عمداً: `openDatabase()` متزامن ويُنادى وقت التحميل. */
export function restoreFromNeonSync(filename: string) {
  if (!neonUrl() || filename === ":memory:") return;
  if (fs.existsSync(filename) && fs.statSync(filename).size > 0) return;
  // `node -e script <path>`: the target file arrives as process.argv[1].
  execFileSync(process.execPath, ["-e", RESTORE_SCRIPT, filename], {
    stdio: "inherit",
    timeout: 60_000,
  });
}

type PgPool = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>; end: () => Promise<void> };

export function startNeonMirror(db: DatabaseSync, filename: string) {
  if (!neonUrl() || filename === ":memory:") return { syncNow: async () => {}, stop: () => {} };
  let pool: PgPool | null = null;
  let lastSha = "";
  let running: Promise<void> | null = null;

  const getPool = async () => {
    if (pool) return pool;
    const { Pool } = (await import("pg")) as any;
    pool = new Pool({ connectionString: neonUrl(), max: 2, idleTimeoutMillis: 30_000 }) as PgPool;
    return pool;
  };

  const syncOnce = async () => {
    const tmp = path.join(os.tmpdir(), `nahj-mirror-${process.pid}-${Date.now()}.sqlite`);
    try {
      db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
      const bytes = fs.readFileSync(tmp);
      const sha = createHash("sha256").update(bytes).digest("hex");
      if (sha === lastSha) return;
      const p = await getPool();
      await p.query("INSERT INTO nahj_snapshots (sha256, bytes) VALUES ($1, $2)", [sha, bytes]);
      await p.query(
        `DELETE FROM nahj_snapshots WHERE id NOT IN (SELECT id FROM nahj_snapshots ORDER BY id DESC LIMIT ${SNAPSHOTS_KEPT})`,
      );
      lastSha = sha;
    } catch (error) {
      console.error("[NAHJ] Neon mirror failed (will retry):", error instanceof Error ? error.message : error);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  };

  const syncNow = () => {
    running ??= syncOnce().finally(() => { running = null; });
    return running;
  };

  const timer = setInterval(() => void syncNow(), MIRROR_INTERVAL_MS);
  timer.unref();
  return { syncNow, stop: () => clearInterval(timer) };
}
