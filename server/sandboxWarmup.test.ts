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
const { buildDemoExport, describeDemoExport, DEMO_LEDGERS } = await import("./archive.ts");
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

    if (sector !== "education") {
      const extra = cases.filter(item => /_x\d+$/.test(String(item.id)));
      assert.ok(extra.length >= 8, `${sector}: حالات المهارات الإضافية قليلة`);
      assert.ok(extra.every(item => item.resultStatus === "pass"), `${sector}: المحرّك خالف المتوقَّع البشري في حالةٍ إضافية`);
      assert.ok(shadows.some(item => item.driftDetected), `${sector}: لا انحراف ظلّ يراه الزائر`);
    }

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

test("تصدير العرض يخرج من الصندوق وحده: لا فوترة ولا مسوّقين ولا دفاتر حقيقية", () => {
  DemoSandbox.create("demo_export_probe", 60_000, "clinic");
  let payload: any = null;
  let counts: any = null;
  DemoSandbox.run("demo_export_probe", 60_000, () => { payload = buildDemoExport(); counts = describeDemoExport(); });
  assert.equal(payload.meta.demo, true);
  assert.equal(payload.meta.sectorCode, "clinic");
  assert.equal(payload.billing, undefined, "فوترة في تصدير العرض");
  assert.equal(payload.owner, undefined, "دفتر مالك في تصدير العرض");
  assert.equal(payload.operations.users, undefined);
  assert.ok(payload.operations.skills.length >= 15);
  assert.equal(counts.invoices, 0);
  assert.deepEqual([...DEMO_LEDGERS].sort(), ["audit", "skills", "workItems"]);
});

test("لغة الصندوق: نصوص التاريخ المولَّدة بالإنجليزية، وتتبدّل وهو مفتوح بلا مسّ ما لمسه الزائر", async () => {
  const hasArabic = (text: string) => /[؀-ۿ]/.test(text);
  for (const sector of ["education", "clinic"]) {
    const id = `demo_lang_${sector}`;
    DemoSandbox.create(id, 60_000, sector, "en");
    let pending: Promise<void> = Promise.resolve();
    DemoSandbox.run(id, 60_000, () => { pending = warmDemoSandbox(); });
    await pending;
    let snap: any = null;
    DemoSandbox.run(id, 60_000, () => {
      const done = (db.workItems as any[]).filter(item => (item.state === "completed" || item.state === "escalated") && (item.details?.history || String(item.id).startsWith("wi_demo_")));
      snap = {
        steps: done.slice(0, 40).map(item => item.currentStepTitle),
        audit: (db.auditEvents as any[]).slice(0, 60).map(event => `${event.timestamp} ${event.actorName} ${event.details}`),
      };
    });
    assert.ok(snap.steps.length > 0);
    assert.ok(snap.steps.every((text: string) => !/الإجراء|اكتمل|رفض|حالة|الاعتماد/.test(text)), `${sector}: خطوة حالة بالعربية في صندوق إنجليزي: ${snap.steps.find((text: string) => /الإجراء|اكتمل|رفض|حالة/.test(text))}`);
    const engineLines = snap.audit.filter((line: string) => /Evaluated|Compared/.test(line));
    assert.ok(engineLines.length >= 2, `${sector}: أحداث المحرّكين لم تُترجَم`);

    /* الرجوع إلى العربية يعيد النصوص، ولا يمسّ موافقةً حسمها الزائر. */
    let pendingId = "";
    DemoSandbox.run(id, 60_000, () => {
      const target = (db.approvalRequests as any[]).find(item => item.status === "pending");
      if (target) { target.status = "approved"; target.decidedBy = "Visitor"; pendingId = target.id; }
      db.setLang("ar");
    });
    let after: any = null;
    DemoSandbox.run(id, 60_000, () => {
      after = {
        arabicSteps: (db.workItems as any[]).filter(item => item.state === "completed" && (item.details?.history || String(item.id).startsWith("wi_demo_"))).slice(0, 5).map(item => item.currentStepTitle),
        touched: (db.approvalRequests as any[]).find(item => item.id === pendingId),
      };
    });
    assert.ok(after.arabicSteps.every((text: string) => hasArabic(text)), `${sector}: لم تعد النصوص إلى العربية`);
    if (pendingId) assert.equal(after.touched.decidedBy, "Visitor", "ما حسمه الزائر لا يُستبدل");
  }
});
