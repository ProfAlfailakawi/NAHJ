import type { ApprovalRequest, Skill, WorkItem, TestCase, ShadowComparison } from "../../src/types/index.ts";
import { applySectorCompliance, redactPatientData, type ComplianceOutcome } from "./policyEngine.ts";
import { evaluationStats, type EvaluationStats } from "./promotionReview.ts";

/*
 * سجلّ القرار.
 *
 * كانت بوابة الاعتماد تعرض عنوان المعاملة وجملة السبب ورمزين، ثم زرّ «اعتمد
 * ونفّذ». المعتمِد لا يرى أيّ إصدارٍ من المهارة سينفّذ، ولا الدليل الذي بُني
 * عليه الطلب، ولا ما الذي سيُكتب على النظام بعد ضغطته. والسجل لا يحفظ إلا أنه
 * ضغط. هنا يُجمع كل ذلك في سجلٍّ واحد يُعرض قبل القرار ويُحفظ معه.
 */

export interface DecisionPreviewLine {
  field: string;
  before: string;
  after: string;
}

export interface DecisionRecord {
  approvalId: string;
  action: string;
  workTitle: string;
  skill: { id: string; name: string; version: number; autonomyLevel: number; changeSummary: string } | null;
  policy: { code: string; description: string; riskLevel: string; requiredRole: string; provenance: string };
  evidence: { label: string; value: string }[];
  stats: EvaluationStats | null;
  preview: DecisionPreviewLine[];
  compliance: ComplianceOutcome | null;
  reasonRequired: boolean;
}

const HIDDEN_FIELDS = new Set(["sector", "channel"]);
const show = (value: unknown): string => {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

export const reasonRequiredFor = (risk: string) => risk === "high" || risk === "critical";

export function buildDecisionRecord(
  approval: ApprovalRequest,
  context: {
    workItems: WorkItem[]; skills: Skill[]; testCases: TestCase[]; shadowComparisons: ShadowComparison[];
    sector: string; provenance?: string;
  },
): DecisionRecord {
  const workItem = context.workItems.find(item => item.id === approval.workItemId);
  const skill = workItem ? context.skills.find(candidate => candidate.id === workItem.skillId) : undefined;
  const version = skill?.versions?.find(entry => entry.version === skill.activeVersion);

  /* حمولة العيادة تُعرض محجوبة دائماً — المعاينة ليست قناةً تُخرج بيانات المريض. */
  const payload = approval.payload || {};
  const compliance = applySectorCompliance(context.sector, approval.actionName, payload)?.compliance
    || (context.sector === "clinic" ? { preset: "CMP-MED-REDACT", ...(() => {
      const redacted = redactPatientData(payload);
      return { redactedFields: redacted.redactedFields, redactedPayload: redacted.payload };
    })() } : null);
  const shown = compliance?.redactedPayload || payload;

  const preview: DecisionPreviewLine[] = [];
  if (workItem) {
    preview.push({ field: "حالة المعاملة", before: workItem.state, after: "completed" });
    preview.push({ field: "نسبة الإنجاز", before: `${workItem.progressPercent}%`, after: "100%" });
  }
  for (const [key, value] of Object.entries(shown)) {
    if (HIDDEN_FIELDS.has(key)) continue;
    preview.push({ field: key, before: "—", after: show(value) });
  }

  const evidence: { label: string; value: string }[] = [];
  if (workItem) {
    evidence.push({ label: "المعاملة", value: `${workItem.code} — ${workItem.title}` });
    for (const entry of (workItem.timeline || []).slice(0, 3)) {
      evidence.push({ label: entry.actor === "ai" ? "خطوة نهج" : entry.actor === "human" ? "خطوة موظف" : "النظام", value: `${entry.title}${entry.details ? ` — ${entry.details}` : ""}` });
    }
  }
  const workItemSkill = new Map(context.workItems.map(item => [item.id, item.skillId]));
  const stats = skill ? evaluationStats(skill, context.testCases, context.shadowComparisons, workItemSkill) : null;
  if (skill) {
    evidence.push({ label: "موثوقية المهارة", value: `${skill.reliabilityScore}%` });
    if (stats?.passRate !== null && stats) evidence.push({ label: "نجاح التدرّب", value: `${stats.testsPassed}/${stats.testsTotal} (${stats.passRate}%)` });
    if (stats?.shadowAgreement !== null && stats) evidence.push({ label: "التطابق في الظل", value: `${stats.shadowMatched}/${stats.shadowCompared} (${stats.shadowAgreement}%)` });
  }

  return {
    approvalId: approval.id,
    action: approval.actionName,
    workTitle: approval.workTitle,
    skill: skill ? {
      id: skill.id, name: skill.name, version: skill.activeVersion, autonomyLevel: skill.autonomyLevel,
      changeSummary: version?.changeSummary || "",
    } : null,
    policy: {
      code: approval.reasonCode,
      description: approval.reasonDescription,
      riskLevel: approval.riskLevel,
      requiredRole: approval.requiredRole,
      provenance: context.provenance || "بوابة الاعتماد",
    },
    evidence,
    stats,
    preview,
    compliance: compliance || null,
    reasonRequired: reasonRequiredFor(approval.riskLevel),
  };
}
