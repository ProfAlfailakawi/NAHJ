import { Router, Response } from "express";
import {
  AuthenticatedRequest, requireAuth, requireOwner, requirePartnerOrOwner, isOwnerRole,
} from "./auth.ts";
import {
  accrueCommissions, computeCommission, deleteClient, deletePartner, getPartner, getPartnerByAccount,
  listClients, listCommissions, partnerOverview, partnerPortal, payCommissions, upsertClient,
  upsertPartner, voidCommission,
} from "./partners.ts";

/*
 * مسارات المسوّقين.
 *
 * قسمان لا يختلطان، والعزل بينهما هو كل شيء:
 *
 *   - `/partners/me`  لوحة المسوّق. كل استعلام فيها مُقيَّد بمعرّفه المشتقّ من
 *     جلسته هو، لا من شيء يرسله. فلا يستطيع أن يطلب لوحة زميله بتبديل رقم.
 *
 *   - `/partners/owner/*` دفتر المالك كاملاً.
 *
 * والقاعدة التي لا تُخرق: المسوّق طرفٌ خارجي. لا يرى بيانةً تشغيلية واحدة من
 * داخل أي مؤسسة — لا مهارة ولا حالة عمل ولا سجلّ تدقيق — ولا يرى شركات غيره
 * ولا إجمالي إيراد المالك. وما لا يخصّه لا يغادر الخادم أصلاً.
 */

export const partnerRouter = Router();

const fail = (res: Response, error: unknown, fallback: string) => {
  const status = Number((error as { status?: number })?.status) || 400;
  res.status(status).json({ error: (error as Error)?.message || fallback, code: (error as { code?: string })?.code });
};

/* ------------------------------------------------- لوحة المسوّق */

/**
 * ما يخصّ صاحب الجلسة وحده.
 *
 * المعرّف يُشتق من الحساب المسجَّل لا من معامل في الطلب — وهذا هو الفرق بين عزلٍ
 * حقيقي وعزلٍ يعتمد على ألّا يجرّب أحدٌ تبديل رقم.
 */
partnerRouter.get("/me", requireAuth, requirePartnerOrOwner, (req: AuthenticatedRequest, res: Response) => {
  const partner = getPartnerByAccount(req.account!.id);
  if (!partner) {
    return void res.status(404).json({
      error: "لا يوجد ملفّ مسوّق مرتبط بهذا الحساب. راجع مالك المنصة لربطه.",
      code: "PARTNER_NOT_LINKED",
    });
  }
  if (partner.status !== "active") {
    return void res.status(403).json({ error: "هذا الملفّ موقوف. راجع مالك المنصة.", code: "PARTNER_SUSPENDED" });
  }
  const portal = partnerPortal(partner.id);
  if (!portal) return void res.status(404).json({ error: "تعذّرت قراءة اللوحة." });
  res.json(portal);
});

/* ------------------------------------------------- دفتر المالك */

const ownerGuard = [requireAuth, requireOwner] as const;

partnerRouter.get("/owner/overview", ...ownerGuard, (_req: AuthenticatedRequest, res: Response) => {
  res.json(partnerOverview());
});

partnerRouter.post("/owner/partners", ...ownerGuard, (req: AuthenticatedRequest, res: Response) => {
  try { res.status(201).json({ partner: upsertPartner(req.body || {}, undefined, req.account!.email) }); }
  catch (error) { fail(res, error, "تعذّر حفظ المسوّق."); }
});

partnerRouter.patch("/owner/partners/:id", ...ownerGuard, (req: AuthenticatedRequest, res: Response) => {
  try { res.json({ partner: upsertPartner(req.body || {}, req.params.id, req.account!.email) }); }
  catch (error) { fail(res, error, "تعذّر تحديث المسوّق."); }
});

partnerRouter.delete("/owner/partners/:id", ...ownerGuard, (req: AuthenticatedRequest, res: Response) => {
  try { deletePartner(req.params.id, req.account!.email); res.json({ ok: true }); }
  catch (error) { fail(res, error, "تعذّر الحذف."); }
});

partnerRouter.post("/owner/clients", ...ownerGuard, (req: AuthenticatedRequest, res: Response) => {
  try { res.status(201).json({ client: upsertClient(req.body || {}, undefined, req.account!.email) }); }
  catch (error) { fail(res, error, "تعذّر حفظ الشركة."); }
});

