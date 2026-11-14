import { randomBytes, randomUUID } from "node:crypto";
import { openDatabase } from "./persistence.ts";
import { verifyPassword, type Account } from "./auth.ts";

/*
 * حذف الحساب من داخل التطبيق (App Store Guideline 5.1.1(v)).
 *
 * القرار الذي يعكسه الكود، لا أكثر:
 *   - المستخدم يطلب الحذف بكلمة مروره. الطلب يُسجَّل، ويُعلَّق الحساب وتُنهى جلساته فوراً.
 *   - لا يُحذف شيء تلقائياً: مشرف المؤسسة (أو المالك) يرى الطلب في شاشة الحسابات وينفّذه
 *     بزر «إتمام الحذف»، فيُجهَّل صفّ الحساب (بريد واسم وكلمة مرور) ويُستبدل اسمه في سجلّ التدقيق.
 *   - بيانات المؤسسة التشغيلية (حالات العمل والمهارات والموافقات) ملكٌ للمؤسسة ولا تُمسّ أبداً.
 *   - حساب المالك (صاحب الترخيص) وآخر مشرف نشط لا يُطلب حذفهما من هنا: كلاهما يقفل المؤسسة
 *     خارج نظامها. يُرفض الطلب برسالة تشرح الخطوة المطلوبة.
 */

export const DELETION_SLA_DAYS = 30;

export type DeletionStatus = "PENDING" | "COMPLETED";

export interface DeletionRequest {
  id: string;
  accountId: string;
  email: string;
  name: string;
  role: string;
  status: DeletionStatus;
  reason: string | null;
  requestedAt: string;
  dueBy: string;
  processedAt: string | null;
  processedBy: string | null;
}

let schemaReady: object | null = null;
function ensureSchema() {
  const db = openDatabase();
  if (schemaReady === db) return db;
  db.exec(`
    CREATE TABLE IF NOT EXISTS account_deletion_requests (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      reason TEXT,
      requested_at TEXT NOT NULL,
      due_by TEXT NOT NULL,
      processed_at TEXT,
      processed_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_deletion_status ON account_deletion_requests(status, requested_at);
  `);
  schemaReady = db;
  return db;
}

const fail = (message: string, status: number, code: string) => Object.assign(new Error(message), { status, code });

function mapRow(row: Record<string, unknown>): DeletionRequest {
  return {
    id: String(row.id), accountId: String(row.account_id), email: String(row.email), name: String(row.name),
    role: String(row.role), status: String(row.status) as DeletionStatus,
    reason: row.reason ? String(row.reason) : null,
    requestedAt: String(row.requested_at), dueBy: String(row.due_by),
    processedAt: row.processed_at ? String(row.processed_at) : null,
    processedBy: row.processed_by ? String(row.processed_by) : null,
  };
}

/* حدّ معدّل لكل حساب: خمس محاولات في الساعة، تُعدّ الفاشلة والناجحة معاً. */
const attempts = new Map<string, number[]>();
export const DELETION_ATTEMPTS_PER_HOUR = 5;
export function deletionRateLimited(accountId: string, nowMs = Date.now()): boolean {
  const recent = (attempts.get(accountId) || []).filter(t => nowMs - t < 3_600_000);
  if (recent.length >= DELETION_ATTEMPTS_PER_HOUR) { attempts.set(accountId, recent); return true; }
  recent.push(nowMs);
  attempts.set(accountId, recent);
  return false;
}
export function resetDeletionRateLimit() { attempts.clear(); }

/**
 * يسجّل طلب الحذف بعد التحقق من كلمة المرور، ثم يعلّق الحساب وينهي جلساته في معاملة واحدة.
 */
