import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/*
 * حراسة انحدار على طبقة الترخيص.
 *
 * ما يُختبر هنا ليس أشكال الشاشات — بل الأربعة التي يُكلّف انكسارُها مالاً أو ثقة:
 *   ١. الحساب المالي: عدد صحيح، بثلاث منازل للدينار، وبترتيب خصمٍ ثم ضريبة.
 *   ٢. اشتقاق الحالة من الوقت: لا عمود يُحدَّث، فلا اشتراك "عالق على نشِط".
 *   ٣. التجديد والتمديد والتناسب الزمني.
 *   ٤. أن التجميد يمنع الكتابة ولا يمنع القراءة.
 */

import {
  addDays, addMonths, amendSubscription, archivePlan, billingSnapshot, cancelSubscription, changePlan,
  daysBetween, ensureBillingSchema, ensureSubscription, evaluateSubscription, extendSubscription,
  formatMoney, getAccountCredit, getPlan, getSubscription, issueInvoice, listInvoices, listPlans,
  outstandingBalance, recordPayment, renewSubscription, resetBillingSchemaCache, revenueSummary,
  runBillingCycle, seedDefaultPlans, startSubscription, terminateSubscription, upsertPlan,
  type UsageSnapshot,
} from "./billing.ts";
import { closeDatabase } from "./persistence.ts";

const USAGE: UsageSnapshot = { seats: 3, skills: 4, workItemsThisPeriod: 12, connectors: 2, mcpServers: 1, aiCallsThisPeriod: 40 };

function freshDatabase() {
  closeDatabase();
  resetBillingSchemaCache();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nahj-billing-"));
  process.env.NAHJ_DATABASE_PATH = path.join(directory, "billing.sqlite");
  ensureBillingSchema();
  seedDefaultPlans();
}

/* --------------------------------------------------------------- المال */

test("المبالغ تُعرض بمنازل عملتها — والدينار ثلاث لا اثنتان", () => {
  assert.equal(formatMoney(149_000, "KWD"), "149.000 KWD");
  assert.equal(formatMoney(1_500, "KWD"), "1.500 KWD");
  assert.equal(formatMoney(1_500, "USD"), "15.00 USD");
  assert.equal(formatMoney(0, "KWD"), "0.000 KWD");
  assert.equal(formatMoney(-2_250, "KWD"), "-2.250 KWD");
  // التجميع يبقى قائماً على الجزء الصحيح وحده.
  assert.equal(formatMoney(12_345_678, "KWD"), "12,345.678 KWD");
});

test("الفاتورة تخصم ثم تُضرّب — لا العكس", () => {
  freshDatabase();
  // 100.000 د.ك، خصم 10%، ضريبة 5% ⇒ 90.000 + 4.500 = 94.500
  const invoice = issueInvoice({
    currency: "KWD",
    lines: [{ description: "اشتراك", quantity: 1, unitAmount: 100_000, amount: 100_000 }],
    discountBps: 1_000, taxBps: 500,
  });
  assert.equal(invoice.subtotal, 100_000);
  assert.equal(invoice.discount, 10_000);
  assert.equal(invoice.tax, 4_500, "الضريبة تُحسب بعد الخصم لا قبله");
  assert.equal(invoice.total, 94_500);
});

test("فاتورة بصفر تُولد مسدَّدة، فلا تعلّق اشتراكاً مجانياً", () => {
  freshDatabase();
  const invoice = issueInvoice({ currency: "KWD", lines: [{ description: "تجربة", quantity: 1, unitAmount: 0, amount: 0 }] });
  assert.equal(invoice.status, "paid");
  assert.equal(outstandingBalance().amount, 0);
});

test("أرقام الفواتير متسلسلة بلا انقطاع داخل السنة", () => {
  freshDatabase();
  const line = [{ description: "بند", quantity: 1, unitAmount: 1_000, amount: 1_000 }];
  const first = issueInvoice({ currency: "KWD", lines: line });
  const second = issueInvoice({ currency: "KWD", lines: line });
  const third = issueInvoice({ currency: "KWD", lines: line });
  const year = new Date().getUTCFullYear();
  assert.equal(first.number, `NAHJ-${year}-0001`);
  assert.equal(second.number, `NAHJ-${year}-0002`);
  assert.equal(third.number, `NAHJ-${year}-0003`);
});

