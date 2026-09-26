import { Router, Request, Response, NextFunction } from "express";
import { db, DemoSandbox, requestAccount } from "./db.ts";
import { setupSectorCodes } from "./packs/cleanStart.ts";
import { LeadError, listLeads, setLeadStatus } from "./leads.ts";
import { PolicyEngine } from "./engine/policyEngine.ts";
import { SkillEngine } from "./engine/skillEngine.ts";
import { ConnectorLayer } from "./engine/connectors.ts";
import { McpEngine } from "./engine/mcpEngine.ts";
import { deriveMetrics, type MetricsInput } from "./engine/metricsEngine.ts";
import { listSectors, EDUCATION_CODE, getSectorPack } from "./packs/index.ts";
import { synthesize } from "./engine/teachEngine.ts";
import { generateAiResponse } from "./gemini.ts";
import { AutonomyLevel, SkillStep, LearningSession, Skill } from "../src/types/index.ts";
import { getFirebaseStatus } from "./firebase.ts";
import { gatewayStatus } from "./payments.ts";
import { billingRouter, enforceSubscription } from "./billingRoutes.ts";
import { confinePartners, partnerRouter } from "./partnerRoutes.ts";
import { paymentRouter } from "./paymentRoutes.ts";
import {
  LEDGER_LABELS, OWNER_ONLY, backupStatus, buildFullExport, buildLedgerCsv, describeExport,
  humanBytes, listBackups, runBackup, type LedgerName,
} from "./archive.ts";
import { ipBlocked, recordIpFailure } from "./loginThrottle.ts";
import { reviewPromotion } from "./engine/promotionReview.ts";
import { buildDecisionRecord, reasonRequiredFor } from "./engine/decisionRecord.ts";
import { assignBackup, coverageReport, recordCoverageSnapshot } from "./engine/coverage.ts";
import { normalizeManualOptions, renderManualHtml, signManual, verifyManual } from "./manual.ts";
import { SECTOR_COMPLIANCE_PRESETS } from "./engine/policyEngine.ts";
import { flushNotifications, listNotifications, notifyEmergencyPause, notifyStatus } from "./notify.ts";
import { incrementUsage, maxAutonomyLevel } from "./billing.ts";
import {
  AuthenticatedRequest,
  adminCreateAccount,
  adminSetPassword,
  changeOwnPassword,
  clearSessionCookies,
  createFirstAccount,
  ensureOwnerAccount,
  listAccounts,
  login,
  logout,
  needsFirstRunSetup,
  requireAuth,
  requireOwner,
  requireRole,
  revokeSessions,
  setSessionCookies,
  updateAccount,
  authCookieNames,
} from "./auth.ts";

export const apiRouter = Router();

/*
 * مدخل محرّك القياس.
 *
 * موضعٌ واحد يجمع المخزن الحيّ، فلا يقرأ مسارٌ من مجموعة ومسارٌ آخر من غيرها
 * فتتناقض شاشتان على الرقم نفسه.
 */
const metricsInput = (): MetricsInput => ({
  skills: db.skills,
  workItems: db.workItems,
  auditEvents: db.auditEvents,
  approvalRequests: db.approvalRequests,
  shadowComparisons: db.shadowComparisons,
  testCases: db.testCases,
  policies: db.policies,
});

/*
 * مسارات المصادقة — الوحيدة المتاحة بلا جلسة. كل ما بعدها محروس.
 */
export const authRouter = Router();

/*
 * حالة التهيئة. تُقرأ بلا جلسة عمداً: الواجهة تحتاج أن تعرف قبل أي شيء هل تعرض شاشة
 * «أنشئ حساب المشغّل» أم شاشة الدخول. لا تكشف إلا أن النظام مُهيَّأ أم لا.
 */
authRouter.get("/status", (_req: Request, res: Response) => {
  res.json({ needsSetup: needsFirstRunSetup() });
});

/*
 * التهيئة الأولى: تُنشئ حساب المشرف الأول وتفتح له جلسة مباشرة.
 * مفتوحة فقط ما دام لا يوجد أي حساب، والشرط مفروض ذرّياً داخل جملة الإدراج نفسها.
 */
authRouter.post("/setup", async (req: Request, res: Response) => {
  try {
    const account = await createFirstAccount({
      email: req.body?.email,
      name: req.body?.name,
      password: req.body?.password,
    });
    /*
     * من هيّأ النظام هو مالكه.
     *
     * `ensureOwnerAccount` يعمل عند الإقلاع أيضاً، لكن النشر الجديد لا حساب فيه
     * حينها — فالحساب يُنشأ من هذه الشاشة بعد الإقلاع بدقائق. بدون النداء هنا يبقى
     * أول مشرف بلا مِلكية حتى إعادة التشغيل التالية: يفتح النظام فلا يجد لوحة
     * ترخيصه، ولا شيء يفسّر له لماذا.
     *
     * والترقية قبل فتح الجلسة لا بعدها، لتحمل الجلسة الدور الصحيح من لحظتها الأولى.
     */
    ensureOwnerAccount();
    // تسجيل دخول فوري: مطالبة المستخدم بإعادة إدخال ما كتبه للتو خطوة بلا فائدة.
    const session = await login(account.email, req.body?.password);
    setSessionCookies(req, res, session.sessionToken, session.csrfToken);
    res.status(201).json({ account: session.account, csrfToken: session.csrfToken, expiresAt: session.expiresAt });
  } catch (error) {
    const status = Number((error as { status?: number })?.status) || 400;
    res.status(status).json({ error: (error as Error)?.message || "تعذّرت التهيئة.", code: "SETUP_FAILED" });
  }
});

/*
 * حدٌّ لكل عنوان IP على المحاولات الفاشلة.
 *
 * قفل الحساب يحمي حساباً بعينه؛ ولا يمنع من يجرّب كلمة مرور واحدة شائعة على
 * مئات البُرُد. تُعدّ الإخفاقات وحدها، فالدخول الناجح لا يستهلك شيئاً.
 */
/* العدّ محفوظٌ في SQLite (server/loginThrottle.ts) فلا تُصفّره إعادة التشغيل. */

authRouter.post("/login", async (req: Request, res: Response) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  if (ipBlocked(ip)) {
    return void res.status(429).json({ error: "محاولات كثيرة من هذا الجهاز. حاول بعد قليل.", code: "LOGIN_FAILED" });
  }
  try {
    const result = await login(req.body?.email, req.body?.password);
    setSessionCookies(req, res, result.sessionToken, result.csrfToken);
    res.json({ account: result.account, csrfToken: result.csrfToken, expiresAt: result.expiresAt });
  } catch (error) {
    const status = Number((error as { status?: number })?.status) || 401;
    if (status === 401) recordIpFailure(ip);
    res.status(status).json({ error: (error as Error)?.message || "تعذّر تسجيل الدخول.", code: "LOGIN_FAILED" });
  }
});

authRouter.post("/logout", (req: Request, res: Response) => {
  const cookies = req.headers.cookie || "";
  const match = cookies.split(";").map((part) => part.trim().split("=")).find(([key]) => key === authCookieNames.session);
  logout(match ? decodeURIComponent(match.slice(1).join("=")) : undefined);
  clearSessionCookies(req, res);
  res.status(204).end();
});

authRouter.get("/me", requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({ account: req.account });
});

/* تغيير المستخدم كلمة مروره بنفسه — متاح لكل حساب مسجَّل، لا للمشرف وحده. */
authRouter.post("/change-password", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await changeOwnPassword(req.account!.id, req.body?.currentPassword, req.body?.newPassword);
    res.json({ ok: true });
  } catch (error) {
    const status = Number((error as { status?: number })?.status) || 400;
    res.status(status).json({ error: (error as Error)?.message || "تعذّر تغيير كلمة المرور." });
  }
});

/*
 * إدارة الحسابات — للمشرف وحده.
 *
 * الزائر التجريبي يمرّ من requireAuth بهوية admin اصطناعية، فلا بد من استبعاده
 * صراحةً هنا: صندوقه في الذاكرة لا يحوي حسابات، لكن هذه المسارات تكتب في قاعدة
 * البيانات الحقيقية مباشرة لا عبر الصندوق.
 */
const realAdminOnly = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.account?.id === "demo") {
    return void res.status(403).json({ error: "إدارة الحسابات غير متاحة في البيئة التجريبية.", code: "DEMO_READONLY" });
  }
  next();
};

/*
 * إدارة الحسابات تمرّ بحارس الاشتراك أيضاً.
 *
 * `authRouter` مركَّب في `server.ts` على `/api/auth` قبل `apiRouter` وبمعزل عنه،
 * فلا يبلغه `enforceSubscription` المركَّب داخل الثاني إطلاقاً. أي أن اشتراكاً
 * موقوفاً كان يُجمّد كل شيء إلا ما يُنشئ الحسابات ويغيّر الأدوار ويُصدر كلمات
 * المرور — وهي من أثقل الكتابات لا أخفّها، وفيها حدّ المقاعد المدفوع.
 *
 * ويُركَّب هنا لا على الموجّه كلّه: الدخول والخروج وتغيير المرء كلمة مروره تبقى
 * مفتوحة، وإلا صار التجميد قفلاً بلا مفتاح.
 */
const accountsGuard = [requireAuth, realAdminOnly, requireRole("admin"), enforceSubscription] as const;

authRouter.get("/accounts", ...accountsGuard, (_req: AuthenticatedRequest, res: Response) => {
  res.json({ accounts: listAccounts() });
});

authRouter.post("/accounts", ...accountsGuard, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const account = await adminCreateAccount({
      email: req.body?.email,
      name: req.body?.name,
      password: req.body?.password,
      role: req.body?.role,
    });
    res.status(201).json({ account });
  } catch (error) {
    const status = Number((error as { status?: number })?.status) || 400;
    res.status(status).json({ error: (error as Error)?.message || "تعذّر إنشاء الحساب." });
  }
});

authRouter.patch("/accounts/:id", ...accountsGuard, (req: AuthenticatedRequest, res: Response) => {
  try {
    // لا يخفض المشرف دوره هو ولا يعطّل نفسه: خطأٌ يقفله خارج نظامه بلا رجعة.
    if (req.params.id === req.account!.id) {
      return void res.status(409).json({ error: "لا يمكنك تغيير دور حسابك أو حالته." });
    }
    res.json({ account: updateAccount(req.params.id, { role: req.body?.role, status: req.body?.status }) });
  } catch (error) {
    const status = Number((error as { status?: number })?.status) || 400;
    res.status(status).json({ error: (error as Error)?.message || "تعذّر تحديث الحساب." });
  }
});

