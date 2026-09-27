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

test("صفحات الهبوط والشروط والخصوصية تُرسم — والعرض ليس باباً عامّاً فيها", () => {
  const landing = renderLandingPage();
  /* العرض أداةٌ يعرضها المالك: لا رابط /try في الصفحة العامة، بل طلب عرضٍ لكل قطاع. */
  assert.ok(!landing.includes("/try/"), "الصفحة العامة تفتح العرض لكل زائر");
  assert.match(landing, /id="lead-form"/);
  for (const pack of SECTOR_PACKS) assert.ok(landing.includes(`data-sector="${pack.code}"`), `لا طلب عرض لقطاع ${pack.code}`);
  assert.ok(landing.includes(`data-sector="${EDUCATION_CODE}"`));
  assert.match(landing, /<html lang="ar" dir="rtl">/);
  assert.match(renderTermsPage(), /شروط الاستخدام/);
  /* الخصوصية تُفصح عن المعالجين الخارجيين الاختياريين — لا وعد بما ليس صحيحاً. */
  const privacy = renderPrivacyPage();
  assert.match(privacy, /Gemini/);
  assert.match(privacy, /Firebase/);
});

test("كل قطاعٍ في مبدّل العرض ممتلئ: أسبوعٌ من النشاط، وأشخاص بمعرّفات فريدة، وحوكمة بلا تجاوزات مُختلقة", async () => {
  const { deriveMetrics } = await import("./engine/metricsEngine.ts");
  const seed = createDemoSandboxSeed();
  const stores: Array<[string, InstanceType<typeof Store>]> = [[EDUCATION_CODE, new Store(seed)]];
  for (const pack of SECTOR_PACKS) {
    const store = new Store(createDemoSandboxSeed());
    store.applySector(pack.code, "اختبار");
    stores.push([pack.code, store]);
  }
  for (const [code, store] of stores) {
    for (const [label, list] of Object.entries({ users: store.users, connectors: store.connectors, sources: store.knowledgeSources, proposals: store.learningProposals, skills: store.skills })) {
      assert.ok(list.length > 0, `${code}: ${label} فارغ`);
      const ids = list.map((entry: { id: string }) => entry.id);
      assert.equal(new Set(ids).size, ids.length, `${code}: معرّف مكرّر في ${label}`);
    }
    assert.ok(store.workItems.length >= 10, `${code}: حالات عمل قليلة`);
    assert.ok(store.approvalRequests.some(a => a.status === "pending"), `${code}: لا موافقة تنتظر`);
    assert.ok(store.approvalRequests.some(a => a.status !== "pending"), `${code}: لا قرار محسوم`);
    const metrics = deriveMetrics({
      skills: store.skills, policies: store.policies, approvalRequests: store.approvalRequests, auditEvents: store.auditEvents,
      workItems: store.workItems, shadowComparisons: store.shadowComparisons, testCases: store.testCases, learningProposals: store.learningProposals,
    } as never);
    assert.equal(metrics.trend.available, true, `${code}: نبض الأسبوع فارغ — ${metrics.trend.reason}`);
    assert.ok(metrics.trend.points.filter(point => point.events > 0).length >= 5, `${code}: أيامٌ بلا نشاط`);
    if (code !== EDUCATION_CODE) assert.equal(metrics.governance.unapprovedHighRiskActions.value, 0, `${code}: تجاوزات مُختلقة`);
  }
});

test("الاعتراض حدثٌ له معنى: فحصٌ انتهى بلا مشكلة، أو حالةٌ اكتملت، لا تُعدّ معترَضة", async () => {
  const { isDemoInterception } = await import("./db.ts");
  assert.equal(isDemoInterception({ state: "completed" }, { badge: "POL-LAW-01" }), false, "«لا تعارض» في حالة مكتملة ليس اعتراضاً");
  assert.equal(isDemoInterception({ state: "executing" }, { badge: "POL-LAW-02" }), false);
  assert.equal(isDemoInterception({ state: "waiting_approval" }, { badge: "Approval" }), true);
  assert.equal(isDemoInterception({ state: "waiting_approval" }, { badge: "POL-RET-01" }), true);
  assert.equal(isDemoInterception({ state: "collecting_data" }, { badge: "POL-MED-01" }), true);
  assert.equal(isDemoInterception({ state: "completed" }, { badge: "Approval" }), false);

  const law = new Store(createDemoSandboxSeed());
  law.applySector("law", "اختبار");
  const conflictFree = law.auditEvents.filter(event => event.provenance === "INT-0912");
  assert.ok(conflictFree.length > 0);
  assert.ok(conflictFree.every(event => event.status !== "intercepted"), "فحص تعارضٍ مكتمل عُدّ اعتراضاً");
  for (const pack of SECTOR_PACKS) {
    const store = new Store(createDemoSandboxSeed());
    store.applySector(pack.code, "اختبار");
    const byCode = new Map(store.workItems.map(item => [item.code, item]));
    for (const event of store.auditEvents.filter(e => e.status === "intercepted")) {
      const item = byCode.get(event.provenance);
      if (item) assert.notEqual(item.state, "completed", `${pack.code}: ${event.provenance} مكتملة ومعدودة معترَضة`);
    }
  }
});

test("موافقةٌ رُفضت في تاريخ العرض تُبقي حالتها موقوفة لا مكتملة", () => {
  for (const code of ["clinic", "law"]) {
    const store = new Store(createDemoSandboxSeed());
    store.applySector(code, "اختبار");
    const rejected = store.approvalRequests.filter(a => a.status === "rejected");
    assert.ok(rejected.length > 0, `${code}: لا موافقة مرفوضة في التاريخ`);
    for (const approval of rejected) {
      const item = store.workItems.find(w => w.id === approval.workItemId);
      assert.ok(item, `${code}: موافقة مرفوضة بلا حالة`);
      assert.notEqual(item!.state, "completed", `${code}: ${item!.code} مكتملة رغم رفض اعتمادها`);
      assert.ok(item!.progressPercent < 100);
      const audit = store.auditEvents.find(e => e.provenance === item!.code && e.action === "APPROVAL_REJECTED");
      assert.equal(audit?.status, "intercepted");
    }
  }
});

test("كلمة مرور مؤقتة في البيئة التجريبية تُنهي جلسات الحساب فعلاً", async () => {
  const { realAdminOnly } = await import("./routes.ts");
  const call = (method: string, path: string, id?: string) => new Promise<any>(resolve => {
    const res: any = { statusCode: 200, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { resolve({ status: this.statusCode, body }); return this; } };
    realAdminOnly({ account: { id: "demo" }, method, path, params: id ? { id } : {}, body: {} } as never, res, () => resolve({ next: true }));
  });
  const list = (await call("GET", "/accounts")).body.accounts as Array<{ id: string; activeSessions: number }>;
  const target = list.find(account => account.activeSessions > 0);
  assert.ok(target, "دفتر العرض بلا جلسات نشطة");
  const reset = await call("POST", `/accounts/${target!.id}/password`, target!.id);
  assert.equal(reset.body.sessionsRevoked, true);
  const after = (await call("GET", "/accounts")).body.accounts.find((a: { id: string }) => a.id === target!.id);
  assert.equal(after.activeSessions, 0, "الردّ يقول أُنهيت الجلسات والعدّاد على حاله");
});
