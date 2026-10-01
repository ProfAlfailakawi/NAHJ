/*
 * تسمياتٌ عربية لرموز النظام.
 *
 * «POL-FIN-02_HIGH_VALUE_THRESHOLD» و«high» تُكتب للمهندس لا للمعتمِد. الرمز
 * يبقى في السجل وفي تلميحٍ لمن يحتاجه، والمعروض جملةٌ تُقرأ.
 */

export const RISK_LABEL_AR: Record<string, string> = {
  low: "خطورة منخفضة",
  medium: "خطورة متوسطة",
  high: "خطورة عالية",
  critical: "خطورة حرجة",
};

export const RISK_LABEL_EN: Record<string, string> = {
  low: "Low risk", medium: "Medium risk", high: "High risk", critical: "Critical risk",
};

export const riskLabel = (risk: string, ar: boolean) =>
  (ar ? RISK_LABEL_AR : RISK_LABEL_EN)[risk] || risk;

/* من الأخصّ إلى الأعمّ: أول بادئة تطابق تُعتمد. */
const REASON_PREFIXES: [RegExp, string, string][] = [
  [/^CMP-MED-REDACT/, "حجب بيانات المريض", "Patient-data redaction"],
  [/^CMP-LAW-CONFLICT-UNCHECKED/, "تعارض مصالح لم يُفحص", "Conflict check not possible"],
  [/^CMP-LAW-CONFLICT/, "تعارض مصالح", "Conflict of interest"],
  [/^CMP-RET-CASH/, "تجاوز حدّ النقد", "Cash limit exceeded"],
  [/REFUND/, "استرداد مبلغ يحتاج اعتماداً", "Refund needs approval"],
  [/HIGH_VALUE/, "مبلغ يتجاوز حدّ الصلاحية المالية", "Amount above financial authority"],
  [/^POL-FIN/, "لائحة الصلاحيات المالية", "Financial authority policy"],
  [/UNVERIFIED_CIVIL_ID|^POL-DOC/, "مستند غير متحقَّق منه", "Unverified document"],
  [/^POL-MED/, "سياسة طبية", "Medical policy"],
  [/^POL-LAW|^POL-LEG/, "سياسة قانونية", "Legal policy"],
  [/^POL-RET|^POL-POS/, "سياسة البيع", "Retail policy"],
  [/APPROVED_POLICY_STANDARD/, "إجراء قياسي ضمن الصلاحيات", "Standard in-policy action"],
  [/^POL-/, "قاعدة سياسة", "Policy rule"],
];

export function reasonLabel(code: string, ar: boolean): string {
  const value = String(code || "");
  for (const [pattern, arLabel, enLabel] of REASON_PREFIXES) if (pattern.test(value)) return ar ? arLabel : enLabel;
  return ar ? "قاعدة اعتماد" : "Approval rule";
}

export const ROLE_LABEL_AR: Record<string, string> = {
  owner: "المالك", admin: "المشرف", manager: "المدير", employee: "الموظف", operator: "الموظف", auditor: "المدقّق", viewer: "المشاهد",
};

/*
 * تسمياتُ عرضٍ لقيمٍ إنجليزية تصل من البيانات كما هي.
 *
 * الخريطة للعرض وحده: المفتاح والقيمة المخزّنة لا يتغيّران، وما لا تعرفه
 * الخريطة يظهر كما وصل — فلا يختفي شيءٌ لأن ترجمته لم تُكتب بعد.
 */
const lookup = (map: Record<string, string>) => (value: string | undefined | null, ar = true): string => {
  const raw = String(value ?? "");
  return (ar && map[raw]) || raw;
};

export const CONNECTOR_TYPE_AR: Record<string, string> = {
  database: "قاعدة بيانات",
  sis: "نظام السجلات",
  system_sis: "نظام السجلات",
  calendar: "التقويم",
  payment: "الدفع",
  crm: "إدارة العملاء",
  storage: "التخزين",
  whatsapp: "واتساب",
  cloud: "خدمة سحابية",
};
export const connectorTypeLabel = lookup(CONNECTOR_TYPE_AR);