test("الدفعة لا تتجاوز المتبقّي، والدفعات الجزئية تُراكم", () => {
  freshDatabase();
  const invoice = issueInvoice({ currency: "KWD", lines: [{ description: "بند", quantity: 1, unitAmount: 100_000, amount: 100_000 }] });

  const partial = recordPayment({ invoiceId: invoice.id, amount: 40_000, method: "bank_transfer" });
  assert.equal(partial.invoice?.status, "partially_paid");
  assert.equal(partial.invoice?.amountPaid, 40_000);
  assert.equal(outstandingBalance().amount, 60_000);

  assert.throws(() => recordPayment({ invoiceId: invoice.id, amount: 60_001 }), /تتجاوز المتبقّي/);

  const rest = recordPayment({ invoiceId: invoice.id, amount: 60_000 });
  assert.equal(rest.invoice?.status, "paid");
  assert.equal(outstandingBalance().amount, 0);
});

test("المبالغ الكسرية تُرفض بدل أن تُقرَّب بصمت", () => {
  freshDatabase();
  assert.throws(
    () => issueInvoice({ currency: "KWD", lines: [{ description: "بند", quantity: 1, unitAmount: 10.5, amount: 10.5 }] }),
    /بالوحدة الصغرى/,
  );
});

/* -------------------------------------------------------------- الوقت */

test("إضافة الشهور تثبت عند نهاية الشهر ولا تنزلق", () => {
  // 31 يناير + شهر = 28 فبراير (لا 2 أو 3 مارس)
  assert.equal(addMonths("2026-01-31T00:00:00.000Z", 1).slice(0, 10), "2026-02-28");
  // وفي سنة كبيسة، 29
  assert.equal(addMonths("2028-01-31T00:00:00.000Z", 1).slice(0, 10), "2028-02-29");
  // والشهر العادي يبقى كما هو
  assert.equal(addMonths("2026-03-15T00:00:00.000Z", 1).slice(0, 10), "2026-04-15");
  assert.equal(addMonths("2026-01-15T00:00:00.000Z", 12).slice(0, 10), "2027-01-15");
});

test("عدّ الأيام يُقرَّب لأعلى، فيومٌ وساعتان يومان لا يوم", () => {
  assert.equal(daysBetween("2026-01-01T00:00:00Z", "2026-01-02T02:00:00Z"), 2);
  assert.equal(daysBetween("2026-01-01T00:00:00Z", "2026-01-11T00:00:00Z"), 10);
});

/* ------------------------------------------------------ اشتقاق الحالة */

test("الحالة تُشتق من الوقت — سارٍ، ثم مهلة، ثم موقوف", () => {
  freshDatabase();
  const started = addDays(new Date().toISOString(), -40);
  startSubscription({ planCode: "starter", cycle: "monthly", startedAt: started, graceDays: 7, issueInvoice: false });

  const subscription = getSubscription()!;
  // الدورة انتهت قبل عشرة أيام، والمهلة سبعة ⇒ موقوف.
  assert.equal(evaluateSubscription(subscription).status, "suspended");
  assert.equal(evaluateSubscription(subscription).writable, false, "الكتابة تتوقف بعد نفاد المهلة");

  // نُعيده إلى داخل المهلة: انتهى قبل ثلاثة أيام من سبعة.
  const inGrace = { ...subscription, currentPeriodEnd: addDays(new Date().toISOString(), -3) };
  const graceState = evaluateSubscription(inGrace);
  assert.equal(graceState.status, "grace");
  assert.equal(graceState.writable, true, "مهلة السماح تعني استمرار العمل لا إيقافه");
  assert.ok(graceState.graceDaysRemaining > 0 && graceState.graceDaysRemaining <= 7);

  // وإلى داخل المدة.
  const live = { ...subscription, currentPeriodEnd: addDays(new Date().toISOString(), 12) };
  assert.equal(evaluateSubscription(live).status, "active");
  assert.equal(evaluateSubscription(live).daysRemaining, 12);
});

test("فاتورة غير مسدَّدة بعد انتهاء المدة تُنتج past_due لا grace", () => {
  freshDatabase();
  startSubscription({ planCode: "starter", cycle: "monthly", startedAt: addDays(new Date().toISOString(), -35), graceDays: 10, issueInvoice: false });
  issueInvoice({ currency: "KWD", lines: [{ description: "دورة", quantity: 1, unitAmount: 149_000, amount: 149_000 }] });

  const state = evaluateSubscription();
  assert.equal(state.status, "past_due");
  assert.equal(state.writable, true, "المستحق داخل المهلة لا يوقف العمل فوراً");
  assert.match(state.reason, /149\.000 KWD/, "الرسالة تقول المبلغ صراحةً");
});

