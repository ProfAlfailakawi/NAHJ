import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/*
 * App Store 3.1.1 / 3.1.3(c): داخل تطبيق iOS لا أسعار ولا باقات ولا روابط إليها.
 * الموقع نفسه لا يتغيّر: كل ما أُضيف معلَّمٌ بصنفَي ios-hide / ios-only، ولا يظهر ios-only إلا بصنف ios-shell.
 */

import { ensureBillingSchema, resetBillingSchemaCache, seedDefaultPlans } from "./billing.ts";
import { closeDatabase } from "./persistence.ts";
import { renderPricingPage } from "./publicPages.ts";
import { IOS_SHELL_HEAD_SCRIPT, IOS_SHELL_STRIP_SCRIPT, renderLandingPage, renderPrivacyPage, renderTermsPage } from "./marketingPages.ts";
import { isAppleNativeShell, APPLE_PLANS_NOTICE } from "../src/lib/platform.ts";

function freshDatabase() {
  closeDatabase();
  resetBillingSchemaCache();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nahj-ios-"));
  process.env.NAHJ_DATABASE_PATH = path.join(directory, "nahj.sqlite");
  ensureBillingSchema();
  seedDefaultPlans();
}

/** يحذف كل عنصر معلَّم ios-hide (وعناصره الداخلية) كما يفعل سكربت التطبيق، ويُظهر ios-only. */
function asIos(html: string): string {
  let out = html;
  // div/span/a/h1... معلَّمة: تُحذف مع محتواها بمطابقة الوسوم المتوازنة.
  for (;;) {
    const open = /<(\w+)\b[^>]*class="[^"]*\bios-hide\b[^"]*"[^>]*>/i.exec(out);
    if (!open) break;
    const tag = open[1].toLowerCase();
    let depth = 0;
    const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
    re.lastIndex = open.index;
    let end = -1;
    for (let m = re.exec(out); m; m = re.exec(out)) {
      depth += m[1] ? -1 : 1;
      if (depth === 0) { end = m.index + m[0].length; break; }
    }
    assert.ok(end > 0, "وسم ios-hide غير متوازن");
    out = out.slice(0, open.index) + out.slice(end);
  }
  return out;
}

/** ما يراه المستخدم أو يتبعه: بلا <style> و<script> (قاعدة CSS تذكر المسار لا تُظهر شيئاً). */
const markup = (html: string) => html.replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, "");

const text = (html: string) => markup(html).replace(/<[^>]+>/g, "").replace(/\s+/g, " ");

const PRICE_FIGURES = /149|395|950|KWD|د\.ك|شهرياً|ربع سنوي|سنوي|رسوم تأسيس/;

test("iOS: الصفحة الرئيسية بلا أسعار ولا رابط /pricing وفيها الجملة المحايدة", () => {
  freshDatabase();
  const web = renderLandingPage();
  assert.match(web, /href="\/pricing"/, "الموقع فقد رابط الأسعار");
  assert.match(web, /الباقات تبدأ من/, "الموقع فقد سطر «تبدأ من»");
  const ios = markup(asIos(web));
  assert.ok(!ios.includes("/pricing"), "بقي رابط للأسعار في صفحة iOS");
  assert.ok(!ios.includes("الباقات تبدأ من"), "بقي سعرٌ في صفحة iOS");
  assert.ok(!/\d[\d,.]*\s*(KWD|د\.ك)/.test(ios), "بقي رقم مالي في صفحة iOS");
  assert.ok(ios.includes("تُرتَّب الباقات مع مؤسستك."));
  assert.ok(ios.includes("Plans are arranged with your organisation."));
});

test("iOS: الشروط والخصوصية بلا رابط للأسعار، والجملة المتبقية سليمة", () => {
  freshDatabase();
  for (const web of [renderTermsPage(), renderPrivacyPage()]) {
    assert.ok(!markup(asIos(web)).includes("/pricing"));
  }
  // نص الموقع كما كان حرفياً قبل التعليم.
  assert.ok(text(renderTermsPage()).includes("الفوترة المختارة والمنشورة في صفحة الأسعار أو في عرضٍ مكتوب."), "نص الموقع تغيّر");
  assert.ok(text(asIos(renderTermsPage())).includes("الفوترة المختارة في عرضٍ مكتوب."));
});

