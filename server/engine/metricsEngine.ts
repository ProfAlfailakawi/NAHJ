import type { AuditEvent, Skill, WorkItem, ShadowComparison, TestCase, Policy, ApprovalRequest } from "../../src/types/index.ts";

/*
 * محرّك القياس.
 *
 * كانت شاشتا الأثر والحوكمة تعرضان ثوابت مكتوبة في الشيفرة: «412 مهمة»، «84.5
 * ساعة»، «78.4% أتمتة»، «143 عملية معروفة»، «0 تجاوزات»، وحلقات سياسات عند
 * 92% و84% و100%. لا شيء منها مشتقّ من بيانة واحدة.
 *
 * وهذا أخطر ما كان في المستودع. لا لأنه رقم خاطئ — بل لأن نهج يبيع الحوكمة
 * والقياس تحديداً. مشترٍ يكتشف أن «0 تجاوزات» ثابتٌ لا يتغيّر مهما فعل، لن يصدّق
 * بعدها سجلّ التدقيق ولا نسبة المطابقة ولا شيئاً على الشاشة. الرقم المخترع في
 * منتج قياسٍ يُفسد كل الأرقام الصادقة من حوله.
 *
 * القاعدة هنا واحدة: كل رقم يُشتق من المخزن، وما لا يمكن اشتقاقه يُعلن أنه غير
 * متاح — لا يُخترع ولا يُقرَّب من فراغ. `null` مع سبب أصدق من رقمٍ جميل.
 */

/* ------------------------------------------------------------ الوقت */

/**
 * يقرأ الطوابع المعروضة بالعربية إلى ISO.
 *
 * بيانات البذرة تحمل «اليوم، 10:15 ص» و«أمس، 02:10 م» — نصوصٌ للعرض لا للحساب.
 * وبدون طابع حقيقي لا يمكن اشتقاق أي سلسلة زمنية، وهو ما دفع الشيفرة أصلاً إلى
 * كتابة منحنى الأسبوع بيدها.
 *
 * يُرجع null لما لا يُقرأ — فلا نخترع تاريخاً لسجلٍّ لا نعرف تاريخه.
 */
