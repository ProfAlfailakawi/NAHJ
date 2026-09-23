import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import type { AddressInfo } from "node:net";

/*
 * حراسة على بدء التشغيل الحقيقي.
 *
 * نشرٌ جديد يُقلع على بذرة العرض. وما يُمسَك هنا: أن المؤسسة لا ترى تلك البذرة
 * على أنها سجلّها، وأن إعدادها الأول يُنتج صفحةً نظيفة باسمها وقطاعها — قوالب
 * بلا أرقامٍ مُختلقة ولا صلاحياتٍ لم تُكتسب — وأنه لا يُعاد فيمحو عملها. ومعها
 * طلبات العرض التي صارت طريق الزائر إلى المالك.
 */

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nahj-golive-"));
process.env.NAHJ_DATABASE_PATH = path.join(directory, "test.sqlite");

const { Store, requestAccount } = await import("./db.ts");
const { buildCleanStart, GENERAL_CODE, setupSectorCodes } = await import("./packs/cleanStart.ts");
const { SECTOR_PACKS, EDUCATION_CODE } = await import("./packs/index.ts");
const { apiRouter, authRouter } = await import("./routes.ts");
const { publicRouter } = await import("./publicPages.ts");
const { createAccount } = await import("./auth.ts");
const { ensureSubscription } = await import("./billing.ts");
const { createLead, listLeads, setLeadStatus, LeadError } = await import("./leads.ts");
const { createDemoSandboxSeed } = await import("./demoSandbox.ts");

/* ما لا يجوز أن يبقى بعد الإعداد: أسماء المؤسسات والموظفين النموذجيين. */
const SAMPLE_NAMES = [
  "أكاديمية المستقبل", "نورة خالد",
  ...SECTOR_PACKS.flatMap(pack => [pack.organization.name, ...pack.people.map(person => person.name)]),
];

function assertClean(store: InstanceType<typeof Store>, label: string) {
  assert.equal(store.users.length, 0, `${label}: موظفون نموذجيون`);
  assert.equal(store.workItems.length, 0, `${label}: حالات عمل`);
  assert.equal(store.approvalRequests.length, 0, `${label}: موافقات`);
  assert.equal(store.testCases.length, 0, `${label}: حالات تدرّب`);
  assert.equal(store.shadowComparisons.length, 0, `${label}: مقارنات ظل`);
  assert.equal(store.learningProposals.length, 0, `${label}: ملاحظات تعلّم مُختلقة`);
  for (const skill of store.skills) {
    assert.equal(skill.status, "draft", `${label}: «${skill.name}» ليست مسوّدة`);
    assert.equal(skill.autonomyLevel, 0, `${label}: «${skill.name}» بصلاحية لم تُكتسب`);
    assert.equal(skill.reliabilityScore, 0);
    assert.equal(skill.usageCount, 0);
    assert.equal(skill.hoursSavedTotal, 0);
  }
  for (const policy of store.policies) assert.match(policy.approvedBy, /قالب/, `${label}: سياسة معتمدة باسم غريب`);
  const visible = JSON.stringify({
    org: store.organization, skills: store.skills, policies: store.policies, sources: store.knowledgeSources,
    channel: store.channel, sim: store.simulatorState, audit: store.auditEvents,
  });
  for (const name of SAMPLE_NAMES) assert.ok(!visible.includes(name), `${label}: بقي «${name}»`);
}

test("كل قطاع — ومعه «نشاط آخر» — يُعَدّ نظيفاً باسم المؤسسة", () => {
  for (const code of setupSectorCodes()) {
    const store = new Store();
    assert.equal(store.organizationConfigured, false, "النشر الجديد غير مُعَدّ");
    const result = store.configureOrganization(code, "مؤسسة الاختبار", "Test Org", "المشرف");
    assert.equal(result.ok, true, `${code}: ${result.reason}`);
    assert.equal(store.organizationConfigured, true);
    assert.equal(store.organization.name, "مؤسسة الاختبار");
    assert.equal(store.sectorCode, code);
    assert.ok(store.channel.welcome.includes("مؤسسة الاختبار"), `${code}: الترحيب لا يحمل اسم المؤسسة`);
    assert.equal(store.auditEvents.length, 1, "السجلّ يبدأ بالإعداد وحده");
    assert.equal(store.auditEvents[0].action, "ORGANIZATION_CONFIGURED");
    assertClean(store, code);
  }
});

