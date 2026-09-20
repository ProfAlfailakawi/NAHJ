import assert from "node:assert/strict";
import test from "node:test";

/*
 * حراسة على الصدق العددي.
 *
 * الخطر الذي تحرسه هذه الاختبارات ليس رقماً خاطئاً — بل عودة الأرقام المخترعة.
 * كانت شاشتا الأثر والحوكمة تعرضان ثوابت مكتوبة في الشيفرة على منتجٍ يبيع
 * القياس، وأخطرها «0 تجاوزات»: ادّعاء إثباتٍ لم يجرِ.
 *
 * فالمُختبَر هنا ثلاثة: أن كل رقم يُشتق، وأن ما لا يُشتق يبقى null، وأن التجاوز
 * حين يقع يظهر.
 */

import {
  deriveGovernance, deriveImpact, deriveMemory, deriveMetrics, deriveToday, deriveTrend,
  parseDisplayTimestamp, type MetricsInput,
} from "./engine/metricsEngine.ts";
import type { AuditEvent, Skill } from "../src/types/index.ts";

const skill = (over: Partial<Skill>): Skill => ({
  id: "s", slug: "s", name: "مهارة", nameEn: "Skill", category: "ops", purpose: "", department: "",
  autonomyLevel: 0, status: "draft", reliabilityScore: 0, reliabilityTier: "low", riskLevel: "low",
  activeVersion: 1, ownerName: "", isSinglePointOfFailure: false, usageCount: 0, successRate: 0,
  humanTakeoverRate: 0, avgDurationMinutes: 0, hoursSavedTotal: 0, steps: [], decisions: [],
  exceptions: [], versions: [], allowedActions: [], killSwitchActive: false, ...over,
});

const audit = (over: Partial<AuditEvent>): AuditEvent => ({
  id: `a_${Math.random()}`, timestamp: "اليوم، 10:00 ص", actorType: "system", actorName: "",
  action: "ACT", provenance: "", risk: "low", latencyMs: 1, details: "", status: "success", ...over,
});

const input = (over: Partial<MetricsInput> = {}): MetricsInput => ({
  skills: [], workItems: [], auditEvents: [], approvalRequests: [],
  shadowComparisons: [], testCases: [], policies: [], ...over,
});

/* ------------------------------------------------------------- الوقت */

test("الطوابع المعروضة بالعربية تُقرأ إلى وقت حقيقي", () => {
  const now = new Date("2026-09-20T12:00:00.000Z");
  const morning = parseDisplayTimestamp("اليوم، 10:15 ص", now);
  assert.ok(morning);
  assert.equal(new Date(morning!).getHours(), 10);

  // المساء يتحوّل إلى 24 ساعة.
  const evening = parseDisplayTimestamp("اليوم، 02:10 م", now);
  assert.equal(new Date(evening!).getHours(), 14);

  // «أمس» ينقص يوماً.
  const yesterday = parseDisplayTimestamp("أمس، 11:45 ص", now);
  assert.equal(new Date(yesterday!).getDate(), new Date(now).getDate() - 1);

  // الفاصلة الإنجليزية واردة في البذرة نفسها، فلا تُكسر القراءة.
  assert.ok(parseDisplayTimestamp("اليوم, 10:22 ص", now));
  // والصيغة الإنجليزية كذلك.
  assert.equal(new Date(parseDisplayTimestamp("09:45 AM", now)!).getHours(), 9);
});

test("ما لا يُقرأ يبقى null — لا يُخترع له تاريخ", () => {
  assert.equal(parseDisplayTimestamp(""), null);
  assert.equal(parseDisplayTimestamp("قريباً"), null);
  assert.equal(parseDisplayTimestamp("99:99"), null);
});

/* -------------------------------------------------------------- الأثر */