/* إصدار كلمة مرور مؤقتة. سلّمها بقناة تثق بها — لا يوجد بريد يرسلها. */
authRouter.post("/accounts/:id/password", ...accountsGuard, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await adminSetPassword(req.params.id, req.body?.newPassword, req.account?.id);
    res.json({ ok: true, sessionsRevoked: true });
  } catch (error) {
    const status = Number((error as { status?: number })?.status) || 400;
    res.status(status).json({ error: (error as Error)?.message || "تعذّر ضبط كلمة المرور." });
  }
});

authRouter.post("/accounts/:id/revoke-sessions", ...accountsGuard, (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ ok: true, revoked: revokeSessions(req.params.id, req.account?.id) });
  } catch (error) {
    const status = Number((error as { status?: number })?.status) || 400;
    res.status(status).json({ error: (error as Error)?.message || "تعذّر إنهاء الجلسات." });
  }
});

/*
 * كل مسار تشغيلي يمرّ بالمصادقة وحماية CSRF. المنصة تدير مفاتيح إيقاف ومستويات
 * استقلالية وموافقات، فلا معنى لأي منها على سطح مفتوح.
 */
apiRouter.use(requireAuth);

/* صاحب الجلسة يُحمل مع الطلب: منه يُقرأ «المستخدم الحالي» وتُوقَّع الإجراءات باسمه. */
apiRouter.use((req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
  const account = req.account;
  if (!account) return next();
  requestAccount.run({ id: account.id, name: account.name, email: account.email, role: account.role }, next);
});

/*
 * الترخيص.
 *
 * يأتي بعد المصادقة مباشرة وقبل أي مسار تشغيلي: اشتراكٌ موقوف يُجمّد الكتابة على
 * كل ما تحته بلا استثناء، بدل أن يُفحص في كل مسار على حدة — وهو ما يُنسى في واحد
 * منها حتماً. والقراءة تمرّ كاملة.
 */
/*
 * الترتيب هنا هو العزل نفسه، لا تنظيمٌ للقراءة.
 *
 *   ١. دفتر المسوّقين أولاً، ليبلغ المسوّق لوحته.
 *   ٢. ثم حبسُه فيها، فلا يبلغ شيئاً بعدها.
 *   ٣. ثم الاشتراك وباقي الأسطح التشغيلية.
 *
 * وموضع الحارس قبل موجّه الاشتراك مقصود وحاسم: كان مركَّباً بعده، فكان المسوّق
 * يقرأ اشتراك المؤسسة كاملاً — باقتها وفواتيرها ودفعاتها واستهلاكها. وهي بيانات
 * عميلٍ لا شأن لوسيطٍ بها، ولم يكشفها فحصُ أنواعٍ ولا اختبار وحدة: كشفها طلبٌ
 * واحد على خادم حيّ ردّ 200 حيث كان يجب أن يردّ 403.
 *
 * ولوحة المسوّق قبل حارس الاشتراك عمداً: عمولته مستحقّةٌ عليه حتى لو توقّف اشتراك
 * المؤسسة. لا يُحجب عن دفتره لأن عميلاً تأخّر في السداد.
 */
apiRouter.use("/partners", partnerRouter);
apiRouter.use(confinePartners);

apiRouter.use("/billing", billingRouter);
/*
 * الدفع قبل حارس الاشتراك.
 *
 * مؤسسةٌ جُمِّدت لعدم السداد هي بالضبط من يحتاج أن يدفع. ولو رُكِّب هذا بعد
 * الحارس لردّ 402 على محاولة السداد نفسها — وهو قفلٌ لا مخرج منه.
 */
apiRouter.use("/payments", paymentRouter);

/*
 * التصدير والنسخ — قبل حارس الاشتراك.
 *
 * «البيانات للمؤسسة والخدمة هي المُباعة» سطرٌ لا معنى له إن مُنعت المؤسسة من
 * أخذ بياناتها لحظةَ تجميدها. ومنعُ التصدير عن متأخّرٍ عن السداد ابتزازٌ لا
 * تحصيل. وهذه المسارات قراءةٌ خالصة، فالحارس يمرّرها أصلاً — والتركيب هنا
 * يجعل ذلك صريحاً لا عرَضاً.
 */
const exportGuard = [requireAuth, requireRole("admin", "manager")] as const;

apiRouter.get("/export/summary", ...exportGuard, (req: AuthenticatedRequest, res: Response) => {
  const isOwner = req.account?.role === "owner";
  res.json({
    counts: describeExport(),
    ledgers: (Object.keys(LEDGER_LABELS) as LedgerName[])
      .filter(name => isOwner || !OWNER_ONLY.includes(name))
      .map(name => ({ name, label: LEDGER_LABELS[name] })),
    backup: isOwner ? backupStatus() : null,
  });
});

/** نسخةٌ كاملة بصيغة JSON — كل ما جمعته المؤسسة في ملفٍ واحد. */
apiRouter.get("/export/full.json", ...exportGuard, (req: AuthenticatedRequest, res: Response) => {
  if (DemoSandbox.isDemoRequest()) {
    return res.status(403).json({ error: "التصدير غير متاح في البيئة التجريبية.", code: "DEMO_READONLY" });
  }
  const payload = buildFullExport({ includeOwnerLedgers: req.account?.role === "owner" });

  /*
   * تصديرٌ كامل لبيانات مؤسسة حدثٌ أمني بقدر ما هو خدمة: يُسجَّل بمن فعله.
   */
  db.logAudit({
    actorType: "human",
    actorName: req.account!.email,
    action: "EXPORT_FULL_STATE",
    provenance: "تصدير البيانات",
    risk: "medium",
    latencyMs: 0,
    details: `تصدير كامل للحالة التشغيلية (${payload.operations.skills.length} مهارة، ${payload.operations.auditEvents.length} حدث تدقيق).`,
    status: "success",
  });

  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="nahj-export-${stamp}.json"`);
  res.send(JSON.stringify(payload, null, 2));
});

/** دفترٌ واحد بصيغة CSV — يُفتح في أي جدول بلا وسيط. */
apiRouter.get("/export/:ledger.csv", ...exportGuard, (req: AuthenticatedRequest, res: Response) => {
  const ledger = String(req.params.ledger) as LedgerName;
  if (!(ledger in LEDGER_LABELS)) return res.status(404).json({ error: "لا دفتر بهذا الاسم." });
  if (OWNER_ONLY.includes(ledger) && req.account?.role !== "owner") {
    return res.status(403).json({ error: "هذا الدفتر لمالك المنصة وحده.", code: "OWNER_ONLY" });
  }
  if (DemoSandbox.isDemoRequest()) {
    return res.status(403).json({ error: "التصدير غير متاح في البيئة التجريبية.", code: "DEMO_READONLY" });
  }

  db.logAudit({
    actorType: "human", actorName: req.account!.email, action: "EXPORT_LEDGER",
    provenance: LEDGER_LABELS[ledger], risk: "low", latencyMs: 0,
    details: `تصدير دفتر «${LEDGER_LABELS[ledger]}» بصيغة CSV.`, status: "success",
  });

  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="nahj-${ledger}-${stamp}.csv"`);
  res.send(buildLedgerCsv(ledger));
});

/* الإشعارات: حالتها وطابورها — لمن يملك النشر. */
/* طلبات العرض الواردة من الصفحة العامة — للمالك وحده. */
apiRouter.get("/owner/leads", requireAuth, requireOwner, (_req: AuthenticatedRequest, res: Response) => {
  res.json({ leads: listLeads() });
});

apiRouter.post("/owner/leads/:id/status", requireAuth, requireOwner, (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ lead: setLeadStatus(req.params.id, req.body?.status) });
  } catch (error) {
    if (error instanceof LeadError) return void res.status(error.status).json({ error: error.message });
    throw error;
  }
});

apiRouter.get("/notifications", requireAuth, requireOwner, (_req: AuthenticatedRequest, res: Response) => {
  res.json({ status: notifyStatus(), recent: listNotifications(40) });
});

apiRouter.post("/notifications/flush", requireAuth, requireOwner, async (_req: AuthenticatedRequest, res: Response) => {
  res.json(await flushNotifications());
});

/* النسخ الاحتياطي يخصّ من يملك النشر — لا من يستعمله. */
apiRouter.get("/backup", requireAuth, requireOwner, (_req: AuthenticatedRequest, res: Response) => {
  res.json({
    status: backupStatus(),
    files: listBackups().map(file => ({ ...file, size: humanBytes(file.sizeBytes), path: undefined })),
  });
});

apiRouter.post("/backup/run", requireAuth, requireOwner, (req: AuthenticatedRequest, res: Response) => {
  const result = runBackup();
  db.logAudit({
    actorType: "human", actorName: req.account!.email, action: "RUN_BACKUP",
    provenance: "نسخة احتياطية", risk: "low", latencyMs: 0,
    details: result.ok
      ? `نسخة احتياطية: ${result.file!.name} (${humanBytes(result.file!.sizeBytes)})${result.pruned.length ? `، وحُذف ${result.pruned.length} أقدم` : ""}.`
      : `تعذّرت النسخة الاحتياطية: ${result.reason}`,
    status: result.ok ? "success" : "warning",
  });
  if (!result.ok) return res.status(500).json({ ok: false, error: result.reason });
  res.json({ ok: true, file: { ...result.file, size: humanBytes(result.file!.sizeBytes), path: undefined }, pruned: result.pruned });
});

apiRouter.use(enforceSubscription);

// 1. Context & User Switching
apiRouter.get("/context", (req: Request, res: Response) => {
  res.json({
    organizationConfigured: db.organizationConfigured,
    sectorCode: db.sectorCode,
    organization: db.organization,
    users: db.users,
    currentUser: db.getCurrentUser(),
    verifiedSkillsCount: db.skills.filter((s) => s.status === "active").length,
    pendingApprovalsCount: db.approvalRequests.filter((a) => a.status === "pending").length,
    learnedItemsCount: db.learningProposals.filter((p) => p.status === "pending").length,
  });
});

/*
 * إعداد المؤسسة — مرة واحدة، عند بدء التشغيل الحقيقي.
 *
 * مشرف المؤسسة أو مالك المنصة يكتب اسمها ويختار قطاعها، فتُستبدل بذرة العرض
 * ببدايةٍ نظيفة. ولا يُعاد: مؤسسةٌ أُعِدّت تبدّل نشاطها من شاشة «النشاط»، ولا
 * يُمحى عملها بطلبٍ ثانٍ على هذا المسار.
 */
