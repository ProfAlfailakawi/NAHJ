import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import type { AddressInfo } from "node:net";

/*
 * حراسة انحدار لما كشفته مراجعة 2026-10-28 على مستوى HTTP:
 * كل اختبارٍ هنا كان يفشل على الشيفرة قبل إصلاحه.
 */

process.env.NAHJ_DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nahj-review-")), "test.sqlite");

const { apiRouter, authRouter } = await import("./routes.ts");
const { createAccount } = await import("./auth.ts");
const { ensureSubscription } = await import("./billing.ts");
const { db } = await import("./db.ts");

const pw = () => ["Review", "Check", "2026"].join("-");

async function start() {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
  app.use("/api", apiRouter);
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: String(err?.message || err) });
  });
  const server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api` };
}

async function signIn(base: string, email: string) {
  const res = await fetch(`${base}/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: pw() }),
  });
  assert.equal(res.status, 200);
  const cookie = (res.headers.getSetCookie?.() || []).map(c => c.split(";")[0]).join("; ");
  const { csrfToken } = await res.json() as { csrfToken: string };
  return (method: string, url: string, body?: unknown) => fetch(`${base}${url}`, {
    method, headers: { "content-type": "application/json", cookie, "x-csrf-token": csrfToken },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

await createAccount({ email: "admin@review.test", name: "مشرفة المراجعة", password: pw(), role: "admin" });
await createAccount({ email: "manager@review.test", name: "مديرة القبول", password: pw(), role: "manager" });
ensureSubscription();
/* باقة رحبة: هذه الاختبارات ليست عن حدود الباقة (انظر limits.test.ts) فلا تصطدم بسقف التجربة. */
{
  const { upsertPlan, startSubscription } = await import("./billing.ts");
  upsertPlan({ code: "roomy", nameAr: "رحبة", nameEn: "Roomy", priceMonthly: 1000, priceQuarterly: 3000, priceAnnual: 10000,
    limits: { seats: 500, skills: 500, workItemsPerMonth: 100000, connectors: 100, mcpServers: 100, aiCallsPerMonth: 100000, maxAutonomyLevel: 6, auditRetentionDays: 365 } } as never, "test");
  startSubscription({ planCode: "roomy", issueInvoice: false }, "test");
}

test("approval decisions: the mandatory reason must be text, and an education rejection lands on the case and the chat", async () => {
  const { server, base } = await start();
  try {
    const manager = await signIn(base, "manager@review.test");
    /* المحادثة التعليمية حتى بوابة القرار: تُنسب إليها الموافقة المنتظرة. */
    for (const text of ["أريد تسجيل ابني", "عمره خمس سنوات", "يوسف"]) assert.equal((await manager("POST", "/simulator/message", { text })).status, 200);
    const upload = await manager("POST", "/simulator/upload-doc", {});
    const { state } = await upload.json() as { state: { approvalId?: string; approvalStatus?: string } };
    assert.equal(state.approvalStatus, "pending");
    const approval = db.approvalRequests.find(a => a.id === state.approvalId)!;
    assert.ok(approval, "the chat claimed the pending approval");
    assert.equal(approval.riskLevel, "high", "a reason is mandatory for this request");

    /* كائنٌ مكان السبب لا يجتاز شرط السبب الإلزامي («[object Object]» ليس سبباً). */
    const objectReason = await manager("POST", `/approvals/${approval.id}/decide`, { decision: "rejected", comments: { note: "anything" } });
    assert.equal(objectReason.status, 400);
    assert.equal((await objectReason.json() as { code: string }).code, "REASON_REQUIRED");
    assert.equal(approval.status, "pending", "nothing was decided");

    /* رفضٌ بسببٍ مكتوب يُكتب على الحالة والمحادثة، والسبب مقصوصٌ إلى حدّه. */
    const longReason = `المقعد غير متاح بعد مراجعة الشعب. ${"ت".repeat(2000)}`;
    const rejected = await manager("POST", `/approvals/${approval.id}/decide`, { decision: "rejected", comments: longReason });
    assert.equal(rejected.status, 200);
    const workItem = db.workItems.find(w => w.id === approval.workItemId)!;
    assert.equal(workItem.state, "escalated", "a rejected case no longer reads «waiting for approval»");
    assert.equal(workItem.assignedMode, "human_takeover", "the case returns to staff");
    assert.equal(workItem.timeline[0].badge, "Rejected");
    assert.equal(typeof workItem.timeline[0].details, "string");
    assert.ok(String(workItem.timeline[0].details).length <= 1000, "the timeline keeps the clipped reason, not the raw body");

    const sim = await (await manager("GET", "/simulator/state")).json() as { state: { approvalStatus?: string; requiresManagerApproval?: boolean } };
    assert.equal(sim.state.approvalStatus, "rejected", "the chat stops offering a gate for a decided request");
    assert.equal(sim.state.requiresManagerApproval, false);
  } finally {
    server.close();
  }
});

test("ledger export: an inherited object key is not a ledger (no empty 200, no junk audit row)", async () => {
  const { server, base } = await start();
  try {
    const admin = await signIn(base, "admin@review.test");
    const before = db.auditEvents.length;
    for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      const res = await admin("GET", `/export/${name}.csv`);
      assert.equal(res.status, 404, `${name}.csv must be unknown`);
    }
    assert.equal(db.auditEvents.length, before, "no audit row for a ledger that does not exist");
    /* والدفاتر الحقيقية تبقى كما هي. */
    const skills = await admin("GET", "/export/skills.csv");
    assert.equal(skills.status, 200);
    assert.match(skills.headers.get("content-type") || "", /text\/csv/);
  } finally {
    server.close();
  }
});

test("a cookie with broken percent-encoding is treated as absent, not as a 500", async () => {
  const { server, base } = await start();
  try {
    const broken = { cookie: "nahj_session=%E0%A4%A; nahj_csrf=%" };
    const me = await fetch(`${base}/auth/me`, { headers: broken });
    assert.equal(me.status, 401, "an unreadable session cookie is no session");
    /* والخروج يمحوها — كان يُردّ 500 فلا يبقى للمستخدم مخرج. */
    const out = await fetch(`${base}/auth/logout`, { method: "POST", headers: broken });
    assert.equal(out.status, 204);
    assert.ok((out.headers.getSetCookie?.() || []).some(c => c.startsWith("nahj_session=") && /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c)), "logout clears the cookie");
  } finally {
    server.close();
  }
});

