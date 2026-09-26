import { db } from "../db.ts";
import { actionsMatch, decide, deriveMinAge, extractFacts, runSuite, smoothReliability } from "./evaluationEngine.ts";
import { Skill, AutonomyLevel, TestCase, ShadowComparison } from "../../src/types/index.ts";

export class SkillEngine {
  public static promoteSkillAutonomy(
    skillId: string,
    targetLevel: AutonomyLevel,
    approvedBy: string,
    record?: Record<string, any>,
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
      ...(record ? { record } : {}),
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
   * إيقافٌ طارئ لكل مهارات التنفيذ (L5 الاعتماد وL6 الطيار الآلي) بضغطة واحدة.
   *
   * كان زرّ «إيقاف طارئ» في شاشة الحوكمة يبدّل علَماً في المتصفح وحده: يظهر
   * شريط «التنفيذ متوقف» ولا يتوقف في الخادم شيء. صار يُفعّل قاطع كل مهارة
   * تنفيذ، ويحفظ من أوقف ولماذا، ويُسجَّل حرجاً في التدقيق.
   */
  public static emergencyPause(reason: string, actorName: string): { success: boolean; message: string; pausedSkills: Skill[] } {
    const clean = String(reason || "").trim();
    if (clean.length < 3) return { success: false, message: "سبب الإيقاف مطلوب.", pausedSkills: [] };
    if (db.emergencyPause?.active) return { success: false, message: "الإيقاف الطارئ مفعّل من قبل.", pausedSkills: [] };
    const targets = db.skills.filter(skill => skill.autonomyLevel >= 5 && !skill.killSwitchActive);
    for (const skill of targets) skill.killSwitchActive = true;
    const at = new Date().toISOString();
    db.emergencyPause = { active: true, reason: clean.slice(0, 500), by: actorName, at, skillIds: targets.map(skill => skill.id) };
    db.logAudit({
      actorType: "human",
      actorName,
      action: "EMERGENCY_PAUSE_AUTOPILOT",
      provenance: "Emergency Circuit Breaker — كل المهارات",
      risk: "critical",
      latencyMs: 10,
      details: `إيقاف طارئ لـ${targets.length} مهارة تنفيذ بواسطة ${actorName}. السبب: ${clean}`,
      status: "warning",
      record: { reason: clean, skillIds: targets.map(skill => skill.id) },
    });
    return { success: true, message: `أُوقفت ${targets.length} مهارة تنفيذ.`, pausedSkills: targets };
  }

  /** الاستئناف يعيد ما أوقفه الإيقاف الطارئ وحده — لا ما أوقفه أحدٌ يدوياً قبله. */
  public static emergencyResume(reason: string, actorName: string): { success: boolean; message: string; resumedSkills: Skill[] } {
    const clean = String(reason || "").trim();
    if (clean.length < 3) return { success: false, message: "سبب الاستئناف مطلوب.", resumedSkills: [] };
    const pause = db.emergencyPause;
    if (!pause?.active) return { success: false, message: "لا إيقاف طارئ مفعّل.", resumedSkills: [] };
    const resumed = db.skills.filter(skill => pause.skillIds.includes(skill.id) && skill.killSwitchActive);
    for (const skill of resumed) skill.killSwitchActive = false;
    db.emergencyPause = { ...pause, active: false, resumedBy: actorName, resumedAt: new Date().toISOString(), resumeReason: clean.slice(0, 500) };
    db.logAudit({
      actorType: "human",
      actorName,
      action: "EMERGENCY_RESUME_AUTOPILOT",
      provenance: "Emergency Circuit Breaker — كل المهارات",
      risk: "high",
      latencyMs: 10,
      details: `استئناف ${resumed.length} مهارة بعد الإيقاف الطارئ بواسطة ${actorName}. السبب: ${clean}`,
      status: "success",
      record: { reason: clean, skillIds: resumed.map(skill => skill.id) },
    });
    return { success: true, message: `استُؤنفت ${resumed.length} مهارة.`, resumedSkills: resumed };
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
    /*
     * عتبات المؤسسة تُقرأ من لوائحها، فتُقيَّم المهارة بما تلتزم به المؤسسة
     * فعلاً لا بما افترضه كاتب المحرّك.
     */
    const context = { minAgeYears: deriveMinAge(db.knowledgeSources, db.skills) };
    const suite = runSuite(db.testCases, db.policies, context);

    for (const result of suite.results) {
      result.testCase.resultStatus = result.passed ? "pass" : "fail";
      result.testCase.executionTimeMs = result.durationMs;
      result.testCase.discrepancy = result.discrepancy;
    }

    /*
     * الموثوقية تتحرّك بما لوحظ — لكلّ مهارةٍ بنتيجة حالاتها هي.
     *
     * كانت نتيجة الحزمة كلّها تُطبَّق على كل مهارةٍ تحت التقييم. فحالاتُ قبولٍ
     * تنجح ترفع موثوقية مهارة استرجاعٍ لم تُختبر أصلاً، فوق عتبة الـ85٪ التي
     * تحرس الترقية إلى L5/L6. أي أن إعادة تشغيل الحزمة كانت تشتري صلاحيةً
     * لمهارةٍ لم تُقيَّم — وهو نقضُ «يكتسب حقّ التنفيذ» من أساسه.
     *
     * وتتحرّك للمهارات تحت التقييم وحدها (تتدرّب أو في الظل): المهارة الحيّة
     * موثوقيتها من تشغيلها الفعلي لا من مقعد الاختبار، والمسوّدة لم تبدأ بعد.
     *
     * وحالةٌ بلا مهارةٍ محدَّدة تُقيَّم وتظهر في نسبة الحزمة، ولا تحرّك موثوقية
     * أحد: ما لم يُختبر لا يُكافأ ولا يُعاقب.
     */
    const bySkill = new Map<string, { passed: number; total: number }>();
    for (const result of suite.results) {
      const skillId = String(result.testCase.skillId || "").trim();
      if (!skillId) continue;
      const bucket = bySkill.get(skillId) || { passed: 0, total: 0 };
      bucket.total += 1;
      if (result.passed) bucket.passed += 1;
      bySkill.set(skillId, bucket);
    }

    for (const skill of db.skills) {
      if (skill.status !== "practicing" && skill.status !== "shadow") continue;
      const bucket = bySkill.get(skill.id);
      if (!bucket || !bucket.total) continue;
      const observed = Math.round((bucket.passed / bucket.total) * 100);
      skill.reliabilityScore = smoothReliability(Number(skill.reliabilityScore) || 0, observed);
      skill.reliabilityTier =
        skill.reliabilityScore >= 95 ? "verified"
        : skill.reliabilityScore >= 85 ? "high"
        : skill.reliabilityScore >= 70 ? "medium" : "low";
    }

    const untargeted = suite.results.filter(result => !String(result.testCase.skillId || "").trim()).length;

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
        : `تقييم ${suite.totalCount} حالة: اجتازت ${suite.passedCount}، ورسبت ${failed}. النسبة ${suite.passRate}%.`
          + (untargeted ? ` (${untargeted} حالة بلا مهارة محدَّدة — لم تحرّك موثوقية أحد.)` : ""),
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

    /*
     * ما يُقارَن هو وقائع الحالة، لا نصُّ عنوانها.
     *
     * كان القرار يُشتقّ من `caseTitle + humanReason` — وهما نصٌّ للعرض: لا سنّ
     * فيهما ولا مستند ولا مبلغ. فحالةُ خصم الأشقاء تُصنَّف «استفساراً عاماً»
     * ويُكتب فوق تطابقٍ حقيقي انحرافٌ لم يقع. وقياسُ انحرافٍ مُختلَق أسوأ من
     * ألّا يُقاس شيء: يُرسل فريقاً يبحث عن خطأ موظفٍ لم يُخطئ.
     *
     * فالوقائع تُقرأ من مصدرٍ حقيقي وحده — حقل الوقائع المسجَّل، أو حالة العمل
     * المرتبطة ببياناتها المهيكلة. وما لا مصدر له لا يُقارَن ولا يُحتسب.
     */
    const workItems = new Map<string, any>();
    for (const item of db.workItems) {
      workItems.set(String(item.id), item);
      workItems.set(String(item.code), item);
    }

    /** يبني نصّ وقائع من حقول حالة العمل المهيكلة — لا من عنوانها. */
    const factsFromWorkItem = (item: any): string => {
      if (!item) return "";
      const details = item.details || {};
      const parts: string[] = [];
      if (details.birthDate) {
        const years = (Date.now() - new Date(String(details.birthDate)).getTime()) / (365.25 * 86_400_000);
        if (Number.isFinite(years) && years > 0) parts.push(`عمره ${Math.floor(years * 10) / 10} سنوات`);
      }
      if (details.ageYears !== undefined) parts.push(`عمره ${details.ageYears} سنوات`);
      if (details.civilIdVerified === true) parts.push("بطاقة مدنية سليمة");
      if (details.civilIdVerified === false) parts.push("بطاقة منتهية");
      if (details.amountKwd !== undefined) parts.push(`${details.amountKwd} د.ك`);
      if (details.daysElapsed !== undefined) parts.push(`بعد مضي ${details.daysElapsed} يوماً`);
      if (details.intent) parts.push(String(details.intent));
      return parts.join("، ");
    };

    const shadowContext = { minAgeYears: deriveMinAge(db.knowledgeSources, db.skills) };
    const unevaluated: string[] = [];
    for (const comparison of comps) {
      const humanAction = String(comparison.humanAction || comparison.humanDecision || "");
      /* ما يُقارَن هو رمز القرار إن سُجّل، وإلا كلام الموظف كما هو. */
      const humanCode = String(comparison.humanActionCode || humanAction);

      /*
       * حالةٌ بلا قرار بشري لا تُقارَن: لا يوجد ما يُقاس عليه. وتُترك كما هي بدل
       * أن تُحتسب تطابقاً — وهو ما كان يفعله العدّ السابق ضمناً.
       */
      if (!humanAction.trim()) continue;

      const recorded = String(comparison.scenario || "").trim();
      const scenario = recorded || factsFromWorkItem(workItems.get(String(comparison.workItemId || "")));
      if (!scenario.trim()) {
        /* لا وقائع ⇒ لا قرار مُختلَق، ولا كتابة فوق السجل. */
        comparison.evaluated = false;
        unevaluated.push(comparison.id);
        continue;
      }

      const decision = decide(extractFacts(scenario), db.policies, shadowContext);
      if (decision.undecidable) {
        /*
         * وقائع ناقصة لا تُكوّن قراراً. وتُعلَن غير مُقاسة بدل أن تُحسب تطابقاً
         * أو انحرافاً — وهو مبدأ المحرّك نفسه: ما يتعذّر تقييمه لا ينجح.
         */
        comparison.evaluated = false;
        comparison.divergenceReason = decision.rationale;
        unevaluated.push(comparison.id);
        continue;
      }

      comparison.evaluated = true;
      comparison.aiAction = decision.action;
      comparison.aiDecision = decision.action;
      comparison.divergenceReason = decision.rationale;
      comparison.matched = actionsMatch(humanCode, decision.action);
      /* الانحراف: اختلافٌ في قرارٍ ليس مجرّد صياغة. */
      comparison.driftDetected = !comparison.matched;
    }

    const decided = comps.filter(comparison =>
      comparison.evaluated === true && String(comparison.humanAction || comparison.humanDecision || "").trim());
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
        ? `لا حالة ظلٍّ قابلة للمقارنة — لم تجرِ مقارنة.${unevaluated.length ? ` (${unevaluated.length} حالة بلا وقائع مسجَّلة.)` : ""}`
        : `قورن ${decided.length} قراراً: تطابق ${matches}، وانحرف ${drifts}. نسبة التطابق ${matchRate}%.`
          + (unevaluated.length ? ` و${unevaluated.length} حالة تُركت بلا مقارنة لغياب وقائعها — لا تُحتسب.` : ""),
      status: drifts > 0 ? "warning" : "success",
    });

    return { comparisons: comps, matchRate, driftCount: drifts };
  }
}
