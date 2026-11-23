import { createHash } from "node:crypto";
import { Router, type Response } from "express";
import { openDatabase } from "./persistence.ts";
import type { AuthenticatedRequest } from "./auth.ts";
import {
  APNS_TOKEN_PATTERN, createApnsSender, type ApnsSender, type PushMessage,
} from "./apnsPush.ts";

/*
 * تنبيهاتُ تطبيق iOS (APNs).
 *
 * داخل التطبيق يسجّل الجهازُ نفسه لدى Apple بلمسةٍ واحدة على «فعّل التنبيهات»،
 * فيُحفظ توكنه هنا مربوطاً بالحساب. ومن ثَمّ كل إشعارٍ شخصيّ يُسجَّل في طابور
 * الإشعارات (notify.ts) يصل كذلك إلى أجهزة صاحبه، وكل طلب اعتمادٍ جديد يصل إلى
 * من يملك حسمه.
 *
 * ثلاث قواعد:
 *   ١. بلا مفتاح APNs في البيئة لا شيء يُرسل ولا خطأ يظهر (no-op صامت).
 *   ٢. التوكن الذي ترفضه Apple (410 / BadDeviceToken / Unregistered) يُحذف.
 *   ٣. الإرسال لا يُعطّل الطلب: يُطلق ولا يُنتظر، وفشله لا يُسقط شيئاً.
 */

let schemaReady = false;

function ensurePushSchema(): void {
  if (schemaReady) return;
  openDatabase().exec(`
    CREATE TABLE IF NOT EXISTS push_devices (
      token TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      platform TEXT NOT NULL DEFAULT 'ios',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_push_devices_account ON push_devices(account_id);
  `);
  schemaReady = true;
}

export function resetPushSchemaCache(): void { schemaReady = false; }

/** بصمة التوكن كما تحسبها الواجهة — لا يُعاد التوكن نفسه إلى المتصفح. */
export const deviceId = (token: string) => createHash("sha256").update(`apns:${token.toLowerCase()}`).digest("hex");

export function saveDevice(accountId: string, token: string): void {
  ensurePushSchema();
  const now = new Date().toISOString();
  openDatabase().prepare(
    `INSERT INTO push_devices(token, account_id, platform, created_at, updated_at) VALUES(?,?,'ios',?,?)
     ON CONFLICT(token) DO UPDATE SET account_id = excluded.account_id, updated_at = excluded.updated_at`,
  ).run(token.toLowerCase(), accountId, now, now);
}

export function removeDevice(token: string, accountId?: string): number {
  ensurePushSchema();
  const db = openDatabase();
  const result = accountId
    ? db.prepare("DELETE FROM push_devices WHERE token = ? AND account_id = ?").run(token.toLowerCase(), accountId)
    : db.prepare("DELETE FROM push_devices WHERE token = ?").run(token.toLowerCase());
  return Number(result.changes);
}

export function devicesFor(accountIds: string[]): string[] {
  ensurePushSchema();
  if (!accountIds.length) return [];
  const marks = accountIds.map(() => "?").join(",");
  return (openDatabase().prepare(`SELECT token FROM push_devices WHERE account_id IN (${marks})`)
    .all(...accountIds) as Array<{ token: string }>).map(row => String(row.token));
}

/** الحسابات النشطة بالبريد أو بالدور — من جدول الحسابات مباشرة. */
function accountIdsWhere(clause: string, ...params: string[]): string[] {
  return (openDatabase().prepare(`SELECT id FROM accounts WHERE status = 'ACTIVE' AND ${clause}`)
    .all(...params) as Array<{ id: string }>).map(row => String(row.id));
}

export const accountIdsByEmail = (email: string) =>
  accountIdsWhere("lower(email) = ?", String(email || "").trim().toLowerCase());

export const accountIdsByRoles = (roles: string[]) =>
  roles.length ? accountIdsWhere(`role IN (${roles.map(() => "?").join(",")})`, ...roles) : [];