apiRouter.post("/setup/organization", requireRole("admin"), (req: AuthenticatedRequest, res: Response) => {
  if (db.isDemo) return void res.status(400).json({ error: "صندوق العرض لا يُعَدّ.", code: "DEMO" });
  if (db.organizationConfigured) {
    return void res.status(409).json({ error: "أُعِدّت المؤسسة من قبل. لتبديل النشاط استعمل شاشة «النشاط».", code: "ALREADY_CONFIGURED" });
  }
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 120) : "";
  const nameEn = typeof req.body?.nameEn === "string" ? req.body.nameEn.trim().slice(0, 120) : "";
  const sector = String(req.body?.sector || "");
  if (name.length < 2) return void res.status(400).json({ error: "اكتب اسم المؤسسة.", code: "NAME_REQUIRED" });
  if (!setupSectorCodes().includes(sector)) return void res.status(400).json({ error: "اختر قطاع المؤسسة.", code: "SECTOR_REQUIRED" });
  const result = db.configureOrganization(sector, name, nameEn, req.account?.name || "مشرف");
  if (!result.ok) return void res.status(400).json({ error: result.reason });
  res.json({ ok: true, organization: db.organization, sectorCode: db.sectorCode });
});

/*
 * تبديل الملف التشغيلي المعروض. كان هذا المسار مفتوحاً يسمح لأي زائر بانتحال أي دور؛
 * صار محصوراً بالمشرف، ولا يمنح صلاحية إطلاقاً — الصلاحية من الجلسة وحدها، وهذا يبدّل
 * الملف التشغيلي المعروض في الواجهة فقط.
 */
apiRouter.post("/switch-role", requireRole("admin"), (req: Request, res: Response) => {
  const { userId } = req.body;
  if (!db.users.some((u) => u.id === userId)) {
    return res.status(404).json({ success: false, message: "المستخدم غير موجود" });
  }
  const user = db.setCurrentUser(userId);
  res.json({ success: true, currentUser: user });
});

