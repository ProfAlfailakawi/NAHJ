import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/*
 * إحماء صندوق العرض.
 *
 * يُسلَّم الصندوق مُجرَّباً: يُشغَّل محرّكا التدرّب والظلّ الحقيقيان على حالاته، فلا يرى الزائر
 * خانات فارغة. والقاعدة التي يحرسها هذا الاختبار: ما في الحالات بعد الإحماء قرّره المحرّك،
 * وما لم يستطع تقييمه يبقى بلا نتيجة — لا نتيجة مكتوبة بيد.
 */

process.env.NAHJ_DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nahj-warm-")), "test.sqlite");

const { warmDemoSandbox } = await import("./routes.ts");
const { DemoSandbox, db } = await import("./db.ts");
const { buildExtraDemoSkills, EXTRA_DEMO_SKILLS } = await import("./packs/demoSkills.ts");

const SECTORS = ["education", "clinic", "law", "retail", "logistics", "realestate"];

for (const sector of SECTORS) {
  test(`إحماء صندوق ${sector} يُشغّل محرّكَي التدرّب والظلّ فعلاً`, async () => {
    const id = `demo_warm_${sector}`;
    DemoSandbox.create(id, 60_000, sector);
    let pending: Promise<void> = Promise.resolve();
    assert.ok(DemoSandbox.run(id, 60_000, () => { pending = warmDemoSandbox(); }));
    await pending;

    let snapshot: { cases: any[]; shadows: any[]; skills: number } | null = null;
    DemoSandbox.run(id, 60_000, () => {
      snapshot = { cases: [...db.testCases], shadows: [...db.shadowComparisons], skills: db.skills.length };
    });
    assert.ok(snapshot);
    const { cases, shadows, skills } = snapshot!;

    assert.ok(cases.length > 0, "لا حالات تدرّب");
    assert.ok(cases.every(item => item.resultStatus === "pass" || item.resultStatus === "fail"),
      "حالة تدرّب لم يمرّ عليها المحرّك");
    assert.ok(cases.some(item => item.resultStatus === "pass"), "لا حالة نجحت بقرار المحرّك");

    assert.ok(shadows.length > 0, "لا مقارنات ظل");
    assert.ok(shadows.every(item => item.aiAction), "مقارنة ظل بلا قرار من المحرّك");
    assert.ok(shadows.some(item => item.matched), "لا مقارنة تطابقت");

    /* مكتبة مهاراتٍ بحجم مؤسسةٍ تعمل، لا ثلاثٍ أو أربع. */
    assert.ok(skills >= 15, `${sector}: ${skills} مهارة فقط`);
  });
}

test("مهارات العرض الإضافية: معرّفات فريدة، وخطورة تضبط الاستقلالية، وبلا نتائج مكتوبة", () => {
  for (const [sector, definitions] of Object.entries(EXTRA_DEMO_SKILLS)) {
    const slugs = new Set<string>();
    for (const skill of buildExtraDemoSkills(sector)) {
      assert.ok(!slugs.has(skill.slug), `${sector}: مهارة مكرّرة ${skill.slug}`);
      slugs.add(skill.slug);
      assert.ok(skill.steps.length >= 2, `${skill.slug}: خطوات قليلة`);
      if (skill.riskLevel === "critical") assert.ok(skill.autonomyLevel <= 2, `${skill.slug}: حرجة فوق L2`);
      if (skill.riskLevel === "high") assert.ok(skill.autonomyLevel <= 3, `${skill.slug}: عالية فوق L3`);
      if (skill.status === "draft") assert.equal(skill.usageCount, 0, `${skill.slug}: مسوّدة بلا تنفيذ`);
    }
    assert.equal(slugs.size, definitions.length);
  }
});