export const TIMELINE_BADGE_AR: Record<string, string> = {
  "Intent Identified": "تحديد الطلب",
  "SIS Checked": "تحقّق من السجلات",
  "Policy Enforced": "طُبّقت السياسة",
  "Tour Booked": "حُجزت الجولة",
  "Approval Required": "يحتاج اعتماداً",
  "Approved & Executed": "اعتُمد ونُفّذ",
  "Human Takeover": "استلام بشري",
  "AI Resumed": "عاد إلى نهج",
  Completed: "اكتمل",
  Booked: "حُجز",
  "Triage OK": "فرز سليم",
  Human: "موظف",
  Approval: "اعتماد",
  Coverage: "تغطية",
  Rejected: "مرفوض",
  Conflict: "تعارض",
  Deadline: "مهلة",
  Tracking: "تتبّع",
  Delay: "تأخير",
  Closed: "أُغلق",
  Dispatch: "إرسال فنّي",
  Auto: "آلي",
};
export const timelineBadgeLabel = lookup(TIMELINE_BADGE_AR);

export const FIELD_LABEL_AR: Record<string, string> = {
  studentName: "اسم الطالب",
  student: "الطالب",
  grade: "الصف",
  academicYear: "العام الدراسي",
  totalTuitionKwd: "إجمالي الرسوم (د.ك)",
  fileOpeningFeeKwd: "رسوم فتح الملف (د.ك)",
  interviewDate: "موعد المقابلة",
  amountKwd: "المبلغ (د.ك)",
  patient: "المريض",
  procedure: "الإجراء",
  copayKwd: "مبلغ التحمّل (د.ك)",
  contact: "جهة التواصل",
  client: "العميل",
  cases: "عدد القضايا",
  feeKwd: "الأتعاب (د.ك)",
  damagedUnits: "الوحدات التالفة",
  tenant: "المستأجر",
  clause: "البند",
  rentKwd: "الإيجار (د.ك)",
  order: "الطلب",
  customer: "العميل",
  civilId: "الرقم المدني",
  phone: "الهاتف",
  dateOfBirth: "تاريخ الميلاد",
  diagnosis: "التشخيص",
  fileNumber: "رقم الملف",
};
export const fieldLabel = lookup(FIELD_LABEL_AR);

