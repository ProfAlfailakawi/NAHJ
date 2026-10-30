import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import type { AddressInfo } from "node:net";

/*
 * «نُحدّث البرنامج» بدل صفحةٍ بيضاء أو «تعذّر إتمام الطلب (502)» أثناء النشر.
 *
 *   U1) الصفحة: مستقلّة بلا طلبٍ خارجي، RTL، نهاريّة فقط كالبرنامج، فصحى بلا رموز تعبيرية، علامة نهج،
 *       تسأل /api/health كل ٣ ثوانٍ وتتباطأ، وتعيد فتح الرابط نفسه، ولا تدور في حلقة.
 *   U2) الخادم: /api/health قبل المصادقة؛ والصفحة تُقدَّم بـnonce يطابق CSP وبلا تخزين.
 *   U3) التطبيق: 5xx بغير JSON على /api ← إشعارٌ واحد ورسالة «قيد التحديث»؛ وخطأ خادمنا
 *       (JSON) يبقى كما هو؛ والانقطاع والجهاز متّصل يُظهر الشريط ويُرفع الخطأ نفسه.
 *   U4) الشريط يختفي حين يعود الخادم، ويُعلم من ينتظر.
 */

/* الطلب الحقيقي للخادم المحلي في U2؛ طبقة الاتصال أدناه تُختبر بـfetch مزيّف. */
const realFetch = globalThis.fetch;
const PAGE = fs.readFileSync(path.resolve("public/updating.html"), "utf8");

/* ══ U1 ═══════════════════════════════════════════════════════════════════════ */
test("U1 الصفحة مستقلّة بهوية نهج، نهاريّة فقط، وتسأل الخادم ولا تدور في حلقة", () => {
  assert.match(PAGE, /^<!doctype html>/i);
  assert.match(PAGE, /<html lang="ar" dir="rtl">/);
  assert.match(PAGE, /<title>قيد التحديث · نهج<\/title>/);
  assert.ok(!/(src|href)=["']https?:/i.test(PAGE) && !/url\(["']?https?:/i.test(PAGE) && !/@import/.test(PAGE), "لا طلب خارجي");
  assert.ok(!/<(link|script)[^>]+(src|href)=/i.test(PAGE), "لا ملف خارجي: سكربتها وأنماطها في الصفحة");
  assert.match(PAGE, /color-scheme:light/);
  assert.ok(!/prefers-color-scheme:dark/.test(PAGE), "نهاريّة فقط كالبرنامج (DESIGN_SYSTEM.md)");
  assert.match(PAGE, /prefers-reduced-motion:reduce/);
  assert.match(PAGE, /url\("\/fonts\/cairo-arabic\.woff2"\)/, "خطّ البرنامج المستضاف ذاتياً");
  assert.match(PAGE, /M18 18v12c0 7\.2 5\.8 13 13 13h9c7\.8 0 14 6\.2 14 14v3/, "علامة نهج نفسها (Brand.tsx)");
  for (const text of ["نمهّد الطريق لنسخةٍ أحدث", "قيد التحديث الآن", "يعود وحده", "تحقّق الآن", "جهازك غير متّصل بالشبكة", "وقتاً أطول مما نعتاد"]) assert.ok(PAGE.includes(text), text);
  assert.ok(!/\p{Extended_Pictographic}/u.test(PAGE), "بلا رموز تعبيرية (DESIGN_SYSTEM.md)");
  assert.match(PAGE, /id="note" role="status" aria-live="polite"/, "السطر المتغيّر يُقرأ");
  assert.match(PAGE, /<button type="button" id="retry">/);
  assert.match(PAGE, /var HEALTH = "\/api\/health"/);
  assert.match(PAGE, /FIRST = 3000, CEILING = 15000, PATIENT = 30000/);
  assert.match(PAGE, /cache: "no-store"/);
  assert.match(PAGE, /recent\(\)\.length >= 3/, "ثلاث إعادات في دقيقتين ← تباطؤ لا حلقة");
  assert.match(PAGE, /location\.pathname === "\/updating\.html"\) location\.replace\("\/"\)/, "فُتحت باسمها ← البداية لا هي");
  assert.match(PAGE, /else location\.reload\(\)/, "وإلا الرابط نفسه");
});

/* ══ U2 ═══════════════════════════════════════════════════════════════════════ */
test("U2 /api/health قبل المصادقة، والصفحة بـnonce يطابق CSP وبلا تخزين", async () => {
  const server = fs.readFileSync(path.resolve("server.ts"), "utf8");
  const health = server.indexOf('app.get("/api/health"');
  assert.ok(health > 0 && health < server.indexOf('app.use("/api/auth"'), "/api/health قبل المصادقة");
  const route = server.indexOf('app.get("/updating.html"');
  assert.ok(route > 0 && route < server.indexOf("app.use(express.static(distPath))"), "الصفحة قبل الملفات الثابتة");

  process.env.NAHJ_FORCE_CSP = "true";
  const { cspMiddleware } = await import("./securityHeaders.ts");
  const { updatingPageRoute } = await import("./updatingPage.ts");
  const app = express();
  app.use(cspMiddleware());
  app.get("/updating.html", updatingPageRoute(path.resolve("public/updating.html")));
  app.get("/missing.html", updatingPageRoute(path.resolve("public/__missing__.html")));
  const listener = app.listen(0);
  try {
    const base = `http://127.0.0.1:${(listener.address() as AddressInfo).port}`;
    const response = await realFetch(`${base}/updating.html`);
    const html = await response.text();
    const nonce = /'nonce-([^']+)'/.exec(response.headers.get("content-security-policy") || "")?.[1];
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /text\/html/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.ok(nonce && html.includes(`<script nonce="${nonce}">`), "سكربت الصفحة يحمل nonce الطلب");
    assert.equal((await realFetch(`${base}/missing.html`)).status, 404);
  } finally {
    listener.close();
    delete process.env.NAHJ_FORCE_CSP;
  }
});

