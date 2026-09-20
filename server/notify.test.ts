import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/*
 * حراسة على الإشعارات.
 *
 * وما يُختبر هنا ليس صياغة الرسائل بل أربع قواعد، كلٌّ منها تمنع عطباً معروفاً:
 *
 *   ١. بلا مزوّد لا يُدَّعى إرسال. واجهةٌ تقول «أُرسل تنبيه» بلا بريد مضبوط
 *      أسوأ من صمتٍ صريح.
 *   ٢. لا يُرسَل الإشعار مرّتين مهما تكرّر الحساب — التذكير يُحسب كل ربع ساعة.
 *   ٣. الفشل يُسجَّل ويُعاد بحدّ، ثم يُترك ظاهراً. ومحاولةٌ لا تنتهي تُخفي عطلاً
 *      دائماً في الإعداد.
 *   ٤. لا كلمة مرور في بريد، ولا مفتاح مزوّد في حالةٍ معروضة.
 */

import {
  MAX_ATTEMPTS, enqueue, flushNotifications, listNotifications, notifyRenewalDue,
  notifyStatus, resetNotifySchemaCache, setMailTransport, type MailTransport,
} from "./notify.ts";
import {
  ensureBillingSchema, ensureSubscription, resetBillingSchemaCache, seedDefaultPlans, startSubscription,
} from "./billing.ts";
import { closeDatabase, openDatabase } from "./persistence.ts";

function freshDatabase() {
  closeDatabase();
  resetBillingSchemaCache();
  resetNotifySchemaCache();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nahj-notify-"));
  process.env.NAHJ_DATABASE_PATH = path.join(directory, "nahj.sqlite");
  ensureBillingSchema();
  seedDefaultPlans();
}

function configure(provider = "resend") {
  process.env.NAHJ_MAIL_PROVIDER = provider;
  process.env.NAHJ_MAIL_API_KEY = "mail-key-for-tests";
  process.env.NAHJ_MAIL_FROM = "nahj@example.com";
  process.env.NAHJ_OWNER_EMAIL = "owner@example.com";
}

function unconfigure() {
  delete process.env.NAHJ_MAIL_PROVIDER;
  delete process.env.NAHJ_MAIL_API_KEY;
  delete process.env.NAHJ_MAIL_FROM;
  delete process.env.NAHJ_MAIL_WEBHOOK_URL;
  delete process.env.NAHJ_OWNER_EMAIL;
}

function stub(handler: () => { status?: number; body?: string }) {
  const calls: Array<{ url: string; body: string }> = [];
  const transport: MailTransport = async request => {
    calls.push({ url: request.url, body: request.body });
    const result = handler();
    return { status: result.status ?? 200, body: result.body ?? "{}" };
  };
  setMailTransport(transport);
  return calls;
}

const anEvent = (key = "k1") => ({
  kind: "invoice.issued",
  dedupeKey: key,
  recipient: "admin@example.com",
  subject: "فاتورة",
  body: "نص",
});

/* ------------------------------------------------- بلا مزوّد */

test("بلا مزوّد بريد لا يُدَّعى إرسال — ويبقى الحدث مرئياً", async () => {
  freshDatabase();
  unconfigure();

  const status = notifyStatus();
  assert.equal(status.configured, false);
  assert.equal(status.provider, "none");
  assert.match(status.note, /التبليغ يدوي/, "لا يُقال للمالك ما البديل");

  const queued = enqueue(anEvent());
  assert.ok(queued, "لم يُسجَّل الحدث أصلاً");
  assert.equal(queued!.status, "skipped", "وُضع «معلّقاً» وهو لن يُرسل أبداً");
  assert.match(queued!.lastError, /لا مزوّد/);

  const calls = stub(() => ({}));
  const result = await flushNotifications();
  assert.equal(calls.length, 0, "خرج طلبٌ إلى مزوّدٍ غير مضبوط");
  assert.equal(result.sent, 0);
});

/* ------------------------------------------------- الإرسال */

