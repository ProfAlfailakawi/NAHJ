import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/*
 * الاسترجاع يُعيد خطوات الإصدار، ودليله المطبوع يطابقه.
 *
 * كان الاسترجاع ينقل رقم الإصدار وحده: تبقى خطوات الإصدار الأحدث تعمل،
 * ويُطبع دليل الإصدار القديم الموقّع بخطوات الأحدث.
 */

process.env.NAHJ_DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nahj-rollback-")), "test.sqlite");

const { db } = await import("./db.ts");
const { SkillEngine } = await import("./engine/skillEngine.ts");
const { versionContent, signManual, renderManualHtml, normalizeManualOptions } = await import("./manual.ts");

type AnySkill = (typeof db.skills)[number];
const step = (id: string, order: number, title: string) => ({ id, order, title, description: `${title} — وصف`, system: "SIS", isAutomated: true });

function makeSkill(id: string): AnySkill {
  const v1Steps = [step("a1", 1, "خطوة الإصدار الأول")];
  const v2Steps = [step("b1", 1, "خطوة الإصدار الثاني"), step("b2", 2, "خطوة جديدة في الإصدار الثاني")];
  const skill = {
    ...JSON.parse(JSON.stringify(db.skills[0])),
    id, slug: id, name: `مهارة ${id}`, activeVersion: 2,
    steps: JSON.parse(JSON.stringify(v2Steps)),
    versions: [
      { version: 1, createdAt: "2026-01-01", approvedBy: "نورة", changeSummary: "الأول", steps: v1Steps, rules: ["قاعدة 1"], exceptions: [] },
      /* الإصدار النشط لا يحفظ خطواته — كما في البذرة: خطواته هي الحيّة. */
      { version: 2, createdAt: "2026-02-01", approvedBy: "نورة", changeSummary: "الثاني", steps: [], rules: ["قاعدة 2"], exceptions: [] },
    ],
  } as AnySkill;
  db.skills.unshift(skill);
  return skill;
}

test("rolling back restores the version's steps, and the manual shows them", () => {
  const skill = makeSkill("sk_rb_restore");
  const v2SignatureBefore = signManual(skill, 2)!.signature;

  const result = SkillEngine.rollbackSkillVersion(skill.id, 1, "مختبر");
  assert.equal(result.success, true, result.message);
  assert.equal(skill.activeVersion, 1);
  assert.deepEqual(skill.steps.map((s) => s.title), ["خطوة الإصدار الأول"], "runtime still runs the newer steps");

  const manual = versionContent(skill, 1)!;
  assert.deepEqual(manual.steps.map((s) => s.title), ["خطوة الإصدار الأول"], "the v1 manual shows the v2 steps");
  const html = renderManualHtml(skill, 1, normalizeManualOptions({}), { organization: "اختبار", issuedBy: "مختبر" })!;
  assert.ok(html.includes("خطوة الإصدار الأول"));
  assert.ok(!html.includes("خطوة جديدة في الإصدار الثاني"), "the printed v1 manual lists a v2 step");

  /* الإصدار الخارج حُفظت خطواته: دليله لم يتغيّر توقيعه، والتقدّم إليه يعيدها. */
  assert.equal(signManual(skill, 2)!.signature, v2SignatureBefore, "the already-issued v2 manual signature changed");
  const forward = SkillEngine.rollbackSkillVersion(skill.id, 2, "مختبر");
  assert.equal(forward.success, true, forward.message);
  assert.deepEqual(skill.steps.map((s) => s.title), ["خطوة الإصدار الثاني", "خطوة جديدة في الإصدار الثاني"]);
});

test("restored steps are a copy: editing the live steps does not rewrite the stored version", () => {
  const skill = makeSkill("sk_rb_copy");
  assert.equal(SkillEngine.rollbackSkillVersion(skill.id, 1, "مختبر").success, true);
  skill.steps[0].title = "عُدّلت حيّاً";
  assert.equal(skill.versions.find((v) => v.version === 1)!.steps[0].title, "خطوة الإصدار الأول");
});

test("a version whose steps were never stored is refused instead of faking a rollback", () => {
  const skill = makeSkill("sk_rb_missing");
  skill.versions[0].steps = [];
  const before = JSON.stringify(skill.steps);
  const result = SkillEngine.rollbackSkillVersion(skill.id, 1, "مختبر");
  assert.equal(result.success, false);
  assert.equal(skill.activeVersion, 2, "the version pointer moved without its steps");
  assert.equal(JSON.stringify(skill.steps), before);
});
