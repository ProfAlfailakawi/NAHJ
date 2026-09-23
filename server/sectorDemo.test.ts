import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/*
 * حراسة على «نهج لكل القطاعات».
 *
 * الوعد أن من يجرّب نهج لعيادته أو مكتبه أو متجره يرى مؤسسةً من قطاعه تعمل —
 * لا مدرسةً بأسماء أخرى، ولا شاشاتٍ فارغة. وهذه الاختبارات تُمسك ذلك عند كل
 * تغيير: نشاط العرض يُبنى لكل حزمة، وحالاته يقرّرها المحرّك فعلاً وتنجح،
 * والصندوق لا يحمل شيئاً من المدرسة، والمؤسسة الحقيقية لا يُكتب فيها نشاطٌ مُختلق.
 */

process.env.NAHJ_DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nahj-sector-")), "test.sqlite");

const { SECTOR_PACKS, EDUCATION_CODE } = await import("./packs/index.ts");
const { expandPack } = await import("./packs/types.ts");
const { buildDemoActivity } = await import("./packs/demoActivity.ts");
const { runSuite, deriveMinAge, extractFacts, decide, refundCeiling } = await import("./engine/evaluationEngine.ts");
const { Store, DemoSandbox, db, normalizeDemoSector } = await import("./db.ts");
const { createDemoSandboxSeed } = await import("./demoSandbox.ts");
const { renderLandingPage, renderTermsPage, renderPrivacyPage } = await import("./marketingPages.ts");

/* ما لا يجوز أن يظهر في مؤسسةٍ ليست مدرسة. و«طالب النتيجة» ليس طالب مدرسة. */
const SCHOOL_WORDS = /الطالب|الطلاب|طالب جديد|تسجيل طالب|ولي أمر|ولي الأمر|الرسوم الدراسية|KG1|KG2|أكاديمية|مديرة القبول|الروضة|الحضانة/;

test("كل حزمة قطاعٍ تحمل نشاط عرضٍ كاملاً", () => {
  for (const pack of SECTOR_PACKS) {
    const demo = pack.demo;
    assert.ok(demo, `${pack.code}: بلا نشاط عرض`);
    assert.ok(demo.work.length >= 3, `${pack.code}: حالات عمل قليلة`);
    assert.ok(demo.approvals.length >= 1, `${pack.code}: لا موافقة تنتظر`);
    assert.ok(demo.cases.length >= 4, `${pack.code}: حالات تدرّب قليلة`);
    assert.ok(demo.shadow.length >= 2, `${pack.code}: حالات ظل قليلة`);
    assert.ok(demo.teach.events.length >= 2, `${pack.code}: مثال «علّم» فارغ`);
    assert.ok(demo.chat.turns.some(turn => turn.approval), `${pack.code}: المحادثة لا تبلغ قراراً`);
    for (const turn of demo.chat.turns) assert.ok(turn.stage < demo.chat.stages.length, `${pack.code}: مرحلة خارج السير`);
  }
});

test("نشاط العرض يُبنى بلا مراجع مكسورة", () => {
  for (const pack of SECTOR_PACKS) {
    const activity = buildDemoActivity(pack.demo!, expandPack(pack), pack.code);
    assert.equal(activity.workItems.length, pack.demo!.work.length);
    for (const approval of activity.approvalRequests) {
      assert.ok(activity.workItems.some(item => item.id === approval.workItemId), `${pack.code}: موافقة بلا حالة`);
      assert.equal(approval.payload.sector, pack.code, "القطاع يُحمل في الطلب ليُنفَّذ بلسانه");
    }
    for (const testCase of activity.testCases) assert.ok(testCase.skillId, `${pack.code}: حالة بلا مهارة`);
  }
});

test("حالات التدرّب في كل قطاع يقرّرها المحرّك وتنجح — لا نتيجة مكتوبة سلفاً", () => {
  for (const pack of SECTOR_PACKS) {
    const expanded = expandPack(pack);
    const activity = buildDemoActivity(pack.demo!, expanded, pack.code);
    for (const testCase of activity.testCases) assert.equal(testCase.resultStatus, undefined, "لا نتيجة قبل التشغيل");
    const suite = runSuite(activity.testCases, expanded.policies, { minAgeYears: deriveMinAge(expanded.knowledgeSources, expanded.skills) });
    const failed = suite.results.filter(result => !result.passed).map(result => `${result.testCase.name}: ${result.discrepancy}`);
    assert.deepEqual(failed, [], `${pack.code}: حالات راسبة`);
  }
});

test("حالات الظل تُقارَن فعلاً: تطابقٌ حيث طابق الموظف، وانحرافٌ حيث خالف", () => {
  for (const pack of SECTOR_PACKS) {
    const expanded = expandPack(pack);
    for (const shadow of pack.demo!.shadow) {
      const decision = decide(extractFacts(shadow.scenario), expanded.policies, {});
      assert.ok(!decision.undecidable, `${pack.code}: «${shadow.title}» لا يُقرَّر`);
      const intendedDrift = /OVERRIDE/.test(shadow.humanCode);
      assert.equal(decision.action === shadow.humanCode, !intendedDrift, `${pack.code}: «${shadow.title}»`);
    }
  }
});

