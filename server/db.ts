import {
  initialOrganization,
  demoUsers,
  initialKnowledgeSources,
  initialPolicies,
  initialSkills,
  initialLearningProposals,
  initialWorkItems,
  initialApprovalRequests,
  initialAuditEvents,
  initialConnectors,
  initialTestCases,
  initialShadowComparisons,
} from "../src/data/seedData.ts";
import {
  Organization,
  User,
  KnowledgeSource,
  Policy,
  Skill,
  LearningProposal,
  WorkItem,
  ApprovalRequest,
  AuditEvent,
  Connector,
  TestCase,
  ShadowComparison,
  LearningSession,
} from "../src/types/index.ts";
import { syncDocToFirestore, getFirebaseStatus } from "./firebase.ts";
import { AUDIT_RETENTION, readState, startPersistenceWorker } from "./persistence.ts";
import { AsyncLocalStorage } from "node:async_hooks";
import { createDemoSandboxSeed, type DemoSandboxSeed } from "./demoSandbox.ts";
import { buildSector, EDUCATION_CODE, getSectorPack } from "./packs/index.ts";
import { buildDemoActivity } from "./packs/demoActivity.ts";
import { buildCleanStart, type CleanStart } from "./packs/cleanStart.ts";

/*
 * صاحب الجلسة في الطلب الجاري — يُضبط بعد المصادقة (routes.ts). منه يُقرأ
 * «المستخدم الحالي» في المؤسسة الحقيقية بدل ملفٍّ نموذجي من البذرة.
 */
export const requestAccount = new AsyncLocalStorage<{ id: string; name: string; email: string; role: string }>();

const ACCOUNT_ROLE_LABEL: Record<string, string> = {
  owner: "مالك المنصة", admin: "مشرف المؤسسة", manager: "مدير", operator: "موظف تشغيل", viewer: "مشاهدة",
};

function accountRoleToUserRole(role: string): User["role"] {
  if (role === "owner") return "owner";
  if (role === "admin") return "admin";
  if (role === "manager") return "manager";
  if (role === "viewer") return "auditor";
  return "employee";
}

const SYSTEM_USER: User = { id: "system", name: "النظام", email: "", role: "admin", department: "", avatar: "" };
import { stampLegacyInstant } from "./engine/metricsEngine.ts";

export interface SimulatorMessage {
  id: string;
  sender: "customer" | "ai" | "system";
  text: string;
  timestamp: string;
  cardType?: "info" | "fee_quote" | "document_request" | "booking_confirmation" | "approval_pending";
  metadata?: Record<string, any>;
}

export interface SimulatorState {
  step: "initial" | "age_asked" | "grade_confirmed" | "doc_requested" | "doc_uploaded" | "booking_offered" | "approval_triggered" | "completed" | "scripted";
  studentName?: string;
  childAge?: number;
  grade?: string;
  civilIdNumber?: string;
  civilIdVerified?: boolean;
  visitDate?: string;
  tuitionFee?: number;
  requiresManagerApproval?: boolean;
  approvalStatus?: "pending" | "approved" | "rejected";
  messages: SimulatorMessage[];
  /*
   * سيرُ القطاعات غير التعليمية: مراحلُه تأتي من الحزمة، ويتقدّم دوراً مع كل
   * رسالة. والتعليم يبقى على سيره المكتوب — فهذه الحقول غائبة عنه.
   */
  stages?: string[];
  stage?: number;
  turn?: number;
  /** معرّف طلب الموافقة الذي فتحته المحادثة، ليُحسم منها ويُردّ عليها. */
  approvalId?: string;
  /** أمثلة يبدأ بها من يجرّب القناة. */
  samplePrompts?: string[];
  /** اسم المؤسسة كما يراه الطرف الآخر في رأس المحادثة. */
  orgName?: string;
}

