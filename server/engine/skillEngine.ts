import { db } from "../db.ts";
import { actionsMatch, decide, extractFacts, runSuite, smoothReliability } from "./evaluationEngine.ts";
import { Skill, AutonomyLevel, TestCase, ShadowComparison } from "../../src/types/index.ts";

export class SkillEngine {
  public static promoteSkillAutonomy(
    skillId: string,
    targetLevel: AutonomyLevel,
    approvedBy: string
  ): { success: boolean; message: string; skill?: Skill } {
    const skill = db.skills.find((s) => s.id === skillId);
    if (!skill) {
      return { success: false, message: "المهارة غير موجودة" };
    }

    // Strict graduation criteria (Prompt Section 123)
    if (targetLevel >= 5 && skill.reliabilityScore < 85) {
      return {
        success: false,
        message: `لا يمكن ترقية المهارة لمستوى التنفيذ التلقائي أو الموافقة (مستوى ${targetLevel}) لأن موثوقيتها (${skill.reliabilityScore}%) أقل من الحد الأدنى المطلوب (85%).`,
      };
    }

    const previousLevel = skill.autonomyLevel;
    skill.autonomyLevel = targetLevel;
    if (targetLevel === 6) {
      skill.status = "active";
    }

    db.logAudit({
      actorType: "human",
      actorName: approvedBy,
      action: "PROMOTE_SKILL_AUTONOMY",
      provenance: "Governance Board & Eval Results",
      risk: targetLevel >= 5 ? "high" : "medium",
      latencyMs: 30,
      details: `ترقية استقلالية مهارة "${skill.name}" من المستوى ${previousLevel} إلى المستوى ${targetLevel} بواسطة ${approvedBy}.`,
      status: "success",
    });

    return {
      success: true,
      message: `تم ترقية مستوى استقلالية المهارة بنجاح إلى المستوى ${targetLevel}.`,
      skill,
    };
  }

  public static rollbackSkillVersion(
    skillId: string,
    targetVersion: number,
    actorName: string
  ): { success: boolean; message: string; skill?: Skill } {
    const skill = db.skills.find((s) => s.id === skillId);
    if (!skill) {
      return { success: false, message: "المهارة غير موجودة" };
    }

    const targetVerObj = skill.versions.find((v) => v.version === targetVersion);
    if (!targetVerObj && targetVersion !== 1) {
      return { success: false, message: "الإصدار المطلوب غير متوفر في سجل الإصدارات" };
    }

    const oldVersion = skill.activeVersion;
    skill.activeVersion = targetVersion;

    db.logAudit({
      actorType: "human",
      actorName: actorName,
      action: "ROLLBACK_SKILL_VERSION",
      provenance: "Version Control Vault",
      risk: "high",
      latencyMs: 40,
      details: `استرجاع مهارة "${skill.name}" من الإصدار v${oldVersion} إلى الإصدار v${targetVersion} مع الحفاظ على سجل التدقيق كاملاً.`,
      status: "warning",
    });

    return {
      success: true,
      message: `تم استرجاع المهارة بنجاح إلى الإصدار v${targetVersion}.`,
      skill,
    };
  }

  public static toggleKillSwitch(
    skillId: string,
    actorName: string
  ): { success: boolean; active: boolean; skill?: Skill } {
    const skill = db.skills.find((s) => s.id === skillId);
    if (!skill) return { success: false, active: false };

    skill.killSwitchActive = !skill.killSwitchActive;

    db.logAudit({
      actorType: "human",
      actorName: actorName,
      action: skill.killSwitchActive ? "KILL_SWITCH_ENGAGED" : "KILL_SWITCH_DISENGAGED",
      provenance: "Emergency Circuit Breaker",
      risk: "critical",
      latencyMs: 15,
      details: `${skill.killSwitchActive ? "تفعيل قاطع الطوارئ (إيقاف فوري)" : "إلغاء قاطع الطوارئ (استئناف العمل)"} لمهارة "${skill.name}".`,
      status: skill.killSwitchActive ? "warning" : "success",
    });

    return { success: true, active: skill.killSwitchActive, skill };
  }