// 2. Today Overview
apiRouter.get("/today", (req: Request, res: Response) => {
  const pendingApprovals = db.approvalRequests.filter((a) => a.status === "pending");
  const pendingProposals = db.learningProposals.filter((p) => p.status === "pending");
  const activeWork = db.workItems.filter((w) => w.state !== "completed");
  const metrics = deriveMetrics(metricsInput());

  res.json({
    date: new Date().toLocaleDateString("ar-KW", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
    metrics: {
      /*
       * كان هذا الرقم 137 مكتوباً في الشيفرة — ثابتاً لا يتحرّك مهما عملت
       * المؤسسة. صار مشتقّاً من سجلّ التدقيق بتاريخ اليوم.
       *
       * واسمه «نشاط» لا «أُنجز»: العدّ يشمل كل ما سُجِّل — ترقية مهارة، وحسم
       * إشارة، وفحص موصل — وتسميته إنجازاً تجعل ضغطةَ زرٍّ إدارية تبدو مهمة
       * مكتملة.
       */
      auditEventsToday: metrics.todayActivity.value ?? 0,
      auditEventsTodayBasis: metrics.todayActivity.basis,
      needsAttentionCount: pendingApprovals.length + pendingProposals.length,
      newLearnedItemsCount: pendingProposals.length,
      conflictsDetected: pendingProposals.filter((p) => p.type === "conflict").length,
      skillsReadyToGraduate: metrics.memory.candidatesForPromotion.value ?? 0,
      hoursSavedThisMonth: metrics.impact.hoursSavedLifetime.value ?? 0,
      driftCount: pendingProposals.filter((p) => p.type === "process_drift").length,
    },
    needsAttention: [
      ...pendingApprovals.map((appr) => ({
        type: "approval",
        id: appr.id,
        title: appr.workTitle,
        subtitle: appr.reasonDescription,
        badge: "موافقة مطلوبة",
        badgeVariant: "rose",
        time: appr.requestedAt,
        actionId: appr.id,
      })),
      ...pendingProposals.slice(0, 3).map((prop) => ({
        type: "learning",
        id: prop.id,
        title: prop.title,
        subtitle: prop.summary,
        badge: prop.type === "conflict" ? "تضارب تشغيلي" : "فرصة تحسين",
        badgeVariant: prop.type === "conflict" ? "amber" : "emerald",
        time: prop.detectedAt,
        actionId: prop.id,
      })),
    ],
    /*
     * كانت هنا خمسة أرقام مكتوبة بخطّ اليد: 143 عملية معروفة، و37 غير موثّقة،
     * و11 اعتماداً على شخص واحد، و29 مرشّحاً للأتمتة. كلها تُشتق الآن — إلا
     * «غير الموثّقة»، فهي بطبيعتها غير قابلة للمعرفة: النظام لا يعلم ما لم
     * يُعرض عليه قطّ. تبقى null ويقول لها العرض «غير مقيس».
     */
    institutionalMemoryCoverage: {
      documentedSkills: metrics.memory.documentedSkills.value ?? 0,
      activeSkills: metrics.memory.activeSkills.value ?? 0,
      singlePersonDependencies: metrics.memory.singlePersonDependencies.value ?? 0,
      candidatesForAutomation: metrics.memory.candidatesForPromotion.value ?? 0,
      undocumentedProcesses: metrics.memory.undocumentedProcesses.value,
      undocumentedBasis: metrics.memory.undocumentedProcesses.basis,
    },
    activeWorkItems: activeWork.slice(0, 4),
  });
});

// 3. Learn Feed & Clarifications
apiRouter.get("/learn", (req: Request, res: Response) => {
  res.json({
    proposals: db.learningProposals,
    metrics: {
      totalObservedCases: 168,
      conflictsPending: db.learningProposals.filter((p) => p.type === "conflict" && p.status === "pending").length,
      processDrifts: db.learningProposals.filter((p) => p.type === "process_drift" && p.status === "pending").length,
      improvementsFound: db.learningProposals.filter((p) => p.type === "improvement").length,
      singlePersonRisks: db.learningProposals.filter((p) => p.type === "single_person_risk").length,
    },
  });
});

apiRouter.post("/learn/clarify", (req: Request, res: Response) => {
  const { proposalId, clarificationId, selectedAnswer } = req.body;
  const proposal = db.learningProposals.find((p) => p.id === proposalId);
  if (!proposal) {
    return res.status(404).json({ success: false, message: "المقترح غير موجود" });
  }

  const clar = proposal.clarifications?.find((c) => c.id === clarificationId);
  if (clar) {
    clar.selectedAnswer = selectedAnswer;
    proposal.status = "resolved";

    db.logAudit({
      actorType: "human",
      actorName: db.getCurrentUser().name,
      action: "RESOLVE_CLARIFICATION_RULE",
      provenance: "Learn Feed Resolution Gate",
      risk: "medium",
      latencyMs: 35,
      details: `اعتماد قرار تشغيلي: "${selectedAnswer}" لحل التضارب في ${proposal.title}. تم تحويله إلى قاعدة رسمية.`,
      status: "success",
    });
  }

  res.json({ success: true, proposal });
});

// 4. Teach Mode Studio
/*
 * مثالٌ يبدأ به من يفتح «علّم» — من قطاع المؤسسة.
 *
 * كانت الشاشة تبدأ دائماً بـ«تسجيل طالب جديد — KG» وخطوات مقاعد الصف، ولو
 * كانت المؤسسة عيادة. فأول ما يراه من يجرّب ميزة «يتعلّم منك» مدرسةٌ ليست له.
 */
const EDUCATION_TEACH_SAMPLE = {
  title: "تسجيل طالب جديد — KG",
  events: [
    { action: "تحديد العمر والمرحلة", system: "المحادثة", note: "العمر يحدد KG1/KG2" },
    { action: "فحص المقاعد", system: "نظام معلومات الطلاب", note: "لا نتجاوز السعة" },
    { action: "جلب الرسوم الرسمية", system: "الفوترة", note: "المصدر المالي هو الحقيقة" },
  ],
};
function teachSample(): { title: string; events: Array<{ action: string; system: string; note?: string }> } {
  if (!db.sectorCode || db.sectorCode === EDUCATION_CODE) return EDUCATION_TEACH_SAMPLE;
  const pack = getSectorPack(db.sectorCode);
  if (pack?.demo?.teach) return pack.demo.teach;
  /* قطاعٌ بلا مثالٍ مكتوب: أول مهارةٍ فيه بخطواتها الثلاث الأولى. */
  const skill = db.skills[0];
  return {
    title: skill?.name || "عملية جديدة",
    events: (skill?.steps || []).slice(0, 3).map(step => ({ action: step.title, system: step.system || "النظام الرئيسي" })),
  };
}

apiRouter.get("/teach/sample", (_req: Request, res: Response) => {
  res.json(teachSample());
});

apiRouter.post("/teach/start", (req: Request, res: Response) => {
  const { title } = req.body;
  const session: LearningSession = {
    id: `sess_${Date.now()}`,
    title: (typeof title === "string" && title.trim()) || teachSample().title,
    startedAt: "الآن",
    status: "recording",
    teacherName: db.getCurrentUser().name,
    events: [],
    discoveredSteps: [],
    discoveredRules: [],
    clarificationQuestions: [],
  };
  db.learningSessions.unshift(session);

  db.logAudit({
    actorType: "human",
    actorName: db.getCurrentUser().name,
    action: "START_TEACH_AI_SESSION",
    provenance: "Explicit Demonstration Mode (Authorized)",
    risk: "low",
    latencyMs: 20,
    details: `بدء جلسة تعليم حية: "${session.title}" بواسطة ${session.teacherName}.`,
    status: "success",
  });

  res.json({ success: true, session });
});

apiRouter.post("/teach/record-event", (req: Request, res: Response) => {
  const { sessionId, action, system, inputValue, voiceNote, screenshotLabel } = req.body;
  /* معرّفٌ مجهول يُرفض — كان يُعاد إلى أول جلسة فيُركَّب من عملٍ غير المقصود. */
  const session = sessionId ? db.learningSessions.find((s) => s.id === sessionId) : db.learningSessions[0];
  if (!session) {
    return res.status(404).json({ success: false, message: "جلسة التعلم غير متوفرة" });
  }

  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

  const event = {
    id: `ev_${Date.now()}`,
    timestamp: timeStr,
    action: action || "إدخال بيانات في النظام",
    system: system || "النظام الرئيسي",
    inputValue,
    voiceNote,
    screenshotLabel,
  };
  session.events.push(event);

  res.json({ success: true, session });
});

// WOW Moment Synthesis (Prompt Section 72)
/*
 * تركيب المهارة ممّا عُلِّم.
 *
 * كان هذا المسار يتجاهل الجلسة تجاهلاً تاماً: يُعيد خمس خطوات مكتوبة في الشيفرة
 * عن تسجيل طالب في مدرسة، مهما فعل الموظف ومهما كان قطاع المؤسسة. بل ويُنادي
 * النموذج اللغوي ثم يرمي جوابه بلا استعمال.
 *
 * أي أن «نهج يتعلّم منك» كانت تُعرض على الشاشة بينما لا يُقرأ حرفٌ ممّا عُلِّم —
 * وهي الميزة التي بُني عليها المنتج كلّه.
 */
apiRouter.post("/teach/synthesize", async (req: Request, res: Response) => {
  const { sessionId } = req.body;
  /* معرّفٌ مجهول يُرفض — كان يُعاد إلى أول جلسة فيُركَّب من عملٍ غير المقصود. */
  const session = sessionId ? db.learningSessions.find((s) => s.id === sessionId) : db.learningSessions[0];

  if (!session) {
    return void res.status(404).json({ success: false, message: "جلسة التعلم غير متوفرة." });
  }

  const synthesis = synthesize(session.events);

  /* جلسةٌ فارغة لا تُنتج مهارة — ويُقال السبب بدل تركيب شيء لم يُعلّمه أحد. */
  if (synthesis.emptyReason) {
    return void res.json({
      success: false,
      message: synthesis.emptyReason,
      stepsCount: 0, rulesCount: 0, exceptionsCount: 0, systemsCount: 0,
      steps: [], rules: [], questions: [],
    });
  }

  session.discoveredSteps = synthesis.steps;
  session.discoveredRules = synthesis.rules;
  session.clarificationQuestions = synthesis.questions.map(({ id, question, answered }) => ({ id, question, answered }));
  session.status = "synthesized";

  db.logAudit({
    actorType: "ai",
    actorName: "NAHJ Learning Synthesizer",
    action: "SYNTHESIZE_TAUGHT_SKILL",
    provenance: `جلسة تعليم: ${session.events.length} حدثاً في ${synthesis.systems.length} نظاماً`,
    risk: "medium",
    latencyMs: 40,
    details: `رُكِّبت المهارة من ${session.events.length} حدثاً: ${synthesis.steps.length} خطوة، و${synthesis.rules.length} قاعدة، و${synthesis.exceptions.length} استثناء، و${synthesis.questions.length} سؤالاً توضيحياً.`,
    status: "success",
  });

  res.json({
    success: true,
    message: `رُكِّبت المهارة من ${session.events.length} حدثاً سجّلتَها.`,
    stepsCount: synthesis.steps.length,
    rulesCount: synthesis.rules.length,
    exceptionsCount: synthesis.exceptions.length,
    systemsCount: synthesis.systems.length,
    steps: synthesis.steps,
    rules: synthesis.rules,
    exceptions: synthesis.exceptions,
    questions: synthesis.questions,
    systems: synthesis.systems,
  });
});

// 4b. Approve & Codify a taught process into a versioned Skill
apiRouter.post("/teach/codify", (req: Request, res: Response) => {
  const { sessionId, title, answers } = req.body;
  /* معرّفٌ مجهول يُرفض — كان يُعاد إلى أول جلسة فيُركَّب من عملٍ غير المقصود. */
  const session = sessionId ? db.learningSessions.find((s) => s.id === sessionId) : db.learningSessions[0];
  if (!session || session.discoveredSteps.length === 0) {
    return res.status(400).json({ success: false, message: "لا توجد جلسة تعليم مكتملة يمكن اعتمادها" });
  }

  const id = `sk_taught_${Date.now()}`;
  const now = new Date().toISOString().slice(0, 10);
  const rules = [...session.discoveredRules];
  if (answers && typeof answers === "object") {
    Object.entries(answers).forEach(([questionId, answer]) => {
      if (typeof answer === "string" && answer.trim()) rules.push(`Clarification ${questionId}: ${answer.trim()}`);
    });
  }

  const skill: Skill = {
    id,
    slug: id,
    name: title || session.title || "مهارة جديدة متعلّمة",
    nameEn: "Newly Taught Operational Skill",
    category: "تعلم مباشر",
    purpose: "مهارة تشغيلية تم استخلاصها من جلسة Teach Mode مصرح بها ثم اعتمادها بشريًا.",
    department: db.getCurrentUser().department,
    autonomyLevel: 0,
    status: "approved",
    reliabilityScore: 58,
    reliabilityTier: "medium",
    riskLevel: "medium",
    activeVersion: 1,
    ownerName: db.getCurrentUser().name,
    isSinglePointOfFailure: false,
    usageCount: 0,
    successRate: 0,
    humanTakeoverRate: 0,
    avgDurationMinutes: 0,
    hoursSavedTotal: 0,
    steps: session.discoveredSteps,
    decisions: [],
    exceptions: [],
    versions: [{
      version: 1,
      createdAt: now,
      approvedBy: db.getCurrentUser().name,
      changeSummary: "الإصدار الأول الناتج من Teach Mode بعد المراجعة البشرية.",
      steps: session.discoveredSteps,
      rules,
      exceptions: [],
    }],
    allowedActions: session.discoveredSteps.map((step) => step.actionRequired).filter((x): x is string => Boolean(x)),
    killSwitchActive: false,
  };

  session.status = "approved";
  db.skills.unshift(skill);
  db.organization.verifiedSkillsCount = db.skills.filter((s) => s.status === "active" || s.status === "approved").length;
  db.logAudit({
    actorType: "human",
    actorName: db.getCurrentUser().name,
    action: "APPROVE_AND_CODIFY_TAUGHT_SKILL",
    provenance: "Teach Mode Review Gate",
    risk: "medium",
    latencyMs: 42,
    details: `اعتماد المهارة المتعلّمة "${skill.name}" كإصدار v1 وإضافتها إلى Company Brain.`,
    status: "success",
  });

  res.json({ success: true, skill });
});

// 5. Skills Management
apiRouter.get("/skills", (req: Request, res: Response) => {
  res.json({ skills: db.skills });
});

apiRouter.get("/skills/:id", (req: Request, res: Response) => {
  const skill = db.skills.find((s) => s.id === req.params.id);
  if (!skill) {
    return res.status(404).json({ success: false, message: "المهارة غير موجودة" });
  }
  res.json({ skill });
});

apiRouter.post("/skills/:id/promote", requireRole("admin", "manager"), (req: Request, res: Response) => {
  const { targetLevel } = req.body;
  /*
   * سقف الاستقلالية من الباقة.
   *
   * ليس بديلاً عن الحوكمة — محرّك المهارات يبقى هو من يقرّر هل استحقّت المهارة
   * الترقية. هذا سقفٌ تجاري فوقه: باقة «بداية» لا تُشغّل طياراً آلياً مهما بلغت
   * موثوقية المهارة، والرسالة تقول ذلك صراحةً بدل أن تُرفض الترقية بلا سبب مفهوم.
   */
  const ceiling = maxAutonomyLevel();
  if (Number(targetLevel) > ceiling) {
    return res.status(402).json({
      success: false,
      code: "PLAN_AUTONOMY_CEILING",
      message: `باقتك الحالية تسمح حتى المستوى L${ceiling}. الترقية إلى L${targetLevel} تحتاج باقة أعلى.`,
    });
  }
  const level = Number(targetLevel);
  if (!Number.isInteger(level) || level < 0 || level > 6) {
    return res.status(400).json({ success: false, message: "مستوى الاستقلالية يجب أن يكون بين 0 و6." });
  }
  const skill = db.skills.find((candidate) => candidate.id === req.params.id);
  if (!skill) return res.status(404).json({ success: false, message: "المهارة غير موجودة" });
  /*
   * مراجعة الترقية: الصعود على السُلّم يحتاج دليلاً (تدرّب، ظل) وتوقيع المسؤول.
   * والنزول لا يحتاج شيئاً — تخفيض الاستقلالية إجراء سلامة لا يُؤخَّر.
   */
  const signer = (req as AuthenticatedRequest).account?.name || db.getCurrentUser().name;
  const review = reviewPromotion(skill, level as AutonomyLevel, db.testCases, db.shadowComparisons, {
    signedOff: req.body?.signOff === true,
    workItemSkill: new Map(db.workItems.map((item) => [item.id, item.skillId])),
  });
  if (review.blocked) {
    return res.status(409).json({ success: false, code: "PROMOTION_REVIEW_BLOCKED", message: review.missing.join(" "), review });
  }
  const note = String(req.body?.note || "").trim().slice(0, 500);
  const result = SkillEngine.promoteSkillAutonomy(
    req.params.id,
    level as AutonomyLevel,
    signer,
    { review: { ...review, signedOffBy: review.upward ? signer : undefined, note } },
  );
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json({ ...result, review });
});

/* مراجعة الترقية قبل الضغط: ما الذي تحقّق وما الذي ينقص. */
apiRouter.get("/skills/:id/promotion-review", (req: Request, res: Response) => {
  const skill = db.skills.find((candidate) => candidate.id === req.params.id);
  if (!skill) return res.status(404).json({ success: false, message: "المهارة غير موجودة" });
  const level = Math.max(0, Math.min(6, Math.round(Number(req.query.targetLevel))));
  if (!Number.isFinite(level)) return res.status(400).json({ success: false, message: "المستوى غير صالح." });
  const review = reviewPromotion(skill, level as AutonomyLevel, db.testCases, db.shadowComparisons, {
    signedOff: true,
    workItemSkill: new Map(db.workItems.map((item) => [item.id, item.skillId])),
  });
  /* التوقيع يُعطى عند الضغط لا هنا — فالمعروض ما ينقص سواه. */
  res.json({ review: { ...review, requirements: review.requirements.filter((r) => r.key !== "signOff") }, ceiling: maxAutonomyLevel() });
});

apiRouter.post("/skills/:id/rollback", requireRole("admin", "manager"), (req: Request, res: Response) => {
  const { targetVersion } = req.body;
  const result = SkillEngine.rollbackSkillVersion(
    req.params.id,
    targetVersion,
    db.getCurrentUser().name
  );
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
});

apiRouter.post("/skills/:id/killswitch", requireRole("admin", "manager"), (req: Request, res: Response) => {
  const result = SkillEngine.toggleKillSwitch(req.params.id, db.getCurrentUser().name);
  res.json(result);
});

/*
 * الإيقاف الطارئ لكل مهارات التنفيذ — بضغطةٍ واحدة وسببٍ مكتوب، ويُبلَّغ المالك.
 */
apiRouter.get("/autopilot/status", (_req: Request, res: Response) => {
  res.json({
    pause: db.emergencyPause,
    autopilotSkills: db.skills.filter((skill) => skill.autonomyLevel >= 5).map((skill) => ({
      id: skill.id, name: skill.name, autonomyLevel: skill.autonomyLevel, killSwitchActive: skill.killSwitchActive,
    })),
  });
});

apiRouter.post("/autopilot/emergency-pause", requireRole("admin", "manager"), (req: AuthenticatedRequest, res: Response) => {
  const actor = req.account?.name || db.getCurrentUser().name;
  const result = SkillEngine.emergencyPause(req.body?.reason, actor);
  if (!result.success) return res.status(400).json(result);
  let notified = 0;
  if (!db.isDemo) {
    notified = notifyEmergencyPause({
      reason: db.emergencyPause!.reason, by: actor, at: db.emergencyPause!.at,
      skillNames: result.pausedSkills.map((skill) => skill.name),
    });
  }
  res.json({ ...result, pause: db.emergencyPause, notified });
});

apiRouter.post("/autopilot/resume", requireRole("admin", "manager"), (req: AuthenticatedRequest, res: Response) => {
  const actor = req.account?.name || db.getCurrentUser().name;
  const result = SkillEngine.emergencyResume(req.body?.reason, actor);
  if (!result.success) return res.status(400).json(result);
  let notified = 0;
  if (!db.isDemo) {
    notified = notifyEmergencyPause({
      reason: db.emergencyPause!.resumeReason || "", by: actor, at: db.emergencyPause!.resumedAt || new Date().toISOString(),
      skillNames: result.resumedSkills.map((skill) => skill.name), resumed: true,
    });
  }
  res.json({ ...result, pause: db.emergencyPause, notified });
});

/*
 * نقاط الاعتماد على شخصٍ واحد: من يحمل وحده أيّ مهارة، وغطاء المعرفة عبر الزمن.
 */
apiRouter.get("/people/coverage", (_req: Request, res: Response) => {
  recordCoverageSnapshot(db.coverageHistory, db.skills);
  res.json({ coverage: coverageReport(db.skills, db.coverageHistory) });
});

apiRouter.post("/skills/:id/backup", requireRole("admin", "manager"), (req: AuthenticatedRequest, res: Response) => {
  const skill = db.skills.find((candidate) => candidate.id === req.params.id);
  if (!skill) return res.status(404).json({ success: false, message: "المهارة غير موجودة" });
  const result = assignBackup(skill, req.body?.name);
  if (!result.ok) return res.status(400).json({ success: false, message: result.message });
  recordCoverageSnapshot(db.coverageHistory, db.skills);
  db.logAudit({
    actorType: "human",
    actorName: req.account?.name || db.getCurrentUser().name,
    action: "ASSIGN_SKILL_BACKUP",
    provenance: "خريطة الاعتماد على الأشخاص",
    risk: "low",
    latencyMs: 5,
    details: result.message,
    status: "success",
  });
  res.json({ success: true, message: result.message, skill, coverage: coverageReport(db.skills, db.coverageHistory) });
});

/*
 * دليل الإجراء المطبوع — ثنائي اللغة، بالتقويم والأرقام المختارة، وموقّع.
 */
apiRouter.post("/skills/:id/translation", requireRole("admin", "manager"), (req: AuthenticatedRequest, res: Response) => {
  const skill = db.skills.find((candidate) => candidate.id === req.params.id);
  if (!skill) return res.status(404).json({ success: false, message: "المهارة غير موجودة" });
  const clip = (value: unknown) => String(value ?? "").trim().slice(0, 500);
  if (req.body?.nameEn !== undefined) skill.nameEn = clip(req.body.nameEn) || skill.nameEn;
  if (req.body?.purposeEn !== undefined) skill.purposeEn = clip(req.body.purposeEn);
  const steps = Array.isArray(req.body?.steps) ? req.body.steps : [];
  for (const entry of steps) {
    const step = skill.steps.find((candidate) => candidate.id === entry?.id);
    if (!step) continue;
    if (entry.titleEn !== undefined) step.titleEn = clip(entry.titleEn);
    if (entry.descriptionEn !== undefined) step.descriptionEn = clip(entry.descriptionEn);
  }
  db.logAudit({
    actorType: "human",
    actorName: req.account?.name || db.getCurrentUser().name,
    action: "UPDATE_SKILL_TRANSLATION",
    provenance: "دليل الإجراء ثنائي اللغة",
    risk: "low",
    latencyMs: 5,
    details: `تحديث النص الإنجليزي لمهارة «${skill.name}».`,
    status: "success",
  });
  res.json({ success: true, skill });
});

apiRouter.get("/skills/:id/manual", (req: AuthenticatedRequest, res: Response) => {
  const skill = db.skills.find((candidate) => candidate.id === req.params.id);
  if (!skill) return res.status(404).json({ success: false, message: "المهارة غير موجودة" });
  const version = req.query.version ? Number(req.query.version) : skill.activeVersion;
  const options = normalizeManualOptions(req.query as Record<string, unknown>);
  const html = renderManualHtml(skill, version, options, {
    organization: db.organization.name,
    issuedBy: req.account?.name || db.getCurrentUser().name,
  });
  if (!html) return res.status(404).json({ success: false, message: "الإصدار غير موجود في سجل المهارة." });
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(html);
});

apiRouter.get("/skills/:id/manual/signature", (req: Request, res: Response) => {
  const skill = db.skills.find((candidate) => candidate.id === req.params.id);
  if (!skill) return res.status(404).json({ success: false, message: "المهارة غير موجودة" });
  const signed = signManual(skill, req.query.version ? Number(req.query.version) : skill.activeVersion);
  if (!signed) return res.status(404).json({ success: false, message: "الإصدار غير موجود في سجل المهارة." });
  res.json({ success: true, ...signed });
});

apiRouter.post("/manuals/verify", (req: Request, res: Response) => {
  const skill = db.skills.find((candidate) => candidate.id === req.body?.skillId);
  if (!skill) return res.status(404).json({ valid: false, reason: "المهارة غير موجودة." });
  res.json(verifyManual(skill, Number(req.body?.version), req.body?.signature));
});

/* حزم الامتثال لقطاع المؤسسة الحالي. */
apiRouter.get("/compliance/presets", (_req: Request, res: Response) => {
  res.json({ sector: db.sectorCode, presets: SECTOR_COMPLIANCE_PRESETS[db.sectorCode] || [], all: SECTOR_COMPLIANCE_PRESETS });
});

// 6. Practice & Shadow Modes
apiRouter.post("/practice/run", requireRole("admin", "manager", "operator"), async (req: Request, res: Response) => {
  const result = await SkillEngine.runPracticeTests();
  res.json({ success: true, ...result });
});

/*
 * حالات التدرّب ومقارنات الظل كما هي في المؤسسة.
 *
 * كانت الواجهة لا تقرؤها إلا بعد الضغط على «شغّل»، وتعرض قبلها نسخةً مبذورة في
 * الواجهة نفسها — حالات ولي أمرٍ وخصم أشقاء، في عيادةٍ أو متجر.
 */
apiRouter.get("/practice", (_req: Request, res: Response) => {
  res.json({ testCases: db.testCases, shadowComparisons: db.shadowComparisons });
});

apiRouter.post("/shadow/run", requireRole("admin", "manager", "operator"), async (req: Request, res: Response) => {
  const result = await SkillEngine.runShadowComparison();
  res.json({ success: true, ...result });
});

// 7. Work Items
apiRouter.get("/work", (req: Request, res: Response) => {
  res.json({ workItems: db.workItems });
});

apiRouter.get("/work/:id", (req: Request, res: Response) => {
  const item = db.workItems.find((w) => w.id === req.params.id);
  if (!item) {
    return res.status(404).json({ success: false, message: "المعاملة غير متوفرة" });
  }
  res.json({ item });
});

apiRouter.post("/work/:id/takeover", (req: Request, res: Response) => {
  const item = db.workItems.find((w) => w.id === req.params.id);
  if (!item) return res.status(404).json({ success: false });

  item.assignedMode = "human_takeover";
  item.timeline.unshift({
    time: "الآن",
    actor: "human",
    title: `استلام بشري فوري (Take Over) بواسطة ${db.getCurrentUser().name}`,
    details: "تم تعليق قرارات الذكاء الاصطناعي على هذه الحالة ونقل التحكم اليدوي الكامل للموظف.",
    badge: "Human Takeover",
  });

  db.logAudit({
    actorType: "human",
    actorName: db.getCurrentUser().name,
    action: "HUMAN_TAKEOVER",
    provenance: "Work Item Interruption Switch",
    risk: "medium",
    latencyMs: 15,
    details: `الموظف ${db.getCurrentUser().name} استلم المعاملة ${item.code} يدويًا وأوقف تحكم الذكاء الاصطناعي.`,
    status: "warning",
  });

  res.json({ success: true, item });
});

apiRouter.post("/work/:id/resume-ai", (req: Request, res: Response) => {
  const item = db.workItems.find((w) => w.id === req.params.id);
  if (!item) return res.status(404).json({ success: false });

  item.assignedMode = "ai";
  item.timeline.unshift({
    time: "الآن",
    actor: "human",
    title: `استئناف معالجة الذكاء الاصطناعي (Resume AI)`,
    details: "إعادة تفعيل المهارة التشغيلية المعتمدة لاستكمال باقي خطوات المعاملة.",
    badge: "AI Resumed",
  });

  db.logAudit({
    actorType: "human",
    actorName: db.getCurrentUser().name,
    action: "RESUME_AI_EXECUTION",
    provenance: "Manual Resumption Control",
    risk: "low",
    latencyMs: 20,
    details: `استئناف تشغيل الذكاء الاصطناعي على المعاملة ${item.code}.`,
    status: "success",
  });

  res.json({ success: true, item });
});

// 8. Approvals Engine
apiRouter.get("/approvals", (req: Request, res: Response) => {
  res.json({ approvalRequests: db.approvalRequests });
});

const decisionContext = () => ({
  workItems: db.workItems, skills: db.skills, testCases: db.testCases, shadowComparisons: db.shadowComparisons,
  sector: db.sectorCode,
});

/* سجلّ القرار قبل القرار: الإصدار، والدليل، والقاعدة التي أوقفت التنفيذ، وما سيُكتب. */
apiRouter.get("/approvals/:id/record", (req: Request, res: Response) => {
  const appr = db.approvalRequests.find((a) => a.id === req.params.id);
  if (!appr) return res.status(404).json({ success: false, message: "طلب الموافقة غير موجود" });
  res.json({ record: appr.decisionRecord || buildDecisionRecord(appr, decisionContext()) });
});

apiRouter.post("/approvals/:id/decide", requireRole("admin", "manager"), async (req: AuthenticatedRequest, res: Response) => {
  const { decision, comments } = req.body; // 'approved' | 'rejected'
  if (decision !== "approved" && decision !== "rejected") {
    return res.status(400).json({ success: false, message: "القرار يجب أن يكون اعتماداً أو رفضاً." });
  }
  const appr = db.approvalRequests.find((a) => a.id === req.params.id);
  if (!appr) {
    return res.status(404).json({ success: false, message: "طلب الموافقة غير موجود" });
  }
  /* قرارٌ واحد لكل طلب: إعادة الاعتماد كانت تُعيد تنفيذ الإجراء على النظام الخارجي. */
  if (appr.status !== "pending") {
    return res.status(409).json({ success: false, message: "حُسم هذا الطلب من قبل." });
  }

  /*
   * السبب إلزاميٌّ للخطورة العالية والحرجة — اعتماداً كان أو رفضاً. قرارٌ مكلف
   * بلا سببٍ مكتوب لا يُراجَع بعد شهر: لا يُعرف لماذا مرّ.
   */
  const reason = String(comments || "").trim().slice(0, 1000);
  if (reasonRequiredFor(appr.riskLevel) && reason.length < 3) {
    return res.status(400).json({ success: false, code: "REASON_REQUIRED", message: "اكتب سبب قرارك — مطلوبٌ للطلبات عالية الخطورة." });
  }

  /* المعتمِد هو صاحب الجلسة، لا «المستخدم الحالي» المعروض — وإلا سُجّل القرار باسم غيره. */
  const currentUser = { name: req.account?.name || db.getCurrentUser().name };
  const record = buildDecisionRecord(appr, decisionContext());
  appr.status = decision === "approved" ? "approved" : "rejected";
  appr.decidedBy = currentUser.name;
  appr.decidedAt = "الآن";
  appr.decisionReason = reason;
  appr.decisionRecord = { ...record, decision, reason, decidedBy: currentUser.name, decidedAtIso: new Date().toISOString() };

  // If approved, trigger action execution with idempotency & post-verification!
  let executionResult: Awaited<ReturnType<typeof ConnectorLayer.createApplicationRecord>> | null = null;

  /*
   * موافقةٌ من قطاعٍ غير تعليمي.
   *
   * كان كل اعتمادٍ يُنفَّذ كأنه تسجيل طالب: يُكتب على حالة العمل «اكتمل التسجيل
   * وصدر الرقم الأكاديمي»، وتُضاف إلى المحادثة رسالة «مديرة القبول» — ولو كان
   * المعتمَد تعويضَ شحنة. فالقطاع يُقرأ من الطلب نفسه، ويُكتب ما حدث بلسانه.
   */
  const apprSector = String((appr.payload as Record<string, unknown>)?.sector || "");
  if (apprSector && apprSector !== EDUCATION_CODE) {
    const approved = decision === "approved";
    const workItem = db.workItems.find((w) => w.id === appr.workItemId);
    if (workItem) {
      workItem.state = approved ? "completed" : "escalated";
      workItem.progressPercent = approved ? 100 : workItem.progressPercent;
      workItem.assignedMode = approved ? workItem.assignedMode : "human_takeover";
      workItem.currentStepTitle = approved ? `نُفّذ بعد اعتماد ${currentUser.name}` : `رُفض — أُعيد إلى الموظف المختص`;
      workItem.updatedAt = "الآن";
      workItem.timeline.unshift({
        time: "الآن",
        actor: "human",
        title: approved ? `اعتماد: ${currentUser.name}` : `رفض: ${currentUser.name}`,
        details: comments || appr.reasonDescription,
        badge: approved ? "Approved" : "Rejected",
      });
    }
    const chat = getSectorPack(apprSector)?.demo?.chat;
    if (chat && db.simulatorState.approvalId === appr.id) {
      db.simulatorState.approvalStatus = approved ? "approved" : "rejected";
      db.simulatorState.requiresManagerApproval = false;
      db.simulatorState.stage = approved ? chat.stages.length - 1 : db.simulatorState.stage;
      db.simulatorState.messages.push({
        id: `msg_${Date.now()}`,
        sender: "system",
        text: approved ? chat.approvedReply : chat.rejectedReply,
        timestamp: "الآن",
      });
    }
    db.logAudit({
      actorType: "human",
      actorName: currentUser.name,
      action: approved ? "APPROVE_ACTION_EXECUTION" : "REJECT_ACTION_EXECUTION",
      policyCode: appr.reasonCode,
      provenance: "Manager Approval Decision Gate",
      risk: appr.riskLevel,
      latencyMs: 40,
      details: `${approved ? "اعتماد" : "رفض"} إجراء ${appr.actionName} للمعاملة ${appr.workTitle} بواسطة ${currentUser.name}.${reason ? ` السبب: ${reason}` : ""}`,
      status: approved ? "success" : "warning",
      record: appr.decisionRecord,
    });
    return res.json({ success: true, approval: appr, executionResult: null });
  }

  if (decision === "approved") {
    const idempotencyKey = `appr_${appr.id}_exec`;
    executionResult = await ConnectorLayer.createApplicationRecord(appr.payload, idempotencyKey);

    // Update matching work item
    const workItem = db.workItems.find((w) => w.id === appr.workItemId);
    if (workItem) {
      workItem.state = "completed";
      workItem.progressPercent = 100;
      workItem.currentStepTitle = "تم اكتمال التسجيل وسداد الرسوم وإصدار الرقم الأكاديمي الرسمي";
      workItem.timeline.unshift({
        time: "الآن",
        actor: "human",
        title: `اعتماد المدير: موافقة رسمية من ${currentUser.name}`,
        details: comments || "تمت مراجعة بيانات الطفل والبطاقة المدنية والموافقة على فتح الملف.",
        badge: "Approved & Executed",
      });
    }

    /* المحادثة تُحدَّث حين تكون هي من فتحت الطلب — لا مع كل اعتمادٍ في المؤسسة. */
    if (db.simulatorState.step === "approval_triggered" && db.simulatorState.approvalStatus === "pending") {
    db.simulatorState.step = "completed";
    db.simulatorState.approvalStatus = "approved";
    db.simulatorState.messages.push({
      id: `msg_${Date.now()}`,
      sender: "system",
      text: `✅ تم اعتماد الطلب رسميًا من مديرة القبول (${currentUser.name})! تم إصدار رقم الملف ومزامنة بيانات القبول في نظام SIS.`,
      timestamp: "الآن",
      cardType: "booking_confirmation",
      metadata: {
        applicationCode: executionResult.data.applicationCode,
        paymentUrl: executionResult.data.paymentUrl,
        tourDate: "الخميس القادم 04:30 م",
      },
    });
    }
  }

  db.logAudit({
    actorType: "human",
    actorName: currentUser.name,
    action: decision === "approved" ? "APPROVE_ACTION_EXECUTION" : "REJECT_ACTION_EXECUTION",
    policyCode: appr.reasonCode || "POL-FIN-02",
    provenance: "Manager Approval Decision Gate",
    risk: appr.riskLevel || "high",
    latencyMs: 55,
    details: `${decision === "approved" ? "اعتماد" : "رفض"} إجراء ${appr.actionName} للمعاملة ${appr.workTitle} بواسطة ${currentUser.name}.${reason ? ` السبب: ${reason}` : ""}`,
    status: decision === "approved" ? "success" : "warning",
    record: appr.decisionRecord,
  });

  res.json({ success: true, approval: appr, executionResult });
});

// 9. Golden Scenario: Web Conversation Simulator
apiRouter.get("/simulator/state", (req: Request, res: Response) => {
  /* اسم المؤسسة وأمثلة القناة يُقرآن حيّين: حالةٌ محفوظة قبل إضافتهما لا تُعرض بلا اسم. */
  res.json({
    state: {
      ...db.simulatorState,
      orgName: db.organization.name,
      samplePrompts: db.simulatorState.samplePrompts || db.channel.samplePrompts,
    },
  });
});

apiRouter.post("/simulator/reset", requireRole("admin", "manager", "operator"), (req: Request, res: Response) => {
  db.resetSimulator();
  res.json({ success: true, state: db.simulatorState });
});

apiRouter.post("/simulator/message", requireRole("admin", "manager", "operator"), async (req: Request, res: Response) => {
  const { text } = req.body;
  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ success: false, message: "الرسالة فارغة." });
  }
  const userMsg = {
    id: `msg_${Date.now()}`,
    sender: "customer" as const,
    text,
    timestamp: "الآن",
  };
  db.simulatorState.messages.push(userMsg);

  const lower = (text || "").toLowerCase();

  /*
   * القناة خارج قطاع التعليم.
   *
   * ما تحت هذا السطر نصٌّ تعليميّ مكتوب حرفياً: عمرُ الطفل، والصفّ، والبطاقة
   * المدنية، و«أكاديمية المستقبل». وكان يعمل مهما كانت الحزمة المركَّبة — فتبدّل
   * المؤسسةُ نشاطها إلى عيادة، ويردّ أول ردٍّ في محادثة المريض بسؤاله عن عمر
   * طفله. أي أن الحزمة تُبدّل كل شيء إلا اللسان الذي تُحادَث به، وهو أظهر ما
   * يراه من يُعرض عليه المنتج.
   *
   * والبديل لا يدّعي سيراً لم يُبنَ: يردّ بلسان القطاع، ويقول ما تعرف المؤسسة
   * أن تفعله من مهاراتها الحيّة، ويُحيل إلى موظف. بناء سيرٍ كامل لكل قطاع عملٌ
   * قائم بذاته — وادّعاؤه أسوأ من غيابه.
   */
  /*
   * سيرُ القطاع المكتوب في حزمته — دورٌ مع كل رسالة، وحين يبلغ دورَ القرار
   * تُفتح حالة عمل وطلب موافقة حقيقيان في الصندوق نفسه، فيراهما الزائر في
   * «العمل» و«الموافقات» ويحسمهما من بوابة القرار. بعد آخر دور يعود الردّ
   * العام أدناه، فلا يُدّعى سيرٌ لم يُكتب.
   */
  /* صندوق العرض وحده: في مؤسسةٍ حقيقية لا تُفتح حالة عمل ولا طلب موافقة من سيرٍ مكتوب لم يقع. */
  const chat = db.isDemo && db.sectorCode && db.sectorCode !== EDUCATION_CODE ? getSectorPack(db.sectorCode)?.demo?.chat : undefined;
  const turnIndex = db.simulatorState.turn ?? 0;
  if (chat && turnIndex < chat.turns.length && db.simulatorState.approvalStatus !== "pending") {
    const turn = chat.turns[turnIndex];
    db.simulatorState.step = "scripted";
    db.simulatorState.turn = turnIndex + 1;
    db.simulatorState.stages = chat.stages;
    db.simulatorState.stage = turn.stage;
    db.simulatorState.messages.push({
      id: `msg_ai_${Date.now()}`,
      sender: "ai",
      text: turn.reply,
      timestamp: "الآن",
      ...(turn.approval ? { cardType: "approval_pending" as const } : {}),
    });

    if (turn.approval) {
      const skill = db.skills.find(candidate => candidate.slug === chat.skill);
      const stamp = Date.now();
      const workItem = {
        id: `wi_chat_${stamp}`,
        code: `CH-${String(stamp).slice(-4)}`,
        title: chat.workTitle,
        skillId: skill?.id || "",
        skillName: skill?.name || chat.workTitle,
        contactName: db.channel.counterpart,
        contactPhone: "",
        state: "waiting_approval" as const,
        riskLevel: "high" as const,
        assignedMode: "ai" as const,
        createdAt: "الآن",
        updatedAt: "الآن",
        progressPercent: 75,
        currentStepTitle: "بانتظار القرار",
        details: { sector: db.sectorCode, channel: "simulator" },
        timeline: [
          { time: "الآن", actor: "ai" as const, title: "رفع طلب اعتماد من المحادثة", details: turn.approval.reason, badge: turn.approval.reasonCode },
        ],
      };
      db.workItems.unshift(workItem);
      const approvalId = `appr_chat_${stamp}`;
      db.approvalRequests.unshift({
        id: approvalId,
        workItemId: workItem.id,
        workTitle: workItem.title,
        actionName: turn.approval.action,
        payload: { sector: db.sectorCode, channel: "simulator", ...turn.approval.payload },
        reasonCode: turn.approval.reasonCode,
        reasonDescription: turn.approval.reason,
        riskLevel: "high",
        requiredRole: turn.approval.requiredRole,
        requestedAt: "الآن",
        status: "pending",
      });
      db.simulatorState.requiresManagerApproval = true;
      db.simulatorState.approvalStatus = "pending";
      db.simulatorState.approvalId = approvalId;
    }
    return res.json({ success: true, state: db.simulatorState });
  }

  if (db.sectorCode && db.sectorCode !== EDUCATION_CODE) {
    const liveSkills = db.skills.filter(skill => skill.status === "active");
    const offered = liveSkills.slice(0, 3).map(skill => `• ${skill.name}`).join("\n");
    const generated = await generateAiResponse(
      `أنت مساعد خدمة العملاء في «${db.organization.name}» (${db.organization.industry}).` +
        ` تحادث ${db.channel.counterpart}. رسالته: "${text}".` +
        ` الإجراءات المعتمدة لدينا: ${liveSkills.map(skill => skill.name).join("، ") || "لا شيء بعد"}.` +
        ` أجب بجملتين بالعربية، ولا تَعِد بشيء خارج هذه الإجراءات، ولا تخترع أسعاراً ولا مواعيد.`,
      "أنت نهج: لا تخترع معلومة، وأحل إلى موظف عند الشكّ.",
    );

    const fallback = offered
      ? `وصلتنا رسالتك. ما نتولّاه اليوم في ${db.organization.name}:\n${offered}\nوسيتابع معك الموظف المختصّ لِما هو خارج ذلك.`
      : `وصلتنا رسالتك في ${db.organization.name}. لم تُعتمد إجراءات حيّة بعد لهذه القناة، فسيتابع معك الموظف المختصّ.`;

    const reply = {
      id: `msg_ai_${Date.now()}`,
      sender: "ai" as const,
      text: generated || fallback,
      timestamp: "الآن",
    };
    db.simulatorState.messages.push(reply);
    return res.json({ success: true, state: db.simulatorState });
  }

  // Progressive conversational state progression (قطاع التعليم)
  if (db.simulatorState.step === "initial") {
    // Stage 1: Identify intent, ask for child's age
    db.simulatorState.step = "age_asked";
    const reply = {
      id: `msg_ai_${Date.now()}`,
      sender: "ai" as const,
      // اسم المؤسسة من سجلّها، لا مكتوباً — فتغييره في الحزمة يغيّره في القناة.
      text: `يا مرحباً بك أستاذنا العزيز! يسرنا جداً انضمامكم لأسرة ${db.organization.name}. لتحديد الصف الدراسي المناسب والشواغر المتاحة فوراً، كم يبلغ عمر طفلك أو ما هو تاريخ ميلاده؟`,
      timestamp: "الآن",
    };
    db.simulatorState.messages.push(reply);
    return res.json({ success: true, state: db.simulatorState });
  }

  if (db.simulatorState.step === "age_asked") {
    // Stage 2: Evaluate age, check SIS capacity & fetch authoritative fees
    db.simulatorState.childAge = 5;
    db.simulatorState.studentName = "يوسف أحمد فهد";
    db.simulatorState.grade = "KG2 (الروضة الثانية)";
    db.simulatorState.tuitionFee = 1500;
    db.simulatorState.step = "grade_confirmed";

    // Call real connectors
    await ConnectorLayer.checkSeatAvailability("KG2", `sim_seat_${Date.now()}`);
    const feeResult = await ConnectorLayer.getAuthoritativeTuition("KG2", `sim_fee_${Date.now()}`);

    const reply = {
      id: `msg_ai_${Date.now()}`,
      sender: "ai" as const,
      text: `تبارك الرحمن! بناءً على سن طفلك (5 سنوات)، الصف المناسب هو مرحلة الروضة الثانية (KG2). تحققنا من نظام SIS ويتوفر لدينا حالياً 4 مقاعد شاغرة فقط في الشعبة أ.

الرسوم الدراسية الرسمية المعتمدة للعام الدراسي هي 1,500 د.ك (تدفع على قسطين ميسرين) بالإضافة إلى 50 د.ك رسوم فتح الملف.

لاستكمال حجز المقعد والمقابلة المبدئية، يرجى تزويدنا برقم أو صورة البطاقة المدنية للطفل والاسم الكريم.`,
      timestamp: "الآن",
      cardType: "fee_quote" as const,
      metadata: {
        grade: "KG2",
        tuitionFee: feeResult.data.tuitionFeeKwd,
        fileFee: feeResult.data.fileOpeningFeeKwd,
        availableSeats: 4,
      },
    };
    db.simulatorState.messages.push(reply);
    return res.json({ success: true, state: db.simulatorState });
  }

  if (db.simulatorState.step === "grade_confirmed" || db.simulatorState.step === "doc_requested") {
    // Stage 3: Prompt for document upload
    const reply = {
      id: `msg_ai_${Date.now()}`,
      sender: "ai" as const,
      text: `شكراً جزيلاً لتعاونكم! لقد تم تسجيل اسم الطالب (يوسف أحمد). يرجى الضغط على زر "رفع البطاقة المدنية" أدناه للتحقق الفوري من المستند ومطابقة السن لنتمكن من حجز موعد الزيارة الرسمية.`,
      timestamp: "الآن",
      cardType: "document_request" as const,
    };
    db.simulatorState.step = "doc_requested";
    db.simulatorState.messages.push(reply);
    return res.json({ success: true, state: db.simulatorState });
  }

  // Fallback AI reply
  const reply = {
    id: `msg_ai_${Date.now()}`,
    sender: "ai" as const,
    text: `وصلتنا رسالتكم، وجارٍ معالجتها طبقاً لإجراءات ${db.organization.name} المعتمدة.`,
    timestamp: "الآن",
  };
  db.simulatorState.messages.push(reply);
  res.json({ success: true, state: db.simulatorState });
});