test("قوالب القطاع تصل كاملة الخطوات — نظيفة لا فارغة", () => {
  for (const pack of SECTOR_PACKS) {
    const start = buildCleanStart(pack.code, "س")!;
    assert.equal(start.skills.length, pack.skills.length);
    assert.equal(start.policies.length, pack.policies.length);
    assert.ok(start.skills.every(skill => skill.steps.length > 0), `${pack.code}: قالب بلا خطوات`);
  }
  assert.ok(buildCleanStart(EDUCATION_CODE, "س")!.skills.length > 0);
  assert.equal(buildCleanStart(GENERAL_CODE, "س")!.skills.length, 0);
  assert.equal(buildCleanStart("clinic", "   "), undefined, "لا مؤسسة بلا اسم");
  assert.equal(buildCleanStart("unknown", "س"), undefined);
});

test("تبديل النشاط في مؤسسةٍ حقيقية يُبقي اسمها ويركّب قوالب لا عرضاً", () => {
  const store = new Store();
  store.configureOrganization("retail", "متجر الأمل", "", "المشرف");
  assert.equal(store.applySector("clinic", "المشرف").ok, true);
  assert.equal(store.organization.name, "متجر الأمل");
  assert.equal(store.sectorCode, "clinic");
  assertClean(store, "clinic بعد التبديل");
});

test("المستخدم الحالي هو صاحب الجلسة لا ملفٌّ نموذجي", () => {
  const store = new Store();
  const user = requestAccount.run({ id: "acc_1", name: "أحمد", email: "a@x.com", role: "owner" }, () => store.getCurrentUser());
  assert.equal(user.name, "أحمد");
  assert.equal(user.department, "مالك المنصة");
  /* صندوق العرض يبقى على ملفّه النموذجي. */
  const demo = new Store(createDemoSandboxSeed());
  const demoUser = requestAccount.run({ id: "acc_1", name: "أحمد", email: "a@x.com", role: "owner" }, () => demo.getCurrentUser());
  assert.notEqual(demoUser.name, "أحمد");
});

/* ------------------------------------------------------------ HTTP */

const pw = () => ["Live", "Start", "2026"].join("-");

async function start() {
  const app = express();
  app.use(express.json());
  app.use(publicRouter);
  app.use("/api/auth", authRouter);
  app.use("/api", apiRouter);
  const server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

async function signIn(base: string, email: string) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: pw() }),
  });
  assert.equal(res.status, 200);
  const cookie = (res.headers.getSetCookie?.() || []).map(c => c.split(";")[0]).join("; ");
  const { csrfToken } = await res.json() as { csrfToken: string };
  return {
    get: (url: string) => fetch(`${base}/api${url}`, { headers: { cookie } }),
    post: (url: string, body: unknown = {}) => fetch(`${base}/api${url}`, {
      method: "POST", headers: { "content-type": "application/json", cookie, "x-csrf-token": csrfToken }, body: JSON.stringify(body),
    }),
  };
}

