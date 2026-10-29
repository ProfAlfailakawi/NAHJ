import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

/*
 * POL-FIN-02 على أداة MCP «knet_create_invoice».
 *
 * كان أي نصٍّ غير فارغ في `approvalToken` يتجاوز موافقة المدير للمبالغ فوق
 * 50 د.ك، ومثال الأداة نفسه يشحن رمزاً جاهزاً. صار الرمز معرّف طلب موافقةٍ
 * معتمَد في المخزن نفسه، للمبلغ والطالب نفسيهما، يُستهلك مرة، ويشيخ.
 */

process.env.NAHJ_DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nahj-knet-appr-")), "test.sqlite");

const { db, DemoSandbox, DEMO_SESSION_TTL_MS } = await import("./db.ts");
const { McpEngine } = await import("./engine/mcpEngine.ts");

const STUDENT = "سارة محمد";
let seq = 0;

function addApproval(overrides: Record<string, any> = {}) {
  const id = `appr_knet_test_${++seq}`;
  db.approvalRequests.unshift({
    id,
    workItemId: "wi_test",
    workTitle: "فاتورة رسوم",
    actionName: "issuePaymentInvoice",
    payload: { studentName: STUDENT, amountKwd: 1500 },
    reasonCode: "POL-FIN-02_HIGH_VALUE_THRESHOLD",
    reasonDescription: "فوق 50 د.ك",
    riskLevel: "high",
    requiredRole: "manager",
    requestedAt: "الآن",
    status: "approved",
    decidedBy: "نورة خالد",
    decidedAt: "الآن",
    decisionRecord: { decidedAtIso: new Date().toISOString() },
    ...overrides,
  } as never);
  return id;
}

const invoice = (args: Record<string, unknown>) => McpEngine.executeTool("knet_create_invoice", { studentName: STUDENT, amountKwd: 1500, ...args });
const paused = (execution: Awaited<ReturnType<typeof invoice>>) =>
  execution.requiresApproval === true && execution.result?.status === "PAUSED_PENDING_APPROVAL";

test("the example params no longer ship an approval token", () => {
  const tool = McpEngine.getTools().find((candidate) => candidate.name === "knet_create_invoice")!;
  assert.equal(tool.exampleParams?.approvalToken, undefined);
});

test("an arbitrary approval token no longer bypasses POL-FIN-02", async () => {
  for (const approvalToken of ["APPR-MGR-NOURA-VALIDATED", "anything", "appr_does_not_exist"]) {
    const execution = await invoice({ approvalToken });
    assert.ok(paused(execution), `token ${approvalToken} bypassed the manager approval`);
    assert.equal(execution.result.paymentUrl, undefined);
  }
});

test("amounts at or under the threshold still work without a token", async () => {
  const execution = await invoice({ amountKwd: 30 });
  assert.equal(execution.status, "success");
  assert.equal(execution.requiresApproval, false);
  assert.ok(execution.result.paymentUrl, "a small invoice was not issued");
});

test("an approved request for the same amount and student issues the invoice once", async () => {
  const id = addApproval();
  const first = await invoice({ approvalToken: id });
  assert.equal(first.status, "success");
  assert.equal(first.requiresApproval, false);
  assert.ok(first.result.paymentUrl, "the approved invoice was not issued");
  assert.equal(first.result.approvalId, id);
  assert.ok(db.approvalRequests.find((a) => a.id === id)!.consumedAt, "the approval was not consumed");

  const replay = await invoice({ approvalToken: id });
  assert.ok(paused(replay), "the same approval was used twice");
});

test("tokens that do not match a fresh approved request are refused", async () => {
  const cases: Array<[string, string, Record<string, unknown>]> = [
    ["pending", addApproval({ status: "pending", decisionRecord: undefined }), {}],
    ["rejected", addApproval({ status: "rejected" }), {}],
    ["other amount", addApproval(), { amountKwd: 2500 }],
    ["other student", addApproval(), { studentName: "شخص آخر" }],
    ["other action", addApproval({ actionName: "issueRefund" }), {}],
    ["expired", addApproval({ decisionRecord: { decidedAtIso: new Date(Date.now() - McpEngine.INVOICE_APPROVAL_TTL_MS - 60_000).toISOString() } }), {}],
    ["no decision time", addApproval({ decisionRecord: undefined }), {}],
  ];
  for (const [label, id, extra] of cases) {
    const execution = await invoice({ approvalToken: id, ...extra });
    assert.ok(paused(execution), `${label}: the invoice was issued`);
    assert.ok(execution.result.approvalTokenRejected, `${label}: no reason given`);
    assert.equal(db.approvalRequests.find((a) => a.id === id)!.consumedAt, undefined, `${label}: approval consumed though refused`);
  }
});

test("an approval from the institution's store is not usable inside a demo sandbox", async () => {
  const id = addApproval();
  const sessionId = `demo_${randomBytes(12).toString("hex")}`;
  DemoSandbox.create(sessionId);
  let execution: Awaited<ReturnType<typeof invoice>> | undefined;
  await new Promise<void>((resolve, reject) => {
    const ran = DemoSandbox.run(sessionId, DEMO_SESSION_TTL_MS, () => {
      invoice({ approvalToken: id }).then((value) => { execution = value; resolve(); }, reject);
    });
    if (!ran) reject(new Error("sandbox did not run"));
  });
  assert.ok(execution && paused(execution), "a sandbox visitor used the institution's approval");
  assert.equal(db.approvalRequests.find((a) => a.id === id)!.consumedAt, undefined);
});