/* ══ U3 / U4 — طبقة الاتصال في الواجهة ══════════════════════════════════════ */
type Bar = { textContent: string; removed: boolean; attrs: Record<string, string>; style: { cssText: string }; dir: string; className: string };
const bars: Bar[] = [];
const events: string[] = [];
const timers: Array<() => void> = [];
(globalThis as Record<string, unknown>).document = {
  cookie: "nahj_csrf=tok",
  documentElement: { lang: "ar" },
  createElement: () => {
    const bar: Bar & { setAttribute: (k: string, v: string) => void; remove: () => void } = {
      textContent: "", removed: false, attrs: {}, style: { cssText: "" }, dir: "", className: "",
      setAttribute(key, value) { this.attrs[key] = value; },
      remove() { this.removed = true; },
    };
    return bar;
  },
  body: { appendChild: (bar: Bar) => { bars.push(bar); } },
};
(globalThis as Record<string, unknown>).window = {
  dispatchEvent: (event: Event) => { events.push(event.type); return true; },
  setTimeout: (fn: () => void) => { timers.push(fn); return timers.length; },
};
const flush = async () => { while (timers.length) { timers.shift()!(); await new Promise(resolve => setImmediate(resolve)); } };

let healthy = false;
let next: () => Promise<Response> = async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
(globalThis as Record<string, unknown>).fetch = async (url: string) => {
  if (url === "/api/health") return new Response(JSON.stringify({ status: "ok" }), { status: healthy ? 200 : 502, headers: { "content-type": "application/json" } });
  return next();
};

const { api, apiOrNull, ApiError } = await import("../src/lib/api.ts");
const { isPlatformUpdating, showUpdatingNotice, SERVER_BACK_EVENT, UPDATING_MESSAGE, UPDATING_WRITE_MESSAGE } = await import("../src/lib/updatingNotice.ts");