test("التجربة حالة قائمة بذاتها، والاشتراك الملغى يبقى عاملاً حتى نهاية مدته", () => {
  freshDatabase();
  startSubscription({ planCode: "trial", cycle: "monthly", trialDays: 30, issueInvoice: false });
  const trial = evaluateSubscription();
  assert.equal(trial.status, "trialing");
  assert.equal(trial.isTrial, true);
  assert.equal(trial.writable, true);

  freshDatabase();
  startSubscription({ planCode: "starter", cycle: "monthly", issueInvoice: false });
  cancelSubscription(true, "tester", "طلب المؤسسة");
  const canceled = evaluateSubscription();
  assert.equal(canceled.status, "canceled");
  assert.equal(canceled.writable, true, "من دفع مقابل مدة يُكملها");
});

test("الإنهاء يوقف الكتابة فوراً", () => {
  freshDatabase();
  startSubscription({ planCode: "growth", cycle: "annual", issueInvoice: false });
  assert.equal(evaluateSubscription().writable, true);
  terminateSubscription("owner@nahj.test", "انتهاء التعاقد");
  const state = evaluateSubscription();
  assert.equal(state.status, "expired");
  assert.equal(state.writable, false);
  assert.match(state.reason, /للقراءة والتصدير/, "الرسالة تؤكد بقاء البيانات مقروءة");
});

/* ----------------------------------------------------- دورة الاشتراك */

test("التجديد يلتقط من حيث انتهت الدورة فلا تضيع أيام على المؤسسة", () => {
  freshDatabase();
  /* دورة انتهت أمس: قريبة، فالتجديد يبدأ من نهايتها لا من اليوم. */
  const started = addDays(new Date().toISOString(), -31);
  startSubscription({ planCode: "starter", cycle: "monthly", startedAt: started, issueInvoice: false });
  const previousEnd = getSubscription()!.currentPeriodEnd;

  const { subscription, invoice } = renewSubscription("owner@nahj.test");
  assert.equal(subscription.currentPeriodStart, previousEnd, "الدورة الجديدة تبدأ حيث انتهت السابقة");
  assert.equal(subscription.currentPeriodEnd, addMonths(previousEnd, 1));
  assert.ok(invoice, "التجديد يُصدر فاتورته");
  assert.equal(invoice!.total, 149_000);
});

test("اشتراك مضى على انتهائه أكثر من دورة يُجدَّد من اليوم لا من الماضي", () => {
  freshDatabase();
  // بدأ قبل سنة ⇒ نهايته قبل أحد عشر شهراً، أي أبعد من دورة كاملة.
  startSubscription({ planCode: "starter", cycle: "monthly", startedAt: addMonths(new Date().toISOString(), -12), issueInvoice: false });
  const { subscription } = renewSubscription("owner@nahj.test");
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(subscription.currentPeriodStart.slice(0, 10), today,
    "لا تُفوتر شهور لم تُقدَّم فيها خدمة");
  assert.ok(subscription.currentPeriodEnd > new Date().toISOString());
});

test("التمديد ينطلق من اليوم حين تكون المدة قد مضت", () => {
  freshDatabase();
  startSubscription({ planCode: "starter", cycle: "monthly", startedAt: addDays(new Date().toISOString(), -90), issueInvoice: false });
  const extended = extendSubscription({ days: 30, reason: "تعويض انقطاع" }, "owner@nahj.test");
  const remaining = daysBetween(new Date().toISOString(), extended.currentPeriodEnd);
  assert.ok(remaining >= 29 && remaining <= 31, `التمديد يجب أن يمنح ثلاثين يوماً قادمة، لا ${remaining}`);
  assert.equal(evaluateSubscription(extended).status, "active");
});

test("مُشغّل الفوترة يجدّد تلقائياً ولا يُكرّر أثره عند إعادة التشغيل", () => {
  freshDatabase();
  startSubscription({ planCode: "starter", cycle: "monthly", startedAt: addDays(new Date().toISOString(), -35), autoRenew: true, issueInvoice: false });

  const first = runBillingCycle();
  assert.equal(first.renewed, true);
  const afterFirst = listInvoices(50).length;

  // إعادة تنفيذٍ فورية لا تُنتج فاتورة ثانية: المدة صارت في المستقبل.
  const second = runBillingCycle();
  assert.equal(second.renewed, false);
  assert.equal(listInvoices(50).length, afterFirst, "دورة الفوترة يجب أن تكون معادة التنفيذ بلا ضرر");
});

test("التجديد التلقائي المُطفأ لا يجدّد", () => {
  freshDatabase();
  startSubscription({ planCode: "starter", cycle: "monthly", startedAt: addDays(new Date().toISOString(), -35), autoRenew: false, issueInvoice: false });
  assert.equal(runBillingCycle().renewed, false);
  assert.equal(listInvoices(50).length, 0);
});

