import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import type { AddressInfo } from "node:net";

/*
 * حراسة انحدار على مستوى HTTP: الأفعال التي تغيّر التشغيل (ترقية مهارة، مفتاح
 * الإيقاف، اعتماد طلب، استدعاء أداة) لا يملكها حسابُ مشاهدة، والطلب لا يُحسم مرتين.
 */

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nahj-guards-"));
process.env.NAHJ_DATABASE_PATH = path.join(directory, "test.sqlite");

const { apiRouter, authRouter } = await import("./routes.ts");
const { createAccount } = await import("./auth.ts");
const { ensureSubscription } = await import("./billing.ts");
const { db } = await import("./db.ts");

const pw = () => ["Guard", "Check", "2026"].join("-");

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
  return (url: string, body: unknown = {}) => fetch(`${base}${url}`, {
    method: "POST", headers: { "content-type": "application/json", cookie, "x-csrf-token": csrfToken }, body: JSON.stringify(body),
  });
}

test("a viewer cannot change operations; a manager decides an approval once", async () => {
  await createAccount({ email: "viewer@nahj.test", name: "مشاهد", password: pw(), role: "viewer" });
  await createAccount({ email: "manager@nahj.test", name: "مديرة القبول", password: pw(), role: "manager" });
  ensureSubscription();
  const { server, base } = await start();
  try {
    const viewer = await signIn(base, "viewer@nahj.test");
    const skillId = db.skills[0].id;
    for (const url of [`/skills/${skillId}/killswitch`, `/skills/${skillId}/promote`, "/mcp/tools/call", "/approvals/appr_01/decide"]) {
      assert.equal((await viewer(url, { decision: "approved", name: "sis_check_seats", targetLevel: 1 })).status, 403, url);
    }

    const manager = await signIn(base, "manager@nahj.test");
    const pending = db.approvalRequests.find(a => a.status === "pending");
    assert.ok(pending, "seed carries a pending approval");
    const first = await manager(`/approvals/${pending.id}/decide`, { decision: "approved", comments: "راجعتُ الملف والرسوم" });
    assert.equal(first.status, 200);
    assert.equal(db.approvalRequests.find(a => a.id === pending.id)?.decidedBy, "مديرة القبول", "recorded under the signed-in account");
    assert.equal((await manager(`/approvals/${pending.id}/decide`, { decision: "approved", comments: "راجعتُ الملف والرسوم" })).status, 409);

    const unknown = await manager("/mcp/tools/call", { name: "no_such_tool" });
    assert.equal(((await unknown.json()) as { success: boolean }).success, false, "an unknown tool never reports success");
  } finally {
    server.close();
  }
});
