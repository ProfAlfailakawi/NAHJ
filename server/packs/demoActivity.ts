import type { ApprovalRequest, AuditEvent, LearningProposal, ShadowComparison, TestCase, WorkItem } from "../../src/types/index.ts";
import type { ExpandedPack, PackDemo } from "./types.ts";

/*
 * يوسّع نشاط العرض المضغوط في الحزمة إلى كيانات كاملة الأنواع.
 *
 * ولا يخترع رقماً: نتائج التدرّب والظل تُترك فارغة ليملأها المحرّك حين يُشغَّل،
 * فيرى الزائر المحرّكَ يقرّر لا نتيجةً مكتوبة سلفاً.
 */
export interface DemoActivity {
  workItems: WorkItem[];
  approvalRequests: ApprovalRequest[];
  testCases: TestCase[];
  shadowComparisons: ShadowComparison[];
}

export function buildDemoActivity(demo: PackDemo, expanded: ExpandedPack, sectorCode: string): DemoActivity {
  const skillBySlug = new Map(expanded.skills.map(skill => [skill.slug, skill]));
  const skillFor = (slug: string) => {
    const skill = skillBySlug.get(slug);
    /* خطأ تأليف لا حالة تشغيل: حزمةٌ تشير إلى مهارة غير موجودة يجب أن تُكتشف في الاختبار. */
    if (!skill) throw new Error(`حزمة ${sectorCode}: مهارة غير معروفة «${slug}» في محتوى العرض`);
    return skill;
  };

  const workItems: WorkItem[] = demo.work.map((work, index) => {
    const skill = skillFor(work.skill);
    return {
      id: `wi_${sectorCode}_${index + 1}`,
      code: work.code,
      title: work.title,
      skillId: skill.id,
      skillName: skill.name,
      contactName: work.contact,
      contactPhone: "",
      state: work.state,
      riskLevel: work.risk,
      assignedMode: work.mode || "ai",
      createdAt: work.timeline[work.timeline.length - 1]?.time || "اليوم",
      updatedAt: work.timeline[0]?.time || "الآن",
      progressPercent: work.progress,
      currentStepTitle: work.step,
      details: { sector: sectorCode, ...(work.details || {}) },
      timeline: work.timeline.map(entry => ({ ...entry })),
    };
  });

  const workByCode = new Map(workItems.map(item => [item.code, item]));
  const approvalRequests: ApprovalRequest[] = demo.approvals.map((approval, index) => {
    const work = workByCode.get(approval.work);
    if (!work) throw new Error(`حزمة ${sectorCode}: موافقة تشير إلى حالة غير موجودة «${approval.work}»`);
    return {
      id: `appr_${sectorCode}_${index + 1}`,
      workItemId: work.id,
      workTitle: work.title,
      actionName: approval.action,
      payload: { sector: sectorCode, ...approval.payload },
      reasonCode: approval.reasonCode,
      reasonDescription: approval.reason,
      riskLevel: approval.risk,
      requiredRole: approval.requiredRole,
      requestedAt: work.updatedAt,
      status: "pending",
    };
  });

  const testCases: TestCase[] = demo.cases.map((testCase, index) => ({
    id: `tc_${sectorCode}_${index + 1}`,
    name: testCase.name,
    skillId: skillFor(testCase.skill).id,
    scenario: testCase.scenario,
    expectedAction: testCase.expected,
    expectedStatus: "pass",
  }));

  const shadowComparisons: ShadowComparison[] = demo.shadow.map((shadow, index) => ({
    id: `sh_${sectorCode}_${index + 1}`,
    caseTitle: shadow.title,
    title: shadow.title,
    timestamp: "اليوم",
    scenario: shadow.scenario,
    humanActor: shadow.humanActor,
    humanAction: shadow.human,
    humanActionCode: shadow.humanCode,
    humanReason: shadow.humanReason,
    aiAction: "",
    aiReason: "",
    matched: false,
    driftDetected: false,
  }));

  return { workItems, approvalRequests, testCases, shadowComparisons };
}

/* ============================================================ تاريخ العرض */

/*
 * أسبوعٌ مضى في مؤسسة العرض.
 *
 * نشاط الحزمة أربع حالاتٍ اليوم؛ فكان «نبض الأسبوع» يقول «النشاط كلّه في يوم
 * واحد»، و«الأشخاص» و«السجل» يوحيان بمؤسسةٍ فتحت أبوابها هذا الصباح. هذا
 * التاريخ يملأ الأيام الستة الماضية بحالاتٍ مكتملة بأسماء عملاء القطاع،
 * وبموافقاتٍ حُسمت، وبسجلّ تدقيقٍ مؤرَّخٍ فعلاً (`at`) — في الصندوق وحده.
 */