partnerRouter.patch("/owner/clients/:id", ...ownerGuard, (req: AuthenticatedRequest, res: Response) => {
  try { res.json({ client: upsertClient(req.body || {}, req.params.id, req.account!.email) }); }
  catch (error) { fail(res, error, "تعذّر تحديث الشركة."); }
});

partnerRouter.delete("/owner/clients/:id", ...ownerGuard, (req: AuthenticatedRequest, res: Response) => {
  try { deleteClient(req.params.id, req.account!.email); res.json({ ok: true }); }
  catch (error) { fail(res, error, "تعذّر الحذف."); }
});

/**
 * معاينة العمولة قبل أن تصير التزاماً.
 *
 * يرى المالك والمسوّق الرقم نفسه قبل التعاقد، فلا يُبنى الاتفاق على تقديرٍ في
 * ذهن كلٍّ منهما ثم يُكتشف الفرق عند أول مطالبة.
 */
partnerRouter.post("/owner/preview", ...ownerGuard, (req: AuthenticatedRequest, res: Response) => {
  const partner = getPartner(String(req.body?.partnerId || ""));
  if (!partner) return void res.status(404).json({ error: "المسوّق غير موجود." });
  const contractValue = Number(req.body?.contractValue ?? 0);
  if (!Number.isInteger(contractValue) || contractValue < 0) {
    return void res.status(400).json({ error: "قيمة العقد تُكتب بالوحدة الصغرى كعدد صحيح." });
  }
  res.json({
    firstCycle: computeCommission(partner, contractValue, 0),
    laterCycle: computeCommission(partner, contractValue, 1),
    model: partner.model,
    currency: partner.currency,
  });
});

partnerRouter.post("/owner/commissions/pay", ...ownerGuard, (req: AuthenticatedRequest, res: Response) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    res.json(payCommissions(ids, String(req.body?.reference || ""), req.account!.email));
  } catch (error) { fail(res, error, "تعذّر تسجيل الدفع."); }
});

partnerRouter.post("/owner/commissions/:id/void", ...ownerGuard, (req: AuthenticatedRequest, res: Response) => {
  try { res.json({ commission: voidCommission(req.params.id, String(req.body?.note || ""), req.account!.email) }); }
  catch (error) { fail(res, error, "تعذّر الإلغاء."); }
});

partnerRouter.post("/owner/accrue", ...ownerGuard, (req: AuthenticatedRequest, res: Response) => {
  try { res.json(accrueCommissions(undefined, req.account!.email)); }
  catch (error) { fail(res, error, "تعذّر توليد الاستحقاقات."); }
});

/* المالك وحده يقرأ دفتر مسوّقٍ بعينه — لأغراض التسوية. */
partnerRouter.get("/owner/partners/:id/portal", ...ownerGuard, (req: AuthenticatedRequest, res: Response) => {
  const portal = partnerPortal(req.params.id);
  if (!portal) return void res.status(404).json({ error: "المسوّق غير موجود." });
  res.json(portal);
});

partnerRouter.get("/owner/clients/:id/commissions", ...ownerGuard, (req: AuthenticatedRequest, res: Response) => {
  res.json({ commissions: listCommissions({ clientId: req.params.id }) });
});

/* ------------------------------------------------ حارس سطح المسوّق */

/**
 * يمنع المسوّق من بلوغ أي سطح تشغيلي.
 *
 * يُركَّب على جذر موجّه الـAPI: المسوّق طرفٌ خارجي، ولا شأن له بمهارات المؤسسة
 * ولا حالات عملها ولا سجلّ تدقيقها — وهي بيانات عميلٍ لا بيانات وسيط.
 *
 * والحجب هنا لا في الواجهة: واجهةٌ تُخفي زرّاً تبقى مساراتها مفتوحة لمن يعرف
 * عنوانها.
 */
export function confinePartners(req: AuthenticatedRequest, res: Response, next: () => void) {
  if (req.account?.role !== "partner") return next();
  const path = req.path || "";
  /* لوحته وحدها، ومعها الفحص الحيّ وهوية الجلسة. */
  if (/^\/partners\/me/.test(path) || /^\/health/.test(path)) return next();
  res.status(403).json({
    error: "حسابك حساب مسوّق — يرى شركاتك وعمولاتك وحدها.",
    code: "PARTNER_SCOPE",
  });
}
