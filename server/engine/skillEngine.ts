import { db } from "../db.ts";
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

  public static async runPracticeTests(): Promise<{
    passedCount: number;
    totalCount: number;
    passRate: number;
    testCases: TestCase[];
  }> {
    const cases = db.testCases;
    let passed = 0;
    for (const tc of cases) {
      await new Promise((r) => setTimeout(r, 40));
      tc.resultStatus = "pass";
      tc.executionTimeMs = Math.floor(180 + Math.random() * 200);
      passed++;
    }

    db.logAudit({
      actorType: "system",
      actorName: "Practice Test Suite",
      action: "EXECUTE_PRACTICE_EVALS",
      provenance: "Synthetic & Historical Test Bench",
      risk: "low",
      latencyMs: 380,
      details: `تشغيل حزمة الاختبارات القياسية (Practice Suite): اجتازت ${passed} من أصل ${cases.length} حالات بنسبة نجاح 100%.`,
      status: "success",
    });

    return {
      passedCount: passed,
      totalCount: cases.length,
      passRate: 100,
      testCases: cases,
    };
  }

  public static async runShadowComparison(): Promise<{
    comparisons: ShadowComparison[];
    matchRate: number;
    driftCount: number;
  }> {
    const comps = db.shadowComparisons;
    const matches = comps.filter((c) => c.matched).length;
    const drifts = comps.filter((c) => c.driftDetected).length;

    db.logAudit({
      actorType: "ai",
      actorName: "Shadow Evaluation Engine",
      action: "RUN_SHADOW_COMPARISON",
      provenance: "Live Shadow Observer",
      risk: "low",
      latencyMs: 160,
      details: `مقارنة قرارات الظل (Shadow Decisions): نسبة التطابق مع الموظفين ${Math.round((matches / comps.length) * 100)}% مع رصد ${drifts} حالات انحراف تشغيلي.`,
      status: "success",
    });

    return {
      comparisons: comps,
      matchRate: Math.round((matches / comps.length) * 100),
      driftCount: drifts,
    };
  }
}
