import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import type { AddressInfo } from "node:net";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nahj-del-"));
process.env.NAHJ_DATABASE_PATH = path.join(directory, "test.sqlite");
process.env.NAHJ_FIREBASE_SYNC = "off";

const { apiRouter, authRouter } = await import("./routes.ts");
const { createAccount, login } = await import("./auth.ts");
const { openDatabase } = await import("./persistence.ts");
const { db, DemoSandbox } = await import("./db.ts");
const { resetDeletionRateLimit } = await import("./accountDeletion.ts");
const { deletionGate } = await import("../src/components/DeleteAccountSection.tsx");
const { renderPrivacyPage } = await import("./marketingPages.ts");

const pw = () => ["Delete", "Check", "2026"].join("-");

async function start() {
  const app = express();
  app.use(express.json());
  /* كما يربط server.ts زائر العرض بصندوقه: الترويسة تحاكي كوكي العرض. */
  app.use((req, _res, next) => {
    const id = req.header("x-test-demo");
    if (id && DemoSandbox.run(id, 60_000, next)) return;
    next();
  });
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

test("طلب الحذف: كلمة مرور خاطئة ترفض، والصحيحة تسجّل وتعلّق وتُخرج وتُدقَّق", async () => {
  resetDeletionRateLimit();
  await createAccount({ email: "own@d.test", name: "المالك", password: pw(), role: "owner" });
  await createAccount({ email: "adm@d.test", name: "مشرف", password: pw(), role: "admin" });
  await createAccount({ email: "emp@d.test", name: "موظف", password: pw(), role: "operator" });
  const { server, base } = await start();
  try {
    const anon = await fetch(`${base}/api/auth/account/deletion-request`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(anon.status, 401, "بلا جلسة");

    const emp = await signIn(base, "emp@d.test");
    assert.equal((await emp("POST", "/auth/account/deletion-request", { password: pw() })).status, 400, "بلا تأكيد");
    const wrong = await emp("POST", "/auth/account/deletion-request", { password: "wrong-password-1", confirm: true });
    assert.equal(wrong.status, 403);
    assert.equal(openDatabase().prepare("SELECT status FROM accounts WHERE email='emp@d.test'").get()!.status, "ACTIVE");

    const ok = await emp("POST", "/auth/account/deletion-request", { password: pw(), confirm: true, reason: "لا أحتاجه" });
    assert.equal(ok.status, 200);
    const body = await ok.json() as { requestId: string; signedOut: boolean };
    assert.ok(body.signedOut);
    assert.equal(openDatabase().prepare("SELECT status FROM accounts WHERE email='emp@d.test'").get()!.status, "SUSPENDED");
    assert.equal(Number(openDatabase().prepare("SELECT COUNT(*) n FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE a.email='emp@d.test'").get()!.n), 0);
    assert.equal((await emp("GET", "/auth/me")).status, 401, "الجلسة انتهت");
    await assert.rejects(login("emp@d.test", pw()), /موقوف/);
    assert.ok(db.auditEvents.some(e => e.action === "ACCOUNT_DELETION_REQUESTED" && e.actorName === "emp@d.test"));

    /* القائمة للمشرف فقط */
    assert.equal((await (await signIn(base, "adm@d.test"))("GET", "/auth/deletion-requests")).status, 200);
    const list = await (await signIn(base, "adm@d.test"))("GET", "/auth/deletion-requests");
    const { requests } = await list.json() as { requests: Array<{ id: string; status: string; email: string }> };
    assert.equal(requests.length, 1);
    assert.equal(requests[0].status, "PENDING");

    /* التنفيذ: يُجهِّل الحساب والتدقيق ولا يمسّ بيانات المؤسسة */
    const skillsBefore = db.skills.length;
    const admin = await signIn(base, "adm@d.test");
    const done = await admin("POST", `/auth/deletion-requests/${body.requestId}/complete`);
    assert.equal(done.status, 200);
    const row = openDatabase().prepare("SELECT email, name, status FROM accounts WHERE id = (SELECT account_id FROM account_deletion_requests WHERE id = ?)").get(body.requestId) as { email: string; name: string; status: string };
    assert.equal(row.status, "DELETED");
    assert.equal(row.name, "حساب محذوف");
    assert.ok(!row.email.includes("emp@d.test"));
    assert.ok(!db.auditEvents.some(e => e.actorName === "emp@d.test" || e.details.includes("emp@d.test")));
    assert.equal(db.skills.length, skillsBefore, "بيانات المؤسسة لم تُمسّ");
    assert.equal((await admin("POST", `/auth/deletion-requests/${body.requestId}/complete`)).status, 409, "لا يُنفَّذ مرتين");
    assert.equal((await (await signIn(base, "own@d.test"))("GET", "/auth/deletion-requests")).status, 200, "المالك يرى القائمة");
  } finally { server.close(); }
});

test("طلب الحذف: غير المشرف لا يرى القائمة، المالك وآخر مشرف يُرفضان، وحدّ المعدّل", async () => {
  resetDeletionRateLimit();
  await createAccount({ email: "mgr@d.test", name: "مديرة", password: pw(), role: "manager" });
  openDatabase().prepare("UPDATE accounts SET status='SUSPENDED' WHERE email='adm@d.test'").run();
  const { server, base } = await start();
  try {
    const mgr = await signIn(base, "mgr@d.test");
    assert.equal((await mgr("GET", "/auth/deletion-requests")).status, 403);
    assert.equal((await mgr("POST", "/auth/deletion-requests/x/complete")).status, 403);

    const owner = await signIn(base, "own@d.test");
    const refused = await owner("POST", "/auth/account/deletion-request", { password: pw(), confirm: true });
    assert.equal(refused.status, 409);
    assert.equal((await refused.json() as { code: string }).code, "OWNER_ACCOUNT");
    assert.equal(openDatabase().prepare("SELECT status FROM accounts WHERE email='own@d.test'").get()!.status, "ACTIVE");

    /* آخر مشرف نشط: المالك وحده يُحتسب، فالمشرف الوحيد عدا المالك ليس "آخر" لكن لو عُلّق المالك لما... نختبر بمشرف جديد وحيد */
    openDatabase().prepare("UPDATE accounts SET role='viewer' WHERE email='own@d.test'").run();
    await createAccount({ email: "solo@d.test", name: "وحيد", password: pw(), role: "admin" });
    const solo = await signIn(base, "solo@d.test");
    const last = await solo("POST", "/auth/account/deletion-request", { password: pw(), confirm: true });
    assert.equal(last.status, 409);
    assert.equal((await last.json() as { code: string }).code, "LAST_ADMIN");

    resetDeletionRateLimit();
    let limited = 0;
    for (let i = 0; i < 7; i++) {
      const r = await mgr("POST", "/auth/account/deletion-request", { password: "wrong-password-1", confirm: true });
      if (r.status === 429) limited++;
    }
    assert.ok(limited >= 2, "الحدّ يعمل");
  } finally { server.close(); }
});

test("الزائر التجريبي لا يحذف شيئاً حقيقياً", async () => {
  const { server, base } = await start();
  try {
    const before = Number(openDatabase().prepare("SELECT COUNT(*) n FROM accounts").get()!.n);
    DemoSandbox.create("demo_test_session", 60_000, undefined, "ar");
    const headers = { "content-type": "application/json", "x-test-demo": "demo_test_session" };
    const res = await fetch(`${base}/api/auth/account/deletion-request`, { method: "POST", headers, body: JSON.stringify({ password: "x", confirm: true }) });
    assert.equal(res.status, 403, "الزائر التجريبي مرفوض صراحةً");
    assert.equal((await res.json() as { code: string }).code, "DEMO_READONLY");
    assert.equal(Number(openDatabase().prepare("SELECT COUNT(*) n FROM accounts").get()!.n), before);
  } finally { server.close(); }
});

test("واجهة الحذف: ظاهرة لكل دور وداخل iOS، وتشرح المنع للمالك والتجريبي", () => {
  assert.deepEqual(deletionGate({ role: "operator" }), { visible: true, blocked: null });
  assert.deepEqual(deletionGate({ role: "viewer" }), { visible: true, blocked: null });
  assert.deepEqual(deletionGate({ role: "admin" }), { visible: true, blocked: null });
  assert.deepEqual(deletionGate({ role: "owner" }), { visible: true, blocked: "owner" });
  assert.deepEqual(deletionGate({ role: "admin", isDemo: true }), { visible: true, blocked: "demo" });
  const source = fs.readFileSync(path.join(import.meta.dirname, "../src/components/DeleteAccountSection.tsx"), "utf8");
  assert.ok(!/isAppleNativeShell|ios-hide|appleShell/.test(source), "لا إخفاء داخل غلاف iOS");
  assert.match(source, /حذف الحساب/);
  assert.match(source, /type="password"/, "يعيد طلب كلمة المرور");
  const accounts = fs.readFileSync(path.join(import.meta.dirname, "../src/components/views/AccountsView.tsx"), "utf8");
  assert.match(accounts, /<DeleteAccountSection/);
});

test("الخصوصية والملاحظات تصف التدفق الفعلي", () => {
  const privacy = renderPrivacyPage();
  assert.match(privacy, /حذف الحساب من داخل التطبيق/);
  assert.match(privacy, /30 يوماً/);
  const notes = fs.readFileSync(path.join(import.meta.dirname, "../apple-release/review/account-deletion.md"), "utf8");
  assert.match(notes, /account_deletion_requests/);
});
