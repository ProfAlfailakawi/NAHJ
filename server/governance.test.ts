import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import type { AddressInfo } from "node:net";

/*
 * سجلّ القرار، ومراجعة الترقية، والإيقاف الطارئ، وخريطة الاعتماد على الأشخاص،
 * ودليل الإجراء الموقَّع — عبر HTTP كما تستعملها الواجهة.
 */
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nahj-governance-"));
process.env.NAHJ_DATABASE_PATH = path.join(directory, "test.sqlite");

const { apiRouter, authRouter } = await import("./routes.ts");
const { createAccount } = await import("./auth.ts");
const { ensureSubscription } = await import("./billing.ts");
const { db } = await import("./db.ts");
const { listNotifications } = await import("./notify.ts");

const pw = () => ["Gov", "Check", "2026"].join("-");

async function start() {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
  app.use("/api", apiRouter);
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
  const headers = { "content-type": "application/json", cookie, "x-csrf-token": csrfToken };
  return {
    post: (url: string, body: unknown = {}) => fetch(`${base}${url}`, { method: "POST", headers, body: JSON.stringify(body) }),
    get: (url: string) => fetch(`${base}${url}`, { headers }),
  };
}

await createAccount({ email: "gm@nahj.test", name: "المديرة العامة", password: pw(), role: "admin" });
ensureSubscription();
const { server, base } = await start();
const admin = await signIn(base, "gm@nahj.test");
test.after(() => server.close());

test("an approval exposes a decision record and a high-risk decision needs a reason", async () => {
  const pending = db.approvalRequests.find(a => a.status === "pending" && (a.riskLevel === "high" || a.riskLevel === "critical"));
  assert.ok(pending, "seed carries a pending high-risk approval");

  const record = (await (await admin.get(`/approvals/${pending.id}/record`)).json()) as { record: any };
  assert.equal(record.record.reasonRequired, true);
  assert.equal(record.record.policy.code, pending.reasonCode);
  assert.ok(Array.isArray(record.record.preview) && record.record.preview.length > 0, "no preview of what will execute");
  assert.ok(record.record.evidence.length > 0, "no evidence");

  const blank = await admin.post(`/approvals/${pending.id}/decide`, { decision: "approved", comments: "  " });
  assert.equal(blank.status, 400);
  assert.equal(((await blank.json()) as { code: string }).code, "REASON_REQUIRED");
  assert.equal(db.approvalRequests.find(a => a.id === pending.id)?.status, "pending", "a rejected request still changed state");

  const ok = await admin.post(`/approvals/${pending.id}/decide`, { decision: "approved", comments: "طابقتُ الرسوم مع اللائحة" });
  assert.equal(ok.status, 200);
  const decided = db.approvalRequests.find(a => a.id === pending.id)!;
  assert.equal(decided.decisionReason, "طابقتُ الرسوم مع اللائحة");
  assert.equal(decided.decisionRecord?.decision, "approved");
  const audit = db.auditEvents.find(e => e.action === "APPROVE_ACTION_EXECUTION" && e.record?.approvalId === pending.id);
  assert.ok(audit, "the decision record is not in the audit trail");
  assert.match(audit.details, /طابقتُ الرسوم/);
});

test("promotion is blocked without evaluation data and without sign-off", async () => {
  const skill = db.skills[0];
  skill.autonomyLevel = 1;
  skill.killSwitchActive = false;
  const noData = skill.id;
  /* لا حالات تدرّب ولا ظلّ لهذه المهارة. */
  db.testCases = db.testCases.filter(t => t.skillId !== noData);
  db.shadowComparisons = db.shadowComparisons.filter(c => (c as any).skillId !== noData && !db.workItems.some(w => w.id === c.workItemId && w.skillId === noData));

  const review = (await (await admin.get(`/skills/${noData}/promotion-review?targetLevel=3`)).json()) as { review: any };
  assert.equal(review.review.blocked, true);
  assert.equal(review.review.stats.passRate, null);

  const blocked = await admin.post(`/skills/${noData}/promote`, { targetLevel: 2, signOff: true });
  assert.equal(blocked.status, 409);
  assert.equal(((await blocked.json()) as { code: string }).code, "PROMOTION_REVIEW_BLOCKED");
  assert.equal(db.skills[0].autonomyLevel, 1);

  /* بيانات تدرّب وظلّ ناجحة. */
  db.testCases.push(
    { id: "tc_g1", name: "حالة", skillId: noData, scenario: "", expectedAction: "", expectedStatus: "pass", resultStatus: "pass" },
    { id: "tc_g2", name: "حالة", skillId: noData, scenario: "", expectedAction: "", expectedStatus: "pass", resultStatus: "pass" },
  );
  db.shadowComparisons.push({ id: "sh_g1", caseTitle: "", timestamp: "", humanAction: "x", humanReason: "", aiAction: "x", aiReason: "", matched: true, driftDetected: false, evaluated: true, skillId: noData } as any);

  const unsigned = await admin.post(`/skills/${noData}/promote`, { targetLevel: 2 });
  assert.equal(unsigned.status, 409, "promoted without owner sign-off");

  const signed = await admin.post(`/skills/${noData}/promote`, { targetLevel: 2, signOff: true, note: "راجعتُ الأرقام" });
  assert.equal(signed.status, 200);
  assert.equal(db.skills[0].autonomyLevel, 2);
  const audit = db.auditEvents.find(e => e.action === "PROMOTE_SKILL_AUTONOMY");
  assert.equal(audit?.record?.review?.signedOffBy, "المديرة العامة");

  /* النزول لا يحتاج مراجعة. */
  const down = await admin.post(`/skills/${noData}/promote`, { targetLevel: 0 });
  assert.equal(down.status, 200);
});

