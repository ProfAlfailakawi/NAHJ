import type { ApprovalRequest, ShadowComparison, TestCase, WorkItem } from "../../src/types/index.ts";
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