const HISTORY_CONTACTS: Record<string, string[]> = {
  clinic: ["سلمى عادل", "خالد جاسم", "نوف مبارك", "حمد سالم", "دلال يوسف", "فهد ناصر", "شيخة بدر", "مشعل حمد", "العنود فيصل", "راشد طلال", "بشاير سعد", "يعقوب عيسى"],
  law: ["شركة الرمال للمقاولات", "بدر عبدالله", "مؤسسة الواحة التجارية", "منيرة خالد", "سعود فهد", "شركة النخيل العقارية", "هند جاسم", "ناصر مبارك", "أمل سالم", "مجموعة الصفاة", "عبدالرحمن يوسف", "لطيفة حمد"],
  retail: ["غدير سالم", "محمد العتيبي", "ريم فيصل", "علي حسين", "نورة بدر", "جراح ناصر", "مريم عادل", "عبدالعزيز فهد", "دانة جاسم", "طلال سعد", "حصة مبارك", "يوسف خالد"],
  logistics: ["شركة الخليج للأغذية", "مؤسسة البحر للتجارة", "فيصل حمد", "شركة الجهراء للمواد", "سارة ناصر", "مصنع الشويخ", "بدر سالم", "شركة الأحمدي للتوريد", "هيا عبدالله", "مخازن الري", "خالد مبارك", "متجر الفحيحيل"],
  realestate: ["عبدالله جاسم", "شركة المروج العقارية", "منى فهد", "سالم بدر", "نورة يوسف", "مؤسسة السالمية", "حمد ناصر", "دلال سعد", "فيصل عادل", "شيماء خالد", "مبارك طلال", "أسرار حمد"],
};

const pad2 = (value: number) => String(value).padStart(2, "0");
const displayStamp = (date: Date, dayOffset: number) => {
  /* بعد أسبوعٍ يصير «قبل 45 أيام» ركيكاً — يُكتب التاريخ نفسه. */
  if (dayOffset > 10) return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}، ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  const day = dayOffset === 0 ? "اليوم" : dayOffset === 1 ? "أمس" : dayOffset === 2 ? "قبل يومين" : dayOffset <= 10 ? `قبل ${dayOffset} أيام` : "";
  const hours = date.getHours();
  return `${day}، ${pad2(hours)}:${pad2(date.getMinutes())} ${hours >= 12 ? "م" : "ص"}`;
};

export interface DemoHistory {
  workItems: WorkItem[];
  approvalRequests: ApprovalRequest[];
  auditEvents: AuditEvent[];
}