export async function requestAccountDeletion(account: Account, password: unknown, reason: unknown): Promise<DeletionRequest> {
  const db = ensureSchema();
  const row = db.prepare("SELECT role, status, password_hash, password_salt FROM accounts WHERE id = ? LIMIT 1").get(account.id) as
    | { role: string; status: string; password_hash: string; password_salt: string } | undefined;
  if (!row || row.status !== "ACTIVE") throw fail("الحساب غير موجود.", 404, "NOT_FOUND");

  const valid = typeof password === "string" && password.length > 0 && (await verifyPassword(password, row.password_hash, row.password_salt));
  if (!valid) throw fail("كلمة المرور غير صحيحة.", 403, "PASSWORD_INVALID");

  if (row.role === "owner") {
    throw fail("حساب مالك المنصة لا يُحذف من التطبيق لأنه يملك ترخيص المؤسسة. انقل الملكية أو راسل المشغّل أولاً.", 409, "OWNER_ACCOUNT");
  }
  if (row.role === "admin") {
    const others = db.prepare("SELECT COUNT(*) AS n FROM accounts WHERE role IN ('admin','owner') AND status = 'ACTIVE' AND id <> ?").get(account.id) as { n: number };
    if (Number(others.n) < 1) throw fail("أنت آخر مشرف نشط. عيّن مشرفاً آخر قبل طلب حذف حسابك.", 409, "LAST_ADMIN");
  }

  const stamp = new Date();
  const text = typeof reason === "string" ? reason.trim().slice(0, 500) : "";
  const request: DeletionRequest = {
    id: `del_${randomUUID()}`, accountId: account.id, email: account.email, name: account.name, role: row.role,
    status: "PENDING", reason: text || null, requestedAt: stamp.toISOString(),
    dueBy: new Date(stamp.getTime() + DELETION_SLA_DAYS * 86_400_000).toISOString(), processedAt: null, processedBy: null,
  };
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      `INSERT INTO account_deletion_requests(id, account_id, email, name, role, status, reason, requested_at, due_by)
       VALUES(?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
    ).run(request.id, request.accountId, request.email, request.name, request.role, request.reason, request.requestedAt, request.dueBy);
    db.prepare("UPDATE accounts SET status = 'SUSPENDED', updated_at = ? WHERE id = ?").run(request.requestedAt, account.id);
    db.prepare("DELETE FROM sessions WHERE account_id = ?").run(account.id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return request;
}

export function listDeletionRequests(): DeletionRequest[] {
  const db = ensureSchema();
  return (db.prepare("SELECT * FROM account_deletion_requests ORDER BY (status = 'PENDING') DESC, requested_at DESC LIMIT 500").all() as Array<Record<string, unknown>>).map(mapRow);
}

export function pendingDeletionCount(): number {
  const row = ensureSchema().prepare("SELECT COUNT(*) AS n FROM account_deletion_requests WHERE status = 'PENDING'").get() as { n: number };
  return Number(row.n);
}

/**
 * ينفّذ الطلب: يُجهِّل صفّ الحساب (لا يُحذف الصف نفسه كي لا ينكسر ما يشير إليه)،
 * ويفكّ ربط ملف المسوّق إن وُجد. المنفِّذ لا يكون صاحب الطلب نفسه.
 */
export function completeDeletionRequest(requestId: string, processor: Account): { request: DeletionRequest; anonymizedEmail: string } {
  const db = ensureSchema();
  const found = db.prepare("SELECT * FROM account_deletion_requests WHERE id = ? LIMIT 1").get(requestId) as Record<string, unknown> | undefined;
  if (!found) throw fail("الطلب غير موجود.", 404, "NOT_FOUND");
  const request = mapRow(found);
  if (request.status !== "PENDING") throw fail("نُفّذ هذا الطلب مسبقاً.", 409, "ALREADY_COMPLETED");
  if (request.accountId === processor.id) throw fail("لا تنفّذ طلب حذف حسابك بنفسك.", 403, "SELF_PROCESS");

  const account = db.prepare("SELECT role, status FROM accounts WHERE id = ? LIMIT 1").get(request.accountId) as { role: string; status: string } | undefined;
  if (account?.role === "owner") throw fail("حساب المالك لا يُجهَّل من هنا.", 409, "OWNER_ACCOUNT");

  const stamp = new Date().toISOString();
  const anonymizedEmail = `deleted-${request.id.slice(4, 12)}@deleted.invalid`;
  db.exec("BEGIN IMMEDIATE");
  try {
    if (account) {
      db.prepare(
        `UPDATE accounts SET email = ?, name = 'حساب محذوف', role = 'viewer', status = 'DELETED',
           password_hash = ?, password_salt = ?, failed_login_count = 0, locked_until = NULL, updated_at = ? WHERE id = ?`,
      ).run(anonymizedEmail, randomBytes(32).toString("hex"), randomBytes(16).toString("hex"), stamp, request.accountId);
      db.prepare("DELETE FROM sessions WHERE account_id = ?").run(request.accountId);
    }
    try { db.prepare("UPDATE partners SET account_id = NULL WHERE account_id = ?").run(request.accountId); } catch { /* جدول المسوّقين غير موجود بعد */ }
    db.prepare("UPDATE account_deletion_requests SET status = 'COMPLETED', processed_at = ?, processed_by = ? WHERE id = ?").run(stamp, processor.email, requestId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { request: { ...request, status: "COMPLETED", processedAt: stamp, processedBy: processor.email }, anonymizedEmail };
}
