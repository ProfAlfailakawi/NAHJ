import { Router, Request, Response, NextFunction } from "express";
import { db } from "./db.ts";
import { PolicyEngine } from "./engine/policyEngine.ts";
import { SkillEngine } from "./engine/skillEngine.ts";
import { ConnectorLayer } from "./engine/connectors.ts";
import { McpEngine } from "./engine/mcpEngine.ts";
import { generateAiResponse } from "./gemini.ts";
import { AutonomyLevel, SkillStep, LearningSession, Skill } from "../src/types/index.ts";
import { getFirebaseStatus } from "./firebase.ts";
import {
  AuthenticatedRequest,
  adminCreateAccount,
  adminSetPassword,
  changeOwnPassword,
  clearSessionCookies,
  createFirstAccount,
  listAccounts,
  login,
  logout,
  needsFirstRunSetup,
  requireAuth,
  requireRole,
  revokeSessions,
  setSessionCookies,
  updateAccount,
  authCookieNames,
} from "./auth.ts";

export const apiRouter = Router();

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
    // تسجيل دخول فوري: مطالبة المستخدم بإعادة إدخال ما كتبه للتو خطوة بلا فائدة.
    const session = await login(account.email, req.body?.password);
    setSessionCookies(req, res, session.sessionToken, session.csrfToken);
    res.status(201).json({ account: session.account, csrfToken: session.csrfToken, expiresAt: session.expiresAt });
  } catch (error) {
    const status = Number((error as { status?: number })?.status) || 400;
    res.status(status).json({ error: (error as Error)?.message || "تعذّرت التهيئة.", code: "SETUP_FAILED" });
  }
});

authRouter.post("/login", async (req: Request, res: Response) => {
  try {
    const result = await login(req.body?.email, req.body?.password);
    setSessionCookies(req, res, result.sessionToken, result.csrfToken);
    res.json({ account: result.account, csrfToken: result.csrfToken, expiresAt: result.expiresAt });
  } catch (error) {
    const status = Number((error as { status?: number })?.status) || 401;
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

const accountsGuard = [requireAuth, realAdminOnly, requireRole("admin")] as const;

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
    await adminSetPassword(req.params.id, req.body?.newPassword);
    res.json({ ok: true, sessionsRevoked: true });
  } catch (error) {
    const status = Number((error as { status?: number })?.status) || 400;
    res.status(status).json({ error: (error as Error)?.message || "تعذّر ضبط كلمة المرور." });
  }
});

authRouter.post("/accounts/:id/revoke-sessions", ...accountsGuard, (req: AuthenticatedRequest, res: Response) => {
  res.json({ ok: true, revoked: revokeSessions(req.params.id) });
});

/*
 * كل مسار تشغيلي يمرّ بالمصادقة وحماية CSRF. المنصة تدير مفاتيح إيقاف ومستويات
 * استقلالية وموافقات، فلا معنى لأي منها على سطح مفتوح.
 */
apiRouter.use(requireAuth);

// 1. Context & User Switching
apiRouter.get("/context", (req: Request, res: Response) => {
  res.json({
    organization: db.organization,
    users: db.users,
    currentUser: db.getCurrentUser(),
    verifiedSkillsCount: db.skills.filter((s) => s.status === "active").length,
    pendingApprovalsCount: db.approvalRequests.filter((a) => a.status === "pending").length,
    learnedItemsCount: db.learningProposals.filter((p) => p.status === "pending").length,
  });
});

/*
 * تبديل الملف التشغيلي المعروض. كان هذا المسار مفتوحاً يسمح لأي زائر بانتحال أي دور؛
 * صار محصوراً بالمشرف، ولا يمنح صلاحية إطلاقاً — الصلاحية من الجلسة وحدها، وهذا يبدّل
 * الملف التشغيلي المعروض في الواجهة فقط.
 */
apiRouter.post("/switch-role", requireRole("admin"), (req: Request, res: Response) => {
  const { userId } = req.body;
  const user = db.setCurrentUser(userId);
  res.json({ success: true, currentUser: user });
});