test("iOS: صفحة /pricing لا تُبقي سعراً ولا باقةً، وتعرض الجملة المحايدة فقط", () => {
  freshDatabase();
  const web = renderPricingPage();
  assert.match(web, /class="price"/, "الموقع فقد الأسعار");
  const ios = markup(asIos(web));
  assert.ok(!/class="price"|class="plan"|data-cycle/.test(ios), "بقي عنصر سعر أو باقة");
  const body = ios.slice(ios.indexOf("<main>"), ios.indexOf("</main>"));
  assert.ok(!PRICE_FIGURES.test(body), "بقي نصٌّ مالي في صفحة /pricing لـ iOS");
  assert.ok(body.includes("تُرتَّب الباقات مع مؤسستك."));
});

test("الموقع: ios-only مخفيّ افتراضياً ولا يظهر إلا بصنف ios-shell، والصنف لا يُضاف إلا لـ iOS", () => {
  freshDatabase();
  const html = renderLandingPage();
  assert.match(html, /\.ios-only \{ display:none; \}/);
  assert.match(html, /html\.ios-shell \.ios-only \{ display:revert; \}/);
  assert.ok(html.includes(IOS_SHELL_HEAD_SCRIPT) && html.includes(IOS_SHELL_STRIP_SCRIPT));
  // السكربت يشترط Capacitor أصلياً على منصة ios؛ ويشغّله كل من المتصفح والأندرويد بلا أثر.
  const run = (cap: unknown) => {
    const added: string[] = [];
    const win = { Capacitor: cap } as any;
    const documentElement = { classList: { add: (c: string) => added.push(c) } };
    new Function("window", "document", IOS_SHELL_HEAD_SCRIPT)(win, { documentElement });
    return added;
  };
  assert.deepEqual(run(undefined), []);
  assert.deepEqual(run({ isNativePlatform: () => false, getPlatform: () => "web" }), []);
  assert.deepEqual(run({ isNativePlatform: () => true, getPlatform: () => "android" }), []);
  assert.deepEqual(run({ isNativePlatform: () => true, getPlatform: () => "ios" }), ["ios-shell"]);
});

test("isAppleNativeShell في الواجهة: iOS الأصلي وحده", () => {
  const g = globalThis as any;
  const withWindow = (win: unknown, fn: () => void) => {
    const had = "window" in g; const prev = g.window;
    g.window = win;
    try { fn(); } finally { if (had) g.window = prev; else delete g.window; }
  };
  assert.equal(isAppleNativeShell(), false);
  withWindow({}, () => assert.equal(isAppleNativeShell(), false));
  withWindow({ Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" } }, () => assert.equal(isAppleNativeShell(), false));
  withWindow({ Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" } }, () => assert.equal(isAppleNativeShell(), true));
  assert.equal(APPLE_PLANS_NOTICE.ar, "تُرتَّب الباقات مع مؤسستك.");
  assert.equal(APPLE_PLANS_NOTICE.en, "Plans are arranged with your organisation.");
});

test("الواجهة: كل سطح سعر أو باقة محكوم بـ isAppleNativeShell", () => {
  const read = (f: string) => fs.readFileSync(f, "utf8");
  assert.match(read("src/components/LoginScreen.tsx"), /!isAppleNativeShell\(\) && <a href="\/pricing">/);
  assert.match(read("src/components/Shell.tsx"), /appleShell && \(item\.id === "billing" \|\| item\.id === "owner" \|\| item\.id === "partners"\)/);
  assert.match(read("src/components/CommandPalette.tsx"), /isAppleNativeShell\(\) && item\.id === "billing"/);
  assert.match(read("src/components/LimitsBanner.tsx"), /isAppleNativeShell\(\)\) return null/);
  assert.match(read("src/components/SubscriptionBanner.tsx"), /!isAppleNativeShell\(\) && <button/);
  const app = read("src/App.tsx");
  for (const id of ["billing", "owner", "partners"]) {
    assert.match(app, new RegExp(`case "${id}":view=isAppleNativeShell\\(\\)\\?applePlansNotice:`));
  }
});
