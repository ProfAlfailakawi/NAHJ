import assert from "node:assert/strict";
import test from "node:test";

/*
 * حراسة على الوعد المركزي.
 *
 * «لا تُعدّ الذكاء ليفهم مؤسستك — دعه يتعلّمها» هو ما بُني عليه المنتج. وكان
 * التركيب يتجاهل ما سُجِّل تجاهلاً تاماً ويُعيد خمس خطوات مكتوبة عن تسجيل طالب،
 * مهما فعل الموظف ومهما كان قطاع المؤسسة.
 *
 * فأهمّ ما يُحرَس هنا: **أن الناتج يتغيّر بتغيّر ما عُلِّم.** تركيبٌ يُعطي الجواب
 * نفسه لكل مدخل ليس تركيباً.
 */

import { synthesize } from "./engine/teachEngine.ts";
import type { TeachEvent } from "../src/types/index.ts";

const event = (over: Partial<TeachEvent>): TeachEvent => ({
  id: `e_${Math.random()}`, timestamp: "10:00", action: "", system: "", ...over,
});

test("جلسة فارغة لا تُنتج مهارة — وتقول لماذا", () => {
  const result = synthesize([]);
  assert.equal(result.steps.length, 0, "رُكِّبت مهارة من لا شيء");
  assert.ok(result.emptyReason, "لم يُذكر سبب الفراغ");
  assert.match(result.emptyReason!, /لم يُسجَّل/);
});

test("الناتج يتبع ما عُلِّم لا قالباً ثابتاً", () => {
  const clinic = synthesize([
    event({ action: "فتح ملف المريض", system: "نظام المعلومات الطبية" }),
    event({ action: "فحص تغطية التأمين", system: "بوابة التأمين" }),
  ]);
  const logistics = synthesize([
    event({ action: "قراءة بوليصة الشحن", system: "نظام إدارة النقل" }),
  ]);

  /* عددُ الخطوات من عدد الأنظمة المتنقَّل بينها، لا خمساً دائماً. */
  assert.equal(clinic.steps.length, 2);
  assert.equal(logistics.steps.length, 1);
  assert.notDeepEqual(clinic.steps[0].title, logistics.steps[0].title);

  /* ولا أثر لقالب المدرسة في أيٍّ منهما. */
  const text = JSON.stringify(clinic) + JSON.stringify(logistics);
  assert.ok(!text.includes("السن القانوني"), "تسرّب قالب المدرسة");
  assert.ok(!text.includes("البطاقة المدنية"), "تسرّب قالب المدرسة");
});

test("الأحداث المتتالية في النظام نفسه خطوة واحدة", () => {
  const result = synthesize([
    event({ action: "بحث عن العميل", system: "CRM" }),
    event({ action: "تحديث بياناته", system: "CRM" }),
    event({ action: "إصدار فاتورة", system: "نظام الفوترة" }),
  ]);
  assert.equal(result.steps.length, 2, "لم تُجمَع الأحداث المتتالية");
  assert.equal(result.steps[0].system, "CRM");
  assert.match(result.steps[0].title, /بحث عن العميل/);
  assert.equal(result.steps[1].system, "نظام الفوترة");
  /* والترتيب متسلسل من واحد — تعتمد عليه الواجهة. */
  result.steps.forEach((step, index) => assert.equal(step.order, index + 1));
});

test("القواعد تُستخرج من كلام الموظف لا من افتراض", () => {
  const result = synthesize([
    event({ action: "فحص", system: "س", voiceNote: "لازم نتأكد من الرصيد قبل أي صرف" }),
    event({ action: "إدخال", system: "س", voiceNote: "ممنوع نتجاوز الحد بدون مدير" }),
  ]);
  assert.equal(result.rules.length, 2);
  assert.ok(result.rules.some(rule => rule.includes("الرصيد")));
});

test("الاستثناء يُميَّز عن القاعدة ولا يُحسم تلقائياً", () => {
  const result = synthesize([
    event({ action: "مراجعة", system: "س", voiceNote: "إذا كان العميل قديم نعطيه خصم" }),
  ]);
  assert.equal(result.exceptions.length, 1);
  assert.equal(result.rules.length, 0, "عُدّ الاستثناء قاعدة");
  assert.match(result.exceptions[0].protocol, /تأكيد المالك/, "حُسم استثناء لم يُحسم أثناء التعليم");
});

test("خطوة الموافقة لا تُؤتمت", () => {
  const manual = synthesize([event({ action: "أخذ موافقة المدير", system: "س" })]);
  assert.equal(manual.steps[0].isAutomated, false, "أُوتمتت خطوة موافقة");

  const readOnly = synthesize([event({ action: "فحص الرصيد", system: "س" })]);
  assert.equal(readOnly.steps[0].isAutomated, true, "لم تُرشَّح خطوة قراءة للأتمتة");

  /* وما ليس قراءةً خالصة يبقى بشرياً — القاعدة متحفّظة عمداً. */
  const unclear = synthesize([event({ action: "تعديل الطلب", system: "س" })]);
  assert.equal(unclear.steps[0].isAutomated, false);
});

test("الأسئلة تُولَّد من غموض حقيقي وتحمل أساسها", () => {
  const result = synthesize([
    event({ action: "إدخال", system: "س", inputValue: "500", voiceNote: "إذا تجاوز المبلغ الحد" }),
    event({ action: "إدخال", system: "س", inputValue: "1200" }),
  ]);
  assert.ok(result.questions.length > 0);
  assert.ok(result.questions.every(question => question.basis), "سؤالٌ بلا أساس ظاهر");
  /* القيم المتباينة في النظام نفسه تستدعي سؤالاً عن القاعدة. */
  assert.ok(result.questions.some(question => /قيم مختلفة/.test(question.question)), "لم يُسأل عن تباين المدخلات");
  /* وشرطٌ بلا بديل يستدعي سؤالاً عن الحالة المقابلة. */
  assert.ok(result.questions.some(question => /الحالة المقابلة/.test(question.question)));
});

test("غياب الاستثناءات يُسأل عنه بدل أن يُفترض عدمه", () => {
  const result = synthesize([event({ action: "فحص", system: "س" })]);
  assert.ok(result.questions.some(question => /الاستثنائية/.test(question.question)));
});

test("المسار لا يركّب من جلسة فارغة", async () => {
  /* الحارس الأهم: مهارةٌ مُخترَعة تمرّ إلى الاعتماد أسوأ من غياب التركيب. */
  const fs = await import("node:fs");
  const routes = fs.readFileSync("server/routes.ts", "utf8");
  const handler = /apiRouter\.post\("\/teach\/synthesize"[\s\S]*?\n\}\);/.exec(routes)?.[0] || "";
  assert.ok(handler, "تعذّر العثور على مسار التركيب");
  assert.match(handler, /synthesize\(session\.events\)/, "التركيب لا يقرأ أحداث الجلسة");
  assert.match(handler, /emptyReason/, "الجلسة الفارغة ما زالت تُنتج مهارة");
  /* ولا قالب مدرسة عاد إلى المسار. */
  assert.doesNotMatch(handler, /السن القانوني|syn_st_1/, "عاد القالب المكتوب");
});
