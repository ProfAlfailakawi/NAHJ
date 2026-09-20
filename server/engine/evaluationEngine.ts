import { PolicyEngine } from "./policyEngine.ts";
import type { Policy, Skill, TestCase } from "../../src/types/index.ts";

/*
 * محرّك التقييم.
 *
 * كان «تشغيل الاختبارات» حلقةً تكتب `pass` على كل حالة وتُعيد `passRate: 100`
 * مكتوبةً. ولم يكن ذلك تجميلاً كأرقام الأثر — بل تعطيلاً لآلة السلامة نفسها:
 *
 *   الترقية إلى L5/L6 مشروطة بموثوقية ≥ 85٪،
 *   والموثوقية تأتي من التدرّب،
 *   والتدرّب يُنجح كل شيء دائماً.
 *
 * أي أن الشرط الذي يحرس الطيار الآلي كان يُمرّر كل مهارة مهما كانت، ووعدُ المنتج
 * المركزي — «على الذكاء أن يكتسب حقّ التنفيذ» — غير منفَّذ: لا شيء يُكتسب، كل
 * شيء يُمنح. وسجلّ التدقيق يكتب «اجتازت 6 من 6» كأن فحصاً جرى.
 *
 * والمبدأ الحاكم هنا مقلوبٌ عمداً عمّا كان:
 *
 *   **الحالة التي يتعذّر تقييمها ترسب، لا تنجح.**
 *
 * لأن «لم أستطع الفحص» و«فحصتُ فنجح» جوابان متناقضان، وخلطهما هو بعينه ما جعل
 * الرقم السابق كاذباً. والقرار يمرّ بمحرّك السياسات نفسه الذي يحكم الإنتاج، فلا
 * يكون الاختبار نسخةً ثانية من المنطق تُصدّق نفسها.
 */

/* ------------------------------------------------------------ الوقائع */

/** ما يمكن استخراجه من نصّ السيناريو. كل حقل اختياري: غيابه معلومة. */
export interface ScenarioFacts {
  ageYears?: number;
  amountKwd?: number;
  daysElapsed?: number;
  documentVerified?: boolean;
  /** محاولة حقن تعليمات في نصّ العميل. */
  injectionAttempt?: boolean;
  intent?: "enrollment" | "refund" | "booking" | "inquiry";
}

/* الأرقام تُكتب عربيةً وهنديةً معاً في نصوص المنطقة. */
const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const toWesternDigits = (text: string) =>
  text.replace(/[٠-٩]/g, ch => String(ARABIC_INDIC.indexOf(ch)));

/*
 * أعدادٌ منطوقة تَرِد كثيراً بدل الأرقام: «طفل عمره سنتين ونصف».
 *
 * وبلا `\b`: حدّ الكلمة في تعابير جافاسكربت يعمل على `\w` وحدها، والحروف
 * العربية ليست منها — فـ`/\bسنتين\b/` لا يطابق شيئاً إطلاقاً. وهو الفخّ نفسه
 * الذي أوقع قراءة الطوابع من قبل، ووقعتُ فيه هنا ثانيةً حتى كشفه التشغيل.
 * والترتيب من الأطول إلى الأقصر مقصود: «سنتين ونصف» قبل «سنتين».
 */
const SPELLED_NUMBERS: Array<[RegExp, number]> = [
  [/سنتين ونصف/, 2.5], [/سنة ونصف/, 1.5], [/ثلاث سنوات ونصف/, 3.5],
  [/سنتين/, 2], [/ثلاث سنوات/, 3], [/أربع سنوات/, 4], [/خمس سنوات/, 5],
  [/ست سنوات/, 6], [/سبع سنوات/, 7], [/سنة واحدة/, 1],
];

/**
 * يستخرج الوقائع من نصّ السيناريو.
 *
 * الاستخراج نمطيّ لا احتمالي: قاعدةٌ لا تنطبق تترك الحقل غائباً بدل أن تخمّن.
 * والتخمين هنا أخطر من الغياب، لأن حالةً قُيّمت على واقعةٍ مُخترَعة تُنتج نسبةَ
 * نجاحٍ بلا معنى — وهو ما نخرج منه.
 */
