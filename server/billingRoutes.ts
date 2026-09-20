import { Router, Response, NextFunction } from "express";
import { db, DemoSandbox } from "./db.ts";
import { accountCount, AuthenticatedRequest, requireAuth, requireOwner, requireRole } from "./auth.ts";
import {
  amendSubscription, archivePlan, billingSnapshot, cancelSubscription, changePlan, DEFAULT_CURRENCY,
  evaluateSubscription, extendSubscription, formatMoney, getSubscription, issueInvoice, listBillingEvents,
  listPlans, readUsage, recordBillingEvent, recordPayment, renewSubscription, restorePlan, resumeSubscription, revenueSummary,
  runBillingCycle, startSubscription, terminateSubscription, upsertPlan, voidInvoice,
  type UsageSnapshot,
} from "./billing.ts";

/*
 * مسارات الترخيص.
 *
 * قسمان لا يختلطان:
 *   - ما تراه المؤسسة المشترية: اشتراكها، مدّته، باقتها، استهلاكها، فواتيرها،
 *     ودفعاتها. للقراءة، ولطلب تغيير — لا للتنفيذ.
 *   - ما يملكه مالك المنصة: الباقات والتسعير وبدء الاشتراك وتمديده وتجديده
 *     وتعليقه، وتسجيل الدفعات، وأرقام الإيراد.
 *
 * وما بينهما هو ما يجعل النظام قابلاً للبيع: المؤسسة ترى كل تفاصيل التزامها
 * كاملة وصادقة، ولا تملك أن تمدّده بنفسها.
 */

export const billingRouter = Router();

/* البيئة التجريبية تقرأ لقطةً اصطناعية ولا تلمس جداول الفوترة الحقيقية. */
const DEMO_SNAPSHOT_NOTE = "أرقام الاشتراك هنا اصطناعية — البيئة التجريبية لا تقرأ ولا تكتب في سجلّ الفوترة الحقيقي.";

/** يقيس الاستهلاك الفعلي من الذاكرة التشغيلية. القياس مشتقّ لا مُدخَل. */
function currentUsage(): UsageSnapshot {
  return {
    seats: DemoSandbox.isDemoRequest() ? db.users.length : accountCount(),
    skills: db.skills.length,
    workItemsThisPeriod: DemoSandbox.isDemoRequest() ? db.workItems.length : readUsage("workItems"),
    connectors: db.connectors.length,
    mcpServers: 0,
    aiCallsThisPeriod: DemoSandbox.isDemoRequest() ? 0 : readUsage("aiCalls"),
  };
}

/**
 * لقطة تجريبية ثابتة: اشتراك «نمو» سارٍ بفاتورة مسدّدة.
 *
 * تُبنى من الوقت الحالي لا من تواريخ مكتوبة، فلا تبدو منتهية لمن يفتح العرض بعد
 * أشهر — وهو ما يحدث لكل بيانات عرض مؤرَّخة بالثابت.
 */
