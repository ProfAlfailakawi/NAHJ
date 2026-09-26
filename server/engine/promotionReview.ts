import type { AutonomyLevel, ShadowComparison, Skill, TestCase } from "../../src/types/index.ts";

/*
 * مراجعة الترقية على سُلّم الاستقلالية.
 *
 * كانت الترقية زرّاً: يُضغط فيرتفع المستوى، والشرط الوحيد موثوقيةٌ ≥ 85٪ عند
 * L5 وما فوق. فمهارةٌ لم تُختبر حالةً واحدة ولم تُقارَن بقرار موظفٍ قطّ تصعد
 * إلى «يقترح عليك» أو «يجهّز العمل» بنقرة. المراجعة هنا تجمع ما يبرّر الصعود —
 * نسبة النجاح، ونسبة التطابق في الظل، والاستثناءات — وتمنعه حين يغيب الدليل.
 */

export interface EvaluationStats {
  testsTotal: number;
  testsPassed: number;
  passRate: number | null;
  shadowCompared: number;
  shadowMatched: number;
  shadowAgreement: number | null;
  driftCount: number;
  exceptions: number;
}

export interface PromotionRequirement {
  key: "practice" | "shadow" | "reliability" | "signOff";
  met: boolean;
  label: string;
}

export interface PromotionReview {
  skillId: string;
  skillName: string;
  version: number;
  fromLevel: number;
  toLevel: number;
  upward: boolean;
  stats: EvaluationStats;
  requirements: PromotionRequirement[];
  missing: string[];
  blocked: boolean;
}

export const MIN_PASS_RATE = 80;
export const MIN_SHADOW_AGREEMENT = 80;
export const MIN_RELIABILITY_FOR_APPROVAL = 85;

const matchesSkill = (skill: Skill) => (value: { skillId?: string; workItemId?: string }, workSkill?: string) =>
  value.skillId === skill.id || (workSkill !== undefined && workSkill === skill.id);

export function evaluationStats(
  skill: Skill, testCases: TestCase[], shadow: ShadowComparison[], workItemSkill: Map<string, string> = new Map(),
): EvaluationStats {
  const own = matchesSkill(skill);
  const tests = testCases.filter(test => own(test) && test.resultStatus);
  const passed = tests.filter(test => test.resultStatus === "pass").length;
  const compared = shadow.filter(comparison =>
    comparison.evaluated === true && own(comparison as any, workItemSkill.get(String(comparison.workItemId || ""))));
  const matched = compared.filter(comparison => comparison.matched).length;
  return {
    testsTotal: tests.length,
    testsPassed: passed,
    passRate: tests.length ? Math.round((passed / tests.length) * 100) : null,
    shadowCompared: compared.length,
    shadowMatched: matched,
    shadowAgreement: compared.length ? Math.round((matched / compared.length) * 100) : null,
    driftCount: compared.filter(comparison => comparison.driftDetected).length,
    exceptions: Array.isArray(skill.exceptions) ? skill.exceptions.length : 0,
  };
}

/**
 * ما يلزم كل مستوى:
 * - L2 (الظل) فما فوق: تدرّبٌ جرى ونسبة نجاحٍ ≥ 80٪.
 * - L3 (يقترح) فما فوق: مقارنة ظلٍّ جرت وتطابقٌ ≥ 80٪.
 * - L5 فما فوق: موثوقية ≥ 85٪ (الشرط القائم في محرّك المهارات).
 * - كل ترقية صاعدة: توقيع المسؤول.
 */
export function reviewPromotion(
  skill: Skill, toLevel: AutonomyLevel, testCases: TestCase[], shadow: ShadowComparison[],
  options: { signedOff?: boolean; workItemSkill?: Map<string, string> } = {},
): PromotionReview {
  const stats = evaluationStats(skill, testCases, shadow, options.workItemSkill);
  const upward = toLevel > skill.autonomyLevel;
  const requirements: PromotionRequirement[] = [];
  if (upward && toLevel >= 2) {
    requirements.push({
      key: "practice",
      met: stats.passRate !== null && stats.passRate >= MIN_PASS_RATE,
      label: stats.passRate === null
        ? "لا نتائج تدرّب لهذه المهارة — شغّل حالات التدرّب أولاً."
        : `نسبة النجاح في التدرّب ${stats.passRate}٪ (المطلوب ${MIN_PASS_RATE}٪ فأكثر).`,
    });
  }
  if (upward && toLevel >= 3) {
    requirements.push({
      key: "shadow",
      met: stats.shadowAgreement !== null && stats.shadowAgreement >= MIN_SHADOW_AGREEMENT,
      label: stats.shadowAgreement === null
        ? "لا مقارنات ظلٍّ مقاسة لهذه المهارة — شغّل الظل أولاً."
        : `التطابق مع قرارات الموظفين ${stats.shadowAgreement}٪ (المطلوب ${MIN_SHADOW_AGREEMENT}٪ فأكثر).`,
    });
  }
  if (upward && toLevel >= 5) {
    requirements.push({
      key: "reliability",
      met: skill.reliabilityScore >= MIN_RELIABILITY_FOR_APPROVAL,
      label: `الموثوقية ${skill.reliabilityScore}٪ (المطلوب ${MIN_RELIABILITY_FOR_APPROVAL}٪ فأكثر).`,
    });
  }
  if (upward) {
    requirements.push({
      key: "signOff",
      met: options.signedOff === true,
      label: options.signedOff ? "وقّع المسؤول على الترقية." : "تحتاج الترقية توقيع المسؤول.",
    });
  }
  const missing = requirements.filter(requirement => !requirement.met).map(requirement => requirement.label);
  return {
    skillId: skill.id,
    skillName: skill.name,
    version: skill.activeVersion,
    fromLevel: skill.autonomyLevel,
    toLevel,
    upward,
    stats,
    requirements,
    missing,
    blocked: missing.length > 0,
  };
}
