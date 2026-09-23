import type { SectorPack } from "./types.ts";

/*
 * مكتب محاماة.
 *
 * ما يحكم هذا القطاع مواعيد لا تُمدّ: مهلة الاستئناف تسقط بفواتها، ولا تسوية
 * بعدها. ولهذا أخطر ما هنا ليس خطأً في المحتوى بل تأخّرٌ في التنبيه — والسقف
 * الموضوع على مهارة المواعيد يعكس ذلك: تُحضِّر ولا تُقرّر.
 *
 * ويضاف إليه تعارض المصالح: قبول موكّل ضدّ موكّل قائم خطأٌ لا يُصلَح بالاعتذار،
 * فهو فحصٌ يسبق كل شيء.
 */
export const lawPack: SectorPack = {
  code: "law",
  nameAr: "مكتب محاماة",
  nameEn: "Law Firm",
  descriptionAr: "القضايا والمواعيد الإجرائية وتعارض المصالح وأتعاب التوكيل.",

  organization: {
    name: "مكتب الميزان للمحاماة والاستشارات",
    nameEn: "Al-Mizan Law Firm",
    industry: "الخدمات القانونية (Legal Services)",
    tagline: "العقل التشغيلي للقضايا والمواعيد الإجرائية والتوكيلات",
    logo: "⚖️",
  },

  people: [
    { name: "المحامي فهد سالم", role: "manager", department: "الشركاء" },
    { name: "نورة عادل", role: "employee", department: "سكرتارية القضايا" },
    { name: "سعد مبارك", role: "employee", department: "التنفيذ والمتابعة" },
    { name: "ليلى يوسف", role: "auditor", department: "الالتزام" },
  ],

  sources: [
    { title: "نظام إدارة القضايا", type: "system_sis", authorityLevel: "live_authoritative", owner: "سكرتارية القضايا", summary: "القضايا والجلسات والمهل الإجرائية. المرجع الحيّ الوحيد للمواعيد." },
    { title: "سجلّ الموكّلين والأطراف المقابلة", type: "catalog", authorityLevel: "approved_data", owner: "الالتزام", summary: "كل موكّل وكل خصم في كل قضية — أساس فحص تعارض المصالح." },
    { title: "جدول المهل الإجرائية", type: "approved_policy", authorityLevel: "approved_policy", owner: "الشركاء", summary: "مدد الاستئناف والاعتراض والتنفيذ لكل نوع حكم." },
    { title: "لائحة الأتعاب المعتمدة", type: "approved_policy", authorityLevel: "approved_policy", owner: "الشركاء", summary: "حدود الأتعاب لكل نوع قضية، وما يحتاج إقرار شريك." },
  ],

  policies: [
    {
      code: "POL-LAW-01", title: "فحص تعارض المصالح قبل أي قبول", titleEn: "Conflict check before any engagement",
      riskLevel: "critical", approvedBy: "المحامي فهد سالم",
      summary: "لا يُقبل موكّل ولا تُفتح قضية قبل فحص التعارض ضدّ كل موكّل وخصم قائم.",
      rules: [
        { condition: "طلب توكيل جديد", action: "افحص السجلّ ضدّ الموكّلين والخصوم، وأوقف المسار عند أي تطابق", explanation: "تمثيل طرفين متخاصمين مخالفةٌ مهنية لا تُصحَّح بالاعتذار بعد القبول." },
        { condition: "تطابق محتمل غير مؤكد", action: "حوّل إلى شريك للبتّ", explanation: "الشكّ في التعارض يُحسم بشرياً لا احتمالياً." },
      ],
    },
    {
      code: "POL-LAW-02", title: "المهل الإجرائية لا تُحتسب تلقائياً وحدها", titleEn: "Procedural deadlines are never auto-final",
      riskLevel: "critical", approvedBy: "المحامي فهد سالم",
      summary: "النظام يحسب المهلة وينبّه، ولا يُغلق قضيةً ولا يُسقط حقّاً بلا إقرار محامٍ.",
      rules: [
        { condition: "اقتراب مهلة استئناف", action: "نبّه المحامي المسؤول والشريك قبل ثلاثة أيام عمل على الأقل", explanation: "المهلة تسقط بفواتها ولا تُمدّ، فالتنبيه المتأخر لا قيمة له." },
        { condition: "حساب مهلة على حكم غير مكتمل البيانات", action: "أوقف الحساب واطلب استكمال بيانات الحكم", explanation: "مهلة محسوبة على تاريخ خاطئ أسوأ من غياب الحساب." },
      ],
    },
    {
      code: "POL-LAW-03", title: "الأتعاب فوق الحدّ تحتاج إقرار شريك", titleEn: "Fees above threshold need partner sign-off",
      riskLevel: "high", approvedBy: "المحامي فهد سالم",
      summary: "أي عرض أتعاب يتجاوز اللائحة المعتمدة يقف حتى يعتمده شريك.",
      rules: [
        { condition: "أتعاب تتجاوز حدّ نوع القضية", action: "أوقف العرض واطلب اعتماد شريك", explanation: "التسعير خارج اللائحة التزامٌ تعاقدي لا يملكه موظف." },
      ],
    },
  ],

  skills: [
    {
      slug: "conflict-check", name: "فحص تعارض المصالح", nameEn: "Conflict of interest check",
      category: "قبول الموكّلين", department: "الالتزام", ownerName: "ليلى يوسف",
      purpose: "مطابقة الموكّل المحتمل وخصومه بكل الأطراف في سجلّ المكتب قبل القبول.",
      riskLevel: "critical", autonomyLevel: 4, status: "active",
      reliabilityScore: 96, usageCount: 134, successRate: 99, humanTakeoverRate: 3, avgDurationMinutes: 2, hoursSavedTotal: 29,
      steps: [
        { title: "استخراج أطراف الطلب", description: "الموكّل المحتمل والخصم وأي طرف ذي صلة.", system: "قناة التواصل", automated: true },
        { title: "مطابقة السجلّ", description: "بحث بالاسم والهوية والسجلّ التجاري في كل القضايا.", system: "سجلّ الموكّلين", automated: true },
        { title: "تصنيف النتيجة", description: "لا تعارض / تعارض مؤكد / تعارض محتمل.", system: "سجلّ الموكّلين", automated: true, decisionRule: "المؤكد يرفض، والمحتمل يُحوَّل لشريك." },
        { title: "تحضير مذكّرة القبول", description: "ملخّص للشريك يتضمّن نتيجة الفحص.", system: "نظام إدارة القضايا", automated: true },
      ],
      decisions: [
        { condition: "تعارض مؤكد", outcome: "رفض التوكيل وتوثيق السبب", risk: "critical" },
        { condition: "تعارض محتمل", outcome: "إيقاف وتحويل إلى شريك", risk: "high" },
      ],
      exceptions: [
        { scenario: "تشابه أسماء بلا رقم هوية", protocol: "يُعدّ تعارضاً محتملاً ويُحوَّل، ولا يُستبعد آلياً." },
      ],
      allowedActions: ["searchParties", "classifyConflict", "prepareMemo"],
    },
    {
      slug: "deadline-watch", name: "رصد المهل الإجرائية", nameEn: "Procedural deadline watch",
      category: "المتابعة", department: "التنفيذ والمتابعة", ownerName: "سعد مبارك",
      purpose: "حساب المهل من تواريخ الأحكام والتنبيه قبل فواتها.",
      riskLevel: "critical", autonomyLevel: 3, status: "active",
      reliabilityScore: 93, usageCount: 312, successRate: 97, humanTakeoverRate: 5, avgDurationMinutes: 1.5, hoursSavedTotal: 46,
      steps: [
        { title: "قراءة بيانات الحكم", description: "نوع الحكم وتاريخ التبليغ والدرجة.", system: "نظام إدارة القضايا", automated: true },
        { title: "احتساب المهلة", description: "تطبيق جدول المهل حسب نوع الحكم.", system: "جدول المهل الإجرائية", automated: true, decisionRule: "بيانات ناقصة توقف الحساب." },
        { title: "جدولة التنبيهات", description: "تنبيه قبل عشرة أيام، ثم ثلاثة، ثم يوم.", system: "نظام إدارة القضايا", automated: true },
        { title: "تحضير مسوّدة الاستئناف", description: "هيكل مذكّرة أولي للمراجعة.", system: "نظام إدارة القضايا", automated: true },
      ],
      decisions: [
        { condition: "تاريخ تبليغ غير موثّق", outcome: "إيقاف الحساب وطلب استكمال", risk: "critical" },
        { condition: "بقي أقل من ثلاثة أيام", outcome: "تنبيه الشريك مباشرة لا المحامي وحده", risk: "critical" },
      ],
      allowedActions: ["computeDeadline", "scheduleReminder", "draftAppealSkeleton"],
    },
    {
      slug: "fee-quote", name: "عرض أتعاب", nameEn: "Fee quotation",
      category: "المالية", department: "الشركاء", ownerName: "المحامي فهد سالم",
      purpose: "تسعير التوكيل حسب اللائحة المعتمدة، ورفع ما يتجاوزها.",
      riskLevel: "high", autonomyLevel: 2, status: "shadow",
      reliabilityScore: 74, usageCount: 41, successRate: 90, humanTakeoverRate: 22, avgDurationMinutes: 7, hoursSavedTotal: 6,
      steps: [
        { title: "تصنيف نوع القضية", description: "تحديد الفئة من وصف الطلب.", system: "نظام إدارة القضايا", automated: true },
        { title: "استخراج الحدّ من اللائحة", description: "الحدّان الأدنى والأعلى للفئة.", system: "لائحة الأتعاب", automated: true },
        { title: "احتساب العرض", description: "بناء العرض ضمن الحدّين.", system: "نظام إدارة القضايا", automated: true, decisionRule: "تجاوز الحدّ يوقف العرض." },
        { title: "رفع للاعتماد عند التجاوز", description: "مذكّرة للشريك بالمبرّر.", system: "نظام إدارة القضايا" },
      ],
      decisions: [
        { condition: "العرض ضمن اللائحة", outcome: "يُرسل بعد مراجعة المحامي", risk: "medium" },
        { condition: "العرض فوق اللائحة", outcome: "إيقاف حتى إقرار شريك", risk: "high" },
      ],
      allowedActions: ["classifyMatter", "computeFee", "requestPartnerApproval"],
    },
  ],

  connectors: [
    { name: "نظام إدارة القضايا", type: "sis", permissions: ["قراءة القضايا", "إنشاء تنبيه", "حفظ مذكّرة"] },
    { name: "تقويم الجلسات", type: "calendar", permissions: ["قراءة", "إضافة موعد"] },
    { name: "أرشيف المستندات", type: "storage", permissions: ["قراءة", "رفع"] },
    { name: "قناة الموكّلين", type: "whatsapp", permissions: ["استقبال", "إرسال"] },
  ],

  proposals: [
    {
      type: "process_drift", title: "انحراف في لحظة بدء احتساب المهلة", titleEn: "Drift in deadline start point",
      confidence: 88, observedCasesCount: 23,
      summary: "بعض القضايا تُحتسب مهلتها من تاريخ النطق بالحكم، وأخرى من تاريخ التبليغ. الفارق يصل إلى أسبوعين.",
      evidence: {
        methodA: { name: "من تاريخ التبليغ", percentage: 74, durationMin: 2, errorRate: 1 },
        methodB: { name: "من تاريخ النطق", percentage: 26, durationMin: 2, errorRate: 17 },
        details: "حالتان اقتربتا من فوات المهلة بسبب الاحتساب من تاريخ النطق.",
      },
      clarifications: [{
        question: "من أي تاريخ تُحتسب مهلة الاستئناف في المكتب؟",
        options: ["من تاريخ التبليغ الرسمي دائماً", "من تاريخ النطق بالحكم", "حسب نوع الحكم — يحتاج تفصيلاً في اللائحة"],
      }],
    },
    {
      type: "improvement", title: "مسوّدات الاستئناف تُعاد كتابتها من الصفر", titleEn: "Appeal drafts rewritten from scratch",
      confidence: 81, observedCasesCount: 19,
      summary: "تسعة عشر مذكّرة استئناف في فئة واحدة تشترك في 70% من بنيتها، وتُكتب كل مرة من جديد.",
      evidence: { details: "متوسط زمن الكتابة 95 دقيقة، ويمكن اختصاره إلى 30 بهيكل معتمد." },
    },
  ],

  channel: {
    counterpart: "موكّل",
    welcome: "أهلاً بك في مكتب الميزان للمحاماة. كيف نقدر نخدمك؟",
    samplePrompts: [
      "أبي أستأنف حكم صدر ضدي",
      "كم أتعابكم في قضية عمالية؟",
      "متى موعد جلستي القادمة؟",
    ],
  },
};