function demoSnapshot() {
  const now = new Date();
  const start = new Date(now); start.setUTCMonth(start.getUTCMonth() - 4);
  const periodStart = new Date(now); periodStart.setUTCDate(periodStart.getUTCDate() - 11);
  const periodEnd = new Date(periodStart); periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
  const plans = listPlans().filter(plan => plan.isPublic);
  const plan = plans.find(p => p.code === "growth") || plans[0] || null;

  const subscription = {
    id: "demo", planCode: plan?.code || "growth", cycle: "monthly" as const,
    startedAt: start.toISOString(), currentPeriodStart: periodStart.toISOString(),
    currentPeriodEnd: periodEnd.toISOString(), trialEndsAt: null, autoRenew: true,
    cancelAtPeriodEnd: false, canceledAt: null, graceDays: 7, discountBps: 1_000, taxBps: 0,
    seatsPurchased: plan?.limits.seats ?? 40, currency: plan?.currency || DEFAULT_CURRENCY,
    terminated: false, notes: DEMO_SNAPSHOT_NOTE, updatedAt: now.toISOString(),
  };
  const state = evaluateSubscription(subscription);
  const price = plan?.priceMonthly ?? 395_000;
  const currency = subscription.currency;
  const invoice = {
    id: "inv_demo_1", number: `NAHJ-${now.getUTCFullYear()}-0007`, kind: "subscription" as const,
    planCode: subscription.planCode, periodStart: subscription.currentPeriodStart, periodEnd: subscription.currentPeriodEnd,
    issuedAt: subscription.currentPeriodStart, dueAt: subscription.currentPeriodEnd, currency,
    subtotal: price, discount: Math.round(price * 0.1), tax: 0, total: price - Math.round(price * 0.1),
    amountPaid: price - Math.round(price * 0.1), status: "paid" as const,
    lines: [{ description: `اشتراك ${plan?.nameAr || "نمو"} — شهري`, quantity: 1, unitAmount: price, amount: price }],
    notes: DEMO_SNAPSHOT_NOTE,
  };

  return {
    subscription, plan, state, scheduledPlanChange: null,
    usage: currentUsage(), limits: plan?.limits ?? null, features: plan?.features ?? {},
    outstanding: { amount: 0, currency, invoiceCount: 0 }, credit: 0,
    invoices: [invoice],
    payments: [{
      id: "pay_demo_1", invoiceId: invoice.id, amount: invoice.total, currency,
      method: "bank_transfer" as const, reference: "DEMO-TRF-4471", paidAt: invoice.issuedAt,
      recordedBy: "system", note: DEMO_SNAPSHOT_NOTE,
    }],
    currency, nextRenewalAt: subscription.currentPeriodEnd, nextRenewalAmount: price,
    lifetimePaid: invoice.total * 4,
    formatted: {
      nextRenewalAmount: formatMoney(price, currency),
      outstanding: formatMoney(0, currency),
      lifetimePaid: formatMoney(invoice.total * 4, currency),
      credit: formatMoney(0, currency),
    },
    isDemo: true,
    demoNote: DEMO_SNAPSHOT_NOTE,
  };
}

/* ------------------------------------------------- ما تراه المؤسسة */

/** اشتراك المؤسسة كاملاً: البداية، النهاية، التجديد، الباقة، الاستهلاك، الفواتير، الدفعات. */
billingRouter.get("/subscription", requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (DemoSandbox.isDemoRequest()) {
    return void res.json({ ...demoSnapshot(), viewerRole: req.account?.role || "viewer", isOwner: false });
  }
  const snapshot = billingSnapshot(currentUsage());
  res.json({ ...snapshot, isDemo: false, viewerRole: req.account?.role || "viewer", isOwner: req.account?.role === "owner" });
});

/** كتالوج الباقات المعروضة. تراه المؤسسة لتعرف ما فوق باقتها وما دونها. */
billingRouter.get("/plans", requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const owner = req.account?.role === "owner" && !DemoSandbox.isDemoRequest();
  const plans = listPlans(owner).filter(plan => owner || plan.isPublic);
  res.json({ plans, currency: getSubscription()?.currency || DEFAULT_CURRENCY });
});

/**
 * طلب من المؤسسة، لا تنفيذ.
 *
 * مشرف المؤسسة لا يمدّد اشتراكه ولا يرقّي باقته بنفسه — لكن حرمانه من قناة يطلب
 * بها يعني أن الطلب يخرج من المنتج إلى رسالة واتساب تضيع. الطلب يُسجَّل في سجلّ
 * الفوترة، فيراه المالك في شاشته مؤرَّخاً باسم صاحبه.
 */
billingRouter.post("/request", requireAuth, requireRole("admin", "manager"), (req: AuthenticatedRequest, res: Response) => {
  if (DemoSandbox.isDemoRequest()) {
    return void res.status(403).json({ error: "الطلبات غير متاحة في البيئة التجريبية.", code: "DEMO_READONLY" });
  }
  const kind = String(req.body?.kind || "").trim();
  if (!["renew", "upgrade", "downgrade", "seats", "invoice_copy", "question"].includes(kind)) {
    return void res.status(400).json({ error: "نوع الطلب غير معروف." });
  }
  const message = String(req.body?.message || "").slice(0, 1_000);
  const event = recordBillingRequest(kind, message, req.account!.email);
  res.status(201).json({ ok: true, event });
});