test("U3 جواب المنصّة لا جواب البرنامج: 5xx بغير JSON وحده", () => {
  for (const status of [500, 502, 503, 504]) {
    assert.equal(isPlatformUpdating(status, "text/html; charset=UTF-8"), true, `${status} HTML`);
    assert.equal(isPlatformUpdating(status, null), true, `${status} بلا نوع (Caddy)`);
    assert.equal(isPlatformUpdating(status, "application/json; charset=utf-8"), false, `${status} JSON من خادمنا`);
  }
  for (const status of [200, 400, 401, 402, 403, 404, 429]) assert.equal(isPlatformUpdating(status, "text/html"), false, String(status));
});

test("U3 الوكيل يجيب 502 أثناء النشر ← إشعارٌ واحد ورسالة «قيد التحديث» لا «تعذّر (502)»", async () => {
  bars.length = 0; timers.length = 0; events.length = 0; healthy = false;
  next = async () => new Response("", { status: 502 });
  await assert.rejects(api("/work"), (error: unknown) => error instanceof ApiError && error.status === 502 && error.message === UPDATING_MESSAGE);
  await assert.rejects(api("/skills/x/promote", { method: "POST", body: "{}" }), (error: unknown) => error instanceof ApiError && error.message === UPDATING_WRITE_MESSAGE);
  assert.equal(await apiOrNull("/audit"), null, "القراءة الصامتة تبقى صامتة");
  assert.equal(bars.length, 1, "شريطٌ واحد مهما تكرّر الطلب");
  assert.equal(bars[0].textContent, UPDATING_MESSAGE);
  assert.equal(bars[0].attrs.role, "status");
  assert.equal(bars[0].dir, "rtl");
  assert.equal(bars[0].className, "nahj-updating-notice", "شكله في src/index.css بشكل إشعارات البرنامج");
  assert.ok(!/\p{Extended_Pictographic}/u.test(UPDATING_WRITE_MESSAGE), "بلا رموز تعبيرية");

  /* U4: لا يختفي والخادم لا يجيب، ويختفي حين يعود ويُعلم من ينتظر. */
  let waited = 0;
  showUpdatingNotice(undefined, () => { waited++; });
  assert.equal(bars.length, 1, "من ينتظر لا يفتح شريطاً ثانياً");
  const tick = async () => { timers.shift()?.(); await new Promise(resolve => setImmediate(resolve)); };
  await tick(); await tick();
  assert.equal(bars[0].removed, false, "الخادم لا يجيب ← يبقى الشريط ويُعاد السؤال");
  assert.equal(timers.length, 1);
  healthy = true;
  await flush();
  assert.equal(bars[0].removed, true, "عاد الخادم ← اختفى الشريط");
  assert.equal(waited, 1, "ونودي من ينتظر");
  assert.ok(events.includes(SERVER_BACK_EVENT));
});

test("U3 خطأ خادمنا (JSON) يبقى برسالته، ولا شريط", async () => {
  bars.length = 0; timers.length = 0; healthy = true;
  next = async () => new Response(JSON.stringify({ error: "حدث خطأ غير متوقع في الخادم.", code: "SERVER_ERROR" }), { status: 500, headers: { "content-type": "application/json" } });
  await assert.rejects(api("/work"), (error: unknown) => error instanceof ApiError && error.status === 500 && error.message === "حدث خطأ غير متوقع في الخادم.");
  assert.equal(bars.length, 0);
});

test("U3 الانقطاع والجهاز متّصل ← الشريط والخطأ نفسه؛ والإلغاء المقصود لا يُظهر شيئاً", async () => {
  bars.length = 0; timers.length = 0; healthy = false;
  const drop = new TypeError("Failed to fetch");
  next = async () => { throw drop; };
  await assert.rejects(api("/work"), (error: unknown) => error === drop);
  assert.equal(bars.length, 1);
  healthy = true; await flush();

  bars.length = 0;
  next = async () => { throw new DOMException("aborted", "AbortError"); };
  await assert.rejects(api("/work"), (error: unknown) => error instanceof Error && error.name === "AbortError");
  assert.equal(bars.length, 0, "إلغاءٌ مقصود ليس نشراً");
});
