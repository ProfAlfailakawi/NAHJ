import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/*
 * حراسة على صفحة البيع.
 *
 * صفحةٌ بلا جلسة تُرسل لعميلٍ محتمل، فثلاثة أشياء تُحسم فيها:
 *
 *   ١. لا تُسرّب: باقةٌ خاصة أو مؤرشفة، أو رقمٌ عن المؤسسة المشتركة، لا تخرج.
 *   ٢. لا تُحقن: أسماء الباقات يكتبها المالك في لوحته وتُعرض لزائرٍ بلا حساب.
 *   ٣. لا تَعِد بما لا يوجد: ميزةٌ ليست مبنية تُعرض بحالتها لا بوسم إنجاز.
 */

import { escapeHtml, FEATURE_BUILD_STATE, publicPlans, renderPricingPage } from "./publicPages.ts";
import { ensureBillingSchema, resetBillingSchemaCache, seedDefaultPlans, upsertPlan } from "./billing.ts";
import { closeDatabase } from "./persistence.ts";

function freshDatabase() {
  closeDatabase();
  resetBillingSchemaCache();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nahj-public-"));
  process.env.NAHJ_DATABASE_PATH = path.join(directory, "nahj.sqlite");
  ensureBillingSchema();
  seedDefaultPlans();
}

test("الباقات الخاصة والمؤرشفة لا تخرج في الصفحة العامة", () => {
  freshDatabase();
  upsertPlan({
    code: "secret_enterprise", nameAr: "عرض خاص لجهة حكومية", nameEn: "Private",
    currency: "KWD", priceMonthly: 9_000_000, priceQuarterly: 0, priceAnnual: 0,
    isPublic: false,
  });

  const codes = publicPlans().map(plan => plan.code);
  assert.ok(!codes.includes("secret_enterprise"), "خرجت باقة خاصة في صفحة عامة");
  assert.ok(!renderPricingPage().includes("عرض خاص لجهة حكومية"), "اسم الباقة الخاصة ظهر في الصفحة");
  assert.ok(codes.length > 0, "لا باقة علنية في البذرة — الفحص بلا معنى");
});

test("اسم باقةٍ يحمل وسماً لا يُنفَّذ في صفحةٍ عامة", () => {
  /*
   * الاسم يكتبه المالك في لوحته، والصفحة تُعرض لزائرٍ بلا حساب. فنصٌّ يُحقن من
   * حقلٍ إداري هنا ثغرة XSS مكتملة الأركان.
   */
  freshDatabase();
  upsertPlan({
    code: "xss_probe",
    nameAr: '<img src=x onerror="alert(1)">',
    nameEn: "probe",
    taglineAr: '"><script>alert(2)</script>',
    currency: "KWD", priceMonthly: 1_000, priceQuarterly: 0, priceAnnual: 0,
    isPublic: true,
  });

  const html = renderPricingPage();
  assert.ok(!html.includes("<img src=x"), "وسمٌ خام خرج إلى الصفحة");
  assert.ok(!html.includes("<script>alert(2)"), "سكربتٌ محقون خرج إلى الصفحة");
  assert.ok(html.includes("&lt;img src=x"), "لم يُهرَّب الاسم أصلاً");

  assert.equal(escapeHtml(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
});

test("ما ليس مبنياً يُعرض بحالته لا بوسم إنجاز", () => {
  freshDatabase();
  const html = renderPricingPage();

  /* الموصلات الخارجية محاكاة اليوم — وهذا معلنٌ في المنتج وفي صفحة البيع. */
  assert.equal(FEATURE_BUILD_STATE.externalConnectors.state, "simulated");
  assert.equal(FEATURE_BUILD_STATE.sso.state, "planned");
  assert.equal(FEATURE_BUILD_STATE.teachMode.state, "built");

  assert.ok(html.includes("محاكاة معلنة") || html.includes("خارطة الطريق"),
    "لا تُعرض حالة ما ليس مبنياً");
  assert.ok(html.includes("ما هو مبنيٌّ اليوم، وما ليس بعد"), "قسم الصدق غائب عن الصفحة");
});

test("الصفحة لا تحمل رقماً عن المؤسسة المشتركة", () => {
  freshDatabase();
  const html = renderPricingPage();
  for (const marker of ["سجلّ التدقيق", "حالات العمل التي", "المستحق", "الفاتورة رقم", "invoice", "subscription"]) {
    assert.ok(!html.includes(marker), `تسرّب بيانٌ تشغيلي إلى صفحة عامة: ${marker}`);
  }
});

test("الصفحة مكتفية بذاتها ولا تطلب من الشبكة شيئاً", () => {
  freshDatabase();
  const html = renderPricingPage();
  assert.ok(!/<script[^>]+src=/.test(html), "سكربتٌ خارجي في صفحةٍ يجب أن تعمل بلا شبكة");
  assert.ok(!/<link[^>]+stylesheet/.test(html), "ورقة أنماطٍ خارجية");
  assert.ok(html.includes('dir="rtl"'), "صفحةٌ عربية بلا اتجاه صحيح");
});