export const ACTION_LABEL_AR: Record<string, string> = {
  APPROVE_ACTION_EXECUTION: "اعتماد وتنفيذ",
  REJECT_ACTION_EXECUTION: "رفض طلب",
  PROMOTE_SKILL_AUTONOMY: "تغيير مستوى الاستقلالية",
  ROLLBACK_SKILL_VERSION: "استرجاع إصدار مهارة",
  KILL_SWITCH_ENGAGED: "إيقاف مهارة",
  KILL_SWITCH_DISENGAGED: "استئناف مهارة",
  EMERGENCY_PAUSE_AUTOPILOT: "إيقاف طارئ للتنفيذ الآلي",
  EMERGENCY_RESUME_AUTOPILOT: "استئناف بعد الإيقاف الطارئ",
  HUMAN_TAKEOVER: "استلام بشري",
  RESUME_AI_EXECUTION: "إعادة التنفيذ إلى نهج",
  RUN_SHADOW_COMPARISON: "مقارنة الظل",
  ASSIGN_SKILL_BACKUP: "إسناد بديل لمهارة",
  UPDATE_SKILL_TRANSLATION: "تحديث النص الإنجليزي",
  ORGANIZATION_CONFIGURED: "إعداد المؤسسة",
  APPLY_SECTOR_PACK: "تطبيق حزمة القطاع",
  REQUEST_APPROVAL: "طلب اعتماد",
  BOOK_CALENDAR_SLOT: "حجز موعد في التقويم",
  VERIFY_DOCUMENT_QUALITY: "فحص جودة المستند",
  QUERY_SIS_SEAT_CAPACITY: "استعلام المقاعد المتاحة",
  POLICY_INTERCEPT: "إيقاف بقاعدة سياسة",
  APPROVAL_REJECTED: "رُفض الاعتماد",
  WORK_EVENT: "حدث في معاملة",
  HUMAN: "تدخّل موظف",
  APPROVAL: "طلب اعتماد",
  BOOKED: "حجز",
  TRIAGE_OK: "فرز سليم",
  COVERAGE: "مطابقة التغطية",
  CONFLICT: "تعارض مصالح",
  DEADLINE: "مهلة إجرائية",
  TRACKING: "تتبّع شحنة",
  DELAY: "تأخّر شحنة",
  CLOSED: "إغلاق طلب",
  DISPATCH: "إرسال فنّي",
  AUTO: "تنفيذ آلي",
  EXPORT_FULL_STATE: "تصدير البيانات",
  EXPORT_LEDGER: "تصدير السجل",
  RUN_BACKUP: "نسخ احتياطي",
  START_TEACH_AI_SESSION: "بدء جلسة تعليم",
  SYNTHESIZE_TAUGHT_SKILL: "صياغة مهارة من الشرح",
  APPROVE_AND_CODIFY_TAUGHT_SKILL: "اعتماد مهارة مُعلَّمة",
  EXECUTE_PRACTICE_EVALS: "تشغيل التدرّب",
  RESOLVE_CLARIFICATION_RULE: "حسم قاعدة توضيح",
  REGISTER_MCP_SERVER: "تسجيل خادم MCP",
  getOfficialFees: "جلب الرسوم المعتمدة",
  checkSeatAvailability: "فحص المقاعد المتاحة",
  verifyCivilIdQuality: "فحص صورة البطاقة المدنية",
  sendPaymentLink: "إرسال رابط الدفع",
  applyFeeDiscount: "تطبيق خصم على الرسوم",
  answerOutsidePolicy: "ردّ خارج السياسة",
  bookCampusTour: "حجز جولة تعريفية",
  createApplicationRecord: "إنشاء ملف طلب",
  escalateToHuman: "تحويل إلى موظف",
  assignBusRoute: "تخصيص خط الحافلة",
  issueTranscript: "إصدار كشف درجات",
  notifyAbsence: "إشعار غياب",
  reconcileInstallment: "مطابقة قسط",
  rejectUnverifiedDoc: "رفض مستند غير متحقَّق",
  verifyIdentity: "التحقق من الهوية",
  verifyCoverage: "مطابقة التغطية",
  notifyPatient: "إشعار المريض",
  notifyPatientOfCopay: "إبلاغ المريض بمبلغ التحمّل",
  createAppointment: "إنشاء موعد",
  routeToReception: "تحويل إلى الاستقبال",
  checkAvailability: "فحص المواعيد المتاحة",
  submitClaim: "تقديم مطالبة",
  computeFee: "احتساب الأتعاب",
  computeDeadline: "احتساب المهلة",
  classifyMatter: "تصنيف القضية",
  classifyConflict: "تصنيف التعارض",
  draftAppealSkeleton: "مسودة هيكل الاستئناف",
  searchParties: "البحث عن الأطراف",
  prepareMemo: "إعداد مذكرة",
  scheduleReminder: "جدولة تذكير",
  sendFeeQuote: "إرسال عرض الأتعاب",
  validateClaim: "التحقق من المطالبة",
  readInvoice: "قراءة الفاتورة",
  computeEta: "احتساب موعد الوصول",
  submitForReview: "رفع للمراجعة",
  checkRestricted: "فحص المواد المقيّدة",
  lookupShipment: "الاستعلام عن شحنة",
  escalate: "تصعيد",
  notifyCustomer: "إشعار العميل",
  classifyTariff: "تصنيف البند الجمركي",
  approveDamageCompensation: "اعتماد تعويض التلف",
  bookViewing: "حجز معاينة",
  escalateEmergency: "تصعيد طارئ",
  sendReminder: "إرسال تذكير",
  verifyTenant: "التحقق من المستأجر",
  notifyTenant: "إشعار المستأجر",
  notifyProspect: "إشعار العميل المحتمل",
  scheduleTechnician: "جدولة فنّي",
  generateLease: "إعداد عقد الإيجار",
  amendLeaseClause: "تعديل بند في العقد",
  classifyFault: "تصنيف العطل",
  escalateToFinance: "تحويل إلى المالية",
  validatePricing: "مطابقة السعر",
  updateAddress: "تحديث العنوان",
  draftPurchaseOrder: "مسودة أمر شراء",
  detectAllergenQuestion: "رصد سؤال حساسية",
  issueRefund: "إصدار استرداد",
  validateReturn: "التحقق من الإرجاع",
  lookupOrder: "الاستعلام عن طلب",
  readInventory: "قراءة المخزون",
  routeToQuality: "تحويل إلى الجودة",
};

