import type { SectorPack } from "./types.ts";

/*
 * شحن ولوجستيات.
 *
 * ما يميّز هذا القطاع أن الخطأ يتحرّك: شحنة وُجّهت خطأً تقطع مسافةً قبل أن
 * يُكتشف الخطأ، وتصحيحها يكلّف رحلةً كاملة لا تعديلَ حقل. ولهذا يقف التخليص
 * الجمركي عند حدٍّ منخفض من الاستقلالية رغم تكراره: بيانٌ جمركي خاطئ غرامةٌ
 * وحجزٌ لا يُصلحان بإعادة إرسال.
 */
export const logisticsPack: SectorPack = {
  code: "logistics",
  nameAr: "شحن ولوجستيات",
  nameEn: "Shipping & Logistics",
  descriptionAr: "الشحنات والتخليص الجمركي والتتبّع ومطالبات التلف.",

  organization: {
    name: "شركة المسار للشحن",
    nameEn: "Al-Masar Freight",
    industry: "النقل والإمداد (Logistics)",
    tagline: "العقل التشغيلي للشحنات والتخليص والتتبّع",
    logo: "🚚",
  },

  people: [
    { name: "ماجد العتيبي", role: "manager", department: "العمليات" },
    { name: "هند الفهد", role: "employee", department: "التخليص الجمركي" },
    { name: "خالد بورسلي", role: "employee", department: "خدمة العملاء" },
    { name: "أمل الكندري", role: "auditor", department: "الالتزام" },
  ],

  sources: [
    { title: "نظام إدارة النقل (TMS)", type: "system_sis", authorityLevel: "live_authoritative", owner: "العمليات", summary: "الشحنات والمسارات وحالات التسليم. المرجع الحيّ." },
    { title: "جدول التعرفة الجمركية", type: "catalog", authorityLevel: "approved_data", owner: "التخليص الجمركي", summary: "بنود التعرفة ونسب الرسوم والمستندات المطلوبة لكل صنف." },
    { title: "لائحة البضائع المقيّدة", type: "approved_policy", authorityLevel: "approved_policy", owner: "الالتزام", summary: "ما يُمنع شحنه وما يحتاج تصريحاً مسبقاً." },
    { title: "سياسة مطالبات التلف", type: "approved_policy", authorityLevel: "approved_policy", owner: "العمليات", summary: "حدود التعويض والمستندات والمهل." },
  ],

  policies: [
    {
      code: "POL-LOG-01", title: "البضائع المقيّدة تُوقف قبل الحجز", titleEn: "Restricted goods stop before booking",
      riskLevel: "critical", approvedBy: "أمل الكندري",
      summary: "أي شحنة يظهر فيها صنف مقيّد تُوقف قبل تأكيد الحجز حتى يُراجعها الالتزام.",
      rules: [
        { condition: "وصف الشحنة يطابق لائحة المقيّدة", action: "أوقف الحجز وحوّل إلى الالتزام", explanation: "شحن صنف ممنوع مسؤوليةٌ نظامية على الشركة لا على العميل." },
        { condition: "وصف غامض لا يُصنَّف", action: "اطلب توضيحاً ولا تُصنّف احتمالياً", explanation: "التصنيف الخاطئ في البيان الجمركي يُعامَل تهرّباً." },
      ],
    },
    {
      code: "POL-LOG-02", title: "البيان الجمركي يُراجَع بشرياً", titleEn: "Customs declarations are human-reviewed",
      riskLevel: "critical", approvedBy: "هند الفهد",
      summary: "النظام يُحضّر البيان ولا يقدّمه؛ التقديم بعد مراجعة مخلّص معتمد.",
      rules: [
        { condition: "بيان جمركي جاهز", action: "اعرضه على المخلّص للمراجعة قبل التقديم", explanation: "غرامة البيان الخاطئ وحجز الشحنة لا يُصلحهما تعديل لاحق." },
      ],
    },
    {
      code: "POL-LOG-03", title: "التعويض فوق الحدّ يحتاج اعتماد العمليات", titleEn: "Claims above threshold need operations sign-off",
      riskLevel: "high", approvedBy: "ماجد العتيبي",
      summary: "مطالبات التلف حتى 100 د.ك تُسوّى آلياً بالمستندات؛ وما فوقها يحتاج اعتماداً.",
      rules: [
        { condition: "قيمة المطالبة ≤ 100 د.ك ومستنداتها مكتملة", action: "سوِّ المطالبة آلياً", explanation: "التأخير في المبالغ الصغيرة يكلّف علاقةً بالعميل أكثر من المبلغ." },
        { condition: "قيمة المطالبة > 100 د.ك", action: "أوقف وارفع إلى العمليات", explanation: "فوق الحدّ تحتاج المطالبة تحقيقاً في سبب التلف." },
      ],
    },
  ],

  skills: [
    {
      slug: "shipment-tracking", name: "تتبّع شحنة", nameEn: "Shipment tracking",
      category: "خدمة العملاء", department: "خدمة العملاء", ownerName: "خالد بورسلي",
      purpose: "الإجابة عن موقع الشحنة ووقت التسليم المتوقع.",
      riskLevel: "low", autonomyLevel: 5, status: "active",
      reliabilityScore: 95, usageCount: 3120, successRate: 98, humanTakeoverRate: 2.2, avgDurationMinutes: 0.8, hoursSavedTotal: 310,
      steps: [
        { title: "تحديد الشحنة", description: "برقم البوليصة أو رقم الطلب.", system: "TMS", automated: true },
        { title: "قراءة آخر مسح", description: "الموقع والحالة وتاريخ آخر تحديث.", system: "TMS", automated: true },
        { title: "احتساب الوقت المتوقع", description: "من المسار والمرحلة الحالية.", system: "TMS", automated: true },
        { title: "الردّ على العميل", description: "الموقع والوقت المتوقع بلغة واضحة.", system: "قناة العملاء", automated: true, decisionRule: "تأخّر يتجاوز 48 ساعة يُحوَّل للعمليات." },
      ],
      decisions: [
        { condition: "الشحنة ضمن الجدول", outcome: "ردّ آلي بالحالة", risk: "low" },
        { condition: "تأخّر يتجاوز 48 ساعة", outcome: "تحويل إلى العمليات مع تنبيه", risk: "medium" },
      ],
      allowedActions: ["lookupShipment", "computeEta", "notifyCustomer"],
    },
    {
      slug: "customs-declaration", name: "تحضير بيان جمركي", nameEn: "Customs declaration prep",
      category: "التخليص", department: "التخليص الجمركي", ownerName: "هند الفهد",
      purpose: "تصنيف البضاعة واحتساب الرسوم وتحضير البيان للمراجعة.",
      riskLevel: "critical", autonomyLevel: 3, status: "shadow",
      reliabilityScore: 81, usageCount: 190, successRate: 92, humanTakeoverRate: 21, avgDurationMinutes: 12, hoursSavedTotal: 34,
      singlePointOfFailure: true,
      steps: [
        { title: "قراءة الفاتورة التجارية", description: "الأصناف والقيم وبلد المنشأ.", system: "أرشيف المستندات", automated: true },
        { title: "فحص لائحة المقيّدة", description: "مطابقة الأصناف بلائحة الممنوع والمقيّد.", system: "لائحة البضائع المقيّدة", automated: true, decisionRule: "أي تطابق يوقف المسار." },
        { title: "تصنيف بند التعرفة", description: "تحديد البند الجمركي لكل صنف.", system: "جدول التعرفة", automated: true, decisionRule: "الغموض يوقف ولا يُصنَّف احتمالياً." },
        { title: "احتساب الرسوم", description: "تطبيق النسب على القيم.", system: "جدول التعرفة", automated: true },
        { title: "عرض البيان للمراجعة", description: "على المخلّص المعتمد قبل التقديم.", system: "التخليص الجمركي" },
      ],
      decisions: [
        { condition: "صنف مقيّد أو ممنوع", outcome: "إيقاف وتحويل إلى الالتزام", risk: "critical" },
        { condition: "وصف غامض", outcome: "طلب توضيح — لا تصنيف احتمالي", risk: "critical" },
      ],
      exceptions: [
        { scenario: "فاتورة بلا بلد منشأ", protocol: "يُوقف التحضير؛ المنشأ يغيّر النسبة كلياً." },
      ],
      allowedActions: ["readInvoice", "checkRestricted", "classifyTariff", "computeDuties", "submitForReview"],
    },
    {
      slug: "damage-claim", name: "مطالبة تلف", nameEn: "Damage claim",
      category: "المطالبات", department: "العمليات", ownerName: "ماجد العتيبي",
      purpose: "استقبال مطالبة التلف، التحقق من المستندات، والتسوية ضمن الحدّ.",
      riskLevel: "high", autonomyLevel: 4, status: "active",
      reliabilityScore: 88, usageCount: 210, successRate: 94, humanTakeoverRate: 11, avgDurationMinutes: 6, hoursSavedTotal: 41,
      steps: [
        { title: "استقبال المطالبة", description: "الشحنة ووصف التلف.", system: "قناة العملاء", automated: true },
        { title: "فحص المهلة", description: "هل المطالبة ضمن المدة المسموحة.", system: "سياسة مطالبات التلف", automated: true },
        { title: "التحقق من المستندات", description: "صور التلف ومحضر الاستلام.", system: "أرشيف المستندات", automated: true },
        { title: "احتساب التعويض", description: "حسب القيمة المعلنة وحدود السياسة.", system: "TMS", automated: true, decisionRule: "تجاوز 100 د.ك يوقف التسوية الآلية." },
        { title: "التسوية أو الرفع", description: "تسوية آلية أو رفع إلى العمليات.", system: "TMS", automated: true },
      ],
      decisions: [
        { condition: "ضمن الحدّ والمستندات مكتملة", outcome: "تسوية آلية", risk: "medium" },
        { condition: "فوق الحدّ", outcome: "رفع إلى العمليات للتحقيق", risk: "high" },
        { condition: "خارج المهلة", outcome: "رفض موثّق مع بيان السبب", risk: "medium" },
      ],
      allowedActions: ["validateClaim", "computeCompensation", "settleClaim", "escalate"],
    },
  ],

  connectors: [
    { name: "نظام إدارة النقل (TMS)", type: "sis", permissions: ["قراءة الشحنات", "تحديث حالة", "تسوية مطالبة"] },
    { name: "بوابة الجمارك", type: "crm", permissions: ["قراءة التعرفة", "تقديم بيان"], status: "degraded" },
    { name: "أرشيف المستندات", type: "storage", permissions: ["قراءة", "رفع"] },
    { name: "قناة العملاء", type: "whatsapp", permissions: ["استقبال", "إرسال"] },
    { name: "تتبّع الأسطول", type: "cloud", permissions: ["قراءة المواقع"] },
  ],

  proposals: [
    {
      type: "single_person_risk", title: "التخليص الجمركي كلّه بمعرفة موظفة واحدة", titleEn: "Customs clearance depends on one person",
      confidence: 98, observedCasesCount: 190,
      summary: "190 بياناً جمركياً كلّها راجعتها موظفة واحدة. غيابها يوقف التخليص كاملاً، والشحنات تتكدّس بأرضيات يومية.",
      evidence: { details: "لا يوجد مخلّص ثانٍ معتمد. تكلفة الأرضيات المقدّرة عند توقّف يومين تتجاوز قيمة تدريب بديل." },
    },
    {
      type: "process_drift", title: "انحراف في تصنيف قطع الغيار", titleEn: "Drift in spare-parts classification",
      confidence: 84, observedCasesCount: 46,
      summary: "قطع الغيار نفسها تُصنَّف تحت بندين مختلفين حسب من يُحضّر البيان — والفارق في الرسوم 4%.",
      evidence: {
        methodA: { name: "البند العام لقطع الغيار", percentage: 58, durationMin: 9, errorRate: 3 },
        methodB: { name: "بند حسب المادة المصنّعة", percentage: 42, durationMin: 14, errorRate: 11 },
        details: "ثلاث شحنات خضعت لتصحيح جمركي بسبب التصنيف الثاني.",
      },
      clarifications: [{
        question: "أي بند يُعتمد لقطع الغيار الميكانيكية؟",
        options: ["البند العام لقطع الغيار", "البند حسب المادة المصنّعة", "يُحسم لكل صنف بقرار المخلّص موثّقاً"],
      }],
    },
  ],

  channel: {
    counterpart: "عميل شحن",
    welcome: "أهلاً بك في شركة المسار للشحن. كيف نقدر نخدمك؟",
    samplePrompts: [
      "وين شحنتي رقم MSR-88214؟",
      "وصلتني البضاعة متضررة، وش أسوي؟",
      "كم رسوم تخليص شحنة قطع غيار؟",
    ],
  },
};
