import { randomUUID } from "node:crypto";
import { openDatabase } from "./persistence.ts";
import { listAccounts } from "./auth.ts";
import {
  daysBetween, evaluateSubscription, formatMoney, getSubscription, listInvoices,
  outstandingBalance, recordBillingEvent,
} from "./billing.ts";

/*
 * الإشعارات.
 *
 * نهج بلا بريد: كلمات المرور تُسلَّم باليد، وانتهاء الاشتراك لا يُنبّه أحداً،
 * والفاتورة تُصدر فلا يعلم بها إلا من فتح الشاشة. ومؤسسةٌ تُجمَّد كتابتها يوم
 * الاثنين لأن أحداً لم يخبرها أن اشتراكها ينتهي الأحد لا تلوم نفسها — تلوم
 * المنتج.
 *
 * والعقد هنا هو عقد بوابة الدفع نفسه، لأن العلّة واحدة:
 *
 *   ١. **بلا مزوّد لا يُدَّعى إرسال.** الحدث يُسجَّل ويُعلَّم «لم يُرسَل — لا
 *      مزوّد بريد»، فيراه المالك ويعرف ما فاته. وواجهةٌ تقول «أُرسل تنبيه»
 *      بينما لا بريد مضبوط أسوأ من صمتٍ صريح.
 *
 *   ٢. **لا يُرسَل مرّتان.** لكل إشعارٍ مفتاحُ تفرّدٍ من الحدث وموضوعه، وقيدٌ
 *      فريد في القاعدة. فتذكيرُ تجديدٍ يُحسب كل ساعة لا يصل اثنتي عشرة مرة.
 *
 *   ٣. **لا يُعطّل الطلب.** الإرسال في عاملٍ دوري لا في مسار الطلب: بطءُ
 *      مزوّد بريد لا يجوز أن يُبطئ تسجيل دفعة.
 *
 *   ٤. **لا كلمة مرور في بريد.** لا قالب هنا يرسل كلمة مرور ولا رابط تعيين:
 *      البريد قناةٌ تُخزَّن وتُعاد توجيهاً وتُقرأ من هاتفٍ ضائع. تسليمُ
 *      المشرف كلمةً مؤقتة بيده أضعفُ راحةً وأقوى أماناً — وهو ما يفعله نهج.
 */

/* ------------------------------------------------------------ الإعداد */

export type MailProvider = "none" | "resend" | "sendgrid" | "webhook";

export interface MailConfig {
  provider: MailProvider;
  apiKey: string;
  from: string;
  webhookUrl: string;
  ownerEmail: string;
}

const env = (name: string) => String(process.env[name] || "").trim();

export function mailConfig(): MailConfig {
  const raw = env("NAHJ_MAIL_PROVIDER").toLowerCase();
  const provider: MailProvider =
    raw === "resend" || raw === "sendgrid" || raw === "webhook" ? raw : "none";
  return {
    provider,
    apiKey: env("NAHJ_MAIL_API_KEY"),
    from: env("NAHJ_MAIL_FROM"),
    webhookUrl: env("NAHJ_MAIL_WEBHOOK_URL"),
    ownerEmail: env("NAHJ_OWNER_EMAIL"),
  };
}

export function notifyStatus() {
  const config = mailConfig();
  const missing: string[] = [];
  if (config.provider === "resend" || config.provider === "sendgrid") {
    if (!config.apiKey) missing.push("مفتاح المزوّد (NAHJ_MAIL_API_KEY)");
    if (!config.from) missing.push("عنوان المُرسِل (NAHJ_MAIL_FROM)");
  }
  if (config.provider === "webhook" && !config.webhookUrl) {
    missing.push("عنوان الاستقبال (NAHJ_MAIL_WEBHOOK_URL)");
  }
  const configured = config.provider !== "none" && missing.length === 0;

  const counts = countsByStatus();
  return {
    provider: config.provider,
    configured,
    missing,
    from: configured ? config.from : "",
    counts,
    note: configured
      ? `الإشعارات تُرسل عبر ${config.provider}.`
      : config.provider === "none"
        ? "لا مزوّد بريد مضبوط — الأحداث تُسجَّل هنا ولا تُرسل. التبليغ يدوي."
        : "المزوّد مُعلن وإعداده ناقص — لن يُرسل إشعار حتى يكتمل.",
  };
}