/* «POL_MED_02» حدثٌ سُمّي برمز قاعدته: يُعرض الرمز بصيغته المعتادة بعد كلمة «قاعدة». */
export function actionLabel(action: string, ar: boolean): string {
  const raw = String(action || "");
  /* الإنجليزية: «RUN_SHADOW_COMPARISON» → «Run shadow comparison» — لا رمزٌ خام على شاشة قارئ. */
  if (!ar) return /^[A-Z][A-Z0-9_]+$/.test(raw) ? raw.charAt(0) + raw.slice(1).toLowerCase().replace(/_/g, " ") : raw;
  if (ACTION_LABEL_AR[raw]) return ACTION_LABEL_AR[raw];
  if (/^POL_[A-Z]+_\d+$/.test(raw)) return `قاعدة ${raw.replace(/_/g, "-")}`;
  return raw;
}

const SECTOR_NAME_AR: Record<string, string> = {
  education: "تعليم ومدارس",
  clinic: "عيادة ومركز طبي",
  law: "مكتب محاماة",
  logistics: "شحن ولوجستيات",
  realestate: "عقارات وإدارة أملاك",
  retail: "تجزئة ومطاعم",
};

export const PROVENANCE_AR: Record<string, string> = {
  "Verified Source (SIS)": "مصدر موثّق (نظام السجلات)",
  "Policy Engine Interception": "إيقاف من محرّك السياسات",
  "Future SIS + Admission Policy v2.4": "نظام السجلات ولائحة القبول v2.4",
  "School Calendar Connector v1.2": "موصل تقويم المدرسة v1.2",
  "Civil ID Matrix & Ministry Standards": "معايير البطاقة المدنية والوزارة",
  "SIS Billing & Capacity Live API": "واجهة الرسوم والمقاعد في نظام السجلات",
  "Manager Approval Decision Gate": "بوابة قرار المدير",
  "Work Item Interruption Switch": "مفتاح استلام المعاملة",
  "Teach Mode Review Gate": "بوابة مراجعة التعليم",
  "Manual Resumption Control": "استئناف يدوي",
  "Learn Feed Resolution Gate": "بوابة حسم المقترحات",
  "Explicit Demonstration Mode (Authorized)": "وضع العرض (مصرَّح)",
};
const PROVENANCE_EN: Record<string, string> = {
  "محرّك التقييم + محرّك السياسات": "Evaluation engine + policy engine",
  "محرّك التقييم + قرارات الموظفين المسجَّلة": "Evaluation engine + recorded staff decisions",
  "تصدير البيانات": "Data export", "نسخة احتياطية": "Backup", "خريطة الاعتماد على الأشخاص": "People dependency map",
  "دليل الإجراء ثنائي اللغة": "Bilingual procedure manual",
};
export function provenanceLabel(value: string, ar: boolean): string {
  const raw = String(value || "");
  if (!ar) {
    if (PROVENANCE_EN[raw]) return PROVENANCE_EN[raw];
    const sector = /^حزمة القطاع: (\w+)$/.exec(raw);
    return sector ? `Sector pack: ${sector[1]}` : raw;
  }
  if (PROVENANCE_AR[raw]) return PROVENANCE_AR[raw];
  const pack = /^حزمة القطاع: (\w+)$/.exec(raw);
  if (pack && SECTOR_NAME_AR[pack[1]]) return `حزمة القطاع: ${SECTOR_NAME_AR[pack[1]]}`;
  return raw;
}