function recordBillingRequest(kind: string, message: string, actor: string) {
  const labels: Record<string, string> = {
    renew: "طلب تجديد", upgrade: "طلب ترقية باقة", downgrade: "طلب تخفيض باقة",
    seats: "طلب مقاعد إضافية", invoice_copy: "طلب نسخة فاتورة", question: "استفسار عن الاشتراك",
  };
  return recordBillingEvent(`request.${kind}`, `${labels[kind]}${message ? ` — ${message}` : ""}`, actor, { kind, message });
}

/* ---------------------------------------------- ما يملكه مالك المنصة */

const ownerGuard = [requireAuth, requireOwner] as const;

const fail = (res: Response, error: unknown, fallback: string) => {
  const status = Number((error as { status?: number })?.status) || 400;
  res.status(status).json({ error: (error as Error)?.message || fallback, code: (error as { code?: string })?.code });
};

/** لوحة المالك: الاشتراك، الإيراد، سجلّ كل حركة مالية. */
billingRouter.get("/owner/overview", ...ownerGuard, (_req: AuthenticatedRequest, res: Response) => {
  runBillingCycle();
  res.json({
    snapshot: billingSnapshot(currentUsage(), { invoiceLimit: 200 }),
    revenue: revenueSummary(),
    plans: listPlans(true),
    events: listBillingEvents(120),
  });
});

billingRouter.post("/owner/plans", ...ownerGuard, (req: AuthenticatedRequest, res: Response) => {
  try { res.status(201).json({ plan: upsertPlan(req.body || {}, req.account!.email) }); }
  catch (error) { fail(res, error, "تعذّر حفظ الباقة."); }
});

billingRouter.post("/owner/plans/:code/archive", ...ownerGuard, (req: AuthenticatedRequest, res: Response) => {
  try { res.json({ plan: archivePlan(req.params.code, req.account!.email) }); }
  catch (error) { fail(res, error, "تعذّرت الأرشفة."); }
});

billingRouter.post("/owner/plans/:code/restore", ...ownerGuard, (req: AuthenticatedRequest, res: Response) => {
  try { res.json({ plan: restorePlan(req.params.code, req.account!.email) }); }
  catch (error) { fail(res, error, "تعذّرت الاستعادة."); }
});

billingRouter.post("/owner/subscription/start", ...ownerGuard, (req: AuthenticatedRequest, res: Response) => {
  try { res.status(201).json({ subscription: startSubscription(req.body || {}, req.account!.email) }); }
  catch (error) { fail(res, error, "تعذّر بدء الاشتراك."); }
});

billingRouter.patch("/owner/subscription", ...ownerGuard, (req: AuthenticatedRequest, res: Response) => {
  try { res.json({ subscription: amendSubscription(req.body || {}, req.account!.email) }); }
  catch (error) { fail(res, error, "تعذّر تعديل الاشتراك."); }
});

billingRouter.post("/owner/subscription/renew", ...ownerGuard, (req: AuthenticatedRequest, res: Response) => {
  try { res.json(renewSubscription(req.account!.email, { issueInvoice: req.body?.issueInvoice !== false })); }
  catch (error) { fail(res, error, "تعذّر التجديد."); }
});

billingRouter.post("/owner/subscription/extend", ...ownerGuard, (req: AuthenticatedRequest, res: Response) => {
  try { res.json({ subscription: extendSubscription(req.body || {}, req.account!.email) }); }
  catch (error) { fail(res, error, "تعذّر التمديد."); }
});

billingRouter.post("/owner/subscription/change-plan", ...ownerGuard, (req: AuthenticatedRequest, res: Response) => {
  try { res.json(changePlan(req.body || {}, req.account!.email)); }
  catch (error) { fail(res, error, "تعذّر تغيير الباقة."); }
});

billingRouter.post("/owner/subscription/cancel", ...ownerGuard, (req: AuthenticatedRequest, res: Response) => {
  try { res.json({ subscription: cancelSubscription(req.body?.atPeriodEnd !== false, req.account!.email, String(req.body?.reason || "")) }); }
  catch (error) { fail(res, error, "تعذّر الإلغاء."); }
});