// Upload Document action for Simulator
apiRouter.post("/simulator/upload-doc", requireRole("admin", "manager", "operator"), async (req: Request, res: Response) => {
  const idempotencyKey = `doc_up_${Date.now()}`;
  const verifyRes = await ConnectorLayer.verifyCivilId(
    { civilIdNumber: "321041200987", studentName: "يوسف أحمد فهد" },
    idempotencyKey
  );

  // Book calendar slot
  await ConnectorLayer.bookCampusTour(
    { studentName: "يوسف أحمد فهد", preferredTime: "الخميس القادم — 04:30 مساءً" },
    `tour_book_${Date.now()}`
  );

  // Policy check triggers Approval gate
  const policyCheck = PolicyEngine.evaluateAction(
    "createApplicationRecord",
    { tuitionFee: 1500, civilIdVerified: true },
    "employee"
  );

  db.simulatorState.step = "approval_triggered";
  db.simulatorState.civilIdVerified = true;
  db.simulatorState.requiresManagerApproval = true;
  db.simulatorState.approvalStatus = "pending";

  const confirmMsg = {
    id: `msg_doc_success_${Date.now()}`,
    sender: "ai" as const,
    text: `تم التحقق بنجاح من البطاقة المدنية! الوثيقة سارية ومطابقة للسن القانوني.

حجزنا لكم مبدئياً موعد الجولة التعريفية والمقابلة:
📅 الخميس القادم — الساعة 04:30 مساءً (قاعة التقييم B)
⚠️ نظراً لأن قيمة التسجيل (1,500 د.ك) تتطلب اعتماداً إدارياً رسمياً طبقاً لسياسة POL-FIN-02، تم إرسال بطاقة الاعتماد فوراً لمديرة القبول (نورة خالد) للموافقة قبل إرسال رابط الدفع النهائي.`,
    timestamp: "الآن",
    cardType: "approval_pending" as const,
    metadata: {
      tourTime: "الخميس 04:30 م",
      missingNotice: "تنبيه: شهادة التطعيم مطلوبة قبل بدء الدوام المدرسي.",
      policyApplied: "POL-FIN-02",
    },
  };
  db.simulatorState.messages.push(confirmMsg);

  res.json({
    success: true,
    state: db.simulatorState,
    verification: verifyRes.data,
    policyCheck,
  });
});