export const ACTOR_AR: Record<string, string> = {
  "NAHJ Learning Engine": "محرّك التعلّم في نهج",
  "Campus Tour Subskill": "مهارة الجولة التعريفية",
  "Vision OCR Engine": "محرّك قراءة المستندات",
  "Skill Executor": "منفّذ المهارات",
};
const ACTOR_EN: Record<string, string> = {
  "نهج": "NAHJ", "محرك السياسات": "Policy engine", "محرّك السياسات": "Policy engine", "النظام": "System",
  "زائر العرض": "Demo visitor", "محرّك التقييم": "Evaluation engine", "موظف": "Staff member",
};
export const actorLabel = (value: string | undefined | null, ar = true): string => {
  const raw = String(value ?? "");
  return ar ? ACTOR_AR[raw] || raw : ACTOR_EN[raw] || raw;
};

/*
 * أساس القياس بالإنجليزية.
 *
 * يكتب المحرّك أساس كل رقم جملةً عربية ثابتة. في الواجهة الإنجليزية كانت تظهر عربيةً بين
 * أرقامٍ إنجليزية، فيُترجَم هنا بمطابقة النص كما هو. ما لا يُعرف يبقى كما جاء — لا يُخترع.
 */
export const MEASURE_BASIS_EN: Record<string, string> = {
  "مجموع مرات تنفيذ كل مهارة موثّقة منذ اعتمادها.": "Total executions of every documented skill since it was approved.",
  "مجموع الساعات المستعادة المسجَّلة على المهارات.": "Sum of recovered hours recorded on the skills.",
  "نسبة النجاح مرجَّحة بعدد مرات التنفيذ لا بعدد المهارات.": "Success rate weighted by number of executions, not number of skills.",
  "المتمّم لنسبة النجاح المرجَّحة.": "The complement of the weighted success rate.",
  "نسبة الحالات التي استلمها موظف، مرجَّحة بالتنفيذ.": "Share of cases a staff member took over, weighted by executions.",
  "متوسط مدّة العملية بالدقائق، مرجَّحاً بالتنفيذ.": "Average process duration in minutes, weighted by executions.",
  "حصّة التنفيذ الذي تحمله مهارات عند مستوى التحضير (L4) فما فوق.": "Share of executions carried by skills at Prepare level (L4) or above.",
  "نسبة تطابق قرار نهج مع قرار الموظف في جلسات الظل.": "How often NAHJ's decision matched the employee's in shadow sessions.",
  "نسبة اجتياز حالات الاختبار التي نُفّذت فعلاً.": "Pass rate of the test cases that were actually run.",
  "حصّة المهارات الموثّقة التي بلغت التشغيل الحيّ.": "Share of documented skills that reached live operation.",
  "سياسات سارية المفعول في تاريخ اليوم.": "Policies in force as of today.",
  "الأدوار البشرية المتمايزة التي يتوقّف عندها التنفيذ.": "Distinct human roles at which execution stops.",
  "طلبات موافقة تنتظر قراراً.": "Approval requests awaiting a decision.",
  "طلبات بُتّ فيها اعتماداً أو رفضاً.": "Requests decided by approval or rejection.",
  "مهارات موقوفة بمفتاح إيقاف.": "Skills stopped by a kill switch.",
  "إجراءات اعترضتها السياسات قبل التنفيذ.": "Actions intercepted by policies before execution.",
  "إجراءات عالية الخطورة نفّذها الذكاء بلا موافقة مقابلة. كل موافقة معتمدة تُجيز تنفيذاً واحداً وتُستهلك — لا تُجيز ما بعده.":
    "High-risk actions the AI executed without a matching approval. Each approved request authorises one execution and is consumed; it does not authorise what follows.",
  "حصّة حالات العمل التي تحمل أثراً زمنياً قابلاً للمراجعة.": "Share of work cases that carry a reviewable time trail.",
  "مهارات موثّقة في عقل المؤسسة.": "Skills documented in the organisation's brain.",
  "مهارات تعمل حيّاً.": "Skills running live.",
  "مهارات يعتمد تنفيذها على شخص واحد.": "Skills whose execution depends on a single person.",
  "مهارات بلغت موثوقية 90% فأكثر ولم تُرقَّ بعد إلى مستوى التحضير.": "Skills with 90% reliability or more not yet promoted to Prepare level.",
  "غير مقيس — النظام لا يعرف ما لم يُعرض عليه. يحتاج اكتشافاً من الموصلات.": "Not measured: the system cannot know what it was never shown. It needs discovery from the connectors.",
  "أحداث مسجَّلة في سجلّ التدقيق بتاريخ اليوم — نشاطٌ لا إنجاز.": "Events recorded in the audit log today: activity, not accomplishment.",
};
export const measureBasis = (basis: string, ar: boolean): string =>
  ar ? basis : MEASURE_BASIS_EN[basis] || basis;