export function buildDemoHistory(expanded: ExpandedPack, sectorCode: string, now: Date = new Date()): DemoHistory {
  const contacts = HISTORY_CONTACTS[sectorCode] || HISTORY_CONTACTS.retail;
  const skills = expanded.skills;
  const people = expanded.users.map(user => user.name);
  const manager = expanded.users.find(user => user.role === "manager" || user.role === "admin")?.name || people[0] || "المدير";
  const workItems: WorkItem[] = [];
  const approvalRequests: ApprovalRequest[] = [];
  const auditEvents: AuditEvent[] = [];
  let serial = 0;

  /*
   * الأسبوع الأخير كثيف (٢–٤ حالات يومياً)، وما قبله حتى أربعة أشهرٍ أخفّ: مؤسسةٌ تعمل منذ
   * شهور لا أسبوعٍ واحد، فيقرأ السجلّ والعمل والموافقات عمراً حقيقياً.
   */
  for (let dayOffset = 120; dayOffset >= 1; dayOffset--) {
    const perDay = dayOffset <= 6 ? 2 + ((dayOffset * 7) % 3) : (dayOffset % 2 === 0 ? 1 : 0) + (dayOffset % 5 === 0 ? 1 : 0);
    for (let slot = 0; slot < perDay; slot++) {
      const skill = skills[(serial + dayOffset) % skills.length];
      const contact = contacts[serial % contacts.length];
      const at = new Date(now);
      at.setDate(at.getDate() - dayOffset);
      at.setHours(8 + ((slot * 3 + dayOffset) % 9), (serial * 17) % 60, 0, 0);
      const stamp = displayStamp(at, dayOffset);
      const iso = at.toISOString();
      const escalated = serial % 7 === 3;
      const gated = skill.riskLevel === "high" || skill.riskLevel === "critical";
      /*
       * موافقةٌ رُفضت تُوقف الحالة. كانت الحالة تُسجَّل «مكتملة 100%» بينما
       * طلب اعتمادها مرفوض وسجلّها يقول «اعتُرض» — ثلاث روايات لحدثٍ واحد.
       */
      const rejected = gated && !escalated && serial % 9 === 4;
      const code = `H-${sectorCode.slice(0, 3).toUpperCase()}-${1100 + serial}`;
      const item: WorkItem = {
        id: `wi_${sectorCode}_h${serial + 1}`,
        code,
        title: `${skill.name} — ${contact}`,
        skillId: skill.id,
        skillName: skill.name,
        contactName: contact,
        contactPhone: "",
        state: escalated || rejected ? "escalated" : "completed",
        riskLevel: skill.riskLevel,
        assignedMode: escalated || rejected ? "human_takeover" : "ai",
        createdAt: stamp,
        updatedAt: stamp,
        progressPercent: rejected ? 80 : 100,
        currentStepTitle: escalated ? `تولّاها ${people[serial % people.length] || manager} — حالة خارج الإجراء الموثّق`
          : rejected ? `رفض ${manager} الاعتماد — أُوقف التنفيذ وأُعيدت الحالة للموظف` : "اكتمل الإجراء وسُجّل الأثر كاملاً",
        details: { sector: sectorCode, history: true },
        timeline: [
          ...(rejected ? [{ time: stamp, actor: "human" as const, title: "رُفض الاعتماد", details: `رفض ${manager} الإجراء — لم يُنفَّذ.`, badge: "Rejected" }] : []),
          ...skill.steps.slice(0, 3).map(step => ({
            time: stamp, actor: step.isAutomated ? "ai" as const : "human" as const, title: step.title, details: step.description,
          })).reverse(),
        ],
      };
      workItems.push(item);

      const action = skill.allowedActions?.[serial % Math.max(1, skill.allowedActions.length)] || "executeStep";
      if (gated && !escalated) {
        /* ما يمسّ الخطورة العالية نُفِّذ بعد موافقةٍ مقابلة — والسجل يشهد بالترتيب. */
        approvalRequests.push({
          id: `appr_${sectorCode}_h${serial + 1}`,
          workItemId: item.id,
          workTitle: item.title,
          actionName: action,
          payload: { sector: sectorCode, contact },
          reasonCode: expanded.policies[serial % Math.max(1, expanded.policies.length)]?.code || "POL",
          reasonDescription: `إجراء عالي الخطورة في «${skill.name}» يحتاج اعتماداً بشرياً قبل التنفيذ.`,
          riskLevel: skill.riskLevel,
          requiredRole: "manager",
          requestedAt: stamp,
          status: rejected ? "rejected" : "approved",
          decidedBy: manager,
          decidedAt: stamp,
        } as ApprovalRequest);
      }
      const approved = gated && !escalated && !rejected;
      auditEvents.push({
        id: `aud_${sectorCode}_h${serial + 1}`,
        timestamp: stamp,
        at: iso,
        actorType: escalated ? "human" : "ai",
        actorName: escalated ? (people[serial % people.length] || manager) : "نهج",
        action: escalated ? "HUMAN_TAKEOVER" : approved || !gated ? action : "APPROVAL_REJECTED",
        provenance: code,
        risk: escalated ? "medium" : approved || !gated ? skill.riskLevel : "medium",
        latencyMs: 300 + ((serial * 137) % 2200),
        details: `${item.title}: ${item.currentStepTitle}`,
        status: escalated ? "warning" : approved || !gated ? "success" : "intercepted",
      } as AuditEvent);
      if (serial % 5 === 2) {
        const policy = expanded.policies[serial % Math.max(1, expanded.policies.length)];
        auditEvents.push({
          id: `aud_${sectorCode}_hp${serial + 1}`,
          timestamp: stamp,
          at: new Date(at.getTime() - 60_000).toISOString(),
          actorType: "system",
          actorName: "محرك السياسات",
          action: "POLICY_INTERCEPT",
          policyCode: policy?.code,
          provenance: "Policy Engine Interception",
          risk: "high",
          latencyMs: 40,
          details: `أُوقف طلبٌ خارج «${policy?.title || "السياسة المعتمدة"}» قبل التنفيذ — ${contact}.`,
          status: "intercepted",
        } as AuditEvent);
      }
      serial++;
    }
  }
  /* الأحدث أولاً، كما يعرضه السجل. */
  return { workItems: workItems.reverse(), approvalRequests: approvalRequests.reverse(), auditEvents: auditEvents.sort((a, b) => String(b.at).localeCompare(String(a.at))) };
}