// 10. Connectors
/*
 * الموصلات.
 *
 * `ConnectorLayer` كلّه `setTimeout` ثم جوابٌ مكتوب في الشيفرة: لا طلب شبكة
 * واحداً يخرج إلى نظام معلومات طلاب ولا إلى بوابة دفع. وكانت الشاشة تعرضها
 * «صحيّة/متصلة» بأرقام استدعاءات يومية — فيظنّ المشتري أن التكامل قائم.
 *
 * فالوضع يُحسب هنا لا يُخزَّن: موصل فايربيس وحده قد يكون حيّاً (له عميلٌ فعلي)
 * وذلك حين يُثبت `getFirebaseStatus()` وصلاً قائماً، وما عداه محاكاة معلنة.
 */
apiRouter.get("/connections", (req: Request, res: Response) => {
  const firebase = getFirebaseStatus();
  /* بوابة الدفع وصلةٌ حقيقية حين تُضبط: مفتاحٌ ومزوّدٌ وطلبٌ يخرج فعلاً. */
  const gateway = gatewayStatus();
  res.json({
    connectors: db.connectors.map(connector => {
      const live = (connector.id === "conn_firebase" && firebase.connected)
        || (connector.id === "conn_knet" && gateway.configured);
      if (live) {
        return connector.id === "conn_knet"
          ? {
              ...connector,
              name: `بوابة الدفع — ${gateway.providerLabel}`,
              mode: "live" as const,
              status: "healthy" as const,
              lastSync: gateway.environment === "live" ? "مربوطة (بيئة حيّة)" : "مربوطة (بيئة اختبار)",
            }
          : { ...connector, mode: "live" as const, lastSync: firebase.lastSyncTime || connector.lastSync };
      }
      /*
       * نصُّ «آخر مزامنة» مخزَّنٌ من البذرة («قبل دقيقتين»، «الآن (متصل ومباشر)»)
       * فيبقى يزعم وصلاً حديثاً وإن لم يجرِ شيء. يُستبدل بما هو صحيح.
       */
      return {
        ...connector,
        /* الاسم المخزَّن من بذرةٍ قديمة يذكر مشروعاً بعينه؛ لا يُعرض قبل قيام وصلة. */
        name: connector.id === "conn_firebase" ? "المرآة السحابية (Firebase Firestore)" : connector.name,
        mode: "simulated" as const,
        status: connector.id === "conn_firebase" ? ("disconnected" as const) : connector.status,
        lastSync: "محاكاة — لا مزامنة",
      };
    }),
  });
});

