import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import type { AddressInfo } from "node:net";

/*
 * انحدارات عن مراجعة الجودة الشاملة: كل اختبار هنا يقابل خللاً وُجد بالتجربة
 * على بياناتٍ كبيرة، ويفشل على الشيفرة القديمة.
 */

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nahj-audit-fixes-"));
process.env.NAHJ_DATABASE_PATH = path.join(directory, "test.sqlite");
process.env.NAHJ_FIREBASE_SYNC = "off";

const { apiRouter, authRouter } = await import("./routes.ts");
const { publicRouter } = await import("./publicPages.ts");
const { createAccount, seatCount, changeOwnPassword, login, updateAccount } = await import("./auth.ts");
const { ensureSubscription, recordPayment, issueInvoice } = await import("./billing.ts");
const { db } = await import("./db.ts");
const { openDatabase } = await import("./persistence.ts");

const pw = () => ["Audit", "Fixes", "2026"].join("-");

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

async function signIn(base: string, email: string, password = pw()) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }),
  });
  assert.equal(res.status, 200);
  const cookie = (res.headers.getSetCookie?.() || []).map(c => c.split(";")[0]).join("; ");
  const { csrfToken } = await res.json() as { csrfToken: string };
  const call = (method: string, url: string, body?: unknown) => fetch(`${base}/api${url}`, {
    method, headers: { "content-type": "application/json", cookie, "x-csrf-token": csrfToken },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
  return { call, cookie };
}

test("المقاعد تعدّ طاقم المؤسسة وحده: لا مالك المنصة ولا المسوّقين ولا المعلَّقين", async () => {
  await createAccount({ email: "own@a.test", name: "مالك المنصة", password: pw(), role: "owner" });
  await createAccount({ email: "adm@a.test", name: "مشرف المؤسسة", password: pw(), role: "admin" });
  await createAccount({ email: "mk1@a.test", name: "مسوّق أول", password: pw(), role: "partner" });
  await createAccount({ email: "mk2@a.test", name: "مسوّق ثانٍ", password: pw(), role: "partner" });
  const staff = await createAccount({ email: "stf@a.test", name: "موظف", password: pw(), role: "operator" });
  assert.equal(seatCount(), 2);
  updateAccount(staff.id, { status: "SUSPENDED" });
  assert.equal(seatCount(), 1, "الحساب المعلّق يشغل مقعداً");
});

test("حساب موقوف: لا يُكشف إيقافه إلا لمن يعرف كلمة مروره", async () => {
  const account = await createAccount({ email: "susp@a.test", name: "موقوف", password: pw(), role: "viewer" });
  updateAccount(account.id, { status: "SUSPENDED" });
  await assert.rejects(login("susp@a.test", "Wrong-Password-1"), (error: { status?: number }) => error.status === 401);
  await assert.rejects(login("susp@a.test", pw()), (error: { status?: number }) => error.status === 403);
});

test("تغيير كلمة المرور يُنهي الجلسات الأخرى ويُبقي جلسة صاحب الطلب", async () => {
  await createAccount({ email: "pwchg@a.test", name: "مغيّر", password: pw(), role: "manager" });
  const one = await login("pwchg@a.test", pw());
  const two = await login("pwchg@a.test", pw());
  const count = (account: string) => Number((openDatabase().prepare("SELECT COUNT(*) AS n FROM sessions WHERE account_id = ?").get(account) as { n: number }).n);
  assert.equal(count(one.account.id), 2);
  await changeOwnPassword(one.account.id, pw(), "New-Password-2027", one.sessionToken);
  assert.equal(count(one.account.id), 1);
  /* والباقية هي جلسة صاحب الطلب، لا الأخرى. */
  const rows = openDatabase().prepare("SELECT token_hash FROM sessions WHERE account_id = ?").all(one.account.id) as Array<{ token_hash: string }>;
  const { createHash } = await import("node:crypto");
  assert.equal(rows[0].token_hash, createHash("sha256").update(one.sessionToken).digest("hex"));
  assert.notEqual(rows[0].token_hash, createHash("sha256").update(two.sessionToken).digest("hex"));
});

test("مسار التعليم: مدخلات معيبة ترفض، والاعتماد مرة واحدة", async () => {
  await createAccount({ email: "mgr@a.test", name: "مديرة", password: pw(), role: "manager" });
  ensureSubscription();
  const { server, base } = await start();
  try {
    const { call } = await signIn(base, "mgr@a.test");
    const started = await (await call("POST", "/teach/start", { title: "ا".repeat(5000) })).json() as { session: { id: string; title: string } };
    assert.ok(started.session.title.length <= 160, "عنوان الجلسة بلا سقف");
    const second = await (await call("POST", "/teach/start", {})).json() as { session: { id: string } };
    assert.notEqual(second.session.id, started.session.id);

    assert.equal((await call("POST", "/teach/record-event", { sessionId: started.session.id })).status, 400, "حدثٌ بلا إجراء");
    assert.equal((await call("POST", "/teach/record-event", { sessionId: started.session.id, action: { x: 1 } })).status, 400, "كائنٌ مكان النص");
    const ok = await call("POST", "/teach/record-event", { sessionId: started.session.id, action: "فتح الملف", system: "النظام", eventKey: "k1" });
    assert.equal(ok.status, 200);
    /* إعادة إرسال الحدث بمفتاحه تحدّثه ولا تكرّره (الواجهة تُعيد الإرسال عند الاستخلاص). */
    await call("POST", "/teach/record-event", { sessionId: started.session.id, action: "فتح الملف", system: "النظام", eventKey: "k1", voiceNote: "لازم الهوية" });
    const stored = db.learningSessions.find(candidate => candidate.id === started.session.id)!;
    assert.equal(stored.events.length, 1, "الحدث نفسه سُجّل مرتين");
    assert.equal(stored.events[0].voiceNote, "لازم الهوية", "التحديث لم يحمل الشرح الصوتي");
    assert.equal((await call("POST", "/teach/synthesize", { sessionId: started.session.id })).status, 200);
    assert.equal((await call("POST", "/teach/codify", { sessionId: started.session.id, title: "مهارة" })).status, 200);
    assert.equal((await call("POST", "/teach/codify", { sessionId: started.session.id, title: "مهارة" })).status, 409, "اعتمادٌ مكرّر ينتج مهارة ثانية");
    assert.equal((await call("POST", "/teach/record-event", { sessionId: started.session.id, action: "متأخر" })).status, 409);
  } finally { server.close(); }
});

test("السؤال التوضيحي يُحسم مرة، بإجابةٍ نصّية، ولا يُحسم المقترح قبل كل أسئلته", async () => {
  ensureSubscription();
  db.learningProposals.unshift({
    id: "lp_test", type: "conflict", title: "تضارب", titleEn: "Conflict", detectedAt: "اليوم", observedCasesCount: 3, confidence: 80,
    summary: "", status: "pending", evidence: {},
    clarifications: [
      { id: "q1", question: "؟", options: ["أ", "ب"] },
      { id: "q2", question: "؟؟", options: ["أ", "ب"] },
    ],
  } as never);
  const { server, base } = await start();
  try {
    const { call } = await signIn(base, "mgr@a.test");
    assert.equal((await call("POST", "/learn/clarify", { proposalId: "lp_test", clarificationId: "q1" })).status, 400, "بلا إجابة");
    assert.equal((await call("POST", "/learn/clarify", { proposalId: "lp_test", clarificationId: "nope", selectedAnswer: "أ" })).status, 404);
    assert.equal((await call("POST", "/learn/clarify", { proposalId: "lp_test", clarificationId: "q1", selectedAnswer: "أ" })).status, 200);
    assert.equal(db.learningProposals.find(p => p.id === "lp_test")?.status, "pending", "حُسم المقترح وفيه سؤال بلا إجابة");
    assert.equal((await call("POST", "/learn/clarify", { proposalId: "lp_test", clarificationId: "q2", selectedAnswer: "ب" })).status, 200);
    assert.equal(db.learningProposals.find(p => p.id === "lp_test")?.status, "resolved");
    assert.equal((await call("POST", "/learn/clarify", { proposalId: "lp_test", clarificationId: "q2", selectedAnswer: "أ" })).status, 409);
  } finally { server.close(); }
});

test("ترقية الاستقلالية: قيمةٌ غير موجودة تُرفض بـ400 لا بعرض ترقية الباقة", async () => {
  const { server, base } = await start();
  try {
    const { call } = await signIn(base, "mgr@a.test");
    const skillId = db.skills[0].id;
    for (const targetLevel of [99, -1, 2.5, "abc"]) {
      assert.equal((await call("POST", `/skills/${skillId}/promote`, { targetLevel })).status, 400, String(targetLevel));
    }
  } finally { server.close(); }
});

test("الاستلام البشري والاستئناف لا يتكرّران عند ضغطةٍ ثانية", async () => {
  db.workItems.unshift({
    id: "wi_t1", code: "T-1", title: "حالة", skillId: db.skills[0].id, skillName: "م", contactName: "ع", contactPhone: "1", state: "queued",
    riskLevel: "low", assignedMode: "ai", createdAt: "الآن", updatedAt: "الآن", progressPercent: 0, currentStepTitle: "", details: {}, timeline: [],
  });
  const { server, base } = await start();
  try {
    const { call } = await signIn(base, "mgr@a.test");
    await call("POST", "/work/wi_t1/takeover");
    await call("POST", "/work/wi_t1/takeover");
    assert.equal(db.workItems.find(w => w.id === "wi_t1")!.timeline.length, 1, "سطرُ استلامٍ مكرّر");
    await call("POST", "/work/wi_t1/resume-ai");
    await call("POST", "/work/wi_t1/resume-ai");
    assert.equal(db.workItems.find(w => w.id === "wi_t1")!.timeline.length, 2);
  } finally { server.close(); }
});

test("طريقة الدفع وتاريخه يُتحقَّق منهما قبل الحفظ", () => {
  ensureSubscription();
  const invoice = issueInvoice({ lines: [{ description: "خدمة", quantity: 1, unitAmount: 10_000, amount: 10_000 }] }, "test");
  assert.throws(() => recordPayment({ invoiceId: invoice.id, amount: 1_000, method: "bitcoin" as never }), /طريقة الدفع/);
  assert.throws(() => recordPayment({ invoiceId: invoice.id, amount: 1_000, paidAt: "garbage" }), /تاريخ الدفع/);
  const ok = recordPayment({ invoiceId: invoice.id, amount: 1_000, method: "cash", paidAt: "2026-01-02" });
  assert.equal(ok.payment.paidAt, "2026-01-02T00:00:00.000Z");
});

test("طلبات العرض: الخطأ في الإدخال لا يستهلك حصّة الزائر", async () => {
  const { server, base } = await start();
  try {
    const post = (body: unknown) => fetch(`${base}/api/public/leads`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    for (let i = 0; i < 8; i++) assert.equal((await post({ name: "س", organization: "", contact: "x" })).status, 400, `محاولة ${i}`);
    assert.equal((await post({ name: "سالم", organization: "عيادة النور", contact: "salem@example.com" })).status, 201, "حُظر زائرٌ لم يُقبل له طلب");
  } finally { server.close(); }
});

test("طلب تشترط سياسته مشرفاً لا يعتمده مدير", async () => {
  await createAccount({ email: "adm2@a.test", name: "مشرف", password: pw(), role: "admin" });
  db.workItems.unshift({
    id: "wi_ref", code: "R-1", title: "استرداد", skillId: db.skills[0].id, skillName: "م", contactName: "ع", contactPhone: "1", state: "waiting_approval",
    riskLevel: "high", assignedMode: "ai", createdAt: "الآن", updatedAt: "الآن", progressPercent: 50, currentStepTitle: "", details: {}, timeline: [],
  });
  db.approvalRequests.unshift({
    id: "appr_ref", workItemId: "wi_ref", workTitle: "استرداد", actionName: "processTuitionRefund", payload: {}, reasonCode: "POL-FIN-02_REFUND_ESCALATION",
    reasonDescription: "يتطلب المدير العام", riskLevel: "high", requiredRole: "owner", requestedAt: "الآن", status: "pending",
  });
  const { server, base } = await start();
  try {
    const manager = await signIn(base, "mgr@a.test");
    const denied = await manager.call("POST", "/approvals/appr_ref/decide", { decision: "approved", comments: "موافق على الاسترداد" });
    assert.equal(denied.status, 403);
    assert.equal(db.approvalRequests.find(a => a.id === "appr_ref")?.status, "pending", "اعتمده مدير رغم شرط السياسة");
    const admin = await signIn(base, "adm2@a.test");
    assert.equal((await admin.call("POST", "/approvals/appr_ref/decide", { decision: "rejected", comments: "المستند ناقص" })).status, 200);
  } finally { server.close(); }
});

test("تسجيل خادم MCP يتحقّق من مدخله ولا يحذف المدمج", async () => {
  const { server, base } = await start();
  try {
    const admin = await signIn(base, "adm2@a.test");
    for (const bad of [{ name: "", endpointUrl: "" }, { name: "x", endpointUrl: "javascript:alert(1)" }, { name: { a: 1 }, endpointUrl: "https://ok.example" }, { name: "خادم", endpointUrl: ["x"] }]) {
      assert.equal((await admin.call("POST", "/mcp/servers", bad)).status, 400, JSON.stringify(bad));
    }
    const created = await admin.call("POST", "/mcp/servers", { id: "sis-mcp-server", name: "خادم خارجي", endpointUrl: "https://mcp.example.com/sse" });
    assert.equal(created.status, 200);
    const body = await created.json() as { server: { id: string } };
    assert.notEqual(body.server.id, "sis-mcp-server", "معرّف العميل استُعمل");
    assert.equal((await admin.call("POST", "/mcp/servers", { name: "مكرر", endpointUrl: "https://mcp.example.com/sse" })).status, 409);
    assert.equal((await admin.call("DELETE", "/mcp/servers/sis-mcp-server")).status, 409, "حُذف خادمٌ مدمج");
    assert.equal((await admin.call("DELETE", `/mcp/servers/${body.server.id}`)).status, 200);
  } finally { server.close(); }
});

test("حدّ المقاعد: المسوّق لا يُرفض به، ولا يُلتفّ عليه بالتعليق أو تغيير الدور", async () => {
  const { adminCreateAccount } = await import("./auth.ts");
  const { upsertPlan, startSubscription } = await import("./billing.ts");
  upsertPlan({ code: "tiny", nameAr: "صغيرة", nameEn: "Tiny", priceMonthly: 1000, priceQuarterly: 3000, priceAnnual: 10000, limits: { seats: 0 } } as never, "test");
  startSubscription({ planCode: "tiny", issueInvoice: false }, "test");
  /* لا مقاعد: موظف يُرفض، ومسوّق يُقبل */
  await assert.rejects(adminCreateAccount({ email: "seatx@a.test", name: "موظف", password: pw(), role: "operator" }), (e: { status?: number }) => e.status === 402);
  const partner = await adminCreateAccount({ email: "seatp@a.test", name: "مسوّق", password: pw(), role: "partner" });
  /* ترقية المسوّق إلى دور موظف تستهلك مقعداً فتُرفض */
  assert.throws(() => updateAccount(partner.id, { role: "operator" }), (e: { status?: number }) => e.status === 402);
  /* وإعادة تفعيل حسابٍ معلّق (لا يشغل مقعداً) تخضع للحدّ نفسه */
  updateAccount(partner.id, { status: "SUSPENDED" });
  assert.throws(() => updateAccount(partner.id, { status: "ACTIVE", role: "viewer" }), (e: { status?: number }) => e.status === 402);
});