test("الإعداد عبر HTTP: للمشرف وحده، مرةً واحدة، وباسم صاحب الجلسة", async () => {
  await createAccount({ email: "owner@live.test", name: "مالك المنصة", password: pw(), role: "owner" });
  await createAccount({ email: "viewer@live.test", name: "مشاهد", password: pw(), role: "viewer" });
  ensureSubscription();
  const { server, base } = await start();
  try {
    const owner = await signIn(base, "owner@live.test");
    const before = await (await owner.get("/context")).json() as { organizationConfigured: boolean; currentUser: { name: string } };
    assert.equal(before.organizationConfigured, false);
    assert.equal(before.currentUser.name, "مالك المنصة", "رأس الشاشة يحمل اسم صاحب الجلسة");

    const viewer = await signIn(base, "viewer@live.test");
    assert.equal((await viewer.post("/setup/organization", { name: "س", sector: "clinic" })).status, 403);

    assert.equal((await owner.post("/setup/organization", { name: "", sector: "clinic" })).status, 400);
    assert.equal((await owner.post("/setup/organization", { name: "عيادات النخبة", sector: "nope" })).status, 400);
    const ok = await owner.post("/setup/organization", { name: "عيادات النخبة", sector: "clinic" });
    assert.equal(ok.status, 200);
    const after = await (await owner.get("/context")).json() as { organizationConfigured: boolean; organization: { name: string } };
    assert.equal(after.organizationConfigured, true);
    assert.equal(after.organization.name, "عيادات النخبة");

    assert.equal((await owner.post("/setup/organization", { name: "أخرى", sector: "law" })).status, 409, "الإعداد لا يُعاد");
  } finally {
    server.close();
  }
});

test("طلب العرض: يُحفظ ويُتحقَّق منه، والآلي يُجاب بلا حفظ، والمالك وحده يقرؤه", async () => {
  assert.throws(() => createLead({ name: "", organization: "م", contact: "a@b.co" }), LeadError);
  assert.throws(() => createLead({ name: "سالم", organization: "مؤسسة", contact: "ليس تواصلاً" }), /بريداً/);
  const before = listLeads().length;
  assert.equal(createLead({ name: "آلي", organization: "آلي", contact: "a@b.co", website: "http://spam" }), null);
  assert.equal(listLeads().length, before, "حقل الفخّ لا يُحفظ");

  const lead = createLead({ name: "سالم", organization: "عيادات النخبة", sector: "clinic", contact: "+965 5000 0000", message: "<b>مرحبا</b>" })!;
  assert.equal(lead.status, "new");
  assert.equal(setLeadStatus(lead.id, "contacted").status, "contacted");
  assert.throws(() => setLeadStatus(lead.id, "hacked"), LeadError);

  const { server, base } = await start();
  try {
    const res = await fetch(`${base}/api/public/leads`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "هند", organization: "شركة المسار", sector: "logistics", contact: "hind@example.com" }),
    });
    assert.equal(res.status, 201);
    assert.equal((await fetch(`${base}/api/public/leads`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "x" }),
    })).status, 400);

    const viewer = await signIn(base, "viewer@live.test");
    assert.equal((await viewer.get("/owner/leads")).status, 403, "الطلبات للمالك وحده");
    const owner = await signIn(base, "owner@live.test");
    const listed = await (await owner.get("/owner/leads")).json() as { leads: Array<{ organization: string }> };
    assert.ok(listed.leads.some(item => item.organization === "شركة المسار"));
  } finally {
    server.close();
  }
});

test("الأسماء النموذجية ثنائية بلا اسم عائلة", async () => {
  /*
   * الاسم والأب فقط («نورة خالد»): حالةٌ مُختلقة لا تُنسب إلى عائلةٍ حقيقية
   * معروفة — لا في العرض ولا في القوالب.
   */
  const { demoUsers } = await import("../src/data/seedData.ts");
  const names = [
    ...demoUsers.map(user => user.name),
    ...SECTOR_PACKS.flatMap(pack => pack.people.map(person => person.name)),
    ...SECTOR_PACKS.flatMap(pack => pack.demo!.work.map(work => work.contact)),
    ...SECTOR_PACKS.flatMap(pack => pack.demo!.shadow.map(shadow => shadow.humanActor)),
  ];
  for (const name of names) {
    const words = name.replace(/^(د\.|م\.|المحامي)\s+/, "").replace(/\s*\(.*\)$/, "").split(/\s+/);
    if (words.length < 2) continue; /* «مراجع» أو «عميلة» ليست اسماً */
    if (/^(مؤسسة|شركة|معرض|مصنع|ورشة|مورد|لجنة|مكتب|مزارع|متجر)/.test(words[0])) continue; /* جهةٌ لا شخص */
    const last = words[words.length - 1];
    assert.ok(!/^(ال|بو)/.test(last) || /^(الطبيب|الموظف)/.test(last), `اسم عائلة في «${name}»`);
  }
});