/* ------------------------------------------------------------ الإرسال */

let sender: ApnsSender = createApnsSender();

/** للاختبار: مرسِلٌ بعميل HTTP/2 محاكى. */
export function setApnsSender(next: ApnsSender | null): void {
  sender = next || createApnsSender();
}

export async function pushToAccounts(accountIds: string[], message: PushMessage): Promise<{ sent: number; dropped: number }> {
  if (!sender.configured()) return { sent: 0, dropped: 0 };
  const tokens = [...new Set(devicesFor([...new Set(accountIds)]))];
  let sent = 0;
  let dropped = 0;
  for (const token of tokens) {
    const result = await sender.send(token, message, message.tag ? { collapseId: message.tag } : {});
    if (result.ok) sent += 1;
    else if (result.gone) dropped += removeDevice(token);
  }
  return { sent, dropped };
}

/** يُطلق ولا يُنتظر: لا يُبطئ الطلب ولا يُسقطه. */
export function pushInBackground(accountIds: string[], message: PushMessage): void {
  if (!accountIds.length || !sender.configured()) return;
  void pushToAccounts(accountIds, message).catch(() => undefined);
}

/* ------------------------------------------------------------ الأحداث */

/** وجهةُ كل نوعٍ من إشعارات الطابور داخل التطبيق. */
export function urlForKind(kind: string): string {
  if (kind.startsWith("invoice.") || kind.startsWith("payment.") || kind.startsWith("renewal.") || kind.startsWith("subscription.")) return "/#billing";
  if (kind.startsWith("autopilot.")) return "/#control";
  return "/#today";
}

/** كل إشعارٍ شخصيّ دخل الطابور يصل كذلك إلى أجهزة صاحبه. */
export function pushForNotification(input: { kind: string; recipient: string; subject: string; body: string }): void {
  const firstLine = String(input.body || "").split("\n").map(line => line.trim()).find(Boolean) || "";
  pushInBackground(accountIdsByEmail(input.recipient), {
    title: input.subject.slice(0, 120), body: firstLine.slice(0, 200), url: urlForKind(input.kind), tag: input.kind,
  });
}

/** طلب اعتمادٍ جديد — إلى من يملك حسمه (المشرف دائماً، والمدير إن لم تشترط السياسة أعلى منه). */
export function pushApprovalRequested(input: { id: string; workTitle: string; actionName: string; requiredRole?: string }): void {
  const roles = input.requiredRole === "owner" || input.requiredRole === "admin" ? ["admin", "owner"] : ["admin", "owner", "manager"];
  pushInBackground(accountIdsByRoles(roles), {
    title: "طلب اعتمادٍ بانتظارك",
    body: `${input.workTitle} — ${input.actionName}`.slice(0, 200),
    url: `/#approval=${encodeURIComponent(input.id)}`,
    tag: `approval:${input.id}`,
  });
}

/* ------------------------------------------------------------ المسارات */

export const pushRouter = Router();

pushRouter.get("/status", (req: AuthenticatedRequest, res: Response) => {
  ensurePushSchema();
  const ids = devicesFor(req.account ? [req.account.id] : []).map(deviceId);
  res.json({ configured: sender.configured(), ids });
});

pushRouter.post("/subscribe-native", (req: AuthenticatedRequest, res: Response) => {
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  if (!APNS_TOKEN_PATTERN.test(token)) return res.status(400).json({ success: false, message: "توكن الجهاز غير صالح." });
  if (!req.account) return res.status(401).json({ success: false });
  saveDevice(req.account.id, token);
  res.json({ success: true, id: deviceId(token) });
});

pushRouter.post("/unsubscribe-native", (req: AuthenticatedRequest, res: Response) => {
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  if (!APNS_TOKEN_PATTERN.test(token)) return res.status(400).json({ success: false, message: "توكن الجهاز غير صالح." });
  if (!req.account) return res.status(401).json({ success: false });
  res.json({ success: true, removed: removeDevice(token, req.account.id) });
});