billingRouter.post("/owner/subscription/resume", ...ownerGuard, (req: AuthenticatedRequest, res: Response) => {
  try { res.json({ subscription: resumeSubscription(req.account!.email) }); }
  catch (error) { fail(res, error, "تعذّرت الاستعادة."); }
});

/*
 * الإنهاء يُجمّد الكتابة فوراً على المؤسسة، فلا يمرّ بضغطة واحدة: يُطلب تأكيد
 * صريح في جسم الطلب. لا نافذة تأكيد في الواجهة تكفي — الواجهة قد تُتجاوز.
 */
billingRouter.post("/owner/subscription/terminate", ...ownerGuard, (req: AuthenticatedRequest, res: Response) => {
  if (req.body?.confirm !== "TERMINATE") {
    return void res.status(400).json({ error: 'الإنهاء يحتاج تأكيداً صريحاً: أرسل confirm="TERMINATE".' });
  }
  try { res.json({ subscription: terminateSubscription(req.account!.email, String(req.body?.reason || "")) }); }
  catch (error) { fail(res, error, "تعذّر الإنهاء."); }
});

billingRouter.post("/owner/invoices", ...ownerGuard, (req: AuthenticatedRequest, res: Response) => {
  try { res.status(201).json({ invoice: issueInvoice(req.body || { lines: [] }, req.account!.email) }); }
  catch (error) { fail(res, error, "تعذّر إصدار الفاتورة."); }
});

billingRouter.post("/owner/invoices/:id/void", ...ownerGuard, (req: AuthenticatedRequest, res: Response) => {
  try { res.json({ invoice: voidInvoice(req.params.id, req.account!.email) }); }
  catch (error) { fail(res, error, "تعذّر الإلغاء."); }
});

billingRouter.post("/owner/payments", ...ownerGuard, (req: AuthenticatedRequest, res: Response) => {
  try { res.status(201).json(recordPayment(req.body || {}, req.account!.email)); }
  catch (error) { fail(res, error, "تعذّر تسجيل الدفعة."); }
});

/* ------------------------------------------------------ حارس الترخيص */

/*
 * المسارات التي تبقى مفتوحة حتى عند التجميد.
 *
 * كان هنا استثناءٌ شامل لكل `/auth/` — وهو أوسع ممّا قصد تعليقه بكثير: يشمل
 * إنشاء الحسابات وتغيير الأدوار وإصدار كلمات المرور وإنهاء الجلسات، لا الخروجَ
 * وتغييرَ كلمة المرور وحدهما. والمقصود اثنان فقط، فهما المذكوران.
 *
 * والسبب: تجميد الطريق إلى التجديد يجعل التجميد أبدياً، وتجميد الخروج من حساب
 * عقوبةٌ على الشخص لا على المؤسسة.
 */
const ALWAYS_OPEN = [/^\/billing\//, /^\/logout$/, /^\/change-password$/];

/**
 * حارس الترخيص — يُركَّب على كل المسارات التشغيلية.
 *
 * يمنع الكتابة وحدها عند التجميد: كل GET يمرّ، فتبقى بيانات المؤسسة وسجلّ
 * تدقيقها وفواتيرها مقروءة وقابلة للتصدير. هذا فرقٌ أخلاقي لا تقني — البيانات
 * لها، والخدمة لنا.
 *
 * ويردّ 402 لا 403: الأولى تقول "ادفع"، والثانية تقول "لا صلاحية لك" — وهما
 * مشكلتان مختلفتان تماماً لمن يقرأ الرسالة.
 */
export function enforceSubscription(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  // صندوق الزائر التجريبي لا اشتراك له ولا يمسّ بيانات مؤسسة.
  if (DemoSandbox.isDemoRequest()) return next();
  if (ALWAYS_OPEN.some(pattern => pattern.test(req.path))) return next();
  // المالك لا يُحجب عن نظامه — وإلا لم يستطع تجديد الاشتراك الذي حجبه.
  if (req.account?.role === "owner") return next();

  const state = evaluateSubscription();
  if (state.writable) return next();

  res.status(402).json({
    error: state.reason,
    code: "SUBSCRIPTION_INACTIVE",
    status: state.status,
    readOnly: true,
    hint: "القراءة والتصدير يعملان. للتجديد راجع مالك المنصة من شاشة الاشتراك.",
  });
}
