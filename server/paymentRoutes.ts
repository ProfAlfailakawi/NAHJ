import { Router, Request, Response } from "express";
import express from "express";
import { AuthenticatedRequest, requireAuth, requireOwner, requireRole } from "./auth.ts";
import { DemoSandbox } from "./db.ts";
import { formatMoney, getInvoice, listInvoices } from "./billing.ts";
import {
  createCheckout, gatewayStatus, handleWebhook, intentsForInvoice, listIntents, remainingOn,
  settleByReference,
} from "./payments.ts";

/*
 * مسارات الدفع.
 *
 * وهي على مستويين لا يختلطان، والفصل بينهما هو موضع التركيب في الخادم لا شرطٌ
 * داخل معالج:
 *
 *   - `paymentPublicRouter`: الويب-هوك ورابط العودة. يُركَّب قبل قارئ JSON وقبل
 *     المصادقة وحارس CSRF وحارس الاشتراك — فالمزوّد لا يملك جلسةً ولا رمز حماية،
 *     ولا يجوز أن يمنعه اشتراكٌ متوقف من إبلاغنا بأن المؤسسة دفعت لتوّها.
 *     وحمايته توقيعه: بلا توقيعٍ صحيح لا يُقرأ منه شيء.
 *
 *   - `paymentRouter`: ما تستعمله المؤسسة والمالك بجلسةٍ ورمز حماية.
 *
 * وترتيب التركيب هنا هو الأمان نفسه: لو وُضع الويب-هوك بعد `express.json` لضاع
 * الجسم الخام وبطل التحقق من التوقيع، ولو وُضع بعد المصادقة لما وصل أصلاً.
 */

const fail = (res: Response, error: unknown, fallback: string) => {
  const status = Number((error as { status?: number })?.status) || 400;
  const message = error instanceof Error && error.message ? error.message : fallback;
  const code = (error as { code?: string })?.code;
  res.status(status).json({ error: message, ...(code ? { code } : {}) });
};

/* --------------------------------------------------------- المسار العام */

export const paymentPublicRouter = Router();

/*
 * الجسم الخام ضرورة لا تفضيل: التوقيع محسوبٌ على البايتات كما أُرسلت، وأي
 * إعادة ترميز (ترتيب مفاتيح، مسافات) تكسر المطابقة فتُرفض إشعاراتٌ صحيحة.
 */
paymentPublicRouter.post(
  "/webhook/:provider",
  express.raw({ type: "*/*", limit: "512kb" }),
  async (req: Request, res: Response) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body ?? "");
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) headers[key.toLowerCase()] = String(value ?? "");

    try {
      const result = await handleWebhook(req.params.provider, rawBody, headers);
      /*
       * 200 حتى حين لا نفعل شيئاً: المزوّد يُعيد الإرسال حتى يستلم 200، وإشعارٌ
       * عن عمليةٍ لا تخصّ هذا النشر لا ينتهي إعادة إرساله أبداً لو ردَدنا بخطأ.
       */
      res.json({ received: true, ...result });
    } catch (error) {
      const status = Number((error as { status?: number })?.status) || 400;
      res.status(status).json({ received: false, error: error instanceof Error ? error.message : "تعذّرت معالجة الإشعار." });
    }
  },
);

/**
 * عودة الدافع.
 *
 * تُسأل البوابة ثم يُعاد المتصفح إلى شاشة الاشتراك بنتيجةٍ في العنوان. ولا
 * يُقرأ من العودة إلا المرجع: فتحُ الرابط باليد لا يُسدِّد فاتورة.
 */
paymentPublicRouter.get("/return", async (req: Request, res: Response) => {
  const reference = String(req.query.ref || req.query.CustomerReference || req.query.tap_id || "");
  let outcome = "pending";
  try {
    const result = await settleByReference(reference);
    outcome = !result ? "unknown" : result.intent.status === "paid" ? "paid" : result.intent.status;
  } catch {
    outcome = "error";
  }
  res.redirect(302, `/?payment=${encodeURIComponent(outcome)}#billing`);
});

/* ------------------------------------------------------ مسارات الجلسة */

export const paymentRouter = Router();