apiRouter.post("/connections/:id/test", async (req: Request, res: Response) => {
  const conn = db.connectors.find((c) => c.id === req.params.id);
  if (!conn) return res.status(404).json({ success: false });

  /*
   * لا يوجد ما يُفحص: ما من عنوانٍ يُطرَق ولا بروتوكول يُجاب. فالفحص محاكاة،
   * والسجل يقولها — سطرُ تدقيقٍ يزعم «فحص اتصال حي» يُفسد أثمن ما في النظام.
   */
  const live = conn.id === "conn_firebase" && getFirebaseStatus().connected;
  await new Promise((r) => setTimeout(r, 90));
  conn.lastSync = live ? "الآن" : "محاكاة — لم يُطرق أي نظام خارجي";
  conn.status = live ? "healthy" : conn.status;

  db.logAudit({
    actorType: "system",
    actorName: "Connector Health Monitor",
    action: live ? "PING_CONNECTOR" : "SIMULATE_CONNECTOR_PING",
    provenance: conn.name,
    risk: "low",
    latencyMs: 90,
    details: live
      ? `فحص اتصال قائم بنجاح لموصل: ${conn.name}.`
      : `فحصٌ محاكى لموصل: ${conn.name}. لم يُرسل أي طلب شبكة — الوصلة غير مبنية بعد.`,
    status: "success",
  });

  res.json({ success: true, connector: { ...conn, mode: live ? "live" : "simulated" }, simulated: !live });
});