test("المُهيّأ يُرسل فعلاً، ويُعلَّم مُرسَلاً", async () => {
  freshDatabase();
  configure();
  enqueue(anEvent("send-1"));

  const calls = stub(() => ({ status: 200 }));
  const result = await flushNotifications();

  assert.equal(result.sent, 1);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /resend\.com/);
  const sentBody = JSON.parse(calls[0].body);
  assert.deepEqual(sentBody.to, ["admin@example.com"]);
  assert.equal(sentBody.from, "nahj@example.com");

  const [notification] = listNotifications(5);
  assert.equal(notification.status, "sent");
  assert.ok(notification.sentAt, "أُرسل بلا ختم وقت");
});

test("عنوان استقبال بدل البريد — للمؤسسة التي توصّل إشعاراتها بنظامها", async () => {
  freshDatabase();
  unconfigure();
  process.env.NAHJ_MAIL_PROVIDER = "webhook";
  process.env.NAHJ_MAIL_WEBHOOK_URL = "https://hooks.example.com/nahj";

  assert.equal(notifyStatus().configured, true);
  enqueue(anEvent("hook-1"));
  const calls = stub(() => ({ status: 200 }));
  await flushNotifications();

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /hooks\.example\.com/);
  assert.equal(JSON.parse(calls[0].body).kind, "invoice.issued");
  unconfigure();
});

/* ------------------------------------------------- التفرّد */

test("الحدث نفسه لا يُرسل مرّتين مهما تكرّر الحساب", () => {
  freshDatabase();
  configure();

  assert.ok(enqueue(anEvent("dup-1")), "أوّلُ إدراجٍ يجب أن ينجح");
  assert.equal(enqueue(anEvent("dup-1")), null, "أُدرج الحدث نفسه مرّتين");
  assert.equal(listNotifications(10).length, 1);
});

test("تذكير التجديد يُحسب مراراً ويُرسل مرّة لكل عتبة", () => {
  freshDatabase();
  configure();
  ensureSubscription();

  /* دورةٌ تنتهي بعد يومين: عتبة الثلاثة أيام تنطبق. */
  startSubscription({ planCode: "growth", cycle: "monthly", issueInvoice: false });
  const soon = new Date(Date.now() + 2 * 86_400_000).toISOString();
  openDatabase().prepare("UPDATE billing_subscription SET current_period_end = ?").run(soon);

  const first = notifyRenewalDue();
  const second = notifyRenewalDue();
  const third = notifyRenewalDue();

  assert.ok(first > 0, "لم يُذكَّر أحدٌ قبل التجديد");
  assert.equal(second, 0, "تكرّر التذكير في الحساب الثاني");
  assert.equal(third, 0);
  assert.equal(listNotifications(20).filter(n => n.kind === "renewal.due").length, first);
});

/* ------------------------------------------------- الفشل */

test("الفشل يُسجَّل سببه ويُعاد بحدٍّ ثم يُترك ظاهراً", async () => {
  freshDatabase();
  configure();
  enqueue(anEvent("fail-1"));
  stub(() => ({ status: 500, body: "provider exploded" }));

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) await flushNotifications();

  const [notification] = listNotifications(5);
  assert.equal(notification.status, "failed", "بقي يُعاد إلى الأبد");
  assert.equal(notification.attempts, MAX_ATTEMPTS);
  assert.match(notification.lastError, /500/, "فشلٌ بلا سببٍ مكتوب لا يُصلَح");

  /* ولا يُعاد بعد استنفاد المحاولات. */
  const calls = stub(() => ({ status: 200 }));
  await flushNotifications();
  assert.equal(calls.length, 0, "أُعيدت محاولةٌ بعد الحدّ");
});

/* ------------------------------------------------- الأسرار */

test("لا مفتاح في الحالة المعروضة، ولا كلمة مرور في أي قالب", () => {
  freshDatabase();
  process.env.NAHJ_MAIL_PROVIDER = "resend";
  process.env.NAHJ_MAIL_API_KEY = "SECRET-MAIL-KEY";
  process.env.NAHJ_MAIL_FROM = "nahj@example.com";

  assert.ok(!JSON.stringify(notifyStatus()).includes("SECRET-MAIL-KEY"), "خرج مفتاح البريد في الحالة");

  /*
   * البريد قناةٌ تُخزَّن وتُعاد توجيهاً وتُقرأ من هاتفٍ ضائع. فلا قالب يرسل
   * كلمة مرور ولا رابط تعيين — والمشرف يسلّم المؤقتة بيده كما هو اليوم.
   */
  const source = fs.readFileSync(path.join(process.cwd(), "server", "notify.ts"), "utf8");
  const templates = source.slice(source.indexOf("/* ---------------------------------------------------------- القوالب */"));
  assert.ok(!/كلمة المرور|password|رمز الدخول/i.test(templates), "قالبٌ يرسل كلمة مرور أو رابط دخول");
  unconfigure();
});

