/**
 * Demo sandbox data for NAHJ.
 *
 * Every visitor who enters Demo gets their OWN clone of this state, held in
 * memory for the life of their session. Nothing here is read from — or written
 * back to — the institution's real Firestore project: the sandbox exists so a
 * prospect can be shown a full, busy NAHJ without a single real record being
 * touched. The volume is deliberate. A demo with four rows reads like a
 * prototype; a demo with two hundred reads like a system that has been running
 * for months, which is the thing being sold.
 *
 * The synthetic people, schools and civil IDs below are invented. They are
 * shaped like Kuwaiti admissions data so screens look right, and they match no
 * real person.
 */
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
import type {
  ApprovalRequest,
  AuditEvent,
  RiskLevel,
  ShadowComparison,
  Skill,
  TestCase,
  WorkItem,
} from "../src/types/index.ts";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/* A fixed stream, not Math.random(). Two visitors entering Demo a second apart
 * should see the same board, and a screenshot taken for a deck should still be
 * reproducible next month. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0x100000000;
  };
}

const FIRST_NAMES = [
  "يوسف", "فاطمة", "عبدالعزيز", "دانة", "سلمان", "شهد", "راكان", "لولوة", "مشاري", "جنى",
  "بدر", "مريم", "طلال", "نورة", "عبدالله", "حصة", "خالد", "غلا", "فيصل", "ريم",
  "ناصر", "سارة", "عمر", "هيا", "محمد", "العنود", "سعود", "منيرة", "أحمد", "وضحى",
];
const FAMILY_NAMES = [
  "الشمري", "العتيبي", "المطيري", "الرشيدي", "العجمي", "الدوسري", "الهاجري", "الكندري",
  "الفضلي", "السبيعي", "البلوشي", "الخالدي", "المطوع", "العنزي", "الصالح", "الحربي",
];
const GRADES = [
  ["KG1 - الروضة الأولى", 1350], ["KG2 - الروضة الثانية", 1500], ["الصف الأول الابتدائي", 1750],
  ["الصف الثالث الابتدائي", 1850], ["الصف الخامس الابتدائي", 1950], ["الصف السابع المتوسط", 2250],
  ["الصف التاسع المتوسط", 2400], ["الصف العاشر الثانوي", 2650], ["الصف الحادي عشر علمي", 2850],
] as const;

const STATES: WorkItem["state"][] = [
  "queued", "collecting_data", "waiting_documents", "waiting_approval", "executing", "completed", "escalated",
];
const RISKS: RiskLevel[] = ["low", "medium", "high"];

/* Skill families beyond the six shipped in the seed. The demo has to show that
 * NAHJ is an operating system for a school's back office, not an admissions
 * chatbot — so finance, transport, HR and student affairs all have to be on the
 * board, each with its own reliability history. */
const EXTRA_SKILLS: ReadonlyArray<readonly [string, string, string, string, number, number]> = [
  ["transfer-student-intake", "استقبال طالب محوّل من مدرسة أخرى", "Transfer Student Intake", "القبول والتسجيل", 5, 91.4],
  ["sibling-discount-review", "مراجعة خصم الإخوة واحتسابه", "Sibling Discount Review", "الشؤون المالية", 4, 96.1],
  ["installment-plan-setup", "إنشاء خطة تقسيط الرسوم الدراسية", "Installment Plan Setup", "الشؤون المالية", 3, 88.7],
  ["late-payment-followup", "متابعة الرسوم المتأخرة وتذكير أولياء الأمور", "Late Payment Follow-up", "الشؤون المالية", 6, 97.3],
  ["bus-route-assignment", "تخصيص خط الحافلة المدرسية", "Bus Route Assignment", "النقل المدرسي", 5, 93.8],
  ["absence-notification", "إشعار الغياب المتكرر لولي الأمر", "Repeated Absence Notification", "شؤون الطلاب", 6, 98.6],
  ["medical-record-intake", "استلام الملف الصحي وشهادة التطعيم", "Medical Record Intake", "العيادة المدرسية", 4, 90.2],
  ["parent-complaint-triage", "فرز شكاوى أولياء الأمور وتوجيهها", "Parent Complaint Triage", "خدمة أولياء الأمور", 3, 85.9],
  ["transcript-issuance", "إصدار كشف الدرجات الرسمي", "Official Transcript Issuance", "شؤون الطلاب", 5, 95.5],
  ["teacher-onboarding", "إجراءات تعيين معلم جديد", "Teacher Onboarding", "الموارد البشرية", 2, 82.4],
  ["substitute-assignment", "تعيين معلم بديل لحصة شاغرة", "Substitute Teacher Assignment", "الشؤون الأكاديمية", 6, 99.1],
  ["uniform-order", "طلب الزي المدرسي وتسليمه", "Uniform Order Fulfilment", "المشتريات", 6, 97.8],
  ["exam-seating-plan", "توزيع قاعات الاختبارات النهائية", "Exam Seating Plan", "الشؤون الأكاديمية", 4, 89.3],
  ["withdrawal-clearance", "إخلاء طرف طالب منسحب", "Student Withdrawal Clearance", "القبول والتسجيل", 3, 87.6],
  ["scholarship-eligibility", "فحص أهلية المنحة الدراسية", "Scholarship Eligibility Check", "الشؤون المالية", 2, 84.1],
  ["field-trip-consent", "جمع موافقات الرحلات المدرسية", "Field Trip Consent Collection", "الأنشطة الطلابية", 6, 98.9],
];