export function extractFacts(scenario: string): ScenarioFacts {
  const text = toWesternDigits(String(scenario || ""));
  const facts: ScenarioFacts = {};

  /*
   * العمر: «عمره 5 سنوات» أو «طفل عمره سنتين ونصف».
   *
   * و`\w*` لا تلتقط اللاحقة العربية في «عمره» — فهي ليست من `\w` أيضاً. تُستعمل
   * فئة الحروف العربية صراحةً بدلاً منها.
   */
  const ageDigits = /عمر[\u0600-\u06FF]*\s*(\d+(?:\.\d+)?)\s*(?:سنة|سنوات|عام)?/.exec(text);
  if (ageDigits) facts.ageYears = Number(ageDigits[1]);
  else if (/عمر|طفل|سن[ةّ]?\s|مواليد/.test(text)) {
    for (const [pattern, value] of SPELLED_NUMBERS) {
      if (pattern.test(text)) { facts.ageYears = value; break; }
    }
  }

  /* المبلغ بالدينار. */
  const amount = /(\d+(?:\.\d+)?)\s*(?:د\.ك|دينار|KWD)/i.exec(text);
  if (amount) facts.amountKwd = Number(amount[1]);

  /* المدّة المنقضية: «بعد مضي شهر كامل» أو «بعد 30 يوماً». */
  const days = /بعد\s+(?:مضي\s+)?(\d+)\s*يوم/.exec(text);
  if (days) facts.daysElapsed = Number(days[1]);
  else if (/بعد\s+(?:مضي\s+)?شهر/.test(text)) facts.daysElapsed = 30;
  else if (/بعد\s+(?:مضي\s+)?شهرين/.test(text)) facts.daysElapsed = 60;

  /* حالة المستند. */
  if (/بطاقة مدنية سليمة|بطاقة سارية|مستند مطابق|وثيقة سليمة/.test(text)) facts.documentVerified = true;
  else if (/بلا بطاقة|دون بطاقة|بطاقة منتهية|مستند غير مطابق/.test(text)) facts.documentVerified = false;

  /*
   * محاولة الحقن: نصّ العميل يأمر النظام بتجاوز قواعده.
   *
   * الكشف يُطابق فعل الأمر مقروناً بما يُؤمَر بتجاوزه — لا كلمةً مفردة، وإلا
   * عُدّ كلُّ من كتب «تجاهل رسالتي السابقة» مهاجماً.
   */
  if (/(تجاهل|تخطَّ|تخطى|انسَ|اعتمد فور)[^.]{0,40}(الشروط|السياسة|القواعد|اللائحة|الخصم|قبول نهائي)/.test(text)
    || /ignore[^.]{0,30}(policy|rules|instructions)/i.test(text)) {
    facts.injectionAttempt = true;
  }

  /*
   * النيّة — وما لا يُعرف يبقى غير معروف.
   *
   * كان كل ما لم يُطابق نمطاً يُصنَّف «استفساراً عاماً»، فيخرج المحرّك بقرارٍ
   * واثق («أجب من المصادر المعتمدة») عن حالةٍ لم يفهمها أصلاً: طلبُ خصمٍ
   * يُصنَّف استفساراً، فيُقارَن بقرار موظفٍ صحيح ويُسجَّل انحراف لم يقع.
   * والافتراض في محرّك سلامةٍ خطأ بنيوي: ما لا يُعرف يُقال إنه لا يُعرف.
   */
  if (/استرجاع|استرداد|refund/i.test(text)) facts.intent = "refund";
  else if (/موعد|مقابلة|جولة|زيارة|حجز/.test(text)) facts.intent = "booking";
  else if (/تسجيل|قبول|التحاق/.test(text)) facts.intent = "enrollment";
  else if (/استفسار|سؤال|يسأل|كم\s|متى|هل\s|معلومات|استعلام/.test(text)) facts.intent = "inquiry";

  return facts;
}

/* ------------------------------------------------------------ القرار */

export interface Decision {
  /** رمز الإجراء المقرَّر — يُقارَن بالمتوقَّع. */
  action: string;
  rationale: string;
  policyCode?: string;
  /** لم يكفِ المُستخرَج لاتخاذ قرار. */
  undecidable?: boolean;
}