test("لا يُسقط إشعارٌ لأن المؤسسة بلا مشرفٍ بعد", async () => {
  /*
   * أول فاتورةٍ في نشرٍ جديد تُصدر قبل أن يُنشئ المالك الحسابات. وحصرُ
   * المستقبِلين في المشرفين يجعلها صامتةً بلا سبب ظاهر — والمالك حينها هو
   * الإدارة كلّها.
   */
  freshDatabase();
  configure();

  const { bootstrapFirstAccount } = await import("./auth.ts");
  process.env.NAHJ_ADMIN_EMAIL = "owner@example.com";
  process.env.NAHJ_ADMIN_PASSWORD = "OwnerPassword12345";
  await bootstrapFirstAccount();
  const { ensureOwnerAccount } = await import("./auth.ts");
  process.env.NAHJ_OWNER_EMAIL = "owner@example.com";
  ensureOwnerAccount();

  const { issueInvoice } = await import("./billing.ts");
  issueInvoice({ currency: "KWD", lines: [{ description: "اشتراك", quantity: 1, unitAmount: 149_000, amount: 149_000 }] });

  const queued = listNotifications(10).filter(item => item.kind === "invoice.issued");
  assert.ok(queued.length > 0, "أُسقط إشعار الفاتورة لغياب مشرف");
  assert.equal(queued[0].recipient, "owner@example.com");

  delete process.env.NAHJ_ADMIN_EMAIL;
  delete process.env.NAHJ_ADMIN_PASSWORD;
});

test("تذكير التجديد يصل عند كل عتبة لا عند الأولى وحدها", async () => {
  /*
   * سقط هذا في مراجعة: العتبات كانت مرتّبة تنازلياً `[14,7,3,1]` والبحث يُعيد
   * أول ما يشمل المتبقّي — و`2 <= 14` صحيح، فيثبت المفتاح على عتبة الأربعة
   * عشر ولا يصل تذكير السبعة ولا الثلاثة ولا اليوم الأخير أبداً. وهو التذكير
   * الوحيد الذي يهمّ فعلاً.
   */
  freshDatabase();
  configure();
  ensureSubscription();
  startSubscription({ planCode: "growth", cycle: "monthly", issueInvoice: false });

  const setRemaining = (days: number) => {
    /* ساعةٌ أقلّ من اليوم الكامل: `daysBetween` يُقرّب لأعلى، فيخرج العدد المقصود بالضبط. */
    const end = new Date(Date.now() + days * 86_400_000 - 3_600_000).toISOString();
    openDatabase().prepare("UPDATE billing_subscription SET current_period_end = ?").run(end);
  };

  /*
   * يقترب الموعد يوماً بعد يوم. والمطلوب إثباتُه أن العتبات الأربع كلّها
   * تُبلَغ — لا أن تثبت الأولى على كل ما دونها.
   */
  for (const days of [12, 6, 2, 1]) {
    setRemaining(days);
    notifyRenewalDue();
  }

  const reminders = listNotifications(50).filter(item => item.kind === "renewal.due");
  const thresholds = reminders.map(item => item.dedupeKey.split(":")[2]);
  assert.deepEqual([...new Set(thresholds)].sort(), ["1", "14", "3", "7"],
    `العتبات التي أُرسلت: ${thresholds.join(",")} — يجب أن تُبلَغ الأربع`);

  /* وتذكير اليوم الأخير — وهو الوحيد الذي يهمّ فعلاً — موجود. */
  assert.ok(reminders.some(item => /ينتهي غداً/.test(item.subject)), "لم يصل تذكير اليوم الأخير");
});