function syntheticSkills(): Skill[] {
  const random = makeRandom(0x5a1e);
  const base = clone(initialSkills);
  const template = base[0];
  const extras: Skill[] = EXTRA_SKILLS.map(([slug, name, nameEn, department, autonomyLevel, reliability], index) => {
    const usageCount = 40 + Math.floor(random() * 460);
    const tier: Skill["reliabilityTier"] =
      reliability >= 95 ? "verified" : reliability >= 90 ? "high" : reliability >= 85 ? "medium" : "low";
    return {
      ...clone(template),
      id: `sk_demo_${slug.replace(/-/g, "_")}`,
      slug,
      name,
      nameEn,
      category: department,
      department,
      purpose: `${name} — إجراء موثّق في عقل المؤسسة، ينفّذه نهج ضمن الصلاحيات المعتمدة ويتوقف عند أي قرار يحتاج بشرًا.`,
      autonomyLevel: autonomyLevel as Skill["autonomyLevel"],
      status: index === EXTRA_SKILLS.length - 1 ? "draft" : "active",
      reliabilityScore: reliability,
      reliabilityTier: tier,
      riskLevel: RISKS[index % RISKS.length],
      activeVersion: 1 + (index % 4),
      ownerName: demoUsers[index % demoUsers.length].name,
      isSinglePointOfFailure: index % 7 === 0,
      usageCount,
      successRate: Number((92 + random() * 7.5).toFixed(1)),
      humanTakeoverRate: Number((random() * 9).toFixed(1)),
      avgDurationMinutes: Number((2 + random() * 11).toFixed(1)),
      hoursSavedTotal: Number((usageCount * (0.08 + random() * 0.22)).toFixed(1)),
      killSwitchActive: false,
    } as Skill;
  });
  return [...base, ...extras];
}