test("نسبة النجاح مرجَّحة بالتنفيذ لا بعدد المهارات", () => {
  /*
   * مهارة نُفِّذت 900 مرة بنجاح 100%، وأخرى نُفِّذت 100 مرة بنجاح 50%.
   * المتوسط البسيط 75% — وهو وصفٌ كاذب لما يحدث. المرجَّح 95%.
   */
  const impact = deriveImpact(input({
    skills: [
      skill({ id: "a", usageCount: 900, successRate: 100 }),
      skill({ id: "b", usageCount: 100, successRate: 50 }),
    ],
  }));
  assert.equal(impact.successRatePercent.value, 95);
  assert.equal(impact.errorRatePercent.value, 5);
  assert.equal(impact.executionsLifetime.value, 1000);
});

test("بلا تنفيذ لا تُخترع نسبة — null لا صفر", () => {
  const impact = deriveImpact(input({ skills: [skill({ usageCount: 0, successRate: 99 })] }));
  assert.equal(impact.successRatePercent.value, null, "صفرٌ هنا يعني «نجاحنا صفر»، وهو ادّعاء آخر");
  assert.equal(impact.successRatePercent.sampleSize, 0);
  assert.equal(impact.shadowMatchRatePercent.value, null);
  assert.equal(impact.practicePassRatePercent.value, null);
});

test("نسبة الأتمتة هي حصّة التنفيذ عند L4 فما فوق", () => {
  const impact = deriveImpact(input({
    skills: [
      skill({ id: "a", usageCount: 300, autonomyLevel: 5 }),
      skill({ id: "b", usageCount: 100, autonomyLevel: 2 }),
    ],
  }));
  assert.equal(impact.automationRatePercent.value, 75);
  assert.match(impact.automationRatePercent.basis, /L4/, "التعريف جزء من الرقم، فيُذكر");
});

test("كل مقياس يحمل أساسه وحجم عيّنته", () => {
  const impact = deriveImpact(input({ skills: [skill({ usageCount: 5, successRate: 80 })] }));
  for (const [name, item] of Object.entries(impact)) {
    assert.ok(item.basis.length > 10, `${name} بلا أساس مقروء`);
    assert.equal(typeof item.sampleSize, "number", `${name} بلا حجم عيّنة`);
  }
});

/* ------------------------------------------------------------ المنحنى */

test("المنحنى لا يُرسم من يوم واحد — ويقول لماذا", () => {
  const now = new Date("2026-09-20T12:00:00.000Z");
  /* سجلات مثبَّتة الطابع في يومٍ واحد — لا تكفي لمنحنى. */
  const oneDay = deriveTrend(input({
    auditEvents: [audit({ at: "2026-09-20T09:00:00.000Z" }), audit({ at: "2026-09-20T10:00:00.000Z" })],
    now,
  }));
  assert.equal(oneDay.available, false);
  assert.match(oneDay.reason, /يوم واحد/);
  assert.deepEqual(oneDay.points, []);

  /* وسجلاتٌ بلا طابع مثبَّت لا تُقرأ إطلاقاً — لا تُدحرج مع الساعة. */
  const unstamped = deriveTrend(input({ auditEvents: [audit({}), audit({})], now }));
  assert.equal(unstamped.available, false);
  assert.match(unstamped.reason, /لا سجلّ/);

  const none = deriveTrend(input({ auditEvents: [], now }));
  assert.equal(none.available, false);
  assert.match(none.reason, /لا سجلّ/);
});

test("المنحنى يُرسم سبعة أيام حين يكفي التاريخ", () => {
  const now = new Date("2026-09-20T12:00:00.000Z");
  const trend = deriveTrend(input({
    auditEvents: [
      audit({ at: "2026-09-20T09:00:00.000Z" }),
      audit({ at: "2026-09-20T10:00:00.000Z" }),
      audit({ at: "2026-09-19T09:00:00.000Z" }),
    ],
    now,
  }));
  assert.equal(trend.available, true);
  assert.equal(trend.points.length, 7);
  assert.equal(trend.points.at(-1)!.events, 2, "اليوم فيه حدثان");
  assert.equal(trend.points.at(-2)!.events, 1);
  assert.equal(trend.points[0].events, 0, "يومٌ بلا نشاط صفرٌ صادق");
});

/* ----------------------------------------------------------- الحوكمة */