test("emergency pause stops every executing skill, needs a reason, and notifies", async () => {
  db.skills[0].autonomyLevel = 6; db.skills[0].killSwitchActive = false;
  if (db.skills[1]) { db.skills[1].autonomyLevel = 5; db.skills[1].killSwitchActive = true; }

  assert.equal((await admin.post("/autopilot/emergency-pause", { reason: "" })).status, 400);
  const res = await admin.post("/autopilot/emergency-pause", { reason: "خطأ في أسعار اليوم" });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { pause: any };
  assert.equal(body.pause.active, true);
  assert.equal(db.skills[0].killSwitchActive, true);
  assert.ok(!body.pause.skillIds.includes(db.skills[1]?.id), "a skill paused by hand was counted as paused by the emergency");
  assert.ok(listNotifications(50).some(n => n.kind === "autopilot.emergency_pause"), "owner not notified");
  assert.ok(db.auditEvents.some(e => e.action === "EMERGENCY_PAUSE_AUTOPILOT" && e.risk === "critical"));

  const resumed = await admin.post("/autopilot/resume", { reason: "صُحّحت الأسعار" });
  assert.equal(resumed.status, 200);
  assert.equal(db.skills[0].killSwitchActive, false);
  if (db.skills[1]) assert.equal(db.skills[1].killSwitchActive, true, "resume lifted a manual pause");
});

test("coverage lists single-person skills and assigning a backup raises the score", async () => {
  for (const skill of db.skills) { skill.backupOwnerNames = []; skill.isSinglePointOfFailure = true; }
  const before = (await (await admin.get("/people/coverage")).json()) as { coverage: any };
  assert.equal(before.coverage.score, 0);
  assert.equal(before.coverage.singlePoints.length, db.skills.length);

  const target = db.skills[0];
  assert.equal((await admin.post(`/skills/${target.id}/backup`, { name: target.ownerName })).status, 400, "the owner became their own backup");
  const res = await admin.post(`/skills/${target.id}/backup`, { name: "سارة" });
  assert.equal(res.status, 200);
  const after = ((await res.json()) as { coverage: any }).coverage;
  assert.ok(after.score > 0);
  assert.ok(after.history.length >= 1, "no coverage history");
});

test("the procedure manual is signed and the signature verifies until content changes", async () => {
  const skill = db.skills[0];
  const html = await (await admin.get(`/skills/${skill.id}/manual?lang=both&calendar=hijri&digits=arab`)).text();
  assert.match(html, /<!doctype html>/);
  const signature = /HMAC-SHA256\): <code>([0-9a-f]{64})<\/code>/.exec(html)?.[1];
  assert.ok(signature, "the manual carries no signature");

  const verify = (sig: string) => admin.post("/manuals/verify", { skillId: skill.id, version: skill.activeVersion, signature: sig })
    .then(r => r.json() as Promise<{ valid: boolean }>);
  assert.equal((await verify(signature)).valid, true);
  assert.equal((await verify("0".repeat(64))).valid, false);

  const translated = await admin.post(`/skills/${skill.id}/translation`, { steps: [{ id: skill.steps[0]?.id, titleEn: "Verify identity" }] });
  assert.equal(translated.status, 200);
  if (skill.steps[0] && skill.versions.find(v => v.version === skill.activeVersion)?.steps?.length === 0) {
    assert.equal((await verify(signature)).valid, false, "an edited manual still verifies");
  }
});

test("compliance presets are exposed for the current sector", async () => {
  const res = (await (await admin.get("/compliance/presets")).json()) as { all: Record<string, unknown[]> };
  for (const sector of ["clinic", "law", "retail"]) assert.ok(res.all[sector]?.length, `${sector} has no preset`);
});