/*
 * يُعيد ما حُفظ سابقاً إن وُجد، وإلا البذرة. هذا هو الفرق بين منتج يتذكّر ونموذج عرض
 * يبدأ من الصفر عند كل إقلاع. يُستعمل للمخزن الحقيقي فقط — البيئة التجريبية لا تُحفظ
 * ولا تُقرأ من القرص إطلاقاً.
 */
function hydrate<T>(key: string, seed: T): T {
  const persisted = readState<T>(key);
  return persisted === undefined ? seed : persisted;
}

/* قناة التعليم الافتراضية — الحزمة المبذورة أصلاً في المنصة. */
const DEFAULT_CHANNEL = {
  counterpart: "ولي أمر",
  welcome: "أهلاً بك في أكاديمية المستقبل الدولية! يسعدنا تواصلكم واستقبال استفساركم بشأن تسجيل طلاب جدد للعام الدراسي 2026/2027.",
  samplePrompts: ["أبي أسجل بنتي في الصف الأول", "كم الرسوم الدراسية؟", "متى يبدأ التسجيل؟"],
};

export class Store {
  /**
   * `isDemo` is the one switch that keeps a visitor's synthetic activity out of
   * the institution's Firestore project. Every write path below checks it, so a
   * demo session can be as noisy as it likes without leaving a trace in real data.
   *
   * It is also what decides where this store's initial contents come from: a demo
   * store clones the synthetic seed, while the real store hydrates from SQLite so
   * a restart does not erase what the institution actually did.
   */
  public readonly isDemo: boolean;
  public organization: Organization;
  public users: User[];
  public currentUserId: string;
  public knowledgeSources: KnowledgeSource[];
  public policies: Policy[];
  public skills: Skill[];
  public learningProposals: LearningProposal[];
  public learningSessions: LearningSession[];
  public workItems: WorkItem[];
  public approvalRequests: ApprovalRequest[];
  public auditEvents: AuditEvent[];
  public connectors: Connector[];
  public testCases: TestCase[];
  public shadowComparisons: ShadowComparison[];
  /** القطاع الذي بُني عليه العقل الحالي. يُقرأ في الواجهة ويُحفظ مع الحالة. */
  public sectorCode: string;
  /** الشخصية التي تحادث المؤسسة من الخارج — تختلف جذرياً بين القطاعات. */
  public channel: { counterpart: string; welcome: string; samplePrompts: string[] };
  /*
   * هل أعدّت المؤسسة نفسها؟ نشرٌ جديد يُقلع على بذرة العرض، والإعداد الأول
   * يستبدلها ببدايةٍ نظيفة باسم المؤسسة وقطاعها. وحتى يتمّ لا تُعرض البذرة على
   * أنها سجلّ المؤسسة — الواجهة تعرض شاشة الإعداد بدلها.
   */
  public organizationConfigured: boolean;

