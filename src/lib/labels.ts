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
  if (!ar) return raw;
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
export function provenanceLabel(value: string, ar: boolean): string {
  const raw = String(value || "");
  if (!ar) return raw;
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
export const actorLabel = lookup(ACTOR_AR);