test("التجاوز يظهر حين يقع فعلاً", () => {
  /*
   * إجراء عالي الخطورة نفّذه الذكاء بنجاح، ولا طلب موافقة معتمداً يقابله.
   * هذا بالضبط ما كان الرقم الثابت «0» يخفيه.
   */
  const governance = deriveGovernance(input({
    auditEvents: [audit({ actorType: "ai", risk: "critical", status: "success", action: "ISSUE_REFUND" })],
  }));
  assert.equal(governance.unapprovedHighRiskActions.value, 1);
});

test("وجود موافقة معتمدة مقابلة يُسقط التجاوز", () => {
  const governance = deriveGovernance(input({
    auditEvents: [audit({ actorType: "ai", risk: "critical", status: "success", action: "ISSUE_REFUND" })],
    approvalRequests: [{
      id: "ap1", workItemId: "w", workTitle: "", actionName: "issueRefund", payload: {},
      reasonCode: "", reasonDescription: "", riskLevel: "critical", requiredRole: "manager",
      requestedAt: "", status: "approved",
    }],
  }));
  assert.equal(governance.unapprovedHighRiskActions.value, 0, "الصفر هنا نتيجة مطابقة، لا قيمة مكتوبة");
});

test("إجراء منخفض الخطورة أو بشريّ ليس تجاوزاً", () => {
  const governance = deriveGovernance(input({
    auditEvents: [
      audit({ actorType: "ai", risk: "low", status: "success" }),
      audit({ actorType: "human", risk: "critical", status: "success" }),
      audit({ actorType: "ai", risk: "critical", status: "intercepted" }),
    ],
  }));
  assert.equal(governance.unapprovedHighRiskActions.value, 0);
  assert.equal(governance.interceptedActions.value, 1, "المعترَض يُعدّ على حدة — هو دليل عمل الحوكمة");
});

test("البوابات البشرية تُعدّ من أدوار الموافقة الفعلية لا من رقم ثابت", () => {
  const base = deriveGovernance(input({}));
  assert.equal(base.humanGates.value, 0, "بلا موافقات ولا سياسات، لا بوابات");

  const withGates = deriveGovernance(input({
    approvalRequests: [
      { id: "1", workItemId: "", workTitle: "", actionName: "", payload: {}, reasonCode: "", reasonDescription: "", riskLevel: "high", requiredRole: "manager", requestedAt: "", status: "pending" },
      { id: "2", workItemId: "", workTitle: "", actionName: "", payload: {}, reasonCode: "", reasonDescription: "", riskLevel: "high", requiredRole: "owner", requestedAt: "", status: "pending" },
      { id: "3", workItemId: "", workTitle: "", actionName: "", payload: {}, reasonCode: "", reasonDescription: "", riskLevel: "high", requiredRole: "manager", requestedAt: "", status: "pending" },
    ],
  }));
  assert.equal(withGates.humanGates.value, 2, "دوران متمايزان من ثلاثة طلبات");
});

test("توزيع المخاطر والاستقلالية من المهارات نفسها", () => {
  const governance = deriveGovernance(input({
    skills: [
      skill({ id: "a", riskLevel: "low", autonomyLevel: 0 }),
      skill({ id: "b", riskLevel: "high", autonomyLevel: 5 }),
      skill({ id: "c", riskLevel: "high", autonomyLevel: 5 }),
    ],
  }));
  assert.deepEqual(governance.riskDistribution, { low: 1, medium: 0, high: 2, critical: 0, total: 3 });
  assert.equal(governance.autonomyDistribution.L5, 2);
  assert.equal(governance.autonomyDistribution.L0, 1);
});

test("تغطية الأثر = حصّة حالات العمل التي تحمل أثراً", () => {
  const governance = deriveGovernance(input({
    workItems: [
      { timeline: [{ time: "", actor: "ai", title: "", details: "" }] } as never,
      { timeline: [] } as never,
    ],
  }));
  assert.equal(governance.auditCoveragePercent.value, 50);
});

/* ------------------------------------------------ الذاكرة المؤسسية */

