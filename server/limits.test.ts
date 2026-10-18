import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import type { AddressInfo } from "node:net";

/* فرض حدود الباقة: تحذير عند 80%، ومنعٌ ودّي عند 100% بلا فقد بيانات، ومالك المنصة يتجاوز، والعدّاد الشهري يُصفَّر. */

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nahj-limits-"));
process.env.NAHJ_DATABASE_PATH = path.join(directory, "test.sqlite");
process.env.NAHJ_FIREBASE_SYNC = "off";

const { apiRouter, authRouter } = await import("./routes.ts");
const { createAccount } = await import("./auth.ts");
const { upsertPlan, startSubscription, getSubscription, usageWindowKey, incrementUsage, addMonths } = await import("./billing.ts");
const { evaluate, noteUsage } = await import("./entitlements.ts");
const { db } = await import("./db.ts");

const pw = () => ["Limit", "Check", "2026"].join("-");

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
const teach = async (call: Awaited<ReturnType<typeof signIn>>, title: string) => {
  const started = await (await call("POST", "/teach/start", { title })).json() as { session: { id: string } };
  await call("POST", "/teach/record-event", { sessionId: started.session.id, action: "فتح الملف", system: "النظام" });
  await call("POST", "/teach/synthesize", { sessionId: started.session.id });
  return call("POST", "/teach/codify", { sessionId: started.session.id, title });
};

test("المهارات: منعٌ ودّي عند الحدّ، والمالك يتجاوز، ولا شيء يُفقد", async () => {
  await createAccount({ email: "own@l.test", name: "المالك", password: pw(), role: "owner" });
  await createAccount({ email: "mgr@l.test", name: "مديرة", password: pw(), role: "manager" });
  upsertPlan({ code: "cap", nameAr: "سقف", nameEn: "Cap", priceMonthly: 1000, priceQuarterly: 3000, priceAnnual: 10000,
    limits: { seats: 50, skills: db.skills.length + 1, workItemsPerMonth: 2, connectors: 99, mcpServers: 1, aiCallsPerMonth: 10, maxAutonomyLevel: 3, auditRetentionDays: 30 } } as never, "test");
  startSubscription({ planCode: "cap", issueInvoice: false }, "test");
  const { server, base } = await start();
  try {
    const manager = await signIn(base, "mgr@l.test");
    assert.equal((await teach(manager, "مهارة أولى")).status, 200, "ضمن الحدّ");
    const before = db.skills.length;
    const blocked = await teach(manager, "مهارة ثانية");
    assert.equal(blocked.status, 402);
    const body = await blocked.json() as { code: string; message: string; metric: string };
    assert.equal(body.code, "PLAN_LIMIT");
    assert.equal(body.metric, "skills");
    assert.match(body.message, /ما أنجزتموه محفوظ/);
    assert.match(body.message, /ترقية/);
    assert.equal(db.skills.length, before, "أُضيفت مهارة رغم المنع");
    assert.ok(db.auditEvents.some(e => e.action === "PLAN_LIMIT_BLOCKED"), "لا أثر للمنع في التدقيق");
    const owner = await signIn(base, "own@l.test");
    assert.equal((await teach(owner, "مهارة المالك")).status, 200, "المالك لم يتجاوز");
  } finally { server.close(); }
});

test("خوادم MCP: الحدّ يمنع التسجيل الزائد", async () => {
  const { server, base } = await start();
  try {
    await createAccount({ email: "adm@l.test", name: "مشرف", password: pw(), role: "admin" });
    const admin = await signIn(base, "adm@l.test");
    assert.equal((await admin("POST", "/mcp/servers", { name: "خادم 1", endpointUrl: "https://a.example.com/sse" })).status, 200);
    assert.ok(db.auditEvents.some(e => e.action === "PLAN_LIMIT_WARNING" && /MCP/.test(e.details)), "لا تحذير 80% بعد التسجيل");
    const second = await admin("POST", "/mcp/servers", { name: "خادم 2", endpointUrl: "https://b.example.com/sse" });
    assert.equal(second.status, 402);
    assert.equal(((await second.json()) as { code: string }).code, "PLAN_LIMIT");
  } finally { server.close(); }
});

test("حالات الشهر ونداءات الذكاء: التحذير عند 80% مرة واحدة، والمنع عند 100%", () => {
  incrementUsage("workItems", 1);
  noteUsage("workItemsPerMonth"); // 1/2 = 50%
  assert.equal(db.auditEvents.filter(e => e.action === "PLAN_LIMIT_WARNING" && /حالات العمل/.test(e.details)).length, 0);
  incrementUsage("workItems", 1); // 2/2
  noteUsage("workItemsPerMonth");
  noteUsage("workItemsPerMonth");
  assert.equal(db.auditEvents.filter(e => e.action === "PLAN_LIMIT_WARNING" && /حالات العمل/.test(e.details)).length, 1, "التحذير تكرّر");
  assert.equal(evaluate("workItemsPerMonth").allowed, false);
  assert.equal(evaluate("aiCallsPerMonth").allowed, true);
});

test("العدّاد الشهري يُصفَّر كل شهر حتى في الدورة السنوية", () => {
  const sub = getSubscription()!;
  const annual = { ...sub, currentPeriodStart: "2026-01-10T00:00:00.000Z", currentPeriodEnd: "2027-01-10T00:00:00.000Z" };
  const jan = usageWindowKey(annual, "2026-01-20T00:00:00.000Z");
  const feb = usageWindowKey(annual, "2026-02-11T00:00:00.000Z");
  const mar = usageWindowKey(annual, addMonths("2026-01-10T00:00:00.000Z", 2));
  assert.notEqual(jan, feb);
  assert.notEqual(feb, mar);
  assert.equal(jan, usageWindowKey(annual, "2026-02-09T00:00:00.000Z"), "نافذة الشهر الأول تغيّرت قبل أوانها");
});