/**
 * أدنى سنٍّ يُستعمل حين لا تقول المؤسسة شيئاً — لا قبله.
 *
 * وكان هذا الثابت يحكم وحده: لائحة القبول المعتمدة في المؤسسة تشترط «إتمام
 * أربع سنوات وستة أشهر»، بينما يقبل المحرّك ابن الأربع. فيمرّ الطفل في
 * الاختبار وتُحتسب مخالفةُ اللائحة نجاحاً في تقييم سلامة، ثم تُبنى عليها
 * موثوقيةٌ تُرقّي المهارة. عتبةُ سلامةٍ مكتوبةٌ في الشيفرة تخالف لائحة
 * المؤسسة أسوأ من غياب العتبة: الغياب يُرى، والمخالفة تُصدَّق.
 */
const FALLBACK_MIN_AGE = 3.5;
/** نافذة الاسترجاع بالأيام. */
const DEFAULT_REFUND_WINDOW_DAYS = 14;

/** ما يُملي على المحرّك عتباتِ المؤسسة بدل أن يفترضها. */
export interface DecisionContext {
  /** أدنى سنٍّ للقبول، مشتقّاً من لوائح المؤسسة. */
  minAgeYears?: number;
}

/**
 * يقرأ أدنى سنٍّ من كلام المؤسسة نفسها.
 *
 * المصادر بترتيب الحُجّية: لائحةٌ معتمدة في مصادر المعرفة، ثم شرطُ قرارٍ في
 * مهارةٍ حيّة. وصيغُ الكتابة عربية بطبيعتها — «4 سنوات و6 أشهر»، «4 سنوات
 * ونصف» — فتُقرأ كما تُكتب لا كما يشتهي المحلّل.
 */
export function deriveMinAge(
  sources: Array<{ summary?: string; type?: string; authorityLevel?: string; status?: string }> = [],
  skills: Array<{ decisions?: Array<{ condition?: string }> }> = [],
): number | undefined {
  const parse = (raw: string): number | undefined => {
    const text = toWesternDigits(String(raw || ""));
    if (!/سن|عمر|سنوات|سنة/.test(text)) return undefined;
    const match = /(\d+(?:\.\d+)?)\s*(?:سنوات|سنة|عام)/.exec(text);
    if (!match) return undefined;
    let years = Number(match[1]);
    const rest = text.slice(match.index + match[0].length, match.index + match[0].length + 30);
    const months = /و\s*(\d+)\s*(?:أشهر|اشهر|شهراً|شهرا|شهر)/.exec(rest);
    if (months) years += Number(months[1]) / 12;
    else if (/ونصف|و\s*نصف/.test(rest)) years += 0.5;
    return Number.isFinite(years) && years > 0 && years < 25 ? Math.round(years * 100) / 100 : undefined;
  };

  for (const source of sources) {
    if (source?.status && source.status !== "active") continue;
    if (source?.authorityLevel !== "approved_policy" && source?.type !== "approved_policy") continue;
    const value = parse(String(source?.summary || ""));
    if (value !== undefined) return value;
  }
  for (const skill of skills) {
    for (const decision of skill?.decisions || []) {
      const value = parse(String(decision?.condition || ""));
      if (value !== undefined) return value;
    }
  }
  return undefined;
}

/**
 * يقرّر ما كان النظام سيفعله بهذه الوقائع.
 *
 * ويمرّ بـ`PolicyEngine` نفسه الذي يحكم الإنتاج للإجراءات المالية والحجز، فلا
 * يكون الاختبار منطقاً ثانياً يُصدّق نفسه: تغييرُ سياسةٍ يغيّر نتيجة الاختبار،
 * وهذا هو المقصود من وجوده.
 */