test("while the emergency pause is active no skill can be promoted into execution (L5+); lowering stays open", async () => {
  const { server, base } = await start();
  try {
    const admin = await signIn(base, "admin@review.test");
    const [running, candidate] = [db.skills[0], db.skills[1]];
    running.autonomyLevel = 6; running.killSwitchActive = false;
    candidate.autonomyLevel = 4; candidate.killSwitchActive = false; candidate.reliabilityScore = 95;
    /* دليلٌ كامل للمرشّحة: لولا الإيقاف لصعدت. */
    db.testCases.push({ id: "tc_pause_1", name: "حالة", skillId: candidate.id, scenario: "", expectedAction: "", expectedStatus: "pass", resultStatus: "pass" } as never);
    db.shadowComparisons.push({ id: "sh_pause_1", caseTitle: "", timestamp: "", humanAction: "x", humanReason: "", aiAction: "x", aiReason: "", matched: true, driftDetected: false, evaluated: true, skillId: candidate.id } as never);

    assert.equal((await admin("POST", "/autopilot/emergency-pause", { reason: "مراجعة أمنية" })).status, 200);
    assert.equal(running.killSwitchActive, true);

    const blocked = await admin("POST", `/skills/${candidate.id}/promote`, { targetLevel: 5, signOff: true });
    assert.equal(blocked.status, 409, "a new executor slipped past the emergency pause");
    assert.equal((await blocked.json() as { code: string }).code, "EMERGENCY_PAUSE_ACTIVE");
    assert.equal(candidate.autonomyLevel, 4);

    /* النزول إجراء سلامة: لا يمنعه الإيقاف. */
    assert.equal((await admin("POST", `/skills/${running.id}/promote`, { targetLevel: 2 })).status, 200);

    /* بعد الاستئناف تعود الترقية بمراجعتها المعتادة. */
    assert.equal((await admin("POST", "/autopilot/resume", { reason: "انتهت المراجعة" })).status, 200);
    assert.equal((await admin("POST", `/skills/${candidate.id}/promote`, { targetLevel: 5, signOff: true })).status, 200);
    assert.equal(candidate.autonomyLevel, 5);
  } finally {
    server.close();
  }
});
