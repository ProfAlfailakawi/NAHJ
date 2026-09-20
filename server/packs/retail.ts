import type { SectorPack } from "./types.ts";

/*
 * تجزئة ومطاعم.
 *
 * القطاع الوحيد هنا الذي يحتمل الطيار الآلي فعلاً: استرجاع بقيمة خمسة دنانير
 * خطؤه يُصحَّح بخمسة دنانير، بخلاف نتيجة فحص أو مهلة استئناف. ولهذا مهارة
 * الاسترجاع تصل إلى L6 تحت سقف مبلغ — وهو المثال الذي يوضّح أن السقف يأتي من
 * قابلية التصحيح لا من صعوبة المهمة.
 *
 * وما يميّزه في الاتجاه الآخر: الحساسية الغذائية. سؤالٌ بسيط عن مكوّنات طبق
 * جوابه الخاطئ قد يقتل — فهي المهارة الوحيدة هنا التي لا تُرفَّع.
 */
export const retailPack: SectorPack = {
  code: "retail",
  nameAr: "تجزئة ومطاعم",
  nameEn: "Retail & Restaurants",
  descriptionAr: "الطلبات والاسترجاع والمخزون وشكاوى العملاء.",

  organization: {
    name: "متاجر الواحة",
    nameEn: "Al-Waha Stores",
    industry: "التجزئة والأغذية (Retail & F&B)",
    tagline: "العقل التشغيلي للطلبات والاسترجاع والمخزون",
    logo: "🛍️",
  },

  people: [
    { name: "بدر الخالدي", role: "manager", department: "العمليات" },
    { name: "سارة المنصور", role: "employee", department: "خدمة العملاء" },
    { name: "يوسف العلي", role: "employee", department: "المخزون" },
    { name: "دلال الشمري", role: "auditor", department: "الجودة" },
  ],

  sources: [
    { title: "نظام نقاط البيع (POS)", type: "system_sis", authorityLevel: "live_authoritative", owner: "العمليات", summary: "الطلبات والفواتير والمرتجعات. المصدر الحيّ للمبيعات." },
    { title: "قائمة المنتجات والمكوّنات", type: "catalog", authorityLevel: "approved_data", owner: "الجودة", summary: "كل صنف ومكوّناته ومسبّبات الحساسية فيه." },
    { title: "سياسة الاسترجاع والاستبدال", type: "approved_policy", authorityLevel: "approved_policy", owner: "العمليات", summary: "المدد والشروط وحدود المبالغ لكل فئة." },
    { title: "مستويات المخزون الآمنة", type: "sop", authorityLevel: "approved_data", owner: "المخزون", summary: "حدّ إعادة الطلب لكل صنف حسب معدل الدوران." },
  ],

  policies: [
    {
      code: "POL-RET-01", title: "الاسترجاع الآلي تحت سقف مبلغ", titleEn: "Auto-refund under a value ceiling",
      riskLevel: "medium", approvedBy: "بدر الخالدي",
      summary: "الاسترجاع حتى 20 د.ك يُنفَّذ آلياً عند توفّر الشروط؛ وما فوقه يحتاج موافقة مشرف.",
      rules: [
        { condition: "قيمة الاسترجاع ≤ 20 د.ك وضمن المدة", action: "نفّذ الاسترجاع آلياً وسجّله", explanation: "خطأٌ هنا يُصحَّح بمبلغه، وتأخير العميل أغلى من المخاطرة." },
        { condition: "قيمة الاسترجاع > 20 د.ك", action: "أوقف ونقل إلى مشرف الوردية", explanation: "فوق السقف يصير الخطأ المتراكم مؤثّراً على الإيراد." },
        { condition: "ثلاثة مرتجعات من العميل نفسه خلال شهر", action: "أوقف الآلي وحوّل للمراجعة", explanation: "النمط قد يكون إساءة استخدام لا شكوى حقيقية." },
      ],
    },
    {
      code: "POL-RET-02", title: "لا إجابة آلية عن الحساسية الغذائية", titleEn: "No automated allergen answers",
      riskLevel: "critical", approvedBy: "دلال الشمري",
      summary: "أسئلة مسبّبات الحساسية تُحوَّل إلى موظف مؤهَّل دائماً، مهما بدا الجواب واضحاً.",
      rules: [
        { condition: "سؤال يذكر حساسية أو مكوّناً بعينه", action: "حوّل فوراً إلى موظف الجودة ولا تُجب", explanation: "جوابٌ خاطئ عن مكوّن قد يقتل، وهذا خطأ لا يُصحَّح باسترجاع." },
      ],
    },
    {
      code: "POL-RET-03", title: "إعادة الطلب عند الحدّ الآمن", titleEn: "Reorder at safety threshold",
      riskLevel: "low", approvedBy: "يوسف العلي",
      summary: "الأصناف التي تبلغ حدّ إعادة الطلب تُرفع في أمر شراء مقترح.",
      rules: [
        { condition: "الكمية ≤ حدّ إعادة الطلب", action: "جهّز أمر شراء مقترحاً للمراجعة", explanation: "نفاد صنف سريع الدوران خسارة مبيعات مباشرة." },
      ],
    },
  ],

  skills: [
    {
      slug: "refund-request", name: "طلب استرجاع", nameEn: "Refund request",
      category: "خدمة العملاء", department: "خدمة العملاء", ownerName: "سارة المنصور",
      purpose: "التحقق من الفاتورة والمدّة والحالة، وتنفيذ الاسترجاع ضمن السقف.",
      riskLevel: "medium", autonomyLevel: 6, status: "active",
      reliabilityScore: 97, usageCount: 1840, successRate: 99, humanTakeoverRate: 1.5, avgDurationMinutes: 1.2, hoursSavedTotal: 212,
      steps: [
        { title: "استخراج رقم الفاتورة", description: "من رسالة العميل أو رقم الطلب.", system: "POS", automated: true },
        { title: "التحقق من المدّة والحالة", description: "ضمن المدة المسموحة وحالة المنتج.", system: "سياسة الاسترجاع", automated: true },
        { title: "فحص السقف والنمط", description: "المبلغ ضد السقف، وعدد مرتجعات العميل.", system: "POS", automated: true, decisionRule: "تجاوز أيهما يوقف الآلي." },
        { title: "تنفيذ الاسترجاع", description: "إرجاع المبلغ لنفس وسيلة الدفع.", system: "POS", automated: true },
        { title: "إشعار العميل", description: "تأكيد بالمبلغ والمدة المتوقعة.", system: "قناة العملاء", automated: true },
      ],
      decisions: [
        { condition: "المبلغ ضمن السقف والشروط", outcome: "تنفيذ آلي فوري", risk: "low" },
        { condition: "فوق السقف", outcome: "تحويل إلى مشرف الوردية", risk: "medium" },
        { condition: "نمط مرتجعات متكرّر", outcome: "إيقاف الآلي وتحويل للمراجعة", risk: "high" },
      ],
      exceptions: [
        { scenario: "منتج مخفَّض في تصفية نهائية", protocol: "لا استرجاع؛ يُعرض استبدال بقيمة رصيد فقط." },
      ],
      allowedActions: ["lookupOrder", "validateReturn", "issueRefund", "notifyCustomer"],
    },
    {
      slug: "order-support", name: "متابعة طلب", nameEn: "Order support",
      category: "خدمة العملاء", department: "خدمة العملاء", ownerName: "سارة المنصور",
      purpose: "الإجابة عن حالة الطلب ووقت التوصيل وتعديل العنوان.",
      riskLevel: "low", autonomyLevel: 5, status: "active",
      reliabilityScore: 94, usageCount: 2610, successRate: 98, humanTakeoverRate: 2.8, avgDurationMinutes: 0.9, hoursSavedTotal: 268,
      steps: [
        { title: "تحديد الطلب", description: "بالرقم أو برقم الجوال.", system: "POS", automated: true },
        { title: "قراءة الحالة", description: "قيد التجهيز / في الطريق / سُلّم.", system: "POS", automated: true },
        { title: "الردّ بالحالة والوقت", description: "مع الوقت المتوقع.", system: "قناة العملاء", automated: true },
        { title: "تعديل العنوان قبل الخروج", description: "يُسمح ما لم يخرج الطلب.", system: "POS", automated: true, decisionRule: "بعد الخروج يُحوَّل للمندوب." },
      ],
      decisions: [
        { condition: "الطلب لم يخرج بعد", outcome: "تعديل العنوان آلياً", risk: "low" },
        { condition: "الطلب خرج", outcome: "تحويل إلى تنسيق التوصيل", risk: "medium" },
      ],
      allowedActions: ["lookupOrder", "updateAddress", "notifyCustomer"],
    },
    {
      slug: "allergen-inquiry", name: "استفسار عن مكوّنات وحساسية", nameEn: "Allergen inquiry",
      category: "الجودة", department: "الجودة", ownerName: "دلال الشمري",
      purpose: "التقاط أسئلة الحساسية وتحويلها إلى مؤهَّل بشري بلا إجابة آلية.",
      riskLevel: "critical", autonomyLevel: 1, status: "practicing",
      reliabilityScore: 58, usageCount: 34, successRate: 100, humanTakeoverRate: 100, avgDurationMinutes: 0.5, hoursSavedTotal: 0,
      steps: [
        { title: "اكتشاف السؤال", description: "رصد ذكر حساسية أو مكوّن.", system: "قناة العملاء", automated: true },
        { title: "تحويل فوري", description: "إلى موظف الجودة مع نصّ السؤال.", system: "الجودة", automated: true, decisionRule: "لا إجابة آلية إطلاقاً." },
      ],
      decisions: [
        { condition: "أي ذكر لحساسية", outcome: "تحويل بشري بلا إجابة", risk: "critical" },
      ],
      exceptions: [
        { scenario: "العميل يلحّ على إجابة فورية", protocol: "يُعتذر ويُعطى رقم الجودة المباشر؛ لا يُجاب آلياً بحال." },
      ],
      allowedActions: ["detectAllergenQuestion", "routeToQuality"],
    },
    {
      slug: "stock-reorder", name: "اقتراح إعادة طلب", nameEn: "Stock reorder proposal",
      category: "المخزون", department: "المخزون", ownerName: "يوسف العلي",
      purpose: "رصد الأصناف عند الحدّ الآمن وتجهيز أمر شراء مقترح.",
      riskLevel: "low", autonomyLevel: 4, status: "active",
      reliabilityScore: 89, usageCount: 420, successRate: 95, humanTakeoverRate: 8, avgDurationMinutes: 2, hoursSavedTotal: 52,
      steps: [
        { title: "قراءة الكميات", description: "الكميات الحالية لكل صنف.", system: "POS", automated: true },
        { title: "مقارنة بالحدّ الآمن", description: "مطابقة بجدول مستويات المخزون.", system: "مستويات المخزون", automated: true },
        { title: "تجهيز أمر الشراء", description: "كميات مقترحة حسب معدل الدوران.", system: "POS", automated: true },
      ],
      decisions: [
        { condition: "صنف تحت الحدّ", outcome: "إدراج في أمر شراء مقترح", risk: "low" },
      ],
      allowedActions: ["readInventory", "draftPurchaseOrder"],
    },
  ],

  connectors: [
    { name: "نظام نقاط البيع (POS)", type: "sis", permissions: ["قراءة الطلبات", "تنفيذ استرجاع", "قراءة المخزون"] },
    { name: "بوابة الدفع", type: "payment", permissions: ["إرجاع مبلغ"] },
    { name: "قناة واتساب للعملاء", type: "whatsapp", permissions: ["استقبال", "إرسال"] },
    { name: "منصّة التوصيل", type: "crm", permissions: ["قراءة حالة الشحنة", "تعديل عنوان"] },
    { name: "مستودع البيانات", type: "database", permissions: ["قراءة"] },
  ],

  proposals: [
    {
      type: "improvement", title: "الاسترجاع تحت 5 د.ك يستهلك وقتاً أكثر من قيمته", titleEn: "Sub-5 KWD refunds cost more than they are worth",
      confidence: 94, observedCasesCount: 612,
      summary: "612 استرجاعاً بقيمة أقل من 5 د.ك مرّ بخطوة تحقّق يدوية معدّلها 4 دقائق — أي تكلفة معالجة تفوق المبلغ نفسه.",
      evidence: {
        methodA: { name: "تنفيذ آلي مباشر", percentage: 38, durationMin: 0.6, errorRate: 0.4 },
        methodB: { name: "تحقّق يدوي ثم تنفيذ", percentage: 62, durationMin: 4.1, errorRate: 0.3 },
        details: "فرق معدل الخطأ بين الطريقتين 0.1% — لا يبرّر فارق الزمن.",
      },
      clarifications: [{
        question: "هل نرفع سقف الاسترجاع الآلي الكامل إلى 5 د.ك بلا تحقّق يدوي؟",
        options: ["نعم — تنفيذ فوري تحت 5 د.ك", "نعم، مع مراجعة لاحقة بالعيّنة", "لا — يبقى التحقّق اليدوي"],
      }],
    },
    {
      type: "conflict", title: "تعارض في التعامل مع منتجات التصفية", titleEn: "Conflicting handling of clearance items",
      confidence: 86, observedCasesCount: 28,
      summary: "بعض الموظفين يسترجعون منتجات التصفية نقداً، وآخرون يمنحون رصيداً فقط.",
      evidence: {
        methodA: { name: "رصيد استبدال فقط", percentage: 61, durationMin: 2, errorRate: 0 },
        methodB: { name: "استرجاع نقدي", percentage: 39, durationMin: 2, errorRate: 0 },
        details: "السياسة المكتوبة تقول رصيداً، والتطبيق يخالفها في أربع حالات من عشر.",
      },
    },
  ],

  channel: {
    counterpart: "عميل",
    welcome: "هلا فيك في متاجر الواحة! كيف نقدر نساعدك؟",
    samplePrompts: [
      "أبي أرجّع طلب وصلني أمس",
      "وين طلبي رقم 4471؟",
      "هل الكيك فيه مكسرات؟ عندي حساسية",
    ],
  },
};