/* ============================================================ إشارات حُسمت */

/*
 * إشاراتُ تعلّمٍ بُتّ فيها خلال الأشهر الماضية.
 *
 * «من الإشارات محسوم» يُحسب من نسبة المحسوم إلى المرصود، فمؤسسةٌ لم يُحسم فيها شيء تُقرأ
 * ٠٪ وكأن النظام لم يعمل يوماً. هذه إشاراتٌ مغلقة بأسماء مهارات المؤسسة نفسها، وبعدد حالات
 * ونسبة ثقةٍ مختلفين، تُضاف إلى صندوق العرض وحده.
 */
export function buildResolvedProposals(skillNames: string[], sectorCode: string): LearningProposal[] {
  const names = skillNames.length ? skillNames : ["الإجراء الأساسي"];
  const templates: Array<{ type: LearningProposal["type"]; title: (n: string) => string; titleEn: string; summary: (n: string) => string; days: number; cases: number; confidence: number; status: "resolved" | "dismissed" }> = [
    { type: "conflict", title: n => `توحيد طريقة تنفيذ «${n}»`, titleEn: "Unified two competing methods", summary: n => `رُصدت طريقتان لتنفيذ «${n}»؛ اعتمد المسؤول الأدقّ منهما وأُلحقت بالمهارة كخطوة موثّقة.`, days: 84, cases: 46, confidence: 91, status: "resolved" },
    { type: "process_drift", title: n => `انحراف مؤقّت في «${n}» أُغلق`, titleEn: "Process drift closed", summary: () => "تخطّى موظفان خطوة تحقّق لضغط العمل؛ أُعيدت الخطوة إلزاميةً وصدرت تذكرةٌ بالتدريب.", days: 71, cases: 19, confidence: 86, status: "resolved" },
    { type: "improvement", title: n => `رسائل استباقية قبل «${n}» تقلّل التأخير`, titleEn: "Proactive reminder adopted", summary: () => "قيس أثر تذكيرٍ مسبق على عيّنةٍ سابقة فاختُصر زمن الإنجاز؛ اعتُمد وأُضيف إلى المهارة.", days: 58, cases: 73, confidence: 94, status: "resolved" },
    { type: "new_skill", title: n => `مهارة مقترحة من تكرار «${n}»`, titleEn: "Skill proposed from repetition", summary: () => "تكرّر الإجراء نفسه بخطواتٍ متطابقة تقريباً فاقترح نهج توثيقه؛ أُنشئت المهارة وهي الآن تحت الملاحظة.", days: 44, cases: 112, confidence: 89, status: "resolved" },
    { type: "outdated_source", title: () => "مصدرٌ قديم لم يعد يطابق العمل", titleEn: "Outdated source flagged", summary: () => "تجاوزت الممارسة اللائحة المسجّلة بنسخةٍ أحدث؛ جُدِّد المصدر وأُرشفت النسخة القديمة.", days: 33, cases: 27, confidence: 82, status: "resolved" },
    { type: "single_person_risk", title: n => `اعتماد «${n}» على موظف واحد`, titleEn: "Single-person dependency", summary: () => "أُسند زميلٌ بديل ودُرّب على الإجراء؛ لم يعد يتوقف العمل على غياب شخص واحد.", days: 21, cases: 15, confidence: 90, status: "resolved" },
    { type: "improvement", title: () => "اقتراح خارج نطاق السياسة — رُفض", titleEn: "Out-of-policy suggestion dismissed", summary: () => "اقترحت الإشارة تجاوز خطوة اعتمادٍ لتسريع الإنجاز؛ رفضها المسؤول لأنها تنقض سياسة معتمدة.", days: 12, cases: 8, confidence: 61, status: "dismissed" },
  ];
  return templates.map((t, index) => {
    const name = names[(index * 2 + 1) % names.length];
    const at = new Date();
    at.setDate(at.getDate() - t.days);
    return {
      id: `prop_${sectorCode}_done_${index + 1}`,
      type: t.type,
      title: t.title(name),
      titleEn: t.titleEn,
      detectedAt: `${at.getFullYear()}-${pad2(at.getMonth() + 1)}-${pad2(at.getDate())}`,
      observedCasesCount: t.cases,
      confidence: t.confidence,
      summary: t.summary(name),
      status: t.status,
      evidence: { details: t.status === "dismissed" ? "رفضه المسؤول — بلا أثر على المهارات." : "حُسمت بقرارٍ بشري موثّق في سجلّ التدقيق." },
    } as LearningProposal;
  });
}