/** سبب غياب المنحنى: جملتان ثابتتان وثالثةٌ فيها تاريخ. */
export function trendReason(reason: string, ar: boolean): string {
  if (ar || !reason) return reason;
  if (reason.startsWith("لا سجلّ تدقيق بعد")) return "No audit log yet: the curve appears with the first activity.";
  const day = /\(([^)]+)\)/.exec(reason);
  return `All activity falls on a single day (${day ? day[1] : "—"}): the curve needs at least two days.`;
}

/** اسم اليوم بلغة الواجهة: الخادم يرسل التسمية بالعربية دائماً، والتاريخ نفسه (YYYY-MM-DD) هو الأصل. */
export function weekdayLabel(day: string, fallback: string, ar: boolean): string {
  if (ar) return fallback;
  const date = new Date(`${day}T12:00:00`);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleDateString("en-GB", { weekday: "long" });
}


/**
 * «أمس، 09:55 ص» كما يكتبها الخادم → «Yesterday, 09:55 AM» في الواجهة الإنجليزية.
 * ما لا يطابق النمط (تاريخٌ كامل مثلاً) يبقى كما جاء.
 */
export function stampLabel(value: string | undefined | null, ar: boolean): string {
  const raw = String(value ?? "");
  if (ar || !/[\u0600-\u06FF]/.test(raw)) return raw;
  return raw
    .replace(/^اليوم/, "Today").replace(/^أمس/, "Yesterday").replace(/^قبل يومين/, "2 days ago")
    .replace(/^قبل (\d+) أيام/, "$1 days ago").replace(/^قبل (\d+) يوما?ً?/, "$1 days ago")
    .replace(/،\s*/g, ", ").replace(/\s*ص$/, " AM").replace(/\s*م$/, " PM")
    .replace(/^الآن$/, "Now");
}

const LEDGER_EN: Record<string, string> = {
  "الفواتير": "Invoices", "الدفعات": "Payments", "سجلّ التدقيق": "Audit log",
  "عمولات المسوّقين": "Partner commissions", "المهارات": "Skills", "حالات العمل": "Work items",
};
export const ledgerLabel = (label: string, ar: boolean): string => (ar ? label : LEDGER_EN[label] || label);

/** حالة المزامنة التي يكتبها الخادم للموصلات المحاكاة. */
export const syncLabel = (value: string | undefined | null, ar: boolean): string => {
  const raw = String(value ?? "");
  return ar ? raw : raw === "محاكاة — لا مزامنة" ? "Simulated — no sync" : raw;
};