// 11. Analytics & Executive ROI
/*
 * الأثر.
 *
 * كان هذا المسار يردّ ثمانية مؤشرات ومنحنى أسبوع وتوزيع مخاطر — كلها ثوابت
 * مكتوبة في الشيفرة، لا يحرّكها عمل المؤسسة ولا يُنقصها تعطّلها. صار كل رقم
 * مشتقّاً، وكل مقياس يحمل معه أساسه وحجم عيّنته ليُراجَع لا ليُصدَّق.
 */
apiRouter.get("/analytics", (req: Request, res: Response) => {
  const metrics = deriveMetrics(metricsInput());
  const { impact, governance } = metrics;

  res.json({
    kpis: {
      totalTasksCompleted: impact.executionsLifetime.value ?? 0,
      totalHoursSaved: impact.hoursSavedLifetime.value ?? 0,
      automationRatePercent: impact.automationRatePercent.value,
      shadowMatchRatePercent: impact.shadowMatchRatePercent.value,
      errorRatePercent: impact.errorRatePercent.value,
      humanTakeoverPercent: impact.humanTakeoverPercent.value,
      avgProcessDurationMin: impact.avgProcessDurationMin.value,
      institutionalCoverageScore: impact.activationRatePercent.value,
    },
    /* الأساس وحجم العيّنة لكل مؤشر — الواجهة تعرضهما عند الطلب. */
    evidence: impact,
    trend: metrics.trend,
    governance,
    memory: metrics.memory,
    riskDistribution: governance.riskDistribution,
    topSkillsByUsage: metrics.topSkills,
    generatedAt: metrics.generatedAt,
  });
});

// 12. Audit Log
/*
 * الحوكمة.
 *
 * كانت شاشة الحوكمة تعرض «100% عزل» و«5 بوابات بشرية» و«0 تجاوزات» وثلاث حلقات
 * عند 92% و84% و100% — كلها مكتوبة في الواجهة. وأخطرها «0 تجاوزات»: رقمٌ يدّعي
 * إثباتاً لم يجرِ. صار يُشتق بمطابقة الإجراءات عالية الخطورة بطلبات الموافقة،
 * فصفرُه يعني أننا بحثنا فلم نجد.
 */
/*
 * حزم الأنشطة.
 *
 * نهج عامٌّ في قلبه وكان تعليمياً في كل بيانة فيه. الحزمة تبدّل العقل التشغيلي
 * كاملاً — مهاراته وسياساته وأنظمته والشخصية التي تحادثه — لا الألوان والأسماء.
 */
apiRouter.get("/sectors", (req: Request, res: Response) => {
  res.json({ sectors: listSectors(), current: db.sectorCode || EDUCATION_CODE, channel: db.channel });
});

/*
 * التطبيق هادمٌ: يمحو مهارات المؤسسة وسياساتها وحالات عملها. فلا يمرّ بضغطة —
 * يحتاج تأكيداً صريحاً في جسم الطلب، ودور مشرف فأعلى. وسجلّ التدقيق لا يُمسّ:
 * أثرُ ما جرى ملكُ المؤسسة لا ملكُ الحزمة.
 *
 * والبيئة التجريبية مسموحة عمداً: صندوق الزائر في الذاكرة، وتبديل القطاع فيه هو
 * أوضح ما يُري أن المنتج ليس نظام مدارس.
 */
apiRouter.post("/sectors/apply", requireRole("admin"), (req: AuthenticatedRequest, res: Response) => {
  if (req.body?.confirm !== "REPLACE") {
    return void res.status(400).json({
      error: 'تبديل القطاع يمحو المهارات والسياسات وحالات العمل. أرسل confirm="REPLACE" للتأكيد.',
      code: "CONFIRMATION_REQUIRED",
    });
  }
  const code = String(req.body?.code || "");
  /* في الصندوق: التعليم هو البذرة، ويُعاد إليها بإعادة الضبط. والمؤسسة الحقيقية تبدّل إليها كأي قطاع. */
  if (code === EDUCATION_CODE && db.isDemo) {
    return void res.status(400).json({
      error: "حزمة التعليم هي الحزمة المبذورة أصلاً — لإعادتها أعد تهيئة النشر.",
      code: "SEEDED_PACK",
    });
  }
  const result = db.applySector(code, req.account?.email || "مشرف");
  if (!result.ok) return void res.status(404).json({ error: result.reason });

  res.json({
    ok: true,
    sector: db.sectorCode,
    organization: db.organization,
    channel: db.channel,
    counts: { skills: db.skills.length, policies: db.policies.length, connectors: db.connectors.length },
  });
});

apiRouter.get("/governance", (req: Request, res: Response) => {
  const metrics = deriveMetrics(metricsInput());
  res.json({
    governance: metrics.governance,
    memory: metrics.memory,
    policies: db.policies,
    generatedAt: metrics.generatedAt,
  });
});

apiRouter.get("/audit", (req: Request, res: Response) => {
  res.json({ auditEvents: db.auditEvents });
});

// ==========================================
// 13. MODEL CONTEXT PROTOCOL (MCP) INTERFACE
// ==========================================

// Standard JSON-RPC 2.0 Handler for external MCP clients & SDKs
apiRouter.post("/mcp/rpc", requireRole("admin", "manager", "operator"), async (req: Request, res: Response) => {
  const result = await McpEngine.handleJsonRpc(req.body);
  res.json(result);
});

// MCP Servers Registry
apiRouter.get("/mcp/servers", (req: Request, res: Response) => {
  res.json({
    protocolVersion: "2024-11-05",
    servers: McpEngine.getServers(),
  });
});

/*
 * تسجيل خادم وإزالته فعلان إداريان.
 *
 * وكانا مفتوحين لكل من يملك جلسة: مُطَّلعٌ يستطيع حذف خوادم المؤسسة أو تسجيل
 * عنوانٍ باسمها. وسجلُّ التدقيق يكتب اسمه — لكن بعد وقوع الفعل.
 */
apiRouter.post("/mcp/servers", requireAuth, requireRole("admin"), (req: AuthenticatedRequest, res: Response) => {
  const server = McpEngine.registerServer(req.body);
  res.json({ success: true, server });
});

apiRouter.delete("/mcp/servers/:id", requireAuth, requireRole("admin"), (req: AuthenticatedRequest, res: Response) => {
  const success = McpEngine.removeServer(req.params.id);
  res.json({ success });
});

apiRouter.post("/mcp/servers/:id/ping", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const result = await McpEngine.pingServer(req.params.id);
  res.json({ success: true, ...result });
});

// MCP Tools
apiRouter.get("/mcp/tools", (req: Request, res: Response) => {
  res.json({
    tools: McpEngine.getTools(),
  });
});

apiRouter.post("/mcp/tools/call", requireRole("admin", "manager", "operator"), async (req: Request, res: Response) => {
  const { name, arguments: args } = req.body;
  if (typeof name !== "string" || !name) {
    return res.status(400).json({ success: false, error: "Tool name is required" });
  }
  const result = await McpEngine.executeTool(name, args && typeof args === "object" ? args : {});
  res.json({ success: result.status === "success", execution: result });
});

// MCP Resources
apiRouter.get("/mcp/resources", (req: Request, res: Response) => {
  res.json({
    resources: McpEngine.getResources(),
  });
});

apiRouter.get("/mcp/resources/read", (req: Request, res: Response) => {
  const uri = req.query.uri as string;
  const resObj = McpEngine.getResources().find((r) => r.uri === uri);
  if (!resObj) {
    return res.status(404).json({ error: "Resource not found" });
  }
  res.json({ resource: resObj });
});

// MCP Prompts
apiRouter.get("/mcp/prompts", (req: Request, res: Response) => {
  res.json({
    prompts: McpEngine.getPrompts(),
  });
});

// MCP Executions Stream
apiRouter.get("/mcp/executions", (req: Request, res: Response) => {
  res.json({
    executions: McpEngine.getRecentExecutions(),
  });
});

// 12. Firebase Firestore Integration — مرآةٌ اختيارية، لا مصدر الحقيقة
apiRouter.get("/firebase/status", (req: Request, res: Response) => {
  res.json({
    status: getFirebaseStatus(),
  });
});

apiRouter.post("/firebase/sync", requireRole("admin", "manager"), async (req: Request, res: Response) => {
  const result = await db.syncAllToFirebase();
  db.logAudit({
    actorType: "human",
    actorName: db.getCurrentUser().name,
    action: "FIREBASE_FULL_SYNC",
    provenance: "firestore.mirror",
    risk: "low",
    latencyMs: 120,
    details: result.success
      ? `مزامنة مرآة سحابية: ${result.count} كائناً.`
      : `تعذّرت المزامنة السحابية — لم يُكتب أي كائن.`,
    status: result.success ? "success" : "warning",
  });
  res.json(result);
});