/* -------------------------------------------------------------- المخطّط */

let schemaReady = false;

function ensureNotifySchema(): void {
  if (schemaReady) return;
  const db = openDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      dedupe_key TEXT NOT NULL,
      kind TEXT NOT NULL,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      sent_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe ON notifications(dedupe_key);
    CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status, created_at);
  `);
  schemaReady = true;
}

export function resetNotifySchemaCache(): void { schemaReady = false; }

export type NotificationStatus = "pending" | "sent" | "failed" | "skipped";

export interface Notification {
  id: string;
  dedupeKey: string;
  kind: string;
  recipient: string;
  subject: string;
  body: string;
  status: NotificationStatus;
  attempts: number;
  lastError: string;
  createdAt: string;
  sentAt: string | null;
}

const rowToNotification = (row: Record<string, unknown>): Notification => ({
  id: String(row.id),
  dedupeKey: String(row.dedupe_key),
  kind: String(row.kind),
  recipient: String(row.recipient),
  subject: String(row.subject),
  body: String(row.body),
  status: String(row.status) as NotificationStatus,
  attempts: Number(row.attempts),
  lastError: String(row.last_error ?? ""),
  createdAt: String(row.created_at),
  sentAt: row.sent_at ? String(row.sent_at) : null,
});

export function listNotifications(limit = 50): Notification[] {
  ensureNotifySchema();
  return (openDatabase()
    .prepare("SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?")
    .all(Math.min(Math.max(limit, 1), 500)) as Array<Record<string, unknown>>)
    .map(rowToNotification);
}

function countsByStatus() {
  ensureNotifySchema();
  const rows = openDatabase()
    .prepare("SELECT status, COUNT(*) AS total FROM notifications GROUP BY status")
    .all() as Array<{ status: string; total: number }>;
  const counts: Record<NotificationStatus, number> = { pending: 0, sent: 0, failed: 0, skipped: 0 };
  for (const row of rows) counts[String(row.status) as NotificationStatus] = Number(row.total);
  return counts;
}

/* ------------------------------------------------------------ النقل */

export type MailTransport = (request: {
  url: string; headers: Record<string, string>; body: string;
}) => Promise<{ status: number; body: string }>;

let transport: MailTransport = async request => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(request.url, {
      method: "POST", headers: request.headers, body: request.body, signal: controller.signal,
    });
    return { status: response.status, body: await response.text() };
  } finally {
    clearTimeout(timer);
  }
};

export function setMailTransport(next: MailTransport | null): void {
  if (next) transport = next;
}

async function deliver(config: MailConfig, notification: Notification): Promise<void> {
  if (config.provider === "resend") {
    const response = await transport({
      url: "https://api.resend.com/emails",
      headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: config.from, to: [notification.recipient],
        subject: notification.subject, text: notification.body,
      }),
    });
    if (response.status >= 300) throw new Error(`رفض المزوّد الإرسال (${response.status}): ${response.body.slice(0, 200)}`);
    return;
  }

  if (config.provider === "sendgrid") {
    const response = await transport({
      url: "https://api.sendgrid.com/v3/mail/send",
      headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: notification.recipient }] }],
        from: { email: config.from },
        subject: notification.subject,
        content: [{ type: "text/plain", value: notification.body }],
      }),
    });
    if (response.status >= 300) throw new Error(`رفض المزوّد الإرسال (${response.status}): ${response.body.slice(0, 200)}`);
    return;
  }

  if (config.provider === "webhook") {
    /* قناةٌ للمؤسسات التي توصّل إشعاراتها بنظامها هي — واتساب، أو سلاك، أو بوابة داخلية. */
    const response = await transport({
      url: config.webhookUrl,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: notification.kind, to: notification.recipient,
        subject: notification.subject, body: notification.body, at: new Date().toISOString(),
      }),
    });
    if (response.status >= 300) throw new Error(`ردّ عنوان الاستقبال بـ${response.status}`);
    return;
  }

  throw new Error("لا مزوّد بريد مضبوط.");
}

/* ------------------------------------------------------------ الطابور */

export interface EnqueueInput {
  kind: string;
  /** مفتاح التفرّد: الحدث وموضوعه. وهو ما يمنع تكرار الإرسال. */
  dedupeKey: string;
  recipient: string;
  subject: string;
  body: string;
}

/**
 * يضع إشعاراً في الطابور.
 *
 * وبلا مزوّدٍ مضبوط يُوضع «متروكاً» لا «معلّقاً»: طابورٌ يتضخّم بمعلّقاتٍ لن
 * تُرسل أبداً يُخفي المعلّقات الحقيقية. والحدث يبقى مرئياً للمالك فيعرف ما
 * فاته حين يربط البريد.
 */
export function enqueue(input: EnqueueInput): Notification | null {
  ensureNotifySchema();
  const recipient = String(input.recipient || "").trim().toLowerCase();
  if (!recipient.includes("@")) return null;

  const configured = notifyStatus().configured;
  const id = `ntf_${randomUUID()}`;
  const now = new Date().toISOString();
  const status: NotificationStatus = configured ? "pending" : "skipped";
  const lastError = configured ? "" : "لا مزوّد بريد مضبوط — لم يُرسل.";

  try {
    openDatabase().prepare(
      `INSERT INTO notifications(id, dedupe_key, kind, recipient, subject, body, status, attempts, last_error, created_at)
       VALUES(?,?,?,?,?,?,?,0,?,?)`,
    ).run(id, input.dedupeKey, input.kind, recipient, input.subject, input.body, status, lastError, now);
  } catch {
    /* القيد الفريد رفض التكرار — وهذا هو المقصود منه. */
    return null;
  }

  return listNotifications(1).find(notification => notification.id === id) ?? null;
}

export const MAX_ATTEMPTS = 5;

/**
 * يُرسل ما في الطابور.
 *
 * والفشل لا يُبتلع ولا يُعاد إلى الأبد: يُسجَّل سببه، ويُعاد حتى خمس محاولات،
 * ثم يُترك فاشلاً ظاهراً. ومحاولةٌ لا تنتهي تُخفي عطلاً دائماً في الإعداد.
 */
export async function flushNotifications(limit = 25): Promise<{ sent: number; failed: number; skipped: number }> {
  ensureNotifySchema();
  const config = mailConfig();
  const status = notifyStatus();
  const db = openDatabase();

  if (!status.configured) {
    const stale = db.prepare("UPDATE notifications SET status = 'skipped', last_error = ? WHERE status = 'pending'")
      .run("لا مزوّد بريد مضبوط — لم يُرسل.");
    return { sent: 0, failed: 0, skipped: Number(stale.changes) };
  }

  const pending = (db.prepare("SELECT * FROM notifications WHERE status IN ('pending','skipped') AND attempts < ? ORDER BY created_at ASC LIMIT ?")
    .all(MAX_ATTEMPTS, Math.min(Math.max(limit, 1), 200)) as Array<Record<string, unknown>>)
    .map(rowToNotification);

  let sent = 0;
  let failed = 0;
  for (const notification of pending) {
    try {
      await deliver(config, notification);
      db.prepare("UPDATE notifications SET status = 'sent', sent_at = ?, attempts = attempts + 1, last_error = '' WHERE id = ?")
        .run(new Date().toISOString(), notification.id);
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const attempts = notification.attempts + 1;
      db.prepare("UPDATE notifications SET status = ?, attempts = ?, last_error = ? WHERE id = ?")
        .run(attempts >= MAX_ATTEMPTS ? "failed" : "pending", attempts, message.slice(0, 400), notification.id);
      failed += 1;
    }
  }
  return { sent, failed, skipped: 0 };
}

/* ---------------------------------------------------------- القوالب */

/**
 * من يُبلَّغ في المؤسسة: المشرفون والمديرون.
 *
 * وإن لم يوجد أيٌّ منهم بعدُ — وهي حال النشر الجديد قبل أن يُنشئ المالك
 * الحسابات — فالمالك هو الإدارة، ويُبلَّغ هو. وإسقاطُ إشعارٍ لأنه لم يجد
 * مستقبِلاً يجعل أول فاتورةٍ في كل نشرٍ جديد صامتةً بلا سبب ظاهر.
 */
const institutionRecipients = (): string[] => {
  try {
    const accounts = listAccounts().filter(account => account.status === "ACTIVE");
    const operators = accounts
      .filter(account => ["admin", "manager"].includes(account.role))
      .map(account => account.email);
    if (operators.length) return operators;
    return accounts.filter(account => account.role === "owner").map(account => account.email);
  } catch {
    return [];
  }
};

const ownerRecipient = (): string[] => {
  const configured = mailConfig().ownerEmail;
  if (configured) return [configured];
  try {
    return listAccounts().filter(account => account.role === "owner").map(account => account.email);
  } catch {
    return [];
  }
};

const fanOut = (recipients: string[], build: (recipient: string) => EnqueueInput): number => {
  let queued = 0;
  for (const recipient of new Set(recipients)) {
    if (enqueue(build(recipient))) queued += 1;
  }
  return queued;
};

/** فاتورة صدرت — تُبلَّغ المؤسسة بها وبموعد استحقاقها. */
export function notifyInvoiceIssued(invoiceId: string): number {
  const invoice = listInvoices(500).find(item => item.id === invoiceId);
  if (!invoice) return 0;
  return fanOut(institutionRecipients(), recipient => ({
    kind: "invoice.issued",
    dedupeKey: `invoice.issued:${invoice.id}:${recipient}`,
    recipient,
    subject: `فاتورة ${invoice.number} — ${formatMoney(invoice.total, invoice.currency)}`,
    body: [
      `صدرت فاتورة جديدة على اشتراك نهج.`,
      ``,
      `الرقم: ${invoice.number}`,
      `المبلغ: ${formatMoney(invoice.total, invoice.currency)}`,
      `الاستحقاق: ${invoice.dueAt.slice(0, 10)}`,
      ``,
      `تفاصيلها كاملة في شاشة «الاشتراك»، ومنها تُسدَّد.`,
    ].join("\n"),
  }));
}

/** دفعة وصلت — يُبلَّغ من يتابع الحساب. */
export function notifyPaymentReceived(paymentId: string, amount: number, currency: string, invoiceNumber: string): number {
  return fanOut([...institutionRecipients(), ...ownerRecipient()], recipient => ({
    kind: "payment.received",
    dedupeKey: `payment.received:${paymentId}:${recipient}`,
    recipient,
    subject: `وصل سداد ${formatMoney(amount, currency)}`,
    body: [
      `سُجِّل سداد على اشتراك نهج.`,
      ``,
      `المبلغ: ${formatMoney(amount, currency)}`,
      `الفاتورة: ${invoiceNumber}`,
      ``,
      `الدفعة ومرجعها في شاشة «الاشتراك».`,
    ].join("\n"),
  }));
}

/** عتبات التذكير قبل التجديد — تنازلياً. */
export const RENEWAL_THRESHOLDS = [14, 7, 3, 1];

/**
 * يُذكّر بالتجديد قبل أن يقع التجميد لا بعده.
 *
 * ومفتاح التفرّد يحمل نهاية الدورة والعتبة معاً: فالحساب الذي يجري كل ساعة
 * يُنتج تذكيراً واحداً لكل عتبة، لا اثني عشر في اليوم. وتجديدُ الاشتراك يُبدّل
 * نهاية الدورة فتبدأ عتباتٌ جديدة طبيعياً.
 */
export function notifyRenewalDue(): number {
  const subscription = getSubscription();
  if (!subscription || subscription.terminated) return 0;

  const state = evaluateSubscription(subscription);
  const remaining = daysBetween(new Date().toISOString(), subscription.currentPeriodEnd);
  const threshold = RENEWAL_THRESHOLDS.find(days => remaining <= days && remaining >= 0);
  if (threshold === undefined) return 0;

  const outstanding = outstandingBalance();
  return fanOut([...institutionRecipients(), ...ownerRecipient()], recipient => ({
    kind: "renewal.due",
    dedupeKey: `renewal.due:${subscription.currentPeriodEnd}:${threshold}:${recipient}`,
    recipient,
    subject: remaining <= 1 ? "اشتراك نهج ينتهي غداً" : `اشتراك نهج ينتهي خلال ${remaining} يوماً`,
    body: [
      `تنتهي الدورة الحالية في ${subscription.currentPeriodEnd.slice(0, 10)}.`,
      ``,
      outstanding.amount > 0
        ? `المستحق غير المسدَّد: ${formatMoney(outstanding.amount, outstanding.currency)}.`
        : `لا مستحق غير مسدَّد.`,
      `الحالة الآن: ${state.reason}`,
      ``,
      `التجديد والسداد من شاشة «الاشتراك». وبعد انتهاء مهلة السماح تُجمّد الكتابة`,
      `وتبقى القراءة والتصدير كاملة.`,
    ].join("\n"),
  }));
}

/** التجميد وقع — يُقال صراحةً وما الذي يرفعه. */
export function notifySuspended(): number {
  const state = evaluateSubscription();
  if (state.writable) return 0;
  const subscription = getSubscription();
  if (!subscription) return 0;

  return fanOut([...institutionRecipients(), ...ownerRecipient()], recipient => ({
    kind: "subscription.suspended",
    dedupeKey: `subscription.suspended:${subscription.currentPeriodEnd}:${recipient}`,
    recipient,
    subject: "تجمّدت الكتابة في نهج",
    body: [
      `الحالة: ${state.reason}`,
      ``,
      `القراءة والتصدير يعملان كاملين — بياناتكم كما هي ولم يُحجب منها شيء.`,
      `ويتوقف التنفيذ والتعديل حتى يُسدَّد المستحق أو يُجدَّد الاشتراك.`,
    ].join("\n"),
  }));
}

/* ------------------------------------------------------------ العامل */

let timer: NodeJS.Timeout | null = null;

export const notifyIntervalMinutes = () => {
  const value = Number(process.env.NAHJ_MAIL_INTERVAL_MINUTES ?? 15);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 24 * 60) : 15;
};

/**
 * عاملٌ واحد يحسب التذكيرات ويُفرغ الطابور.
 *
 * وموضعه خارج مسار الطلب مقصود: بطءُ مزوّد بريد لا يجوز أن يُبطئ تسجيل دفعة
 * ولا فتح شاشة.
 */
export function startNotifyWorker(): void {
  if (timer) return;
  const tick = () => {
    try {
      notifyRenewalDue();
      notifySuspended();
    } catch (error) {
      console.warn("[NAHJ] تعذّر حساب التذكيرات:", error instanceof Error ? error.message : error);
    }
    void flushNotifications().then(result => {
      if (result.sent) console.log(`[NAHJ] أُرسل ${result.sent} إشعاراً.`);
      if (result.failed) console.warn(`[NAHJ] فشل إرسال ${result.failed} إشعاراً — التفاصيل في لوحة المالك.`);
    }).catch(() => { /* السبب مكتوب على كل صفّ */ });
  };

  timer = setInterval(tick, notifyIntervalMinutes() * 60_000);
  timer.unref();
  /* دفعةٌ أولى بعد دقيقة من الإقلاع: لا تُعطّل البدء ولا تنتظر ربع ساعة. */
  const first = setTimeout(tick, 60_000);
  first.unref();
}

export function stopNotifyWorker(): void {
  if (timer) { clearInterval(timer); timer = null; }
}

/** يُستدعى بعد أحداث الفوترة ليُسجَّل الأثر في سجلّ الترخيص أيضاً. */
export function recordNotifyEvent(kind: string, queued: number): void {
  if (!queued) return;
  recordBillingEvent("notification.queued", `${kind}: ${queued} إشعاراً`, "system", { kind, queued });
}