test("العمليات غير الموثّقة تبقى غير مقيسة — لا رقم لها", () => {
  const memory = deriveMemory(input({ skills: [skill({}), skill({ id: "b" })] }));
  assert.equal(memory.undocumentedProcesses.value, null,
    "النظام لا يعلم ما لم يُعرض عليه؛ الرقم 37 كان اختراعاً");
  assert.match(memory.undocumentedProcesses.basis, /غير مقيس/);
  assert.equal(memory.documentedSkills.value, 2);
});

test("المرشّحون للترقية يُشتقّون من الموثوقية والمستوى", () => {
  const memory = deriveMemory(input({
    skills: [
      skill({ id: "a", reliabilityScore: 95, autonomyLevel: 2 }),
      skill({ id: "b", reliabilityScore: 95, autonomyLevel: 5 }),
      skill({ id: "c", reliabilityScore: 40, autonomyLevel: 1 }),
    ],
  }));
  assert.equal(memory.candidatesForPromotion.value, 1);
});

/* ------------------------------------------------------- نشاط اليوم */

test("نشاط اليوم يُعدّ من سجلّ اليوم وحده", () => {
  const now = new Date("2026-09-20T12:00:00.000Z");
  const today = deriveToday(input({
    auditEvents: [
      audit({ at: "2026-09-20T08:00:00.000Z" }),
      audit({ at: "2026-09-20T09:00:00.000Z" }),
      audit({ at: "2026-09-18T09:00:00.000Z" }),
    ],
    now,
  }));
  assert.equal(today.value, 2);
});

test("نظام بلا نشاط يقول صفراً — والصفر هنا صادق", () => {
  const report = deriveMetrics(input({ now: new Date("2026-09-20T12:00:00.000Z") }));
  assert.equal(report.todayActivity.value, 0);
  assert.equal(report.impact.successRatePercent.value, null);
  assert.equal(report.trend.available, false);
  assert.equal(report.governance.unapprovedHighRiskActions.value, 0);
  assert.deepEqual(report.topSkills, []);
});

/* --------------------------------------------- حراسة ضدّ عودة الاختراع */

test("لا ثوابت مكتوبة عادت إلى مساري الأثر والحوكمة", async () => {
  const fs = await import("node:fs");
  const routes = fs.readFileSync("server/routes.ts", "utf8");
  const analytics = /apiRouter\.get\("\/analytics"[\s\S]*?\n\}\);/.exec(routes)?.[0] || "";

  assert.ok(analytics, "تعذّر العثور على مسار الأثر");
  for (const ghost of ["412", "84.5", "78.4", "94.2", "0.8", "3.9", "5.4", "88"]) {
    assert.doesNotMatch(analytics, new RegExp(`[^\\w.]${ghost.replace(".", "\\.")}[^\\w.]`),
      `عاد الثابت ${ghost} إلى مسار الأثر`);
  }
  assert.match(analytics, /deriveMetrics/, "المسار لا يشتقّ");

  const today = /apiRouter\.get\("\/today"[\s\S]*?\n\}\);/.exec(routes)?.[0] || "";
  assert.doesNotMatch(today, /tasksCompletedToday: \d/, "عاد عدّاد اليوم رقماً مكتوباً");
  assert.doesNotMatch(today, /undocumentedProcesses: \d/, "لا يُخترع رقمٌ لما لا يُعرف");
});

test("الواجهة لا تحمل أرقام ارتدادٍ مخترعة", async () => {
  const fs = await import("node:fs");
  const app = fs.readFileSync("src/App.tsx", "utf8");
  const fallback = /const fallbackAnalytics:AnalyticsData=\{[\s\S]*?\n\};/.exec(app)?.[0] || "";
  assert.ok(fallback, "تعذّر العثور على كائن الارتداد");
  assert.doesNotMatch(fallback, /412|84\.5|78\.4|94\.2/, "عاد الارتداد يعرض أرقاماً جميلة بدل أن يقول إنه فشل");
  assert.match(fallback, /available:false/, "الارتداد يجب أن يُعلن غياب البيانات");
});

/* ------------------------------- جولة مراجعة ثانية: أربعة عيوب في المحرّك */

