import type { SkillException, SkillStep, TeachEvent } from "../../src/types/index.ts";

/*
 * محرّك التعليم.
 *
 * وضع التعليم هو الوعد المركزي للمنتج: «لا تُعدّ الذكاء ليفهم مؤسستك — دعه
 * يتعلّمها». والموظف ينفّذ عمله كالمعتاد بينما يُسجَّل كل ما يفعله.
 *
 * وكان التركيب — الخطوة التي تُحوّل ما سُجِّل إلى مهارة — يتجاهل ما سُجِّل تجاهلاً
 * تاماً: يُعيد خمس خطوات مكتوبة في الشيفرة عن تسجيل طالب في مدرسة، مهما كان
 * الذي فعله الموظف ومهما كان قطاع المؤسسة. بل ويُنادي النموذج اللغوي ثم يرمي
 * جوابه (`await generateAiResponse(prompt);` بلا استعمال للناتج).
 *
 * أي أن «نهج يتعلّم منك» كانت تُعرض على الشاشة بينما لا يُقرأ حرفٌ ممّا علّمتَه.
 * وهذا أخطر من رقمٍ مخترع على لوحة: الرقم يُجمّل قياساً، وهذا يُلغي الميزة التي
 * بُني عليها المنتج كلّه.
 *
 * والتركيب هنا حتميّ لا احتمالي: يقرأ الأحداث ويشتقّ منها. فلا يحتاج مفتاح
 * نموذج ليعمل — والنموذج، إن وُجد، يُحسّن الصياغة ولا يخترع خطوة. ومهارةٌ
 * مُخترَعة تمرّ إلى الاعتماد أسوأ من غياب التركيب أصلاً.
 */

/* ----------------------------------------------------------- الإشارات */

/*
 * علاماتٌ لغوية تُميّز نوع ما يقوله الموظف في ملاحظته الصوتية.
 *
 * وهي عربيةٌ بطبيعتها لأن الموظف يتكلّم بلغته. ولا تُستعمل `\b` معها: حدّ الكلمة
 * لا ينطبق على الحروف العربية في تعابير جافاسكربت.
 */
const RULE_MARKERS = /(لازم|يجب|دائماً|دائما|ممنوع|لا يجوز|أبداً|حصراً|حصرا|إلزامي|قاعدة|ما ينفع|لا بد)/;
const EXCEPTION_MARKERS = /(إذا|اذا|لو |إلا|الا |ما عدا|ماعدا|استثناء|أحياناً|احيانا|في حالة|عند ما|حال )/;
const DECISION_MARKERS = /(نقرّر|نقرر|نختار|نحدّد|نحدد|يعتمد على|حسب|بناءً على|بناء على)/;
const APPROVAL_MARKERS = /(موافقة|اعتماد|توقيع|يوقّع|يعتمد|إذن|تفويض|مدير|مسؤول)/;

/** فعلٌ يقرأ ولا يغيّر — مرشَّحٌ للأتمتة بأمان. */
const READ_ONLY_MARKERS = /(فحص|تحقق|تحقّق|استعلام|قراءة|مراجعة|بحث|عرض|مطابقة|استخراج)/;

const clean = (value: unknown) => String(value ?? "").trim();

/* ------------------------------------------------------------ الخطوات */

/**
 * يجمع الأحداث المتتالية في النظام الواحد خطوةً واحدة.
 *
 * الموظف يفتح نظاماً فيفعل فيه عدّة أشياء، ثم ينتقل. فحدودُ الخطوة هي حدودُ
 * انتقاله بين الأنظمة — وهو أقرب ما يكون إلى ما يفهمه هو عن «خطوة».
 *
 * وحدثٌ واحد لا يُصنع منه خمس خطوات: عدد الخطوات يأتي ممّا فُعل، لا من قالب.
 */
function groupIntoSteps(events: TeachEvent[]): TeachEvent[][] {
  const groups: TeachEvent[][] = [];
  for (const event of events) {
    const last = groups[groups.length - 1];
    if (last && clean(last[0].system) === clean(event.system)) last.push(event);
    else groups.push([event]);
  }
  return groups;
}

function titleFor(group: TeachEvent[]): string {
  const actions = group.map(event => clean(event.action)).filter(Boolean);
  if (!actions.length) return "خطوة غير موصوفة";
  if (actions.length === 1) return actions[0];
  /* أول فعلٍ وآخره يصفان مدى الخطوة دون أن يطول العنوان. */
  return `${actions[0]} حتى ${actions[actions.length - 1]}`;
}

/**
 * هل تصلح الخطوة للأتمتة؟
 *
 * قاعدةٌ متحفّظة عمداً: ما لم يظهر أنه قراءةٌ خالصة يُترك بشرياً. فالخطأ في هذا
 * الاتجاه يُكلّف مراجعةً زائدة، وفي الاتجاه الآخر يُكلّف إجراءً نُفِّذ بلا إنسان.
 */
function isAutomatable(group: TeachEvent[]): boolean {
  const text = group.map(event => `${clean(event.action)} ${clean(event.voiceNote)}`).join(" ");
  if (APPROVAL_MARKERS.test(text)) return false;
  return READ_ONLY_MARKERS.test(text);
}

/* ------------------------------------------------------------ النتيجة */