  constructor(seed?: DemoSandboxSeed) {
    this.isDemo = Boolean(seed);
    const persisted = <T>(key: string, value: T): T => (seed ? value : hydrate(key, value));

    this.organization = seed ? seed.organization : persisted("organization", { ...initialOrganization });
    this.users = seed ? seed.users : persisted("users", [...demoUsers]);
    this.currentUserId = seed ? "usr_noura" : persisted("currentUserId", "usr_noura");
    this.knowledgeSources = seed ? seed.knowledgeSources : persisted("knowledgeSources", [...initialKnowledgeSources]);
    this.policies = seed ? seed.policies : persisted("policies", [...initialPolicies]);
    this.skills = seed ? seed.skills : persisted("skills", JSON.parse(JSON.stringify(initialSkills)));
    this.learningProposals = seed ? seed.learningProposals : persisted("learningProposals", JSON.parse(JSON.stringify(initialLearningProposals)));
    this.learningSessions = seed ? [] : persisted("learningSessions", [] as LearningSession[]);
    this.workItems = seed ? seed.workItems : persisted("workItems", JSON.parse(JSON.stringify(initialWorkItems)));
    this.approvalRequests = seed ? seed.approvalRequests : persisted("approvalRequests", JSON.parse(JSON.stringify(initialApprovalRequests)));
    this.auditEvents = seed ? seed.auditEvents : persisted("auditEvents", JSON.parse(JSON.stringify(initialAuditEvents)));
    this.connectors = seed ? seed.connectors : persisted("connectors", JSON.parse(JSON.stringify(initialConnectors)));
    this.testCases = seed ? seed.testCases : persisted("testCases", JSON.parse(JSON.stringify(initialTestCases)));
    this.shadowComparisons = seed ? seed.shadowComparisons : persisted("shadowComparisons", JSON.parse(JSON.stringify(initialShadowComparisons)));
    /*
     * تثبيت طوابع السجلات القديمة — مرة واحدة عند البناء.
     *
     * سجلات البذرة والسجلات المحفوظة قبل إضافة `at` تحمل نصّ عرضٍ فقط («اليوم،
     * 10:15 ص»). وقراءته عند كل طلب كانت تدحرجها مع الساعة فلا تشيخ أبداً. تُقرأ
     * هنا مرة وتُثبَّت، ثم تشيخ كما يشيخ كل شيء.
     */
    const stampedAt = new Date();
    for (const event of this.auditEvents) {
      if (!event.at) {
        const instant = stampLegacyInstant(event, stampedAt);
        if (instant) event.at = instant;
      }
    }

    this.sectorCode = seed ? EDUCATION_CODE : persisted("sectorCode", EDUCATION_CODE);
    /* صندوق العرض مُعَدٌّ بطبيعته؛ والمؤسسة الحقيقية حتى تُعِدّ نفسها. */
    this.organizationConfigured = seed ? true : persisted("organizationConfigured", false);
    this.channel = seed ? DEFAULT_CHANNEL : persisted("channel", { ...DEFAULT_CHANNEL });

    const freshSimulator: SimulatorState = {
      step: "initial",
    messages: [
      {
        id: "msg_welcome",
        sender: "ai",
        text: "أهلاً بك في أكاديمية المستقبل الدولية! يسعدنا تواصلكم واستقبال استفساركم بشأن تسجيل طلاب جدد للعام الدراسي 2026/2027.",
        timestamp: "10:14 ص",
      },
    ],
    };
    this.simulatorState = seed ? freshSimulator : persisted("simulatorState", freshSimulator);
  }

  /*
   * يُسنَد في الباني لا كمُهيّئ حقل: مُهيّئات الحقول تعمل قبل جسم الباني، فكانت
   * `this.isDemo` ما تزال undefined وتأخذ كل بيئة تجريبية الحالة المحفوظة من القرص —
   * أي العكس تماماً من الغرض.
   */
  public simulatorState: SimulatorState;

  public getCurrentUser(): User {
    /*
     * في المؤسسة الحقيقية: صاحب الجلسة هو المستخدم الحالي.
     *
     * كان رأس الشاشة يعرض «نورة خالد — إدارة القبول» لمالك المنصة نفسه، وكل
     * إجراء (إيقاف مهارة، جلسة تعليم) يُسجَّل باسمها. والصندوق التجريبي يبقى على
     * ملفّه النموذجي.
     */
    if (!this.isDemo) {
      const account = requestAccount.getStore();
      if (account) {
        return {
          id: account.id,
          name: account.name,
          email: account.email,
          role: accountRoleToUserRole(account.role),
          department: ACCOUNT_ROLE_LABEL[account.role] || "",
          avatar: "",
        };
      }
    }
    return this.users.find((u) => u.id === this.currentUserId) || this.users[0] || SYSTEM_USER;
  }

  public setCurrentUser(userId: string): User {
    const u = this.users.find((x) => x.id === userId);
    if (u) {
      this.currentUserId = u.id;
      return u;
    }
    return this.getCurrentUser();
  }