test("سقف الاسترجاع الآلي يُقرأ من لائحة المؤسسة", () => {
  const retail = expandPack(SECTOR_PACKS.find(pack => pack.code === "retail")!);
  assert.equal(refundCeiling(retail.policies), 20);
  assert.equal(decide(extractFacts("استرجاع 12 د.ك بعد 2 يوم"), retail.policies).action, "ISSUE_REFUND");
  assert.equal(decide(extractFacts("استرجاع 89 د.ك بعد 3 أيام"), retail.policies).action, "REQUEST_APPROVAL_REFUND");
  /* بلا لائحة سقف: كل استرجاع يُرفع للاعتماد كما كان. */
  assert.equal(decide(extractFacts("استرجاع 12 د.ك بعد 2 يوم"), []).action, "REQUEST_APPROVAL_REFUND");
  /* «أيام» بالجمع تُقرأ مدّةً — كانت تُسقط فيتعذّر التقييم. */
  assert.equal(extractFacts("بعد 3 أيام من الشراء").daysElapsed, 3);
});

test("صندوق العرض على قطاعٍ لا يحمل شيئاً من المدرسة", () => {
  for (const pack of SECTOR_PACKS) {
    const store = new Store(createDemoSandboxSeed());
    assert.equal(store.applySector(pack.code, "اختبار").ok, true);
    assert.ok(store.workItems.length >= 3 && store.approvalRequests.length >= 1, `${pack.code}: الصندوق فارغ`);
    assert.ok(store.testCases.length >= 4 && store.shadowComparisons.length >= 2);
    const visible = JSON.stringify({
      org: store.organization, work: store.workItems, approvals: store.approvalRequests, tests: store.testCases,
      shadow: store.shadowComparisons, audit: store.auditEvents, sim: store.simulatorState, skills: store.skills,
    });
    const hit = SCHOOL_WORDS.exec(visible);
    assert.ok(!hit, `${pack.code}: كلمة مدرسية «${hit?.[0]}» — …${hit ? visible.slice(Math.max(0, hit.index - 60), hit.index + 20) : ""}`);
    assert.deepEqual(store.simulatorState.stages, pack.demo!.chat.stages);
  }
});

test("المؤسسة الحقيقية تبدّل قطاعها نظيفةً — لا نشاط عرضٍ مُختلق في سجلّها", () => {
  const store = new Store();
  assert.equal(store.isDemo, false);
  store.applySector("clinic", "مشرف");
  assert.equal(store.workItems.length, 0);
  assert.equal(store.approvalRequests.length, 0);
  assert.equal(store.testCases.length, 0);
});

test("العرض يُفتح على القطاع المختار، ويبقى عليه بعد إعادة الضبط", () => {
  assert.equal(normalizeDemoSector("law"), "law");
  assert.equal(normalizeDemoSector("unknown"), EDUCATION_CODE, "رمزٌ مجهول يعود إلى التعليم");
  assert.equal(normalizeDemoSector(undefined), EDUCATION_CODE);

  const id = "demo_sector_test";
  DemoSandbox.create(id, 60_000, "logistics");
  let sector = "";
  DemoSandbox.run(id, 60_000, () => { sector = db.sectorCode; });
  assert.equal(sector, "logistics");
  DemoSandbox.reset(id, 60_000);
  DemoSandbox.run(id, 60_000, () => { sector = db.sectorCode; });
  assert.equal(sector, "logistics", "إعادة الضبط لا تُعيد الزائر إلى المدرسة");
  DemoSandbox.destroy(id);
});

test("عرض التعليم: حالات التدرّب كلها قابلة للتقييم وتنجح", () => {
  const seed = createDemoSandboxSeed();
  const suite = runSuite(seed.testCases, seed.policies, { minAgeYears: deriveMinAge(seed.knowledgeSources, seed.skills) });
  const failed = suite.results.filter(result => !result.passed).map(result => result.testCase.name);
  assert.deepEqual(failed, []);
});

test("صفحات الهبوط والشروط والخصوصية تُرسم، وتُدخل كل قطاعٍ إلى عرضه", () => {
  const landing = renderLandingPage();
  for (const pack of SECTOR_PACKS) assert.ok(landing.includes(`/try/${pack.code}`), `الهبوط بلا مدخل ${pack.code}`);
  assert.ok(landing.includes(`/try/${EDUCATION_CODE}`));
  assert.match(landing, /<html lang="ar" dir="rtl">/);
  assert.match(renderTermsPage(), /شروط الاستخدام/);
  /* الخصوصية تُفصح عن المعالجين الخارجيين الاختياريين — لا وعد بما ليس صحيحاً. */
  const privacy = renderPrivacyPage();
  assert.match(privacy, /Gemini/);
  assert.match(privacy, /Firebase/);
});