/** حالة البوابة — بلا مفتاح ولا سرّ، فقط ما يلزم الواجهة لتقرّر ما تعرض. */
paymentRouter.get("/gateway", requireAuth, (_req: AuthenticatedRequest, res: Response) => {
  const status = gatewayStatus();
  res.json({
    provider: status.provider,
    providerLabel: status.providerLabel,
    configured: status.configured,
    environment: status.environment,
    missing: status.missing,
    note: status.note,
  });
});

/**
 * إنشاء رابط دفع لفاتورة.
 *
 * متاحٌ لمن يملك قرار الصرف في المؤسسة (مشرف أو مدير) وللمالك. والمبلغ لا
 * يُؤخذ من الطلب إطلاقاً: يُشتق من المتبقّي على الفاتورة في الخادم — وإلا دفع
 * من يشاء ما يشاء وعُدَّت الفاتورة مسدّدة.
 */
paymentRouter.post("/checkout", requireAuth, requireRole("admin", "manager"), async (req: AuthenticatedRequest, res: Response) => {
  if (DemoSandbox.isDemoRequest()) {
    return res.status(403).json({ error: "الدفع غير متاح في البيئة التجريبية.", code: "DEMO_READONLY" });
  }
  try {
    const intent = await createCheckout({
      invoiceId: String(req.body?.invoiceId || ""),
      payerName: req.account?.name,
      payerEmail: req.account?.email,
      payerPhone: String(req.body?.payerPhone || ""),
    }, req.account!.email);
    res.status(201).json({
      intentId: intent.id,
      url: intent.checkoutUrl,
      amount: intent.amount,
      currency: intent.currency,
      formattedAmount: formatMoney(intent.amount, intent.currency),
      provider: intent.provider,
      environment: gatewayStatus().environment,
    });
  } catch (error) {
    fail(res, error, "تعذّر إنشاء رابط الدفع.");
  }
});

/** حالة عملية بعينها — تُستعمل بعد العودة من صفحة المزوّد. */
paymentRouter.get("/intents/:id", requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const intents = listIntents(500).filter(intent => intent.id === req.params.id);
  if (!intents.length) return res.status(404).json({ error: "عملية الدفع غير موجودة." });
  const intent = intents[0];
  res.json({
    id: intent.id, invoiceId: intent.invoiceId, status: intent.status,
    amount: intent.amount, currency: intent.currency,
    formattedAmount: formatMoney(intent.amount, intent.currency),
    failureReason: intent.failureReason, settledAt: intent.settledAt,
  });
});

/**
 * دفتر العمليات للمالك.
 *
 * ما يهمّه ليس القائمة وحدها بل ما يحتاج تدخّلاً: عمليةٌ حُصِّلت بمبلغٍ مخالف،
 * أو حُصِّلت ولم تُسجَّل. وهذه تُرفع إلى أعلى بدل أن تُدفن في سجلّ طويل.
 */
paymentRouter.get("/owner/intents", requireAuth, requireOwner, (_req: AuthenticatedRequest, res: Response) => {
  const intents = listIntents(200);
  const invoices = new Map(listInvoices(500).map(invoice => [invoice.id, invoice]));
  res.json({
    gateway: gatewayStatus(),
    needsAttention: intents.filter(intent => intent.status === "mismatch").map(intent => ({
      ...intent,
      invoiceNumber: invoices.get(intent.invoiceId)?.number || "—",
      formattedAmount: formatMoney(intent.amount, intent.currency),
    })),
    intents: intents.map(intent => ({
      ...intent,
      invoiceNumber: invoices.get(intent.invoiceId)?.number || "—",
      formattedAmount: formatMoney(intent.amount, intent.currency),
    })),
  });
});

/** عمليات فاتورةٍ بعينها، وما تبقّى عليها. */
paymentRouter.get("/invoices/:id/intents", requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const invoice = getInvoice(String(req.params.id));
  if (!invoice) return res.status(404).json({ error: "الفاتورة غير موجودة." });
  res.json({
    remaining: remainingOn(invoice),
    formattedRemaining: formatMoney(remainingOn(invoice), invoice.currency),
    intents: intentsForInvoice(invoice.id),
  });
});