test("موافقةٌ واحدة تُجيز تنفيذاً واحداً — لا كل ما يحمل اسمها إلى الأبد", async () => {
  const { deriveGovernance: derive } = await import("./engine/metricsEngine.ts");
  /*
   * العيب: المطابقة بمجموعة أسماء تجعل اعتماداً واحداً على «استرجاع» يُجيز كل
   * استرجاعٍ لاحق، فيمرّ ألفُ تنفيذ بلا موافقة والشاشة تقول «لا تجاوزات».
   */
  const approval = {
    id: "ap1", workItemId: "w1", workTitle: "", actionName: "issueRefund", payload: {},
    reasonCode: "", reasonDescription: "", riskLevel: "critical" as const, requiredRole: "manager" as const,
    requestedAt: "", status: "approved" as const,
  };
  const execution = (id: string, at: string) =>
    audit({ id, at, actorType: "ai", risk: "critical", status: "success", action: "ISSUE_REFUND" });

  const one = derive(input({ approvalRequests: [approval], auditEvents: [execution("a", "2026-09-20T09:00:00.000Z")] }));
  assert.equal(one.unapprovedHighRiskActions.value, 0, "الموافقة الواحدة لم تُجز تنفيذها");

  const three = derive(input({
    approvalRequests: [approval],
    auditEvents: [
      execution("a", "2026-09-20T09:00:00.000Z"),
      execution("b", "2026-09-20T10:00:00.000Z"),
      execution("c", "2026-09-20T11:00:00.000Z"),
    ],
  }));
  assert.equal(three.unapprovedHighRiskActions.value, 2,
    "موافقة واحدة أجازت ثلاثة تنفيذات — عاد الرقم الكاذب من باب المنطق");

  /* وموافقتان تُجيزان اثنين. */
  const two = derive(input({
    approvalRequests: [approval, { ...approval, id: "ap2" }],
    auditEvents: [execution("a", "2026-09-20T09:00:00.000Z"), execution("b", "2026-09-20T10:00:00.000Z")],
  }));
  assert.equal(two.unapprovedHighRiskActions.value, 0);
});

test("السجلّ القديم لا يتدحرج مع الساعة", () => {
  /*
   * قراءة «اليوم» من نصّ العرض عند كل طلب كانت تُبقي حدث البذرة اليومَ أبداً،
   * فلا يشيخ شيء ويعيد عدّاد اليوم عرض البذرة نفسها كل صباح.
   */
  const legacy = audit({ timestamp: "اليوم، 10:15 ص" });
  delete (legacy as { at?: string }).at;

  const today = deriveToday(input({ auditEvents: [legacy], now: new Date("2026-09-20T12:00:00.000Z") }));
  assert.equal(today.value, 0, "سجلٌّ بلا طابع مثبَّت يُحتسب في يوم القراءة");

  /* وبعد التثبيت مرة واحدة يُعَدّ في يومه هو، ويشيخ بعده. */
  const stamped = audit({ at: "2026-09-20T09:00:00.000Z" });
  assert.equal(deriveToday(input({ auditEvents: [stamped], now: new Date("2026-09-20T12:00:00.000Z") })).value, 1);
  assert.equal(deriveToday(input({ auditEvents: [stamped], now: new Date("2026-09-23T12:00:00.000Z") })).value, 0,
    "السجلّ المثبَّت ما زال يُحتسب بعد ثلاثة أيام");
});

test("التثبيت يقع مرة واحدة عند بناء المخزن", async () => {
  const { Store } = await import("./db.ts");
  const store = new Store();
  const stamped = store.auditEvents.filter(event => Boolean(event.at));
  assert.ok(stamped.length > 0, "لم يُثبَّت أي طابع عند البناء");
  /* وطابعٌ مثبَّت لا يتغيّر بقراءةٍ لاحقة. */
  const first = store.auditEvents[0].at;
  assert.equal(store.auditEvents[0].at, first);
});

test("عدّاد اليوم يقول إنه نشاط لا إنجاز", () => {
  const today = deriveToday(input({ auditEvents: [audit({ at: new Date().toISOString() })] }));
  assert.match(today.basis, /نشاطٌ لا إنجاز/, "الاسم ما زال يَعِد بإنجاز ويعدّ نشاطاً");
});