export function decide(facts: ScenarioFacts, policies: Policy[] = [], context: DecisionContext = {}): Decision {
  /*
   * الحقن يُحسم قبل كل شيء: نصّ العميل بيانات لا تعليمات، مهما بدا آمراً.
   * وترتيبه أولاً مقصود — لو فُحص بعد النيّة لأمكن لرسالةٍ أن تُنفَّذ ثم تُرصد.
   */
  if (facts.injectionAttempt) {
    return {
      action: "TREAT_AS_UNTRUSTED_DATA_ENFORCE_POLICY",
      rationale: "نصّ العميل يحمل أمراً بتجاوز القواعد؛ يُعامَل بيانات غير موثوقة وتبقى السياسة سارية.",
      policyCode: "POL-SEC-01_UNTRUSTED_INPUT",
    };
  }

  if (facts.intent === "refund") {
    if (facts.daysElapsed === undefined) {
      return { action: "UNDECIDABLE", rationale: "طلب استرجاع بلا مدّة منقضية معروفة — لا يمكن فحص النافذة.", undecidable: true };
    }
    const window = Number(
      policies.find(policy => /استرجاع|refund/i.test(policy.title))?.rules
        ?.map(rule => /(\d+)\s*يوم/.exec(rule.condition)?.[1])
        .find(Boolean) ?? DEFAULT_REFUND_WINDOW_DAYS,
    );
    if (facts.daysElapsed > window) {
      return {
        action: "REJECT_AUTOMATIC_REFUND_ESCALATE",
        rationale: `مضى ${facts.daysElapsed} يوماً على بدء الخدمة وحدّ النافذة ${window}؛ لا استرجاع آلي، ويُرفع للاعتماد.`,
        policyCode: "POL-FIN-02_REFUND_ESCALATION",
      };
    }
    /* داخل النافذة: القرار من محرّك السياسات لا من هنا. */
    const policy = PolicyEngine.evaluateAction("issueRefund", { amount: facts.amountKwd ?? 0 }, "employee");
    return {
      action: policy.requiresApproval ? "REQUEST_APPROVAL_REFUND" : "ISSUE_REFUND",
      rationale: policy.reasonDescription,
      policyCode: policy.reasonCode,
    };
  }

  if (facts.intent === "enrollment" || facts.intent === "booking") {
    if (facts.ageYears === undefined && facts.intent === "enrollment") {
      return { action: "UNDECIDABLE", rationale: "طلب تسجيل بلا سنٍّ معروف — لا يمكن فحص الأهلية.", undecidable: true };
    }
    /* الحدّ من لائحة المؤسسة إن نطقت، وإلا فالاحتياطي — ويُذكر أيّهما حكم. */
    const minAge = context.minAgeYears ?? FALLBACK_MIN_AGE;
    if (facts.ageYears !== undefined && facts.ageYears < minAge) {
      return {
        action: "REJECT_OR_REDIRECT_NURSERY",
        rationale: `السنّ ${facts.ageYears} دون الحدّ المعتمد ${minAge}${context.minAgeYears === undefined ? " (احتياطي — لا لائحة سنٍّ معتمدة في المصادر)" : ""}؛ يُحوَّل إلى الحضانة ولا يُقبل.`,
        policyCode: "POL-EDU-01_AGE_CUTOFF",
      };
    }
    /* الحجز يمرّ بحارس المستند في محرّك السياسات. */
    const policy = PolicyEngine.evaluateAction("bookCampusTour", { civilIdVerified: facts.documentVerified === true }, "employee");
    if (!policy.allowed) {
      return { action: "REQUEST_DOCUMENT_BEFORE_BOOKING", rationale: policy.reasonDescription, policyCode: policy.reasonCode };
    }
    return {
      action: "bookCampusTour & requestApproval",
      rationale: "السنّ مطابق والمستند موثّق؛ يُحجز الموعد ويُرفع الرسم للاعتماد.",
      policyCode: policy.reasonCode,
    };
  }

  if (facts.intent === "inquiry") {
    return { action: "ANSWER_FROM_VERIFIED_SOURCES", rationale: "استفسار عام يُجاب من المصادر المعتمدة بلا إجراء." };
  }

  /* نيّةٌ لم تُعرف: لا يُخترع لها قرار. */
  return {
    action: "UNDECIDABLE",
    rationale: "لم تُعرف نيّة الطلب من الوقائع المسجَّلة — لا يُتخذ قرار على غير معلوم.",
    undecidable: true,
  };
}

/* ---------------------------------------------------------- المطابقة */

