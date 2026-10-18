import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import type { AddressInfo } from "node:net";

/* المحادثة التجريبية وجلسات التعليم لكل موظف — لا تُشارَك بين حسابات المؤسسة. */

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nahj-peruser-"));
process.env.NAHJ_DATABASE_PATH = path.join(directory, "test.sqlite");
process.env.NAHJ_FIREBASE_SYNC = "off";

const { apiRouter, authRouter } = await import("./routes.ts");
const { createAccount } = await import("./auth.ts");
const { ensureSubscription } = await import("./billing.ts");
const { db } = await import("./db.ts");

const pw = () => ["Per", "User", "2026"].join("-");
async function start() {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
  app.use("/api", apiRouter);
  const server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}
async function signIn(base: string, email: string) {
  const res = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: pw() }) });
  const cookie = (res.headers.getSetCookie?.() || []).map(c => c.split(";")[0]).join("; ");
  const { csrfToken } = await res.json() as { csrfToken: string };
  return (method: string, url: string, body: unknown = {}) => fetch(`${base}/api${url}`, {
    method, headers: { "content-type": "application/json", cookie, "x-csrf-token": csrfToken }, body: method === "GET" ? undefined : JSON.stringify(body),
  });
}
type Sim = { state: { messages: Array<{ text: string }> } };

test("محادثة التجربة معزولة لكل موظف", async () => {
  await createAccount({ email: "a@p.test", name: "موظفة أ", password: pw(), role: "operator" });
  await createAccount({ email: "b@p.test", name: "موظف ب", password: pw(), role: "operator" });
  ensureSubscription();
  const { server, base } = await start();
  try {
    const a = await signIn(base, "a@p.test");
    const b = await signIn(base, "b@p.test");
    await a("POST", "/simulator/message", { text: "رسالة موظفة أ الأولى" });
    await a("POST", "/simulator/message", { text: "رسالة موظفة أ الثانية" });
    const aState = await (await a("GET", "/simulator/state")).json() as Sim;
    const bState = await (await b("GET", "/simulator/state")).json() as Sim;
    assert.ok(aState.state.messages.some(m => m.text.includes("أ الأولى")));
    assert.ok(!bState.state.messages.some(m => m.text.includes("موظفة أ")), "رسائل أ ظهرت عند ب");
    assert.equal(bState.state.messages.length, 1, "محادثة ب ليست بكرًا");
    await b("POST", "/simulator/reset");
    const aAfter = await (await a("GET", "/simulator/state")).json() as Sim;
    assert.ok(aAfter.state.messages.some(m => m.text.includes("أ الثانية")), "إعادة ب صفّرت محادثة أ");
    assert.ok(Object.keys(db.simulatorByUser).length >= 2);
  } finally { server.close(); }
});

test("جلسات التعليم لكل موظف، والقديمة بلا صاحب تبقى مشتركة", async () => {
  db.learningSessions.push({ id: "sess_legacy", title: "قديمة", startedAt: "الآن", status: "recording", teacherName: "x", events: [], discoveredSteps: [], discoveredRules: [], clarificationQuestions: [] } as never);
  const { server, base } = await start();
  try {
    const a = await signIn(base, "a@p.test");
    const b = await signIn(base, "b@p.test");
    const started = await (await a("POST", "/teach/start", { title: "جلسة أ" })).json() as { session: { id: string } };
    assert.equal((await a("POST", "/teach/record-event", { sessionId: started.session.id, action: "خطوة" })).status, 200);
    assert.equal((await b("POST", "/teach/record-event", { sessionId: started.session.id, action: "تسلّل" })).status, 404, "ب كتب في جلسة أ");
    assert.equal((await b("POST", "/teach/synthesize", { sessionId: started.session.id })).status, 404);
    /* بلا معرّف: ب يرى القديمة المشتركة لا جلسة أ */
    const fallback = await b("POST", "/teach/record-event", { action: "على المشتركة القديمة" });
    assert.equal(fallback.status, 200);
    assert.equal(db.learningSessions.find(s => s.id === "sess_legacy")!.events.length, 1);
    assert.equal(db.learningSessions.find(s => s.id === started.session.id)!.events.length, 1, "اختلطت أحداث الجلستين");
  } finally { server.close(); }
});

test("اعتماد طلب موظف لا يُكمل محادثة موظفٍ آخر", async () => {
  const base0 = { workItemId: "w", workTitle: "ط", actionName: "createApplicationRecord", payload: { tuitionFee: 1500 }, reasonCode: "POL-FIN-02", reasonDescription: "x", riskLevel: "low" as const, requiredRole: "manager" as const, requestedAt: "الآن", status: "pending" as const };
  db.approvalRequests.unshift({ ...base0, id: "appr_e1" } as never, { ...base0, id: "appr_e2" } as never);
  await createAccount({ email: "m@p.test", name: "مديرة", password: pw(), role: "manager" });
  const { server, base } = await start();
  try {
    const a = await signIn(base, "a@p.test");
    const b = await signIn(base, "b@p.test");
    await a("POST", "/simulator/reset"); await b("POST", "/simulator/reset");
    await a("POST", "/simulator/upload-doc");
    await b("POST", "/simulator/upload-doc");
    const owners = db.approvalRequests.filter(r => r.id === "appr_e1" || r.id === "appr_e2").map(r => r.requestedBy);
    assert.equal(new Set(owners).size, 2, "نُسب الطلبان لصاحبٍ واحد");
    const manager = await signIn(base, "m@p.test");
    const mine = db.approvalRequests.find(r => r.id === "appr_e1")!;
    const res = await manager("POST", `/approvals/${mine.id}/decide`, { decision: "approved" });
    assert.equal(res.status, 200);
    const states = Object.entries(db.simulatorByUser).map(([id, state]) => ({ id, step: state.step }));
    assert.equal(states.filter(s => s.step === "completed").length, 1, "اكتملت أكثر من محادثة");
    assert.equal(db.simulatorOf(mine.requestedBy)!.step, "completed");
  } finally { server.close(); }
});