test("الفواتير المتأخرة تُعلَّم، والتعليم لا يُكرَّر بلا معنى", () => {
  freshDatabase();
  startSubscription({ planCode: "starter", cycle: "monthly", issueInvoice: false });
  issueInvoice({
    currency: "KWD", issuedAt: addDays(new Date().toISOString(), -40), dueInDays: 14,
    lines: [{ description: "بند", quantity: 1, unitAmount: 50_000, amount: 50_000 }],
  });
  assert.equal(runBillingCycle().overdueMarked, 1);
  assert.equal(listInvoices(10)[0].status, "overdue");
  assert.equal(runBillingCycle().overdueMarked, 0, "المُعلَّمة سابقاً لا تُعلَّم ثانية");
});

/* ------------------------------------------------------ تغيير الباقة */

test("الترقية الفورية تُفوتر المتبقّي من الدورة وحده", () => {
  freshDatabase();
  // دورة شهرية بدأت قبل يومين ⇒ نحو 93% متبقٍّ.
  startSubscription({ planCode: "starter", cycle: "monthly", startedAt: addDays(new Date().toISOString(), -2), issueInvoice: false });
  const { invoice } = changePlan({ planCode: "growth", timing: "immediate" }, "owner@nahj.test");

  const fullDifference = 395_000 - 149_000;
  assert.ok(invoice, "الترقية تُصدر فاتورة فرق");
  assert.ok(invoice!.total < fullDifference, "لا تُفوتر دورة كاملة عن مدة مضى جزء منها");
  assert.ok(invoice!.total > fullDifference * 0.85, `الفرق المتناسب بعيد عن المتوقع: ${invoice!.total}`);
  assert.equal(getSubscription()!.planCode, "growth");
});

test("التخفيض يُقيَّد رصيداً ولا يُصدر فاتورة سالبة", () => {
  freshDatabase();
  startSubscription({ planCode: "growth", cycle: "monthly", startedAt: addDays(new Date().toISOString(), -2), issueInvoice: false });
  const before = listInvoices(50).length;
  const { invoice } = changePlan({ planCode: "starter", timing: "immediate" }, "owner@nahj.test");

  assert.equal(invoice, null, "التخفيض لا يُصدر فاتورة");
  assert.equal(listInvoices(50).length, before);
  assert.ok(getAccountCredit() > 0, "الفرق يُقيَّد رصيداً للمؤسسة");
});

test("الانتقال المجدول لا يغيّر الباقة السارية، ويُنفَّذ عند التجديد", () => {
  freshDatabase();
  startSubscription({ planCode: "starter", cycle: "monthly", startedAt: addDays(new Date().toISOString(), -35), autoRenew: true, issueInvoice: false });
  changePlan({ planCode: "growth", timing: "at_period_end" }, "owner@nahj.test");
  assert.equal(getSubscription()!.planCode, "starter", "المجدول لا يسري قبل موعده");

  runBillingCycle();
  assert.equal(getSubscription()!.planCode, "growth", "ويسري عند التجديد");
});

/* ---------------------------------------------------- الباقات وحدودها */

test("الباقة التي عليها اشتراك قائم لا تُؤرشف", () => {
  freshDatabase();
  startSubscription({ planCode: "growth", cycle: "monthly", issueInvoice: false });
  assert.throws(() => archivePlan("growth", "owner@nahj.test"), /اشتراك قائم/);
  // وباقة أخرى تُؤرشف بلا اعتراض.
  assert.equal(archivePlan("starter", "owner@nahj.test").archived, true);
});

