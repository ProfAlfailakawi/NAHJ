import type { SectorPack } from "./types.ts";

/*
 * عيادة / مركز طبي.
 *
 * ما يميّز هذا القطاع عن غيره ليس المصطلحات: خصوصية بيانات المريض تجعل أبسط
 * عملية — «أرسل نتيجة التحليل» — إجراءً عالي الخطورة يحتاج تحقّق هوية، بينما
 * نظيرها في التجزئة لا يحتاج شيئاً. ولهذا لا تُرفَّع مهارةٌ تمسّ نتيجة فحص إلى
 * التنفيذ الذاتي هنا مهما بلغت موثوقيتها.
 */
export const clinicPack: SectorPack = {
  code: "clinic",
  nameAr: "عيادة ومركز طبي",
  nameEn: "Clinic & Medical Centre",
  descriptionAr: "المواعيد، التأمين، التحويلات، ونتائج الفحوص — تحت خصوصية المريض.",

  organization: {
    name: "مركز الشفاء التخصصي",
    nameEn: "Al-Shifa Specialist Centre",
    industry: "الرعاية الصحية (Healthcare)",
    tagline: "العقل التشغيلي للمواعيد والتأمين وملفات المرضى",
    logo: "🩺",
  },

  people: [
    { name: "د. هيا ناصر", role: "manager", department: "الإدارة الطبية" },
    { name: "عبدالله فهد", role: "employee", department: "الاستقبال" },
    { name: "منى سعد", role: "employee", department: "التأمين والمطالبات" },
    { name: "طارق حمد", role: "auditor", department: "الالتزام والجودة" },
  ],

  sources: [
    { title: "نظام المعلومات الطبية (HIS)", type: "system_sis", authorityLevel: "live_authoritative", owner: "تقنية المعلومات", summary: "ملفات المرضى والمواعيد ونتائج الفحوص. المصدر الحيّ الوحيد المعتمد." },
    { title: "جدول تغطية شركات التأمين", type: "catalog", authorityLevel: "approved_data", owner: "التأمين والمطالبات", summary: "ما تغطيه كل شركة، ونسب التحمّل، والإجراءات التي تحتاج موافقة مسبقة." },
    { title: "بروتوكول خصوصية بيانات المريض", type: "approved_policy", authorityLevel: "approved_policy", owner: "الالتزام والجودة", summary: "من يطّلع على ماذا، وكيف يُتحقَّق من هوية طالب المعلومة." },
    { title: "دليل التحويل للطوارئ", type: "sop", authorityLevel: "approved_policy", owner: "الإدارة الطبية", summary: "علامات الخطر التي توجب تحويلاً فورياً بدل حجز موعد." },
  ],

  policies: [
    {
      code: "POL-MED-01", title: "لا نتيجة فحص بلا تحقّق هوية", titleEn: "No result without identity verification",
      riskLevel: "critical", approvedBy: "د. هيا ناصر",
      summary: "نتائج الفحوص لا تُسلَّم إلا لصاحبها بعد تحقّق مزدوج، ولا تُرسل عبر قناة نصّية.",
      rules: [
        { condition: "طلب نتيجة فحص عبر أي قناة", action: "تحقّق من الهوية برقم الملف وتاريخ الميلاد، ثم حوّل إلى موظف الاستقبال", explanation: "تسليم نتيجة لغير صاحبها خرقٌ لخصوصية المريض لا يُصحَّح بعد وقوعه." },
        { condition: "طلب نتيجة نيابةً عن مريض آخر", action: "ارفض وأحل إلى الإدارة الطبية", explanation: "التفويض الطبي يحتاج إثباتاً مكتوباً لا إقراراً شفهياً." },
      ],
    },
    {
      code: "POL-MED-02", title: "الأعراض الحرجة تُحوَّل ولا تُجدوَل", titleEn: "Critical symptoms escalate, never schedule",
      riskLevel: "critical", approvedBy: "د. هيا ناصر",
      summary: "ما يظهر فيه عَرَضٌ حرج يُحوَّل إلى الطوارئ فوراً، ولا يُعرض عليه موعد.",
      rules: [
        { condition: "ورود عَرَض من قائمة العلامات الحرجة", action: "أوقف الحجز وحوّل إلى الطوارئ وأبلغ الطبيب المناوب", explanation: "حجز موعد بعد أسبوع لمن يصف ألم صدر قد يكون قراراً قاتلاً." },
      ],
    },
    {
      code: "POL-MED-03", title: "الموافقة المسبقة للتأمين قبل الإجراء", titleEn: "Pre-authorization before procedure",
      riskLevel: "high", approvedBy: "منى سعد",
      summary: "الإجراءات التي تشترط موافقة مسبقة لا تُجدوَل قبل صدورها.",
      rules: [
        { condition: "إجراء ضمن قائمة الموافقة المسبقة", action: "قدّم المطالبة وانتظر الموافقة قبل تثبيت الموعد", explanation: "جدولة إجراء بلا موافقة تُحمّل المريض تكلفةً لم يوافق عليها." },
      ],
    },
  ],

  skills: [
    {
      slug: "appointment-booking", name: "حجز موعد وفرز أوّلي", nameEn: "Appointment booking & triage",
      category: "المواعيد", department: "الاستقبال", ownerName: "عبدالله فهد",
      purpose: "استقبال طلب الموعد، فرز الأعراض، ومطابقة التخصص والوقت المتاح.",
      riskLevel: "high", autonomyLevel: 3, status: "active",
      reliabilityScore: 91, usageCount: 240, successRate: 96, humanTakeoverRate: 6, avgDurationMinutes: 3.5, hoursSavedTotal: 38,
      steps: [
        { title: "استقبال الطلب وتحديد الشكوى", description: "قراءة وصف الحالة من المريض بلغته.", system: "قناة التواصل", automated: true },
        { title: "فرز العلامات الحرجة", description: "مطابقة الوصف بقائمة العلامات الحرجة المعتمدة.", system: "دليل التحويل للطوارئ", automated: true, decisionRule: "أي علامة حرجة توقف المسار وتحوّل فوراً." },
        { title: "مطابقة التخصص", description: "تحديد العيادة المناسبة من الشكوى.", system: "HIS", automated: true },
        { title: "عرض الأوقات المتاحة", description: "أقرب ثلاثة مواعيد لدى الطبيب المناسب.", system: "HIS", automated: true },
        { title: "تثبيت الموعد", description: "حجز الموعد وإرسال التأكيد.", system: "HIS", automated: true },
      ],
      decisions: [
        { condition: "عَرَض حرج", outcome: "تحويل فوري للطوارئ بلا حجز", risk: "critical" },
        { condition: "تخصص غير متوفر", outcome: "عرض تحويل خارجي بعد موافقة الإدارة الطبية", risk: "medium" },
      ],
      exceptions: [
        { scenario: "المريض قاصر ويطلب بنفسه", protocol: "يُطلب تواصل وليّ الأمر قبل أي تثبيت." },
        { scenario: "تكرار إلغاء ثلاث مرات", protocol: "يُحوَّل إلى الاستقبال لتأكيد الجدّية قبل الحجز الرابع." },
      ],
      allowedActions: ["checkAvailability", "createAppointment", "escalateToEmergency", "sendConfirmation"],
    },
    {
      slug: "insurance-claim", name: "مطالبة تأمين", nameEn: "Insurance claim",
      category: "التأمين", department: "التأمين والمطالبات", ownerName: "منى سعد",
      purpose: "التحقق من التغطية، احتساب التحمّل، وتقديم المطالبة.",
      riskLevel: "high", autonomyLevel: 2, status: "shadow",
      reliabilityScore: 78, usageCount: 86, successRate: 88, humanTakeoverRate: 18, avgDurationMinutes: 9, hoursSavedTotal: 14,
      singlePointOfFailure: true,
      steps: [
        { title: "قراءة بطاقة التأمين", description: "استخراج الشركة ورقم الوثيقة والفئة.", system: "HIS", automated: true },
        { title: "مطابقة التغطية", description: "هل الإجراء مغطّى، وبأي نسبة تحمّل.", system: "جدول تغطية شركات التأمين", automated: true },
        { title: "فحص الموافقة المسبقة", description: "هل يشترط الإجراء موافقة قبل التنفيذ.", system: "جدول تغطية شركات التأمين", automated: true, decisionRule: "الاشتراط يوقف الجدولة حتى صدور الموافقة." },
        { title: "تقديم المطالبة", description: "رفع المطالبة إلى بوابة شركة التأمين.", system: "بوابة التأمين" },
        { title: "إبلاغ المريض بالتحمّل", description: "إشعار بالمبلغ المتوقع قبل الإجراء.", system: "قناة التواصل" },
      ],
      decisions: [
        { condition: "الإجراء غير مغطّى", outcome: "إبلاغ المريض بالتكلفة كاملة قبل الجدولة", risk: "high" },
        { condition: "وثيقة منتهية", outcome: "إيقاف المطالبة وتحويل إلى موظف التأمين", risk: "medium" },
      ],
      allowedActions: ["verifyCoverage", "submitClaim", "notifyPatient"],
    },
    {
      slug: "result-release", name: "تسليم نتيجة فحص", nameEn: "Test result release",
      category: "الملفات الطبية", department: "الاستقبال", ownerName: "د. هيا ناصر",
      purpose: "التحقق من هوية طالب النتيجة قبل أي إفصاح.",
      riskLevel: "critical", autonomyLevel: 1, status: "practicing",
      reliabilityScore: 64, usageCount: 12, successRate: 83, humanTakeoverRate: 42, avgDurationMinutes: 4, hoursSavedTotal: 1.5,
      steps: [
        { title: "استقبال الطلب", description: "تسجيل طلب النتيجة ومصدره.", system: "قناة التواصل", automated: true },
        { title: "تحقّق مزدوج من الهوية", description: "رقم الملف وتاريخ الميلاد معاً.", system: "HIS", automated: true, decisionRule: "فشل أي طرف يوقف المسار." },
        { title: "تحويل إلى موظف الاستقبال", description: "التسليم يتم بشرياً دائماً.", system: "الاستقبال" },
      ],
      decisions: [
        { condition: "فشل التحقق", outcome: "رفض الإفصاح وتسجيل المحاولة في سجلّ التدقيق", risk: "critical" },
      ],
      exceptions: [
        { scenario: "طلب من قريب بلا تفويض", protocol: "رفض قاطع، وإحالة إلى الإدارة الطبية." },
      ],
      allowedActions: ["verifyIdentity", "routeToReception"],
    },
  ],

  connectors: [
    { name: "نظام المعلومات الطبية (HIS)", type: "sis", permissions: ["قراءة الملفات", "قراءة المواعيد", "إنشاء موعد"] },
    { name: "بوابة شركات التأمين", type: "crm", permissions: ["فحص التغطية", "تقديم مطالبة"] },
    { name: "تقويم الأطباء", type: "calendar", permissions: ["قراءة التوفّر", "حجز"] },
    { name: "قناة واتساب للمرضى", type: "whatsapp", permissions: ["استقبال", "إرسال تأكيد"] },
    { name: "أرشيف التقارير", type: "storage", permissions: ["قراءة"] },
  ],

  proposals: [
    {
      type: "conflict", title: "طريقتان مختلفتان لفرز ألم الصدر", titleEn: "Two conflicting triage paths for chest pain",
      confidence: 92, observedCasesCount: 17,
      summary: "موظفان يتعاملان مع شكوى ألم الصدر بطريقتين: أحدهما يحوّل فوراً، والآخر يسأل عن المدّة أولاً ثم يجدول.",
      evidence: {
        methodA: { name: "تحويل فوري للطوارئ", percentage: 65, durationMin: 1, errorRate: 0 },
        methodB: { name: "سؤال عن المدّة ثم جدولة", percentage: 35, durationMin: 6, errorRate: 12 },
        details: "الطريقة الثانية أخّرت ثلاث حالات تبيّن لاحقاً أنها تحتاج تدخلاً عاجلاً.",
      },
      clarifications: [{
        question: "هل يُحوَّل كل من يصف ألم صدر إلى الطوارئ بلا استثناء؟",
        options: ["نعم — تحويل فوري دائماً", "لا — بعد سؤالين محدّدين فقط", "يُحوَّل ما لم يكن ألماً معروفاً مزمناً موثّقاً في الملف"],
      }],
    },
    {
      type: "single_person_risk", title: "مطالبات التأمين تعتمد على شخص واحد", titleEn: "Insurance claims depend on one person",
      confidence: 97, observedCasesCount: 86,
      summary: "كل مطالبات التأمين تمرّ عبر موظفة واحدة. غيابها يوماً يوقف الإيراد التأميني كاملاً.",
      evidence: { details: "86 مطالبة خلال الفترة، جميعها بمعرفة الموظفة نفسها. لا يوجد بديل مدرَّب." },
    },
  ],

  channel: {
    counterpart: "مريض",
    welcome: "أهلاً بك في مركز الشفاء التخصصي. كيف نقدر نساعدك اليوم؟",
    samplePrompts: [
      "أبي أحجز موعد مع باطنية",
      "عندي ألم في صدري من ساعة",
      "وش تغطية تأميني لعملية المنظار؟",
    ],
  },
};