function syntheticWorkItems(skills: Skill[]): WorkItem[] {
  const random = makeRandom(0x7c3f);
  const base = clone(initialWorkItems);
  const generated: WorkItem[] = Array.from({ length: 140 }, (_, index) => {
    const skill = skills[index % skills.length];
    const first = FIRST_NAMES[index % FIRST_NAMES.length];
    const family = FAMILY_NAMES[(index * 3) % FAMILY_NAMES.length];
    const guardianFirst = FIRST_NAMES[(index * 7 + 4) % FIRST_NAMES.length];
    const [grade, fee] = GRADES[index % GRADES.length];
    const state = STATES[index % STATES.length];
    const hour = 8 + (index % 9);
    const minute = (index * 13) % 60;
    const stamp = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "م" : "ص"}`;
    const dayOffset = Math.floor(index / 12);
    const day = dayOffset === 0 ? "اليوم" : dayOffset === 1 ? "أمس" : `قبل ${dayOffset} أيام`;
    const progress = state === "completed" ? 100 : state === "queued" ? 5 : 20 + Math.floor(random() * 70);
    return {
      id: `wi_demo_${2000 + index}`,
      code: `${skill.department === "الشؤون المالية" ? "FIN" : skill.department === "النقل المدرسي" ? "TRN" : "ADM"}-${2000 + index}`,
      title: `${skill.name}: ${first} ${family} (${grade})`,
      skillId: skill.id,
      skillName: skill.name,
      contactName: `${guardianFirst} ${family} (ولي الأمر)`,
      contactPhone: `+965 9${String(100000 + ((index * 7919) % 899999)).slice(0, 3)} ${String(1000 + ((index * 131) % 8999))}`,
      state,
      riskLevel: RISKS[(index * 5) % RISKS.length],
      assignedMode: index % 11 === 0 ? "human_takeover" : "ai",
      createdAt: `${day}، ${stamp}`,
      updatedAt: `${day}، ${String(hour).padStart(2, "0")}:${String((minute + 17) % 60).padStart(2, "0")} ${hour >= 12 ? "م" : "ص"}`,
      progressPercent: progress,
      currentStepTitle:
        state === "waiting_approval" ? "بانتظار اعتماد المسؤول قبل تنفيذ الإجراء المالي"
        : state === "waiting_documents" ? "بانتظار رفع المستندات الناقصة من ولي الأمر"
        : state === "escalated" ? "تم التصعيد إلى موظف بشري لوجود حالة خارج الإجراء الموثّق"
        : state === "completed" ? "اكتمل الإجراء وأُرسل الإشعار الرسمي"
        : state === "executing" ? "تنفيذ الخطوات المعتمدة على الأنظمة المرتبطة"
        : state === "collecting_data" ? "جمع بيانات الطالب والتحقق منها"
        : "في قائمة الانتظار — لم يبدأ التنفيذ بعد",
      details: {
        studentName: `${first} ${family}`,
        gradeAssigned: grade,
        tuitionFeeKwd: fee,
        registrationFeeKwd: 50,
        academicYear: "2026/2027",
        civilIdVerified: index % 6 !== 0,
        missingDocs: index % 6 === 0 ? ["شهادة التطعيم (تم طلبها)"] : [],
      },
      timeline: [
        { time: stamp, actor: "ai", title: "استلام الطلب وتحديد الإجراء الموثّق", details: `تم ربط الطلب بمهارة «${skill.name}».`, badge: "Intent Identified" },
        { time: stamp, actor: "ai", title: "التحقق من المصدر المعتمد", details: "قراءة البيانات من نظام SIS دون تخمين أي رقم.", badge: "Policy Enforced" },
        ...(state === "waiting_approval"
          ? [{ time: stamp, actor: "system" as const, title: "توقّف عند حد الصلاحية", details: "الإجراء المالي يتجاوز الحد المسموح للتنفيذ الآلي.", badge: "Approval Required" }]
          : []),
        ...(state === "completed"
          ? [{ time: stamp, actor: "ai" as const, title: "اكتمال الإجراء", details: "أُرسل الإشعار الرسمي إلى ولي الأمر وسُجّل الأثر كاملًا.", badge: "Completed" }]
          : []),
      ],
    } as WorkItem;
  });
  return [...base, ...generated];
}

function syntheticApprovals(workItems: WorkItem[]): ApprovalRequest[] {
  const base = clone(initialApprovalRequests);
  const waiting = workItems.filter(item => item.state === "waiting_approval");
  const generated: ApprovalRequest[] = waiting.map((item, index) => ({
    id: `apr_demo_${index + 1}`,
    workItemId: item.id,
    workTitle: item.title,
    actionName: index % 3 === 0 ? "sendPaymentLink" : index % 3 === 1 ? "applyFeeDiscount" : "confirmSeatReservation",
    payload: { amountKwd: item.details.tuitionFeeKwd, grade: item.details.gradeAssigned, student: item.details.studentName },
    reasonCode: index % 3 === 0 ? "POL-FIN-02" : index % 3 === 1 ? "POL-FIN-07" : "POL-ADM-04",
    reasonDescription:
      index % 3 === 0 ? "إصدار رابط سداد رسمي يتجاوز حد التنفيذ الآلي ويحتاج اعتماد المسؤول."
      : index % 3 === 1 ? "تطبيق خصم على الرسوم لا يُعتمد آليًا مهما بلغت موثوقية المهارة."
      : "حجز مقعد نهائي في شعبة قاربت على الاكتمال.",
    riskLevel: item.riskLevel,
    requiredRole: index % 4 === 0 ? "owner" : "manager",
    requestedAt: item.updatedAt,
    // Most of the board is settled history; a handful stay open so the reviewer
    // has something real to act on during the walkthrough.
    status: index < 6 ? "pending" : index % 5 === 0 ? "rejected" : "approved",
    ...(index >= 6 ? { decidedBy: demoUsers[index % demoUsers.length].name, decidedAt: item.updatedAt } : {}),
  })) as ApprovalRequest[];
  return [...base, ...generated];
}

const AUDIT_ACTIONS: ReadonlyArray<readonly [string, string, AuditEvent["status"], RiskLevel]> = [
  ["getOfficialFees", "قراءة الرسوم من جدول SIS المعتمد", "success", "low"],
  ["checkSeatAvailability", "الاستعلام عن المقاعد المتاحة في الشعبة", "success", "low"],
  ["verifyCivilIdQuality", "فحص جودة البطاقة المدنية والتحقق من صلاحيتها", "success", "medium"],
  ["sendPaymentLink", "إصدار رابط سداد رسمي بعد اعتماد المسؤول", "success", "high"],
  ["applyFeeDiscount", "محاولة تطبيق خصم دون اعتماد", "intercepted", "high"],
  ["answerOutsidePolicy", "سؤال خارج نطاق المصادر الموثّقة", "intercepted", "medium"],
  ["bookCampusTour", "حجز موعد جولة مدرسية", "success", "low"],
  ["createApplicationRecord", "إنشاء سجل طلب تسجيل في SIS", "success", "medium"],
  ["escalateToHuman", "تصعيد الحالة إلى موظف بشري", "warning", "medium"],
  ["assignBusRoute", "تخصيص خط حافلة حسب عنوان السكن", "success", "low"],
  ["issueTranscript", "إصدار كشف درجات رسمي موقّع", "success", "medium"],
  ["notifyAbsence", "إشعار ولي الأمر بالغياب المتكرر", "success", "low"],
  ["reconcileInstallment", "تسوية دفعة تقسيط مع النظام المالي", "warning", "high"],
  ["rejectUnverifiedDoc", "رفض مستند غير مقروء وطلب بديل", "success", "low"],
];

function syntheticAudit(): AuditEvent[] {
  const random = makeRandom(0x1f5d);
  const base = clone(initialAuditEvents);
  const generated: AuditEvent[] = Array.from({ length: 220 }, (_, index) => {
    const [action, details, status, risk] = AUDIT_ACTIONS[index % AUDIT_ACTIONS.length];
    const hour = 7 + (index % 11);
    const minute = (index * 17) % 60;
    const dayOffset = Math.floor(index / 22);
    const day = dayOffset === 0 ? "اليوم" : dayOffset === 1 ? "أمس" : `قبل ${dayOffset} أيام`;
    const human = index % 9 === 0;
    return {
      id: `aud_demo_${index + 1}`,
      timestamp: `${day}، ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "م" : "ص"}`,
      actorType: human ? "human" : status === "intercepted" ? "system" : "ai",
      actorName: human ? demoUsers[index % demoUsers.length].name : status === "intercepted" ? "محرك السياسات" : "نهج",
      action,
      policyCode: status === "intercepted" ? "POL-FIN-02" : index % 4 === 0 ? "POL-ADM-01" : undefined,
      provenance: status === "intercepted" ? "Policy Engine Interception" : "Verified Source (SIS)",
      risk,
      latencyMs: 120 + Math.floor(random() * 2400),
      details,
      status,
    } as AuditEvent;
  });
  return [...generated, ...base];
}

function syntheticTestCases(skills: Skill[]): TestCase[] {
  const random = makeRandom(0x2b77);
  const base = clone(initialTestCases);
  const generated: TestCase[] = Array.from({ length: 60 }, (_, index) => {
    const skill = skills[index % skills.length];
    const failing = index % 13 === 0;
    return {
      id: `tc_demo_${index + 1}`,
      name: `${skill.name} — حالة اختبار ${Math.floor(index / skills.length) + 1}`,
      scenario:
        index % 3 === 0 ? "ولي أمر يطلب خصمًا غير معتمد على الرسوم."
        : index % 3 === 1 ? "بيانات الطالب ناقصة والمستند غير مقروء."
        : "طلب اعتيادي مكتمل البيانات ضمن الإجراء الموثّق.",
      expectedAction: index % 3 === 0 ? "requestApproval" : index % 3 === 1 ? "requestDocument" : skill.allowedActions?.[0] || "executeStep",
      expectedStatus: "pass",
      resultStatus: failing ? "fail" : "pass",
      executionTimeMs: 200 + Math.floor(random() * 1800),
      ...(failing ? { discrepancy: "نفّذ نهج الخطوة دون التوقف عند حد الصلاحية المالي المعتمد." } : {}),
    } as TestCase;
  });
  return [...base, ...generated];
}

function syntheticShadow(workItems: WorkItem[]): ShadowComparison[] {
  const random = makeRandom(0x3e91);
  const base = clone(initialShadowComparisons);
  const generated: ShadowComparison[] = Array.from({ length: 48 }, (_, index) => {
    const item = workItems[(index * 3) % workItems.length];
    const matched = index % 9 !== 0;
    return {
      id: `sh_demo_${index + 1}`,
      caseTitle: item.title,
      timestamp: item.updatedAt,
      humanAction: matched ? "طلب الاعتماد قبل إصدار رابط السداد" : "منح استثناء يدوي لولي أمر قديم",
      humanReason: matched ? "الإجراء المالي يتجاوز الحد المسموح." : "قرار شخصي غير موثّق في أي سياسة معتمدة.",
      aiAction: matched ? "طلب الاعتماد قبل إصدار رابط السداد" : "رفض الاستثناء وطلب اعتماد المسؤول",
      aiReason: matched ? "مطابقة السياسة POL-FIN-02." : "لا يوجد سند في المصادر الموثّقة لمنح الاستثناء.",
      matched,
      driftDetected: !matched,
      workItemId: item.id,
      confidence: Number((matched ? 0.9 + random() * 0.09 : 0.55 + random() * 0.2).toFixed(2)),
      ...(matched ? {} : { divergenceReason: "انحراف بشري عن الإجراء الموثّق — مرشح لمراجعة السياسة." }),
    } as ShadowComparison;
  });
  return [...base, ...generated];
}

export interface DemoSandboxSeed {
  organization: ReturnType<typeof clone<typeof initialOrganization>>;
  users: typeof demoUsers;
  knowledgeSources: typeof initialKnowledgeSources;
  policies: typeof initialPolicies;
  skills: Skill[];
  learningProposals: typeof initialLearningProposals;
  workItems: WorkItem[];
  approvalRequests: ApprovalRequest[];
  auditEvents: AuditEvent[];
  connectors: typeof initialConnectors;
  testCases: TestCase[];
  shadowComparisons: ShadowComparison[];
}

/** A fresh, self-contained dataset. Called once per demo session, and again on reset. */
export function createDemoSandboxSeed(): DemoSandboxSeed {
  const skills = syntheticSkills();
  const workItems = syntheticWorkItems(skills);
  const activeSkills = skills.filter(skill => skill.status === "active").length;
  return {
    organization: {
      ...clone(initialOrganization),
      verifiedSkillsCount: activeSkills,
      hoursSavedMonth: Number(skills.reduce((sum, skill) => sum + (skill.hoursSavedTotal || 0), 0).toFixed(1)),
    },
    users: clone(demoUsers),
    knowledgeSources: clone(initialKnowledgeSources),
    policies: clone(initialPolicies),
    skills,
    learningProposals: clone(initialLearningProposals),
    workItems,
    approvalRequests: syntheticApprovals(workItems),
    auditEvents: syntheticAudit(),
    connectors: clone(initialConnectors),
    testCases: syntheticTestCases(skills),
    shadowComparisons: syntheticShadow(workItems),
  };
}