  public logAudit(event: Omit<AuditEvent, "id" | "timestamp">): AuditEvent {
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")} ${now.getHours() >= 12 ? "م" : "ص"}`;
    const newEvent: AuditEvent = {
      id: `aud_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      timestamp: `اليوم، ${timeStr}`,
      // الطابع الحقيقي إلى جانب نصّ العرض: القياس يحتاج الأول، والقارئ الثاني.
      at: now.toISOString(),
      ...event,
    };
    this.auditEvents.unshift(newEvent);
    // سجل التدقيق يُقصّ عند حدّ ثابت وإلا نما بلا سقف في الذاكرة وفي الملف معاً.
    if (this.auditEvents.length > AUDIT_RETENTION) this.auditEvents.length = AUDIT_RETENTION;
    // Background sync to Firestore nahj-a27a4 — never from a demo sandbox.
    if (!this.isDemo) void syncDocToFirestore("auditEvents", newEvent.id, newEvent);
    return newEvent;
  }

  /**
   * يستبدل العقل التشغيلي بحزمة قطاع أخرى.
   *
   * عمليةٌ هادمة بطبيعتها: تمسح المهارات والسياسات والموصلات ومصادر المعرفة
   * وتضع مكانها عقل القطاع الجديد. ولهذا لا تُنادى إلا بتأكيد صريح من المسار.
   *
   * وما لا تمسحه مقصود: سجلّ التدقيق يبقى. أثرُ ما جرى ملكُ المؤسسة لا ملكُ
   * الحزمة، ومحوُه عند تبديل القطاع يُفقد المراجعة معناها — ويمحو الحدث الذي
   * يسجّل التبديل نفسه.
   */
  /**
   * بداية التشغيل الحقيقي: اسم المؤسسة وقطاعها، على صفحةٍ نظيفة.
   *
   * يُمحى كل ما جاء من بذرة العرض — الموظفون النموذجيون، وحالات العمل،
   * والموافقات، والاختبارات، وملاحظات التعلّم، وسجلّ التدقيق النموذجي — لأنه لم
   * يقع في هذه المؤسسة. وأول سطرٍ في سجلّها الحقيقي هو هذا الإعداد نفسه.
   */
  public configureOrganization(code: string, name: string, nameEn: string, actorName: string): { ok: boolean; reason?: string } {
    if (this.isDemo) return { ok: false, reason: "لا تُعَدّ مؤسسةٌ من داخل صندوق العرض." };
    const start = buildCleanStart(code, name, nameEn);
    if (!start) return { ok: false, reason: name.trim() ? `قطاع غير معروف: ${code}` : "اسم المؤسسة مطلوب." };
    this.installCleanStart(start);
    this.auditEvents = [];
    this.organizationConfigured = true;
    this.logAudit({
      actorType: "human",
      actorName,
      action: "ORGANIZATION_CONFIGURED",
      provenance: `إعداد المؤسسة — ${start.sectorCode}`,
      risk: "medium",
      latencyMs: 0,
      details: `بدأ التشغيل الفعلي لـ«${start.organization.name}». ${start.skills.length} قالب مهارة و${start.policies.length} قالب سياسة بانتظار المراجعة؛ لا حالات ولا موافقات ولا بيانات نموذجية.`,
      status: "success",
    });
    return { ok: true };
  }

  private installCleanStart(start: CleanStart): void {
    this.organization = start.organization;
    this.users = [];
    this.knowledgeSources = start.knowledgeSources;
    this.policies = start.policies;
    this.skills = start.skills;
    this.connectors = start.connectors;
    this.learningProposals = [];
    this.channel = start.channel;
    this.sectorCode = start.sectorCode;
    this.workItems = [];
    this.approvalRequests = [];
    this.testCases = [];
    this.shadowComparisons = [];
    this.learningSessions = [];
    this.resetSimulator();
  }

  public applySector(code: string, actorName: string): { ok: boolean; reason?: string } {
    /*
     * المؤسسة الحقيقية تبدّل نشاطها إلى قوالب نظيفة، وتحتفظ باسمها. كانت تُركَّب
     * عليها حزمة العرض كما هي: اسم «مركز الشفاء» مكان اسمها، وموظفون
     * مُختلَقون، ومهاراتٌ حيّة بموثوقية 91٪ لم تكتسبها.
     */
    if (!this.isDemo) {
      const start = buildCleanStart(code, this.organization.name, this.organization.nameEn);
      if (!start) return { ok: false, reason: `قطاع غير معروف: ${code}` };
      this.installCleanStart(start);
      this.logAudit({
        actorType: "human",
        actorName,
        action: "APPLY_SECTOR_PACK",
        provenance: `حزمة القطاع: ${code}`,
        risk: "high",
        latencyMs: 0,
        details: `بُدّل نشاط «${this.organization.name}» إلى ${code}: ${start.skills.length} قالب مهارة و${start.policies.length} قالب سياسة بانتظار المراجعة. سجلّ التدقيق محفوظ.`,
        status: "success",
      });
      return { ok: true };
    }
    const built = buildSector(code);
    if (!built) return { ok: false, reason: `قطاع غير معروف: ${code}` };

    this.organization = built.organization;
    this.users = built.users;
    this.currentUserId = built.users[0]?.id || this.currentUserId;
    this.knowledgeSources = built.knowledgeSources;
    this.policies = built.policies;
    this.skills = built.skills;
    this.connectors = built.connectors;
    this.learningProposals = built.learningProposals;
    this.channel = built.channel;
    this.sectorCode = code;

    /*
     * ما يخصّ القطاع السابق ولا معنى له بعده: حالات عمله، وطلبات موافقته،
     * واختباراته، ومقارنات ظلّه. تركها يُنتج شاشةً فيها «تسجيل طالب» داخل عيادة.
     */
    this.workItems = [];
    this.approvalRequests = [];
    this.testCases = [];
    this.shadowComparisons = [];
    this.learningSessions = [];

    /*
     * صندوق العرض وحده يُملأ بنشاط القطاع: من يجرّب نهج لعيادته يرى عيادةً
     * تعمل لا عيادةً فارغة. والمؤسسة الحقيقية تبدأ نظيفة — لا تُكتب في سجلّها
     * حالاتٌ لم تقع.
     */
    const demo = getSectorPack(code)?.demo;
    if (this.isDemo && demo) {
      const activity = buildDemoActivity(demo, built, code);
      this.workItems = activity.workItems;
      this.approvalRequests = activity.approvalRequests;
      this.testCases = activity.testCases;
      this.shadowComparisons = activity.shadowComparisons;
      /*
       * سجلّ الصندوق يبدأ من تاريخ هذه المؤسسة لا من تاريخ المدرسة المبذورة:
       * كان «السجل» في عيادة العرض يعرض «مديرة القبول» و«KG2». ويُبنى من
       * أحداث حالاتها نفسها، فما في السجل هو ما في «العمل».
       */
      this.auditEvents = [];
      const humanNames = built.users.map(user => user.name);
      for (const item of [...activity.workItems].reverse()) {
        for (const entry of [...item.timeline].reverse()) {
          this.logAudit({
            actorType: entry.actor,
            actorName: entry.actor === "ai" ? "نهج" : entry.actor === "human" ? (humanNames[0] || "موظف") : "النظام",
            action: entry.badge ? entry.badge.toUpperCase().replace(/[^A-Z0-9]+/g, "_") || "WORK_EVENT" : "WORK_EVENT",
            provenance: item.code,
            risk: item.riskLevel,
            latencyMs: 0,
            details: `${item.title}: ${entry.title} — ${entry.details}`,
            status: item.state === "escalated" ? "warning" : "success",
          });
        }
      }
      this.organization = {
        ...this.organization,
        verifiedSkillsCount: built.skills.filter(skill => skill.status === "active").length,
        hoursSavedMonth: Number(built.skills.reduce((sum, skill) => sum + (skill.hoursSavedTotal || 0), 0).toFixed(1)),
      };
    }
    this.resetSimulator();

    this.logAudit({
      actorType: "human",
      actorName,
      action: "APPLY_SECTOR_PACK",
      provenance: `حزمة القطاع: ${code}`,
      risk: "high",
      latencyMs: 0,
      details: `استُبدل العقل التشغيلي بحزمة «${built.organization.name}» — ${built.skills.length} مهارة و${built.policies.length} سياسة. سجلّ التدقيق محفوظ.`,
      status: "success",
    });

    return { ok: true };
  }

  public resetSimulator(): void {
    const chat = this.isDemo && this.sectorCode !== EDUCATION_CODE ? getSectorPack(this.sectorCode)?.demo?.chat : undefined;
    this.simulatorState = {
      step: "initial",
      messages: [
        {
          id: "msg_welcome_reset",
          sender: "ai",
          text: this.channel.welcome,
          timestamp: "الآن",
        },
      ],
      samplePrompts: this.channel.samplePrompts,
      orgName: this.organization.name,
      ...(chat ? { stages: chat.stages, stage: 0, turn: 0 } : {}),
    };
    if (!this.isDemo) void syncDocToFirestore("simulator", "state", this.simulatorState);
  }

  /**
   * Synchronize entire operational memory to Firebase Firestore project nahj-a27a4
   */
  public async syncAllToFirebase(): Promise<{ success: boolean; count: number; status: any; reason?: string }> {
    // A sandbox never publishes. Reporting success keeps the demo's own
    // "sync" screen honest-looking without a single document being written.
    if (this.isDemo) return { success: true, count: 0, status: getFirebaseStatus() };

    /*
     * `syncDocToFirestore` يبتلع أخطاءه ويُعيد false، فلا يصل شيء إلى try/catch.
     * عدّ المحاولات هنا كان يُبلّغ success:true و count:32 بينما رُفضت الكتابات
     * الاثنتان والثلاثون كلها بـ PERMISSION_DENIED — وهو بالضبط الكذب الذي أزلناه
     * من الواجهة. نعدّ ما نجح فعلاً، ونحتفظ بأول فشل سبباً.
     */
    const documents: Array<[string, string, Record<string, any>]> = [
      ["organization", "current", this.organization],
      ...this.users.map((u) => ["users", u.id, u] as [string, string, any]),
      ...this.skills.map((s) => ["skills", s.id, s] as [string, string, any]),
      ...this.workItems.map((w) => ["workItems", w.id, w] as [string, string, any]),
      ...this.learningProposals.map((p) => ["learningProposals", p.id, p] as [string, string, any]),
      ...this.approvalRequests.map((a) => ["approvalRequests", a.id, a] as [string, string, any]),
      ...this.connectors.map((c) => ["connectors", c.id, c] as [string, string, any]),
      ...this.auditEvents.slice(0, 30).map((e) => ["auditEvents", e.id, e] as [string, string, any]),
      ...this.testCases.map((t) => ["testCases", t.id, t] as [string, string, any]),
      ...this.shadowComparisons.map((sc) => ["shadowComparisons", sc.id, sc] as [string, string, any]),
      ["simulator", "state", this.simulatorState],
    ];

    let count = 0;
    let failed = 0;
    try {
      for (const [collectionName, docId, data] of documents) {
        if (await syncDocToFirestore(collectionName, docId, data)) count++;
        else failed++;
      }
    } catch (err: any) {
      return this.syncFailure(String(err?.message || err), count);
    }

    if (failed > 0) {
      const status = getFirebaseStatus();
      return this.syncFailure(String(status.error || "سبب غير معروف"), count, failed, documents.length);
    }

    console.log(`[Firebase nahj-a27a4] Successfully synced ${count} entities to Firestore.`);
    return { success: true, count, status: getFirebaseStatus() };
  }

  private syncFailure(message: string, count: number, failed?: number, total?: number) {
    /*
     * قواعد Firestore تمنع وصول العملاء (وهو المقصود: نهج بلا مصادقة على مستوى
     * Firestore). المزامنة الحالية تستعمل SDK العميل، فتُرفض دائماً. نُعيد السبب
     * صراحةً بدل رقم يقرؤه العميل كنجاح.
     */
    const denied = /permission|PERMISSION_DENIED|insufficient/i.test(message);
    const scope = failed !== undefined && total !== undefined ? ` (${failed} من ${total})` : "";
    console.warn(`[Firebase nahj-a27a4] Sync failed${scope}:`, message);
    return {
      success: false,
      count,
      status: getFirebaseStatus(),
      reason: denied
        ? `المرآة مقفلة: قواعد Firestore تمنع وصول العملاء، فرُفضت الكتابة${scope}. تفعيلها يحتاج نقل الخادم إلى Admin SDK بحساب خدمة.`
        : `تعذّرت المزامنة${scope}: ${message.slice(0, 200)}`,
    };
  }
}

const baseStore = new Store();

/**
 * Demo sandboxes.
 *
 * Each visitor who enters Demo is handed a private `Store`, kept in memory and
 * reachable only through their own session cookie. `db` is a proxy: inside a
 * demo request it resolves to that visitor's sandbox, and everywhere else to
 * the single real store. Route handlers were written against `db` and did not
 * have to change.
 */
type DemoRecord = { store: Store; expiresAt: number; sector: string };

/*
 * صندوق عرضٍ على قطاعٍ بعينه. التعليم هو البذرة نفسها؛ وما عداه يُركَّب فوقها
 * بحزمته ونشاطها — فمن اختار «عيادة» يدخل عيادةً من أول شاشة.
 */
function sandboxStore(sector: string): Store {
  const store = new Store(createDemoSandboxSeed());
  if (sector && sector !== EDUCATION_CODE) store.applySector(sector, "زائر العرض");
  return store;
}

/** قطاعٌ معروف أو التعليم — لا يُركَّب صندوقٌ على رمزٍ مجهول. */
export function normalizeDemoSector(value: unknown): string {
  const code = String(value || "").trim();
  return code && getSectorPack(code) ? code : EDUCATION_CODE;
}
const demoContext = new AsyncLocalStorage<{ sessionId: string; store: Store }>();
const demoSandboxes = new Map<string, DemoRecord>();

function currentStore(): Store {
  return demoContext.getStore()?.store || baseStore;
}

export const db: Store = new Proxy(baseStore, {
  get(_target, prop, receiver) {
    const store = currentStore();
    const value = Reflect.get(store, prop, receiver);
    return typeof value === "function" ? value.bind(store) : value;
  },
  set(_target, prop, value) {
    return Reflect.set(currentStore(), prop, value);
  },
  has(_target, prop) { return Reflect.has(currentStore(), prop); },
  ownKeys() { return Reflect.ownKeys(currentStore()); },
  getOwnPropertyDescriptor(_target, prop) { return Reflect.getOwnPropertyDescriptor(currentStore(), prop); },
}) as Store;

export const DEMO_SESSION_TTL_MS = 60 * 60 * 1000;
const MAX_DEMO_SANDBOXES = Number(process.env.NAHJ_DEMO_MAX_SANDBOXES) > 0 ? Number(process.env.NAHJ_DEMO_MAX_SANDBOXES) : 300;

/** Drop sandboxes whose visitor left, so an unattended demo cannot grow without bound. */
function sweepExpiredSandboxes(): void {
  const now = Date.now();
  for (const [id, record] of demoSandboxes) if (record.expiresAt <= now) demoSandboxes.delete(id);
}

export const DemoSandbox = {
  isDemoRequest: (): boolean => Boolean(demoContext.getStore()),
  currentSessionId: (): string => demoContext.getStore()?.sessionId || "",
  create(sessionId: string, ttlMs: number = DEMO_SESSION_TTL_MS, sector: string = EDUCATION_CODE): void {
    sweepExpiredSandboxes();
    /*
     * سقفٌ لعدد الصناديق: /try/<قطاع> رابطٌ عامّ يُنشئ صندوقاً بكل زيارة، وزاحفٌ
     * يطرقه بلا توقّف كان سيملأ الذاكرة. يُزاح الأقدم انتهاءً — زائرٌ حقيقي
     * يعود فيجد عرضاً جديداً، ولا يسقط الخادم.
     */
    while (demoSandboxes.size >= MAX_DEMO_SANDBOXES) {
      let oldestId = "";
      let oldestAt = Infinity;
      for (const [id, record] of demoSandboxes) if (record.expiresAt < oldestAt) { oldestAt = record.expiresAt; oldestId = id; }
      demoSandboxes.delete(oldestId);
    }
    const code = normalizeDemoSector(sector);
    demoSandboxes.set(sessionId, { store: sandboxStore(code), expiresAt: Date.now() + ttlMs, sector: code });
  },
  /** إعادة الضبط تُبقي القطاع الذي اختاره الزائر — لا تُعيده إلى المدرسة. */
  reset(sessionId: string, ttlMs: number = DEMO_SESSION_TTL_MS): boolean {
    if (!sessionId.startsWith("demo_") || !demoSandboxes.has(sessionId)) return false;
    const sector = demoSandboxes.get(sessionId)!.sector;
    demoSandboxes.set(sessionId, { store: sandboxStore(sector), expiresAt: Date.now() + ttlMs, sector });
    return true;
  },
  destroy(sessionId: string): void { demoSandboxes.delete(sessionId); },
  /** Runs `fn` bound to the visitor's sandbox. Returns false when the session has expired. */
  run(sessionId: string, ttlMs: number, fn: () => void): boolean {
    const record = demoSandboxes.get(sessionId);
    if (!record || record.expiresAt <= Date.now()) { demoSandboxes.delete(sessionId); return false; }
    record.expiresAt = Date.now() + ttlMs;
    demoContext.run({ sessionId, store: record.store }, fn);
    return true;
  },
};

/*
 * اللقطة التي يحفظها العامل الدوري. تقرأ من `baseStore` صراحةً لا من الوكيل `db`:
 * الوكيل يتحوّل إلى صندوق الزائر التجريبي داخل طلبه، وقراءة منه هنا كانت ستكتب
 * بيانات تجريبية مكان بيانات المؤسسة.
 */
export function snapshotState(): Record<string, unknown> {
  return {
    organization: baseStore.organization,
    users: baseStore.users,
    currentUserId: baseStore.currentUserId,
    knowledgeSources: baseStore.knowledgeSources,
    policies: baseStore.policies,
    skills: baseStore.skills,
    learningProposals: baseStore.learningProposals,
    learningSessions: baseStore.learningSessions,
    workItems: baseStore.workItems,
    approvalRequests: baseStore.approvalRequests,
    auditEvents: baseStore.auditEvents,
    connectors: baseStore.connectors,
    testCases: baseStore.testCases,
    shadowComparisons: baseStore.shadowComparisons,
    simulatorState: baseStore.simulatorState,
    sectorCode: baseStore.sectorCode,
    channel: baseStore.channel,
    organizationConfigured: baseStore.organizationConfigured,
  };
}

export const persistence = startPersistenceWorker(snapshotState);

// Non-blocking background sync to Firebase project nahj-a27a4 after boot
setTimeout(() => {
  void baseStore.syncAllToFirebase().catch((err) => {
    console.warn("[Firebase] Background initial sync handled:", err);
  });
}, 8000);