export function parseDisplayTimestamp(display: string, now = new Date()): string | null {
  if (typeof display !== "string" || !display.trim()) return null;

  const text = display.trim();
  // الفاصلة العربية والإنجليزية كلتاهما واردتان في البذرة نفسها.
  const time = /(\d{1,2}):(\d{2})/.exec(text);
  if (!time) return null;

  let hours = Number(time[1]);
  const minutes = Number(time[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) return null;

  /*
   * حدّ الكلمة `\b` لا ينطبق على الحروف العربية في تعابير جافاسكربت النمطية —
   * فهي ليست من `\w`. و`/\bم\b/` كان لا يطابق شيئاً إطلاقاً، فقُرئت كل ساعة
   * مسائية صباحيةً: «02:10 م» تصير الثانية فجراً. نطابق الرمز محاطاً بفراغ أو
   * فاصلة أو طرف النصّ بدلاً من ذلك — وهكذا لا تلتقط «م» من داخل «أمس».
   */
  const standalone = (marker: string) => new RegExp(`(^|[\\s،,])${marker}([\\s،,]|$)`).test(text);
  const pm = /PM/i.test(text) || standalone("م");
  const am = /AM/i.test(text) || standalone("ص");
  if (pm && hours < 12) hours += 12;
  if (am && hours === 12) hours = 0;

  const date = new Date(now);
  if (/أمس/.test(text)) date.setDate(date.getDate() - 1);
  else if (/قبل يومين/.test(text)) date.setDate(date.getDate() - 2);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

/**
 * الطابع الحقيقي لسجلّ.
 *
 * `at` وحده هو المصدر. وقراءة «اليوم» من نصّ العرض عند كل طلب كانت تدحرج السجلات
 * القديمة مع الساعة: حدثٌ مكتوبٌ عليه «اليوم» يبقى اليومَ إلى الأبد، و«أمس» يبقى
 * أمسِ أبداً — فلا يشيخ شيء، ويظلّ عدّاد اليوم ومنحنى الأسبوع يعيدان عرض البذرة
 * نفسها كل صباح.
 *
 * فالقراءة من النصّ تقع مرة واحدة عند بناء المخزن (`stampLegacyInstant`) وتُثبَّت،
 * ثم لا تُعاد. وما لا يحمل `at` بعدها لا طابع له — وهذا أصدق من طابع متحرّك.
 */
export const eventInstant = (event: { at?: string; timestamp?: string }, _now = new Date()): string | null =>
  event.at || null;

/**
 * يُثبّت طابعاً لسجلّ قديم مرة واحدة.
 *
 * يُنادى عند بناء المخزن لا عند كل قراءة: التاريخ الأصلي غير معروف، فأقرب ما
 * يمكن هو قراءة نصّ العرض لحظة أول تحميل وتثبيتها. والتثبيت هو المقصود — بعده
 * يشيخ السجلّ كما يشيخ كل شيء.
 */
export const stampLegacyInstant = (event: { at?: string; timestamp?: string }, now = new Date()): string | null =>
  event.at || parseDisplayTimestamp(String(event.timestamp || ""), now);

const dayKey = (iso: string) => iso.slice(0, 10);

/* --------------------------------------------------------- المتوسطات */

/**
 * متوسط مرجَّح بالاستعمال.
 *
 * المتوسط البسيط يساوي بين مهارة نُفِّذت 168 مرة وأخرى نُفِّذت 3 — فيُنتج «نسبة
 * نجاح» لا تصف ما يحدث فعلاً في المؤسسة. الترجيح بالاستعمال هو الوصف الصادق.
 *
 * ويُرجع null عند غياب أي استعمال: صفرٌ هنا يعني «نجاحنا صفر»، وهو ادّعاء آخر.
 */
function weightedAverage(items: Array<{ weight: number; value: number }>): number | null {
  const usable = items.filter(item => Number.isFinite(item.weight) && Number.isFinite(item.value) && item.weight > 0);
  const totalWeight = usable.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return null;
  return round(usable.reduce((sum, item) => sum + item.weight * item.value, 0) / totalWeight);
}

const round = (value: number, places = 1) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

const percent = (part: number, whole: number): number | null => (whole > 0 ? round((part / whole) * 100) : null);

/* ------------------------------------------------------------ الأنواع */

/**
 * كل مقياس يحمل معه أساسه وحجم عيّنته.
 *
 * رقمٌ بلا أساس لا يُراجَع: «94%» من ماذا، وعلى كم حالة؟ الواجهة تعرض الأساس عند
 * الطلب، فيستطيع من يقرأ أن يحكم على الرقم بدل أن يُصدّقه.
 */
export interface Measure {
  value: number | null;
  /** تعريف المقياس بلغة تُقرأ — لا اسم حقل. */
  basis: string;
  /** عدد السجلات التي اشتُقّ منها. صفر يعني: لا بيانات بعد. */
  sampleSize: number;
}

const measure = (value: number | null, basis: string, sampleSize: number): Measure => ({ value, basis, sampleSize });

export interface MetricsInput {
  skills: Skill[];
  workItems: WorkItem[];
  auditEvents: AuditEvent[];
  approvalRequests: ApprovalRequest[];
  shadowComparisons: ShadowComparison[];
  testCases: TestCase[];
  policies: Policy[];
  now?: Date;
}

/* ------------------------------------------------------- مؤشرات الأثر */

export interface ImpactKpis {
  executionsLifetime: Measure;
  hoursSavedLifetime: Measure;
  successRatePercent: Measure;
  errorRatePercent: Measure;
  humanTakeoverPercent: Measure;
  avgProcessDurationMin: Measure;
  automationRatePercent: Measure;
  shadowMatchRatePercent: Measure;
  practicePassRatePercent: Measure;
  activationRatePercent: Measure;
}

export function deriveImpact(input: MetricsInput): ImpactKpis {
  const { skills, shadowComparisons, testCases } = input;
  const used = skills.filter(skill => Number(skill.usageCount) > 0);
  const totalUsage = used.reduce((sum, skill) => sum + Number(skill.usageCount || 0), 0);

  const successRate = weightedAverage(used.map(skill => ({ weight: Number(skill.usageCount || 0), value: Number(skill.successRate || 0) })));
  const takeover = weightedAverage(used.map(skill => ({ weight: Number(skill.usageCount || 0), value: Number(skill.humanTakeoverRate || 0) })));
  const duration = weightedAverage(used.map(skill => ({ weight: Number(skill.usageCount || 0), value: Number(skill.avgDurationMinutes || 0) })));

  /*
   * «نسبة الأتمتة» تُعرَّف صراحةً: حصّة التنفيذ الذي تحمله مهارات بلغت مستوى
   * التحضير (L4) فما فوق. تعريفٌ آخر يُعطي رقماً آخر، فالتعريف جزء من الرقم.
   */
  const automatedUsage = used
    .filter(skill => Number(skill.autonomyLevel) >= 4)
    .reduce((sum, skill) => sum + Number(skill.usageCount || 0), 0);

  const shadowDecided = shadowComparisons.filter(comparison => typeof comparison.matched === "boolean");
  const shadowMatched = shadowDecided.filter(comparison => comparison.matched).length;

  const practiceRun = testCases.filter(test => test.resultStatus === "pass" || test.resultStatus === "fail");
  const practicePassed = practiceRun.filter(test => test.resultStatus === "pass").length;

  const activeSkills = skills.filter(skill => skill.status === "active").length;

  return {
    executionsLifetime: measure(totalUsage, "مجموع مرات تنفيذ كل مهارة موثّقة منذ اعتمادها.", used.length),
    hoursSavedLifetime: measure(
      round(skills.reduce((sum, skill) => sum + Number(skill.hoursSavedTotal || 0), 0)),
      "مجموع الساعات المستعادة المسجَّلة على المهارات.",
      skills.length,
    ),
    successRatePercent: measure(successRate, "نسبة النجاح مرجَّحة بعدد مرات التنفيذ لا بعدد المهارات.", used.length),
    errorRatePercent: measure(successRate === null ? null : round(100 - successRate), "المتمّم لنسبة النجاح المرجَّحة.", used.length),
    humanTakeoverPercent: measure(takeover, "نسبة الحالات التي استلمها موظف، مرجَّحة بالتنفيذ.", used.length),
    avgProcessDurationMin: measure(duration, "متوسط مدّة العملية بالدقائق، مرجَّحاً بالتنفيذ.", used.length),
    automationRatePercent: measure(
      percent(automatedUsage, totalUsage),
      "حصّة التنفيذ الذي تحمله مهارات عند مستوى التحضير (L4) فما فوق.",
      used.length,
    ),
    shadowMatchRatePercent: measure(
      percent(shadowMatched, shadowDecided.length),
      "نسبة تطابق قرار نهج مع قرار الموظف في جلسات الظل.",
      shadowDecided.length,
    ),
    practicePassRatePercent: measure(
      percent(practicePassed, practiceRun.length),
      "نسبة اجتياز حالات الاختبار التي نُفّذت فعلاً.",
      practiceRun.length,
    ),
    activationRatePercent: measure(
      percent(activeSkills, skills.length),
      "حصّة المهارات الموثّقة التي بلغت التشغيل الحيّ.",
      skills.length,
    ),
  };
}

/* -------------------------------------------------------- منحنى الأيام */

export interface TrendPoint { day: string; label: string; events: number; executions: number }

export interface Trend {
  available: boolean;
  /** سبب عدم التوفّر، بلغة تُقرأ. فارغ عند التوفّر. */
  reason: string;
  points: TrendPoint[];
}

/**
 * نشاط آخر سبعة أيام، مشتقّاً من سجلّ التدقيق.
 *
 * ويُعلن عدم توفّره صراحةً حين لا يوجد تاريخٌ يكفي — بدل رسم منحنى مخترع. منحنى
 * جميل على مؤسسة لم تبدأ العمل بعد هو أول كذبة يراها المشتري.
 */
export function deriveTrend(input: MetricsInput): Trend {
  const now = input.now || new Date();
  const stamped = input.auditEvents
    .map(event => eventInstant(event, now))
    .filter((iso): iso is string => Boolean(iso));

  if (!stamped.length) {
    return { available: false, reason: "لا سجلّ تدقيق بعد — المنحنى يظهر مع أول نشاط.", points: [] };
  }

  const byDay = new Map<string, number>();
  for (const iso of stamped) byDay.set(dayKey(iso), (byDay.get(dayKey(iso)) || 0) + 1);

  if (byDay.size < 2) {
    return {
      available: false,
      reason: `النشاط كلّه في يوم واحد (${byDay.size === 1 ? [...byDay.keys()][0] : "—"}) — المنحنى يحتاج يومين على الأقل.`,
      points: [],
    };
  }

  const points: TrendPoint[] = [];
  for (let back = 6; back >= 0; back--) {
    const date = new Date(now);
    date.setDate(date.getDate() - back);
    const key = dayKey(date.toISOString());
    points.push({
      day: key,
      label: date.toLocaleDateString("ar-KW", { weekday: "long" }),
      events: byDay.get(key) || 0,
      executions: byDay.get(key) || 0,
    });
  }
  return { available: true, reason: "", points };
}

/* ----------------------------------------------------------- الحوكمة */

export interface GovernanceSnapshot {
  policiesActive: Measure;
  humanGates: Measure;
  approvalsPending: Measure;
  approvalsDecided: Measure;
  killSwitchesActive: Measure;
  interceptedActions: Measure;
  /** إجراءات عالية الخطورة نُفِّذت بلا موافقة مقابلة. يجب أن تبقى صفراً — والصفر هنا مُثبَت. */
  unapprovedHighRiskActions: Measure;
  auditCoveragePercent: Measure;
  riskDistribution: { low: number; medium: number; high: number; critical: number; total: number };
  autonomyDistribution: Record<string, number>;
}

export function deriveGovernance(input: MetricsInput): GovernanceSnapshot {
  const { skills, policies, approvalRequests, auditEvents, workItems } = input;
  const now = input.now || new Date();
  const nowIso = now.toISOString();

  const activePolicies = policies.filter(policy => {
    const from = policy.effectiveFrom ? new Date(policy.effectiveFrom).toISOString() : "";
    const to = policy.effectiveTo ? new Date(policy.effectiveTo).toISOString() : "";
    return (!from || from <= nowIso) && (!to || to >= nowIso);
  });

  /*
   * «البوابات البشرية» = الأدوار المتمايزة التي يتوقّف عندها التنفيذ فعلاً. كان
   * الرقم 5 مكتوباً في الواجهة؛ وهو الآن يتحرّك مع سياسات المؤسسة وموافقاتها.
   */
  const gateRoles = new Set<string>();
  for (const approval of approvalRequests) if (approval.requiredRole) gateRoles.add(String(approval.requiredRole));
  for (const policy of policies) {
    for (const rule of policy.rules || []) {
      const match = /(مدير|manager|owner|admin|مالك|مشرف)/i.exec(String(rule.action || ""));
      if (match) gateRoles.add(match[0].toLowerCase());
    }
  }

  const decided = approvalRequests.filter(approval => approval.status !== "pending");
  const intercepted = auditEvents.filter(event => event.status === "intercepted");

  /*
   * التجاوزات — الرقم الذي كان ثابتاً على صفر.
   *
   * يُشتق الآن: إجراءٌ عالي الخطورة نفّذه الذكاء بنجاح دون أن يقابله طلب موافقة
   * مبتوت. صفرٌ هنا يعني أننا بحثنا فلم نجد، لا أننا كتبنا صفراً.
   */
  /*
   * أسماء الإجراءات تُكتب بعُرفين مختلفين: سجلّ التدقيق بـSCREAMING_SNAKE
   * («ISSUE_REFUND») وطلبات الموافقة بـcamelCase («issueRefund»). المطابقة
   * بالحروف الصغيرة وحدها لا تجمعهما أبداً، فكان كل إجراءٍ محكومٍ بموافقة
   * يُحتسب تجاوزاً. التطبيع يُسقط كل ما ليس حرفاً أو رقماً، فيلتقي العُرفان.
   */
  const normalizeAction = (name: unknown) => String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  /*
   * والموافقة تُستهلك مرة واحدة.
   *
   * المطابقة بمجموعةٍ من الأسماء كانت تجعل موافقةً واحدة على «استرجاع» تُجيز كل
   * استرجاعٍ لاحق إلى الأبد: يعتمد المدير حالةً واحدة، فيمرّ بعدها ألفُ تنفيذ
   * بلا موافقة والشاشة تقول «لا تجاوزات». وهو بالضبط الرقم الكاذب الذي أُزيل
   * من الشيفرة — عاد من باب المنطق بدل باب الثابت.
   *
   * فالعدّ رصيدٌ لا مجموعة: كل موافقة معتمدة تُجيز تنفيذاً واحداً، وتُخصم عند
   * استعمالها. والترتيب زمنيّ لأن موافقةً صدرت بعد التنفيذ لا تُجيزه بأثر رجعي.
   */
  const approvalBudget = new Map<string, number>();
  for (const approval of approvalRequests) {
    if (approval.status !== "approved") continue;
    const key = normalizeAction(approval.actionName);
    approvalBudget.set(key, (approvalBudget.get(key) || 0) + 1);
  }

  const highRiskExecutions = auditEvents
    .filter(event =>
      event.actorType === "ai" &&
      (event.risk === "high" || event.risk === "critical") &&
      event.status === "success")
    .sort((a, b) => String(eventInstant(a, now) || "").localeCompare(String(eventInstant(b, now) || "")));

  const unapproved = highRiskExecutions.filter(event => {
    const key = normalizeAction(event.action);
    const remaining = approvalBudget.get(key) || 0;
    if (remaining > 0) { approvalBudget.set(key, remaining - 1); return false; }
    return true;
  });

  const traced = workItems.filter(item => Array.isArray(item.timeline) && item.timeline.length > 0);

  const riskDistribution = { low: 0, medium: 0, high: 0, critical: 0, total: skills.length };
  for (const skill of skills) {
    const level = skill.riskLevel as keyof typeof riskDistribution;
    if (level in riskDistribution && level !== "total") riskDistribution[level]++;
  }

  const autonomyDistribution: Record<string, number> = {};
  for (const skill of skills) {
    const key = `L${Number(skill.autonomyLevel ?? 0)}`;
    autonomyDistribution[key] = (autonomyDistribution[key] || 0) + 1;
  }

  return {
    policiesActive: measure(activePolicies.length, "سياسات سارية المفعول في تاريخ اليوم.", policies.length),
    humanGates: measure(gateRoles.size, "الأدوار البشرية المتمايزة التي يتوقّف عندها التنفيذ.", approvalRequests.length + policies.length),
    approvalsPending: measure(approvalRequests.filter(a => a.status === "pending").length, "طلبات موافقة تنتظر قراراً.", approvalRequests.length),
    approvalsDecided: measure(decided.length, "طلبات بُتّ فيها اعتماداً أو رفضاً.", approvalRequests.length),
    killSwitchesActive: measure(skills.filter(skill => skill.killSwitchActive).length, "مهارات موقوفة بمفتاح إيقاف.", skills.length),
    interceptedActions: measure(intercepted.length, "إجراءات اعترضتها السياسات قبل التنفيذ.", auditEvents.length),
    unapprovedHighRiskActions: measure(
      unapproved.length,
      "إجراءات عالية الخطورة نفّذها الذكاء بلا موافقة مقابلة. كل موافقة معتمدة تُجيز تنفيذاً واحداً وتُستهلك — لا تُجيز ما بعده.",
      auditEvents.length,
    ),
    auditCoveragePercent: measure(
      percent(traced.length, workItems.length),
      "حصّة حالات العمل التي تحمل أثراً زمنياً قابلاً للمراجعة.",
      workItems.length,
    ),
    riskDistribution,
    autonomyDistribution,
  };
}

/* ------------------------------------------------- الذاكرة المؤسسية */

export interface InstitutionalMemory {
  documentedSkills: Measure;
  activeSkills: Measure;
  singlePersonDependencies: Measure;
  candidatesForPromotion: Measure;
  /**
   * العمليات غير الموثّقة.
   *
   * كان الرقم 37 مكتوباً في الشيفرة. وهو بطبيعته غير قابل للمعرفة: النظام لا يعلم
   * ما لم يُعرض عليه قطّ. يبقى `null` حتى يقيسه اكتشافٌ حقيقي من الموصلات، ويُقال
   * ذلك على الشاشة صراحةً — «غير مقيس» أصدق من رقمٍ يوحي بمسحٍ لم يجرِ.
   */
  undocumentedProcesses: Measure;
}

export function deriveMemory(input: MetricsInput): InstitutionalMemory {
  const { skills } = input;
  return {
    documentedSkills: measure(skills.length, "مهارات موثّقة في عقل المؤسسة.", skills.length),
    activeSkills: measure(skills.filter(skill => skill.status === "active").length, "مهارات تعمل حيّاً.", skills.length),
    singlePersonDependencies: measure(
      skills.filter(skill => skill.isSinglePointOfFailure).length,
      "مهارات يعتمد تنفيذها على شخص واحد.",
      skills.length,
    ),
    candidatesForPromotion: measure(
      skills.filter(skill => Number(skill.reliabilityScore) >= 90 && Number(skill.autonomyLevel) < 4).length,
      "مهارات بلغت موثوقية 90% فأكثر ولم تُرقَّ بعد إلى مستوى التحضير.",
      skills.length,
    ),
    undocumentedProcesses: measure(null, "غير مقيس — النظام لا يعرف ما لم يُعرض عليه. يحتاج اكتشافاً من الموصلات.", 0),
  };
}

/* ------------------------------------------------------- نشاط اليوم */

/**
 * نشاط اليوم — لا «ما أُنجز».
 *
 * العدّ يشمل كل ما سُجِّل: ترقية مهارة، وحسم إشارة، وفحص موصل، وتركيب حزمة.
 * وتسميته «أُنجز» تجعل ضغطةَ زرٍّ إداريةً تبدو مهمةً مكتملة. فالاسم صار يصف ما
 * يُعَدّ فعلاً، بدل أن يُعَدّ شيءٌ ويُسمّى بغيره.
 */
export function deriveToday(input: MetricsInput): Measure {
  const now = input.now || new Date();
  const today = dayKey(now.toISOString());
  const count = input.auditEvents.filter(event => {
    const iso = eventInstant(event, now);
    return iso ? dayKey(iso) === today : false;
  }).length;
  return measure(count, "أحداث مسجَّلة في سجلّ التدقيق بتاريخ اليوم — نشاطٌ لا إنجاز.", input.auditEvents.length);
}

/* ------------------------------------------------------------ الجامع */

export interface MetricsReport {
  impact: ImpactKpis;
  trend: Trend;
  governance: GovernanceSnapshot;
  memory: InstitutionalMemory;
  todayActivity: Measure;
  topSkills: Array<{ name: string; usageCount: number; hoursSaved: number; successRate: number; reliabilityTier: string; autonomyLevel: number }>;
  generatedAt: string;
}

export function deriveMetrics(input: MetricsInput): MetricsReport {
  const now = input.now || new Date();
  return {
    impact: deriveImpact(input),
    trend: deriveTrend(input),
    governance: deriveGovernance(input),
    memory: deriveMemory(input),
    todayActivity: deriveToday(input),
    topSkills: [...input.skills]
      .sort((a, b) => Number(b.usageCount || 0) - Number(a.usageCount || 0))
      .slice(0, 6)
      .map(skill => ({
        name: skill.name,
        usageCount: Number(skill.usageCount || 0),
        hoursSaved: Number(skill.hoursSavedTotal || 0),
        successRate: Number(skill.successRate || 0),
        reliabilityTier: String(skill.reliabilityTier || "low"),
        autonomyLevel: Number(skill.autonomyLevel ?? 0),
      })),
    generatedAt: now.toISOString(),
  };
}