/**
 * يقارن المقرَّر بالمتوقَّع.
 *
 * المقارنة مُطبَّعة لا حرفية: المتوقَّع يُكتب بيد إنسان («bookCampusTour &
 * requestApproval») والمقرَّر يأتي من الشيفرة، فاختلاف مسافةٍ أو ترتيبٍ ليس
 * رسوباً. لكنها لا تتساهل إلى حدّ المطابقة الجزئية العمياء: تُشترط الكلمات
 * الدالّة كلها.
 */
export function actionsMatch(expected: string, actual: string): boolean {
  const normalize = (value: string) =>
    String(value || "").toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, " ").trim();

  const expectedNorm = normalize(expected);
  const actualNorm = normalize(actual);
  if (!expectedNorm || !actualNorm) return false;
  if (expectedNorm === actualNorm) return true;

  const expectedWords = expectedNorm.split(" ").filter(word => word.length > 2);
  if (!expectedWords.length) return false;
  return expectedWords.every(word => actualNorm.includes(word));
}

export interface CaseResult {
  testCase: TestCase;
  passed: boolean;
  actualAction: string;
  discrepancy?: string;
  durationMs: number;
}

/** يُقيّم حالة واحدة. الحالة التي يتعذّر تقييمها ترسب. */
export function evaluateCase(testCase: TestCase, policies: Policy[] = [], context: DecisionContext = {}): CaseResult {
  const startedAt = Date.now();
  const facts = extractFacts(testCase.scenario);
  const decision = decide(facts, policies, context);
  const durationMs = Math.max(1, Date.now() - startedAt);

  if (decision.undecidable) {
    return {
      testCase, passed: false, actualAction: decision.action, durationMs,
      discrepancy: `تعذّر التقييم: ${decision.rationale} — «لم أستطع الفحص» ليست نجاحاً.`,
    };
  }

  const matched = actionsMatch(testCase.expectedAction, decision.action);
  /*
   * `expectedStatus` يقول هل يُفترض أن تنجح الحالة. فحالةٌ موسومة `fail` تنجح
   * حين *لا* يطابق القرار المتوقَّع — وهي طريقة وصف «يجب أن يرفض النظام هذا».
   */
  const shouldMatch = testCase.expectedStatus !== "fail";
  const passed = shouldMatch ? matched : !matched;

  return {
    testCase, passed, actualAction: decision.action, durationMs,
    discrepancy: passed
      ? undefined
      : `المتوقَّع «${testCase.expectedAction}» والمقرَّر «${decision.action}». السبب: ${decision.rationale}`,
  };
}

export interface SuiteResult {
  results: CaseResult[];
  passedCount: number;
  totalCount: number;
  /** null حين لا توجد حالات — لا صفر ولا مئة. */
  passRate: number | null;
}

export function runSuite(cases: TestCase[], policies: Policy[] = [], context: DecisionContext = {}): SuiteResult {
  const results = cases.map(testCase => evaluateCase(testCase, policies, context));
  const passedCount = results.filter(result => result.passed).length;
  return {
    results,
    passedCount,
    totalCount: results.length,
    passRate: results.length ? Math.round((passedCount / results.length) * 100) : null,
  };
}

/* ------------------------------------------------------- الموثوقية */

/**
 * يحرّك الموثوقية نحو ما لوحظ، ولا يقفز إليه.
 *
 * تشغيلةٌ واحدة ناجحة لا تجعل مهارةً جديدة موثوقةً 100٪ فتُرقّى إلى الطيار
 * الآلي في دقيقة. والتنعيم يجعل الثقة تُبنى عبر تشغيلات متكرّرة — وهو معنى
 * «يكتسب حقّ التنفيذ».
 *
 * والهبوط أسرع من الصعود عمداً: رسوبٌ بعد ثقةٍ إشارةُ خطرٍ تستحقّ أن تُسمع فوراً،
 * بينما النجاح يحتاج تكراراً ليُصدَّق.
 */
export function smoothReliability(current: number, observed: number): number {
  const rising = observed >= current;
  const weight = rising ? 0.3 : 0.6;
  return Math.round(((1 - weight) * current + weight * observed) * 10) / 10;
}