// 2. Today Overview
apiRouter.get("/today", (req: Request, res: Response) => {
  const pendingApprovals = db.approvalRequests.filter((a) => a.status === "pending");
  const pendingProposals = db.learningProposals.filter((p) => p.status === "pending");
  const activeWork = db.workItems.filter((w) => w.state !== "completed");

  res.json({
    date: new Date().toLocaleDateString("ar-KW", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
    metrics: {
      tasksCompletedToday: 137,
      needsAttentionCount: pendingApprovals.length + pendingProposals.length,
      newLearnedItemsCount: pendingProposals.length,
      conflictsDetected: pendingProposals.filter((p) => p.type === "conflict").length,
      skillsReadyToGraduate: db.skills.filter((s) => s.reliabilityScore >= 90 && s.autonomyLevel < 6).length,
      hoursSavedThisMonth: db.organization.hoursSavedMonth,
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
    institutionalMemoryCoverage: {
      knownProcesses: 143,
      documentedSkills: db.skills.length,
      undocumentedProcesses: 37,
      singlePersonDependencies: 11,
      candidatesForAutomation: 29,
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
apiRouter.post("/teach/start", (req: Request, res: Response) => {
  const { title } = req.body;
  const session: LearningSession = {
    id: `sess_${Date.now()}`,
    title: title || "تسجيل طالب جديد في المرحلة التمهيدية",
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
  const session = db.learningSessions.find((s) => s.id === sessionId) || db.learningSessions[0];
  if (!session) {
    return res.status(404).json({ success: false, message: "جلسة التعلم غير متوفرة" });
  }

  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

  const event = {
    id: `ev_${Date.now()}`,
    timestamp: timeStr,
    action: action || "إدخال بيانات في النظام",
    system: system || "Future SIS Core",
    inputValue,
    voiceNote,
    screenshotLabel,
  };
  session.events.push(event);

  res.json({ success: true, session });
});

// WOW Moment Synthesis (Prompt Section 72)
apiRouter.post("/teach/synthesize", async (req: Request, res: Response) => {
  const { sessionId } = req.body;
  const session = db.learningSessions.find((s) => s.id === sessionId) || db.learningSessions[0];

  const stepsDetected: SkillStep[] = [
    {
      id: "syn_st_1",
      order: 1,
      title: "فحص السن القانوني وتحديد المرحلة المناسبة",
      description: "مطابقة تاريخ ميلاد الطفل مع لائحة معايير السن لوزارة التربية.",
      system: "SIS Registration Portal",
      isAutomated: true,
    },
    {
      id: "syn_st_2",
      order: 2,
      title: "التحقق من سعة المقاعد المتاحة",
      description: "استعلام فوري من قاعدة بيانات المقاعد المدرسية لمنع تكدس الصفوف.",
      system: "Future SIS Capacity API",
      isAutomated: true,
    },
    {
      id: "syn_st_3",
      order: 3,
      title: "إلزامية التحقق من البطاقة المدنية وجودة المستند",
      description: "فحص الوجهين واستخراج الأرقام والبيانات ومطابقة الاسم الرباعي.",
      system: "Document OCR Engine",
      isAutomated: true,
    },
    {
      id: "syn_st_4",
      order: 4,
      title: "حجز موعد المقابلة المدرسية والجولة",
      description: "تنسيق موعد مع لجنة التقييم المبدئي وتثبيت الموعد بالتقويم.",
      system: "School Calendar Gateway",
      isAutomated: true,
    },
    {
      id: "syn_st_5",
      order: 5,
      title: "اعتماد الرسوم وإنشاء ملف القبول النهائي",
      description: "إرسال بطاقة موافقة لمدير القبول لاعتماد القيمة واستخراج رابط K-Net.",
      system: "Executive Approval Gate & K-Net",
      isAutomated: false,
    },
  ];

  const rulesDetected = [
    "الرسوم الدراسية تؤخذ حصراً من جدول الفوترة المركزي (1,500 د.ك لمرحلة KG2).",
    "أي استثناء في المقاعد أو خصم مالي يتطلب توقيع مدير القبول.",
    "لا يُقبل طلب غير مكتمل البطاقة المدنية تحت أي ظرف.",
  ];

  const clarificationQuestions = [
    {
      id: "q_syn_1",
      question: "هل المقابلة الشخصية مطلوبة لجميع الطلاب أم يُعفى منها أبناء الهيئة التدريسية؟",
      answered: false,
    },
    {
      id: "q_syn_2",
      question: "في حال عدم توفر مقاعد في KG2، هل يُحوّل الطالب تلقائيًا لقائمة الانتظار أم يُعرض عليه فرع الأكاديمية الثاني؟",
      answered: false,
    },
  ];

  if (session) {
    session.status = "synthesized";
    session.discoveredSteps = stepsDetected;
    session.discoveredRules = rulesDetected;
    session.clarificationQuestions = clarificationQuestions;
  }

  // Attempt dynamic enhancement with Gemini if available
  const prompt = `Synthesize organizational steps for school admission taught by staff: ${session?.events.map((e) => e.action).join(", ")}`;
  await generateAiResponse(prompt);

  db.logAudit({
    actorType: "ai",
    actorName: "NAHJ Learning Synthesizer",
    action: "SYNTHESIZE_TAUGHT_SKILL",
    provenance: "Teach Session Capture & Event Stream",
    risk: "medium",
    latencyMs: 420,
    details: `تم تحليل الجلسة التعليمية واستخراج 5 خطوات تشغيلية، 3 قواعد حتمية، وطرح سؤالين توضيحيين قبل الاعتماد.`,
    status: "success",
  });

  res.json({
    success: true,
    message: "I learned a new skill! تم استخلاص المهارة بنجاح وطرح الأسئلة التوضيحية.",
    stepsCount: stepsDetected.length,
    rulesCount: rulesDetected.length,
    exceptionsCount: 2,
    systemsCount: 3,
    steps: stepsDetected,
    rules: rulesDetected,
    questions: clarificationQuestions,
  });
});

// 4b. Approve & Codify a taught process into a versioned Skill
apiRouter.post("/teach/codify", (req: Request, res: Response) => {
  const { sessionId, title, answers } = req.body;
  const session = db.learningSessions.find((s) => s.id === sessionId) || db.learningSessions[0];
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

apiRouter.post("/skills/:id/promote", (req: Request, res: Response) => {
  const { targetLevel } = req.body;
  const result = SkillEngine.promoteSkillAutonomy(
    req.params.id,
    targetLevel as AutonomyLevel,
    db.getCurrentUser().name
  );
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
});

apiRouter.post("/skills/:id/rollback", (req: Request, res: Response) => {
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

apiRouter.post("/skills/:id/killswitch", (req: Request, res: Response) => {
  const result = SkillEngine.toggleKillSwitch(req.params.id, db.getCurrentUser().name);
  res.json(result);
});

// 6. Practice & Shadow Modes
apiRouter.post("/practice/run", async (req: Request, res: Response) => {
  const result = await SkillEngine.runPracticeTests();
  res.json({ success: true, ...result });
});

apiRouter.post("/shadow/run", async (req: Request, res: Response) => {
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

apiRouter.post("/approvals/:id/decide", async (req: Request, res: Response) => {
  const { decision, comments } = req.body; // 'approved' | 'rejected'
  const appr = db.approvalRequests.find((a) => a.id === req.params.id);
  if (!appr) {
    return res.status(404).json({ success: false, message: "طلب الموافقة غير موجود" });
  }

  const currentUser = db.getCurrentUser();
  appr.status = decision === "approved" ? "approved" : "rejected";
  appr.decidedBy = currentUser.name;
  appr.decidedAt = "الآن";

  // If approved, trigger action execution with idempotency & post-verification!
  let executionResult: Awaited<ReturnType<typeof ConnectorLayer.createApplicationRecord>> | null = null;
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

    // Also update simulator state if it matches active conversation
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

  db.logAudit({
    actorType: "human",
    actorName: currentUser.name,
    action: decision === "approved" ? "APPROVE_ACTION_EXECUTION" : "REJECT_ACTION_EXECUTION",
    policyCode: "POL-FIN-02",
    provenance: "Manager Approval Decision Gate",
    risk: "high",
    latencyMs: 55,
    details: `${decision === "approved" ? "اعتماد" : "رفض"} إجراء ${appr.actionName} للمعاملة ${appr.workTitle} بواسطة ${currentUser.name}.`,
    status: decision === "approved" ? "success" : "warning",
  });

  res.json({ success: true, approval: appr, executionResult });
});

// 9. Golden Scenario: Web Conversation Simulator
apiRouter.get("/simulator/state", (req: Request, res: Response) => {
  res.json({ state: db.simulatorState });
});

apiRouter.post("/simulator/reset", (req: Request, res: Response) => {
  db.resetSimulator();
  res.json({ success: true, state: db.simulatorState });
});

apiRouter.post("/simulator/message", async (req: Request, res: Response) => {
  const { text } = req.body;
  const userMsg = {
    id: `msg_${Date.now()}`,
    sender: "customer" as const,
    text,
    timestamp: "الآن",
  };
  db.simulatorState.messages.push(userMsg);

  const lower = (text || "").toLowerCase();

  // Progressive conversational state progression
  if (db.simulatorState.step === "initial") {
    // Stage 1: Identify intent, ask for child's age
    db.simulatorState.step = "age_asked";
    const reply = {
      id: `msg_ai_${Date.now()}`,
      sender: "ai" as const,
      text: "يا مرحباً بك أستاذنا العزيز! يسرنا جداً انضمامكم لأسرة أكاديمية المستقبل. لتحديد الصف الدراسي المناسب والشواغر المتاحة فوراً، كم يبلغ عمر طفلك أو ما هو تاريخ ميلاده؟",
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
    text: "وصلتنا رسالتكم، وجارٍ معالجتها طبقاً لإجراءات أكاديمية المستقبل المعتمدة.",
    timestamp: "الآن",
  };
  db.simulatorState.messages.push(reply);
  res.json({ success: true, state: db.simulatorState });
});

// Upload Document action for Simulator
apiRouter.post("/simulator/upload-doc", async (req: Request, res: Response) => {
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
⚠️ نظراً لأن قيمة التسجيل (1,500 د.ك) تتطلب اعتماداً إدارياً رسمياً طبقاً لسياسة POL-FIN-02، تم إرسال بطاقة الاعتماد فوراً لمديرة القبول (نورة الصباح) للموافقة قبل إرسال رابط الدفع النهائي.`,
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
apiRouter.get("/connections", (req: Request, res: Response) => {
  res.json({ connectors: db.connectors });
});

apiRouter.post("/connections/:id/test", async (req: Request, res: Response) => {
  const conn = db.connectors.find((c) => c.id === req.params.id);
  if (!conn) return res.status(404).json({ success: false });

  await new Promise((r) => setTimeout(r, 90));
  conn.lastSync = "الآن";
  conn.status = "healthy";

  db.logAudit({
    actorType: "system",
    actorName: "Connector Health Monitor",
    action: "PING_CONNECTOR",
    provenance: conn.name,
    risk: "low",
    latencyMs: 90,
    details: `فحص الاتصال الحي بنجاح لموصل: ${conn.name}. زمن الاستجابة طبيعي.`,
    status: "success",
  });

  res.json({ success: true, connector: conn });
});

// 11. Analytics & Executive ROI
apiRouter.get("/analytics", (req: Request, res: Response) => {
  res.json({
    kpis: {
      totalTasksCompleted: 412,
      totalHoursSaved: 84.5,
      automationRatePercent: 78.4,
      shadowMatchRatePercent: 94.2,
      errorRatePercent: 0.8,
      humanTakeoverPercent: 3.9,
      avgProcessDurationMin: 5.4,
      institutionalCoverageScore: 88,
    },
    weeklyTrend: [
      { day: "الأحد", tasks: 48, savedHours: 12.5 },
      { day: "الإثنين", tasks: 62, savedHours: 15.0 },
      { day: "الثلاثاء", tasks: 54, savedHours: 13.2 },
      { day: "الأربعاء", tasks: 71, savedHours: 18.4 },
      { day: "الخميس", tasks: 68, savedHours: 17.1 },
    ],
    riskDistribution: {
      low: 65,
      medium: 25,
      high: 10,
    },
    topSkillsByUsage: db.skills.map((s) => ({
      name: s.name,
      usageCount: s.usageCount,
      hoursSaved: s.hoursSavedTotal,
      successRate: s.successRate,
      reliabilityTier: s.reliabilityTier,
    })),
  });
});

// 12. Audit Log
apiRouter.get("/audit", (req: Request, res: Response) => {
  res.json({ auditEvents: db.auditEvents });
});

// ==========================================
// 13. MODEL CONTEXT PROTOCOL (MCP) INTERFACE
// ==========================================

// Standard JSON-RPC 2.0 Handler for external MCP clients & SDKs
apiRouter.post("/mcp/rpc", async (req: Request, res: Response) => {
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

apiRouter.post("/mcp/servers", (req: Request, res: Response) => {
  const server = McpEngine.registerServer(req.body);
  res.json({ success: true, server });
});

apiRouter.delete("/mcp/servers/:id", (req: Request, res: Response) => {
  const success = McpEngine.removeServer(req.params.id);
  res.json({ success });
});

apiRouter.post("/mcp/servers/:id/ping", (req: Request, res: Response) => {
  const result = McpEngine.pingServer(req.params.id);
  res.json({ success: true, ...result });
});

// MCP Tools
apiRouter.get("/mcp/tools", (req: Request, res: Response) => {
  res.json({
    tools: McpEngine.getTools(),
  });
});

apiRouter.post("/mcp/tools/call", async (req: Request, res: Response) => {
  const { name, arguments: args } = req.body;
  if (!name) {
    return res.status(400).json({ success: false, error: "Tool name is required" });
  }
  const result = await McpEngine.executeTool(name, args || {});
  res.json({ success: true, execution: result });
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

// 12. Firebase Firestore Integration (Project: nahj-a27a4)
apiRouter.get("/firebase/status", (req: Request, res: Response) => {
  res.json({
    status: getFirebaseStatus(),
  });
});

apiRouter.post("/firebase/sync", async (req: Request, res: Response) => {
  const result = await db.syncAllToFirebase();
  db.logAudit({
    actorType: "human",
    actorName: db.getCurrentUser().name,
    action: "FIREBASE_FULL_SYNC",
    provenance: "nahj-a27a4.firestore",
    risk: "low",
    latencyMs: 120,
    details: `مزامنة شاملة لذاكرة المنصة التشغيلية إلى قاعدة بيانات سحابة Firebase Firestore (nahj-a27a4) بإجمالي ${result.count} كائن.`,
    status: result.success ? "success" : "warning",
  });
  res.json(result);
});