export interface SynthesisQuestion {
  id: string;
  question: string;
  answered: boolean;
  /** ما أثار السؤال — يُعرض للموظف فيعرف لماذا يُسأل. */
  basis: string;
}

export interface Synthesis {
  steps: SkillStep[];
  rules: string[];
  exceptions: SkillException[];
  questions: SynthesisQuestion[];
  systems: string[];
  /** رسالةٌ صريحة حين لا يوجد ما يُركَّب. */
  emptyReason?: string;
}

/**
 * يركّب مهارةً ممّا سُجِّل فعلاً.
 *
 * بلا أحداث لا تُركَّب مهارة — ويُقال ذلك صراحةً. وهذا أهمّ سطرٍ هنا: التركيب
 * السابق كان يُنتج مهارةً كاملة من جلسةٍ فارغة، فيمرّ إلى الاعتماد شيءٌ لم
 * يُعلّمه أحد.
 */
export function synthesize(events: TeachEvent[]): Synthesis {
  const usable = (events || []).filter(event => clean(event.action) || clean(event.system));

  if (!usable.length) {
    return {
      steps: [], rules: [], exceptions: [], questions: [], systems: [],
      emptyReason: "لم يُسجَّل أي حدث في هذه الجلسة — لا يوجد ما يُركَّب. نفّذ العملية كالمعتاد وسيُسجَّل ما تفعله.",
    };
  }

  const groups = groupIntoSteps(usable);
  const systems = [...new Set(usable.map(event => clean(event.system)).filter(Boolean))];

  const steps: SkillStep[] = groups.map((group, index) => {
    const notes = group.map(event => clean(event.voiceNote)).filter(Boolean);
    const inputs = group.map(event => clean(event.inputValue)).filter(Boolean);
    const decisionNote = notes.find(note => DECISION_MARKERS.test(note) || EXCEPTION_MARKERS.test(note));

    const descriptionParts = [
      group.map(event => clean(event.action)).filter(Boolean).join("، "),
      inputs.length ? `القيم المدخلة: ${inputs.join("، ")}` : "",
      notes.length ? `ملاحظة الموظف: ${notes.join(" ")}` : "",
    ].filter(Boolean);

    return {
      id: `syn_${index + 1}`,
      order: index + 1,
      title: titleFor(group),
      description: descriptionParts.join(". "),
      system: clean(group[0].system) || "غير محدّد",
      decisionRule: decisionNote || undefined,
      isAutomated: isAutomatable(group),
    };
  });

  /* القواعد والاستثناءات من كلام الموظف نفسه، لا من افتراض. */
  const rules: string[] = [];
  const exceptions: SkillException[] = [];
  for (const event of usable) {
    const note = clean(event.voiceNote);
    if (!note) continue;
    if (EXCEPTION_MARKERS.test(note)) {
      exceptions.push({ scenario: note, protocol: "يحتاج تأكيد المالك قبل الاعتماد — وُصف أثناء التعليم ولم يُحسم." });
    } else if (RULE_MARKERS.test(note)) {
      rules.push(note);
    }
  }

  /*
   * الأسئلة تُولَّد من غموضٍ حقيقي لا لتبدو المنصة ذكية.
   *
   * كل سؤال يحمل أساسه، فيعرف الموظف لماذا يُسأل — وسؤالٌ بلا سبب ظاهر يُهمل.
   */
  const questions: SynthesisQuestion[] = [];
  const ask = (question: string, basis: string) => {
    questions.push({ id: `q_${questions.length + 1}`, question, answered: false, basis });
  };

  for (const step of steps) {
    if (step.decisionRule && !RULE_MARKERS.test(step.decisionRule)) {
      ask(
        `في خطوة «${step.title}»: ذكرتَ «${step.decisionRule}» — ما الذي يحدث في الحالة المقابلة؟`,
        "وُصف شرطٌ بلا ذكر البديل.",
      );
    }
  }

  const manualSteps = steps.filter(step => !step.isAutomated);
  for (const step of manualSteps.slice(0, 2)) {
    ask(`خطوة «${step.title}» تُركت بشرية — من يملك اعتمادها؟`, "الخطوة تمسّ موافقة أو قراراً.");
  }

  /* قيمةٌ تكرّرت بصور مختلفة في النظام نفسه: أيّها القاعدة؟ */
  const inputsBySystem = new Map<string, Set<string>>();
  for (const event of usable) {
    const value = clean(event.inputValue);
    if (!value) continue;
    const system = clean(event.system) || "غير محدّد";
    if (!inputsBySystem.has(system)) inputsBySystem.set(system, new Set());
    inputsBySystem.get(system)!.add(value);
  }
  for (const [system, values] of inputsBySystem) {
    if (values.size > 1) {
      ask(
        `في «${system}» أُدخلت قيم مختلفة (${[...values].slice(0, 3).join("، ")}) — ما القاعدة التي تحدّد أيّها يُستعمل؟`,
        "تباينت المدخلات في النظام نفسه.",
      );
    }
  }

  if (!exceptions.length) {
    ask("ما الحالات الاستثنائية التي تخرج عن هذا المسار؟", "لم يُذكر أي استثناء أثناء التعليم.");
  }

  return { steps, rules, exceptions, questions, systems };
}
