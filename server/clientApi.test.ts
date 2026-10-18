import assert from "node:assert/strict";
import test from "node:test";

/*
 * سلوك طبقة الاتصال في الواجهة (src/lib/api.ts) تجاه رفض الخادم.
 *
 * كان كل 403 يُعامل كأنه «انتهت الجلسة» فيُطرد المسوّق إلى شاشة الدخول وهو مسجَّل، وكانت
 * الكتابة المرفوضة تُقرأ `null` فتعرض الواجهة نجاحاً لم يقع.
 */

const events: string[] = [];
(globalThis as Record<string, unknown>).document = { cookie: "nahj_csrf=tok", documentElement: { lang: "ar" } };
(globalThis as Record<string, unknown>).window = { dispatchEvent: (event: Event) => { events.push(event.type); return true; } };

let next: { status: number; body: unknown } = { status: 200, body: {} };
(globalThis as Record<string, unknown>).fetch = async () =>
  new Response(JSON.stringify(next.body), { status: next.status, headers: { "content-type": "application/json" } });

const { apiOrNull, apiStrict, ApiError, UnauthorizedError, SubscriptionBlockedError } = await import("../src/lib/api.ts");
const reply = (status: number, body: unknown = {}) => { next = { status, body }; };

test("403 صلاحية: القراءة تُبتلع والكتابة تُرفع بسببها ولا تُعدّ انتهاء جلسة", async () => {
  reply(403, { error: "لا تملك صلاحية تنفيذ هذه العملية.", code: "FORBIDDEN" });
  assert.equal(await apiOrNull("/audit"), null);
  await assert.rejects(apiOrNull("/skills/x/promote", { method: "POST", body: "{}" }), (error: unknown) => error instanceof ApiError && error.status === 403);
});

test("رمز الحماية المنتهي أو غياب الجلسة يعني انتهاء الجلسة", async () => {
  reply(403, { error: "رمز الحماية غير صالح.", code: "CSRF_INVALID" });
  await assert.rejects(apiOrNull("/skills", { method: "POST", body: "{}" }), (error: unknown) => error instanceof UnauthorizedError);
  reply(401, { error: "يلزم تسجيل الدخول.", code: "AUTH_REQUIRED" });
  await assert.rejects(apiOrNull("/work"), (error: unknown) => error instanceof UnauthorizedError);
});

test("انتهاء الجلسة أثناء العمل يُعلَن للتطبيق مرة، ولا يُعلَن عن فشل الدخول نفسه", async () => {
  events.length = 0;
  reply(401, { error: "x" });
  await assert.rejects(apiStrict("/billing/subscription"));
  assert.deepEqual(events, ["nahj:session-expired"]);
  events.length = 0;
  await assert.rejects(apiStrict("/auth/login", { method: "POST", body: "{}" }));
  assert.deepEqual(events, [], "فشل تسجيل الدخول عُدّ انتهاء جلسة");
});

test("apiStrict لا يُخفي الفشل: 409 و500 تُرفع، و402 اشتراك موقوف", async () => {
  reply(409, { message: "حُسم هذا الطلب من قبل." });
  await assert.rejects(apiStrict("/approvals/a/decide", { method: "POST", body: "{}" }), (error: unknown) => error instanceof ApiError && error.status === 409 && /حُسم/.test(error.message));
  reply(500, { error: "حدث خطأ غير متوقع في الخادم." });
  await assert.rejects(apiStrict("/work/w/takeover", { method: "POST", body: "{}" }), (error: unknown) => error instanceof ApiError && error.status === 500);
  reply(402, { error: "الاشتراك موقوف." });
  await assert.rejects(apiStrict("/work/w/takeover", { method: "POST", body: "{}" }), (error: unknown) => error instanceof SubscriptionBlockedError);
});