/** ملاحظة لقطة الاشتراك التجريبية. */
export const demoSnapshotNote = (note: string | undefined, ar: boolean): string =>
  ar || !note ? note || "" : /^أرقام الاشتراك هنا اصطناعية/.test(note)
    ? "Subscription figures here are synthetic. The demo environment neither reads nor writes the real billing ledger."
    : note;

/** وصف القطاع بالإنجليزية: الخادم يرسل العربية فقط. */
const SECTOR_DESC_EN: Record<string, string> = {
  education: "Enrolment, admissions, fees and student affairs: the seeded pack.",
  clinic: "Appointments, insurance, referrals and test results, under patient privacy.",
  law: "Cases, procedural deadlines, conflict checks and engagement fees.",
  retail: "Orders, refunds, inventory and customer complaints.",
  logistics: "Shipments, customs clearance, tracking and damage claims.",
  realestate: "Viewings, leases, collections and maintenance requests.",
};
const SECTOR_ORG_EN: Record<string, string> = {
  education: "Future International Academy", clinic: "Al-Shifa Specialist Centre", law: "Al-Mizan Law & Advisory",
  retail: "Al-Waha Stores", logistics: "Al-Masar Shipping", realestate: "Al-Dira Real Estate",
};
export const sectorDescription = (code: string, arabic: string, ar: boolean): string => (ar ? arabic : SECTOR_DESC_EN[code] || arabic);
export const sectorOrganization = (code: string, arabic: string, ar: boolean): string => (ar ? arabic : SECTOR_ORG_EN[code] || arabic);


/*
 * قرارات المحرّك بلغةٍ تُقرأ.
 *
 * يخرج المحرّك برمزٍ ثابت (REQUEST_DOCUMENT_BEFORE_BOOKING) لأن الرمز هو ما يُقارَن بقرار الموظف. أما
 * العرض فجملةٌ؛ والرمز يبقى في التلميح لمن يحتاجه. وعلى الهاتف كان الرمز الطويل يتقطّع في منتصف كلماته.
 */
export const DECISION_LABEL: Record<string, [string, string]> = {
  ANSWER_FROM_VERIFIED_SOURCES: ["إجابة من المصادر المعتمدة", "Answer from verified sources"],
  TREAT_AS_UNTRUSTED_DATA_ENFORCE_POLICY: ["معاملة النص بيانات غير موثوقة وتطبيق السياسة", "Treat as untrusted data, enforce policy"],
  REQUEST_DOCUMENT_BEFORE_BOOKING: ["طلب المستند قبل الحجز", "Request the document before booking"],
  REJECT_AUTOMATIC_REFUND_ESCALATE: ["رفض الاسترداد الآلي والرفع للاعتماد", "Reject automatic refund, escalate"],
  REQUEST_APPROVAL_REFUND: ["طلب اعتماد الاسترداد", "Request refund approval"],
  REJECT_OR_REDIRECT_NURSERY: ["رفض أو تحويل إلى الحضانة", "Reject or redirect to nursery"],
  ISSUE_REFUND: ["تنفيذ الاسترداد", "Issue the refund"],
  UNDECIDABLE: ["تعذّر القرار — وقائع غير كافية", "Undecidable: not enough facts"],
  MANUAL_EXCEPTION_OVERRIDE: ["استثناء يدوي خارج السياسة", "Manual exception outside policy"],
  MANUAL_BOOKING_OVERRIDE: ["حجز يدوي متجاوِز", "Manual booking override"],
  "bookCampusTour & requestApproval": ["حجز الجولة ورفع الرسم للاعتماد", "Book the tour and request approval"],
};
export const decisionLabel = (code: string | undefined | null, ar: boolean): string => {
  const raw = String(code ?? "");
  const hit = DECISION_LABEL[raw];
  return hit ? hit[ar ? 0 : 1] : raw;
};