test("حدّ الباقة يقبل حتى الحدّ ويرفض ما بعده، وnull تعني بلا حدّ", async () => {
  freshDatabase();
  const { checkLimit } = await import("./billing.ts");
  upsertPlan({ code: "tiny", nameAr: "صغيرة", limits: { seats: 3 }, priceMonthly: 1_000 }, "tester");
  startSubscription({ planCode: "tiny", cycle: "monthly", seats: 3, issueInvoice: false });

  assert.equal(checkLimit("seats", 2).allowed, true, "اثنان مستعملان يسعان ثالثاً");
  assert.equal(checkLimit("seats", 3).allowed, false, "الثلاثة ممتلئة");
  assert.match(checkLimit("seats", 3).reason, /حدّ الباقة/);

  // المقاعد المشتراة فوق حدّ الباقة ترفع السقف الفعلي.
  amendSubscription({ seats: 6 }, "tester");
  assert.equal(checkLimit("seats", 5).allowed, true, "المقاعد الإضافية المدفوعة تُحتسب");

  /*
   * باقة جديدة ترث الحدود الافتراضية لما لم يُذكر — لا "بلا حدّ". فتحُ كل شيء
   * بالسكوت هو أسوأ افتراض ممكن في طبقة ترخيص.
   */
  assert.equal(checkLimit("workItemsPerMonth", 0).limit, 500, "ما لم يُذكر يأخذ الحدّ الافتراضي لا اللانهاية");
  /* وبلا حدّ تُطلب صراحةً بـnull. */
  upsertPlan({ code: "tiny", nameAr: "صغيرة", limits: { workItemsPerMonth: null } }, "tester");
  assert.equal(checkLimit("workItemsPerMonth", 999_999).allowed, true, "null تعني بلا سقف فعلاً");
  assert.equal(checkLimit("workItemsPerMonth", 999_999).limit, null);
});

test("أرشفة الباقة لا تمسّ الفواتير الصادرة عليها", () => {
  freshDatabase();
  const invoice = issueInvoice({ planCode: "starter", currency: "KWD", lines: [{ description: "بند", quantity: 1, unitAmount: 1_000, amount: 1_000 }] });
  archivePlan("starter", "owner@nahj.test");
  assert.equal(listInvoices(10).find(item => item.id === invoice.id)?.planCode, "starter");
  assert.ok(getPlan("starter"), "الباقة تبقى قابلة للقراءة بعد الأرشفة");
});

/* ------------------------------------------------------------ اللقطة */

test("اللقطة تجمع كل ما تحتاجه الشاشة، بلا حساب في المتصفح", () => {
  freshDatabase();
  startSubscription({ planCode: "growth", cycle: "monthly", issueInvoice: true });
  const snapshot = billingSnapshot(USAGE);

  assert.ok(snapshot.subscription, "الاشتراك");
  assert.equal(snapshot.plan?.code, "growth");
  assert.equal(snapshot.state.status, "active");
  assert.equal(snapshot.usage.skills, 4);
  assert.equal(snapshot.limits?.maxAutonomyLevel, 5);
  assert.equal(snapshot.nextRenewalAt, snapshot.subscription!.currentPeriodEnd);
  // الصيغ المعروضة تأتي من الخادم لا تُحتسب في العميل.
  assert.equal(snapshot.formatted.nextRenewalAmount, "395.000 KWD");
  /* فاتورة التفعيل الأولى تحمل رسوم التأسيس ودورتها معاً — لا الدورة وحدها. */
  assert.equal(snapshot.outstanding.amount, 500_000 + 395_000, "رسوم التأسيس تُفوتر مع الدورة الأولى");
  assert.equal(snapshot.formatted.outstanding, "895.000 KWD");
  assert.equal(snapshot.invoices[0].lines.length, 2, "الفاتورة تفصل التأسيس عن الاشتراك");
});

test("الإيراد المتكرّر يُطبَّع على الشهر، ويصفّر عند التجميد", () => {
  freshDatabase();
  startSubscription({ planCode: "growth", cycle: "annual", issueInvoice: false });
  const annual = revenueSummary();
  assert.equal(annual.mrr, Math.round(3_950_000 / 12), "الباقة السنوية تُقسم على اثني عشر");
  assert.equal(annual.arr, annual.mrr * 12);

  terminateSubscription("owner@nahj.test");
  assert.equal(revenueSummary().mrr, 0, "إيرادٌ متوقّف لا يُعدّ متكرّراً");
});

test("التهيئة الأولى تفتح تجربة بدل أن تقفل النظام أو تفتحه بلا حدّ", () => {
  freshDatabase();
  const subscription = ensureSubscription();
  assert.equal(subscription.planCode, "trial");
  assert.equal(evaluateSubscription(subscription).status, "trialing");
  // والنداء الثاني لا يُنشئ اشتراكاً آخر.
  assert.equal(ensureSubscription().startedAt, subscription.startedAt);
});

test("زرع الباقات لا يدهس تسعيراً عدّله المالك", () => {
  freshDatabase();
  upsertPlan({ code: "starter", nameAr: "بداية", priceMonthly: 999_000 }, "owner@nahj.test");
  assert.equal(seedDefaultPlans(), 0, "لا باقة جديدة تُزرع فوق القائم");
  assert.equal(getPlan("starter")!.priceMonthly, 999_000, "سعر المالك يبقى");
  assert.ok(listPlans().length >= 5);
});