  /**
   * يشغّل حزمة الاختبارات — تقييماً حقيقياً.
   *
   * كانت هذه الحلقة تكتب `pass` على كل حالة وتُعيد `passRate: 100` مكتوبةً. ولم
   * يكن ذلك رقماً مجمَّلاً على شاشة — بل تعطيلاً لآلة السلامة: الترقية إلى L5/L6
   * مشروطة بموثوقية ≥ 85٪، والموثوقية من التدرّب، والتدرّب يُنجح الكل. فالشرط
   * الذي يحرس الطيار الآلي كان يُمرّر كل مهارة مهما كانت.
   *
   * والآن يمرّ كل سيناريو بمحرّك التقييم، وهو بدوره يمرّ بمحرّك السياسات نفسه
   * الذي يحكم الإنتاج. والحالة التي يتعذّر تقييمها ترسب ولا تنجح.
   */
  public static async runPracticeTests(): Promise<{
    passedCount: number;
    totalCount: number;
    passRate: number | null;
    testCases: TestCase[];
  }> {
    const suite = runSuite(db.testCases, db.policies);

    for (const result of suite.results) {
      result.testCase.resultStatus = result.passed ? "pass" : "fail";
      result.testCase.executionTimeMs = result.durationMs;
      result.testCase.discrepancy = result.discrepancy;
    }

    /*
     * الموثوقية تتحرّك بما لوحظ.
     *
     * تتحرّك للمهارات تحت التقييم وحدها (تتدرّب أو في الظل): المهارة الحيّة
     * موثوقيتها من تشغيلها الفعلي لا من مقعد الاختبار، والمسوّدة لم تبدأ بعد.
     */
    if (suite.passRate !== null) {
      for (const skill of db.skills) {
        if (skill.status !== "practicing" && skill.status !== "shadow") continue;
        skill.reliabilityScore = smoothReliability(Number(skill.reliabilityScore) || 0, suite.passRate);
        skill.reliabilityTier =
          skill.reliabilityScore >= 95 ? "verified"
          : skill.reliabilityScore >= 85 ? "high"
          : skill.reliabilityScore >= 70 ? "medium" : "low";
      }
    }

    const failed = suite.totalCount - suite.passedCount;
    db.logAudit({
      actorType: "system",
      actorName: "Practice Test Suite",
      action: "EXECUTE_PRACTICE_EVALS",
      provenance: "محرّك التقييم + محرّك السياسات",
      risk: failed > 0 ? "medium" : "low",
      latencyMs: suite.results.reduce((sum, result) => sum + result.durationMs, 0),
      details: suite.totalCount === 0
        ? "لا حالات اختبار معرَّفة — لم يجرِ تقييم، ولم تتحرّك موثوقية."
        : `تقييم ${suite.totalCount} حالة: اجتازت ${suite.passedCount}، ورسبت ${failed}. النسبة ${suite.passRate}%.`,
      status: failed > 0 ? "warning" : "success",
    });

    return {
      passedCount: suite.passedCount,
      totalCount: suite.totalCount,
      passRate: suite.passRate,
      testCases: db.testCases,
    };
  }

  /**
   * يشغّل المقارنة في الظل — قراراً مقابل قرار.
   *
   * كانت هذه الدالة تقرأ سجلات مبذورة وتُعيد حساب نسبة التطابق المكتوبة فيها.
   * أي أنها لم تكن تُقارن شيئاً: لا تُشكّل قرار نهج، ولا تضعه أمام قرار الموظف.
   * فالنسبة كانت وصفاً للبذرة لا للنظام.
   *
   * والآن يُشتق قرار نهج من وقائع الحالة عبر محرّك التقييم — وهو بدوره يمرّ
   * بمحرّك السياسات نفسه الذي يحكم الإنتاج — ثم يُقارَن بما فعله الموظف. فما
   * يُقاس هو المسافة بين النظام والإنسان، وهو المقصود من الظل أصلاً.
   */
  public static async runShadowComparison(): Promise<{
    comparisons: ShadowComparison[];
    matchRate: number | null;
    driftCount: number;
  }> {
    const comps = db.shadowComparisons;

    for (const comparison of comps) {
      const humanAction = String(comparison.humanAction || comparison.humanDecision || "");
      const scenario = `${comparison.caseTitle || comparison.title || ""} ${comparison.humanReason || ""}`;

      /*
       * حالةٌ بلا قرار بشري لا تُقارَن: لا يوجد ما يُقاس عليه. وتُترك كما هي بدل
       * أن تُحتسب تطابقاً — وهو ما كان يفعله العدّ السابق ضمناً.
       */
      if (!humanAction.trim()) continue;

      const decision = decide(extractFacts(scenario), db.policies);
      comparison.aiAction = decision.action;
      comparison.aiDecision = decision.action;
      comparison.divergenceReason = decision.rationale;
      comparison.matched = actionsMatch(humanAction, decision.action);
      /* الانحراف: اختلافٌ في قرارٍ ليس مجرّد صياغة. */
      comparison.driftDetected = !comparison.matched;
    }

    const decided = comps.filter(comparison => String(comparison.humanAction || comparison.humanDecision || "").trim());
    const matches = decided.filter(comparison => comparison.matched).length;
    const drifts = decided.filter(comparison => comparison.driftDetected).length;
    const matchRate = decided.length ? Math.round((matches / decided.length) * 100) : null;

    db.logAudit({
      actorType: "ai",
      actorName: "Shadow Evaluation Engine",
      action: "RUN_SHADOW_COMPARISON",
      provenance: "محرّك التقييم + قرارات الموظفين المسجَّلة",
      risk: drifts > 0 ? "medium" : "low",
      latencyMs: 160,
      details: decided.length === 0
        ? "لا حالات ظلّ تحمل قراراً بشرياً — لم تجرِ مقارنة."
        : `قورن ${decided.length} قراراً: تطابق ${matches}، وانحرف ${drifts}. نسبة التطابق ${matchRate}%.`,
      status: drifts > 0 ? "warning" : "success",
    });

    return { comparisons: comps, matchRate, driftCount: drifts };
  }
}
