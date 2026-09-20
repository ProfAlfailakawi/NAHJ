import type { SectorPack } from "./types.ts";

/*
 * عقارات وإدارة أملاك.
 *
 * ما يحكم هذا القطاع التزامٌ تعاقدي طويل: عقد إيجار سنة يُوقَّع في دقيقة ويُحمَل
 * اثني عشر شهراً. ولهذا يقف التسعير والتعاقد عند الاقتراح، بينما تُترك طلبات
 * الصيانة — وهي اليومية المتكرّرة — تعمل بحرية أوسع: خطؤها يُصحَّح بزيارة ثانية.
 */
export const realEstatePack: SectorPack = {
  code: "realestate",
  nameAr: "عقارات وإدارة أملاك",
  nameEn: "Real Estate & Property Management",
  descriptionAr: "المعاينات وعقود الإيجار والتحصيل وطلبات الصيانة.",

  organization: {
    name: "شركة الديرة العقارية",
    nameEn: "Al-Deera Properties",
    industry: "العقارات وإدارة الأملاك (Real Estate)",
    tagline: "العقل التشغيلي للمعاينات والعقود والتحصيل والصيانة",
    logo: "🏢",
  },

  people: [
    { name: "وليد السالم", role: "manager", department: "إدارة الأملاك" },
    { name: "غادة المطوع", role: "employee", department: "التأجير" },
    { name: "راشد العازمي", role: "employee", department: "الصيانة" },
    { name: "نوف الهاجري", role: "auditor", department: "المالية" },
  ],

  sources: [
    { title: "نظام إدارة الأملاك", type: "system_sis", authorityLevel: "live_authoritative", owner: "إدارة الأملاك", summary: "الوحدات والعقود والمستأجرون والتحصيل. المرجع الحيّ." },
    { title: "جدول الإيجارات المعتمد", type: "catalog", authorityLevel: "approved_data", owner: "إدارة الأملاك", summary: "الإيجار المعتمد لكل نوع وحدة وموقع، وحدود التفاوض." },
    { title: "نموذج عقد الإيجار المعتمد", type: "approved_policy", authorityLevel: "approved_policy", owner: "إدارة الأملاك", summary: "الصيغة المعتمدة وبنودها التي لا تُعدَّل بلا إقرار." },
    { title: "دليل تصنيف أعطال الصيانة", type: "sop", authorityLevel: "approved_data", owner: "الصيانة", summary: "تصنيف العطل وأولويته وزمن الاستجابة الملزم." },
  ],

  policies: [
    {
      code: "POL-RE-01", title: "لا تعديل على بنود العقد بلا إقرار", titleEn: "No contract clause edits without sign-off",
      riskLevel: "critical", approvedBy: "وليد السالم",
      summary: "نموذج العقد يُستعمل كما هو؛ أي تعديل على بنوده يحتاج إقرار إدارة الأملاك.",
      rules: [
        { condition: "طلب تعديل بند في العقد", action: "أوقف الإصدار وارفع إلى إدارة الأملاك", explanation: "بندٌ معدَّل يُلزم الشركة اثني عشر شهراً ولا يُتراجع عنه بإشعار." },
      ],
    },
    {
      code: "POL-RE-02", title: "الإيجار خارج الجدول يحتاج اعتماداً", titleEn: "Off-schedule rent needs approval",
      riskLevel: "high", approvedBy: "وليد السالم",
      summary: "العروض ضمن حدود الجدول تُقدَّم مباشرة؛ وما يخرج عنها يقف حتى الاعتماد.",
      rules: [
        { condition: "الإيجار المعروض ضمن حدود الجدول", action: "قدّم العرض بعد مراجعة موظف التأجير", explanation: "الجدول معتمد مسبقاً، فلا داعي لاعتماد مكرّر." },
        { condition: "خصم يتجاوز الحدّ الأدنى في الجدول", action: "أوقف وارفع إلى إدارة الأملاك", explanation: "التنازل عن الإيراد قرار مالك لا موظف." },
      ],
    },
    {
      code: "POL-RE-03", title: "أعطال السلامة استجابة فورية", titleEn: "Safety faults get immediate response",
      riskLevel: "critical", approvedBy: "راشد العازمي",
      summary: "أعطال الكهرباء والغاز والمصاعد تُصنَّف طارئة وتُرسل فوراً بلا انتظار دور.",
      rules: [
        { condition: "عطل في قائمة السلامة", action: "أرسل فنّي الطوارئ فوراً وأبلغ إدارة الأملاك", explanation: "تأخير عطل مصعد أو تسرّب غاز مسؤولية على الأرواح لا على الخدمة." },
      ],
    },
  ],

  skills: [
    {
      slug: "maintenance-request", name: "طلب صيانة", nameEn: "Maintenance request",
      category: "الصيانة", department: "الصيانة", ownerName: "راشد العازمي",
      purpose: "استقبال العطل، تصنيف أولويته، وجدولة الفنّي المناسب.",
      riskLevel: "medium", autonomyLevel: 5, status: "active",
      reliabilityScore: 93, usageCount: 980, successRate: 97, humanTakeoverRate: 4, avgDurationMinutes: 2.4, hoursSavedTotal: 128,
      steps: [
        { title: "استقبال البلاغ", description: "الوحدة ووصف العطل من المستأجر.", system: "قناة المستأجرين", automated: true },
        { title: "تصنيف العطل", description: "مطابقة الوصف بدليل التصنيف.", system: "دليل تصنيف الأعطال", automated: true, decisionRule: "عطل سلامة يقفز إلى الطارئ فوراً." },
        { title: "تحديد الأولوية وزمن الاستجابة", description: "حسب التصنيف.", system: "دليل تصنيف الأعطال", automated: true },
        { title: "جدولة الفنّي", description: "أقرب فنّي متاح بالتخصص المطلوب.", system: "نظام إدارة الأملاك", automated: true },
        { title: "إبلاغ المستأجر", description: "الموعد ونافذة الزيارة.", system: "قناة المستأجرين", automated: true },
      ],
      decisions: [
        { condition: "عطل سلامة", outcome: "فنّي طوارئ فوراً وإبلاغ الإدارة", risk: "critical" },
        { condition: "عطل عادي", outcome: "جدولة ضمن زمن الاستجابة", risk: "low" },
        { condition: "تكرار العطل نفسه ثلاث مرات", outcome: "رفع إلى إدارة الأملاك لفحص جذري", risk: "medium" },
      ],
      exceptions: [
        { scenario: "المستأجر متأخر في السداد", protocol: "الصيانة لا تتوقف؛ التحصيل مسار منفصل لا يُقايَض بالسلامة." },
      ],
      allowedActions: ["classifyFault", "scheduleTechnician", "notifyTenant", "escalateEmergency"],
    },
    {
      slug: "viewing-booking", name: "حجز معاينة", nameEn: "Viewing booking",
      category: "التأجير", department: "التأجير", ownerName: "غادة المطوع",
      purpose: "مطابقة طلب المستأجر بالوحدات المتاحة وحجز موعد معاينة.",
      riskLevel: "low", autonomyLevel: 5, status: "active",
      reliabilityScore: 91, usageCount: 640, successRate: 96, humanTakeoverRate: 6, avgDurationMinutes: 3, hoursSavedTotal: 82,
      steps: [
        { title: "قراءة المتطلبات", description: "المنطقة والميزانية وعدد الغرف.", system: "قناة العملاء", automated: true },
        { title: "مطابقة الوحدات المتاحة", description: "بحث في الشاغر المطابق.", system: "نظام إدارة الأملاك", automated: true },
        { title: "عرض ثلاثة خيارات", description: "أقرب ثلاث وحدات مطابقة بأسعارها.", system: "جدول الإيجارات", automated: true },
        { title: "حجز موعد المعاينة", description: "مع مندوب التأجير المتاح.", system: "تقويم المعاينات", automated: true },
      ],
      decisions: [
        { condition: "لا وحدة مطابقة", outcome: "عرض أقرب بديل وتسجيل الطلب في قائمة الانتظار", risk: "low" },
      ],
      allowedActions: ["searchUnits", "bookViewing", "notifyProspect"],
    },
    {
      slug: "lease-issuance", name: "إصدار عقد إيجار", nameEn: "Lease issuance",
      category: "التعاقد", department: "التأجير", ownerName: "وليد السالم",
      purpose: "تجهيز العقد من النموذج المعتمد بعد التحقق من المستندات والتسعير.",
      riskLevel: "critical", autonomyLevel: 4, status: "active",
      reliabilityScore: 90, usageCount: 156, successRate: 95, humanTakeoverRate: 12, avgDurationMinutes: 11, hoursSavedTotal: 47,
      steps: [
        { title: "التحقق من هوية المستأجر", description: "البطاقة والمستندات المطلوبة.", system: "نظام إدارة الأملاك", automated: true },
        { title: "مطابقة الإيجار بالجدول", description: "هل السعر ضمن الحدود المعتمدة.", system: "جدول الإيجارات", automated: true, decisionRule: "الخروج عن الجدول يوقف الإصدار." },
        { title: "تعبئة النموذج المعتمد", description: "بلا تعديل على البنود.", system: "نموذج العقد المعتمد", automated: true },
        { title: "عرض للتوقيع", description: "إرسال للمراجعة والتوقيع.", system: "قناة العملاء" },
      ],
      decisions: [
        { condition: "السعر ضمن الجدول والمستندات مكتملة", outcome: "تجهيز العقد للتوقيع", risk: "high" },
        { condition: "طلب تعديل بند", outcome: "إيقاف ورفع إلى إدارة الأملاك", risk: "critical" },
        { condition: "خصم تحت الحدّ الأدنى", outcome: "إيقاف حتى الاعتماد", risk: "high" },
      ],
      exceptions: [
        { scenario: "مستأجر له عقد سابق أُنهي لعدم السداد", protocol: "يُوقف الإصدار ويُرفع للمالية قبل أي التزام." },
      ],
      allowedActions: ["verifyTenant", "validatePricing", "generateLease", "requestApproval"],
    },
    {
      slug: "rent-collection", name: "متابعة التحصيل", nameEn: "Rent collection follow-up",
      category: "المالية", department: "المالية", ownerName: "نوف الهاجري",
      purpose: "رصد الأقساط المستحقة وتذكير المستأجرين وتصعيد المتأخرات.",
      riskLevel: "medium", autonomyLevel: 4, status: "active",
      reliabilityScore: 87, usageCount: 1420, successRate: 93, humanTakeoverRate: 9, avgDurationMinutes: 1.1, hoursSavedTotal: 96,
      steps: [
        { title: "قراءة الأقساط المستحقة", description: "ما استحقّ ولم يُسدَّد.", system: "نظام إدارة الأملاك", automated: true },
        { title: "تذكير قبل الاستحقاق", description: "قبل ثلاثة أيام.", system: "قناة المستأجرين", automated: true },
        { title: "تذكير بعد التأخّر", description: "في اليوم الثالث والسابع.", system: "قناة المستأجرين", automated: true },
        { title: "تصعيد المتأخرات", description: "بعد 14 يوماً إلى المالية.", system: "نظام إدارة الأملاك", automated: true, decisionRule: "لا إجراء قانوني آلي إطلاقاً." },
      ],
      decisions: [
        { condition: "تأخّر يتجاوز 14 يوماً", outcome: "تصعيد إلى المالية — لا إجراء قانوني آلي", risk: "high" },
      ],
      allowedActions: ["readDues", "sendReminder", "escalateToFinance"],
    },
  ],

  connectors: [
    { name: "نظام إدارة الأملاك", type: "sis", permissions: ["قراءة الوحدات", "قراءة العقود", "إنشاء طلب صيانة"] },
    { name: "تقويم المعاينات", type: "calendar", permissions: ["قراءة", "حجز"] },
    { name: "بوابة الدفع", type: "payment", permissions: ["قراءة السداد", "إرسال رابط دفع"] },
    { name: "قناة المستأجرين", type: "whatsapp", permissions: ["استقبال", "إرسال"] },
    { name: "أرشيف العقود", type: "storage", permissions: ["قراءة", "رفع"] },
  ],

  proposals: [
    {
      type: "improvement", title: "تذكير ما قبل الاستحقاق يخفض التأخّر", titleEn: "Pre-due reminders cut late payments",
      confidence: 90, observedCasesCount: 1420,
      summary: "الوحدات التي وصلها تذكير قبل ثلاثة أيام تأخّرت بنسبة 9% مقابل 31% لمن لم يصله.",
      evidence: {
        methodA: { name: "تذكير قبل الاستحقاق", percentage: 62, durationMin: 0.4, errorRate: 9 },
        methodB: { name: "بلا تذكير مسبق", percentage: 38, durationMin: 0, errorRate: 31 },
        details: "الفارق يعادل تحسّناً في التدفق النقدي يُقدَّر بثلاثة أسابيع.",
      },
      clarifications: [{
        question: "هل نعمّم التذكير المسبق على كل العقود؟",
        options: ["نعم — لكل العقود", "للعقود التي سبق لها التأخّر فقط", "لا — يبقى اختيارياً بطلب المالك"],
      }],
    },
    {
      type: "conflict", title: "تعارض في ربط الصيانة بالسداد", titleEn: "Conflict over linking maintenance to payment",
      confidence: 87, observedCasesCount: 31,
      summary: "بعض الموظفين يؤجّلون طلبات صيانة المستأجرين المتأخرين في السداد، وآخرون ينفّذونها فوراً.",
      evidence: {
        methodA: { name: "تنفيذ الصيانة بلا ربط بالسداد", percentage: 68, durationMin: 2, errorRate: 0 },
        methodB: { name: "تأجيل حتى السداد", percentage: 32, durationMin: 2, errorRate: 0 },
        details: "حالتان من الثانية شملتا عطلاً كهربائياً — أي مخاطرة سلامة مقابل دين.",
      },
      clarifications: [{
        question: "هل تُربط طلبات الصيانة بحالة السداد؟",
        options: ["لا تُربط إطلاقاً — الصيانة مسار مستقل", "تُربط عدا أعطال السلامة", "تُربط بقرار إدارة الأملاك حالةً بحالة"],
      }],
    },
  ],

  channel: {
    counterpart: "مستأجر أو باحث عن وحدة",
    welcome: "أهلاً بك في شركة الديرة العقارية. كيف نقدر نساعدك؟",
    samplePrompts: [
      "أبي شقة غرفتين في السالمية",
      "المصعد معطّل من أمس",
      "متى يستحق قسط الإيجار القادم؟",
    ],
  },
};
