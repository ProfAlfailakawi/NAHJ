import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";

/*
 * عزل سجلّ MCP بين صندوق العرض والمؤسسة الحقيقية.
 *
 * سجلّ الخوادم وسجلّ التنفيذ كانا حالةً ساكنة في الصنف نفسه، مشتركةً بين كل
 * صناديق /try والمؤسسة الحقيقية. فزائرٌ بلا حساب (هويته في الصندوق «مشرف»)
 * يرى تنفيذات المؤسسة بمعاملاتها (رقم مدني واسم)، ويحذف خوادمها المسجّلة،
 * ويسجّل خوادم تظهر في شاشتها وتُحتسب من حصّة باقتها.
 */

process.env.NAHJ_DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nahj-mcp-iso-")), "test.sqlite");

const { apiRouter, authRouter } = await import("./routes.ts");
const { createAccount } = await import("./auth.ts");
const { ensureSubscription } = await import("./billing.ts");
const { DemoSandbox, DEMO_SESSION_TTL_MS } = await import("./db.ts");

const pw = () => ["Mcp", "Isolation", "2026"].join("-");

/* ربط العرض كما في server.ts: كعكة `nahj_demo` تربط الطلب بصندوقه وحده. */
async function start() {
  const app = express();
  app.use(express.json());
  app.use("/api", (req, _res, next) => {
    const raw = String(req.headers.cookie || "").split(";").map(part => part.trim()).find(part => part.startsWith("nahj_demo="));
    const sessionId = raw ? raw.slice("nahj_demo=".length) : "";
    if (!sessionId.startsWith("demo_") || !DemoSandbox.run(sessionId, DEMO_SESSION_TTL_MS, () => next())) next();
  });
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
  return (method: string, url: string, body?: unknown) => fetch(`${base}${url}`, {
    method,
    headers: { "content-type": "application/json", cookie, "x-csrf-token": csrfToken },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function demoVisitor(base: string) {
  const sessionId = `demo_${randomBytes(16).toString("hex")}`;
  DemoSandbox.create(sessionId);
  return (method: string, url: string, body?: unknown) => fetch(`${base}${url}`, {
    method,
    headers: { "content-type": "application/json", cookie: `nahj_demo=${sessionId}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

type ServerRow = { id: string; endpointUrl: string; mode: string };
type ExecRow = { parameters: Record<string, unknown> };

test("a demo visitor neither sees nor changes the institution's MCP registry and executions", async () => {
  await createAccount({ email: "admin@mcp-iso.test", name: "مشرف المؤسسة", password: pw(), role: "admin" });
  ensureSubscription();
  const { server, base } = await start();
  try {
    const admin = await signIn(base, "admin@mcp-iso.test");
    const visitor = demoVisitor(base);

    /* المؤسسة تسجّل خادمها وتنفّذ أداةً بمعاملاتٍ شخصية. */
    const registered = await admin("POST", "/mcp/servers", { name: "خادم المؤسسة", endpointUrl: "https://institution.example/mcp" });
    assert.equal(registered.status, 200);
    const realServer = ((await registered.json()) as { server: ServerRow }).server;
    const call = await admin("POST", "/mcp/tools/call", { name: "ocr_verify_civil_id", arguments: { civilIdNumber: "299010100001", studentName: "اسم حقيقي" } });
    assert.equal(call.status, 200);

    /* الزائر لا يرى خادم المؤسسة ولا تنفيذاتها. */
    const seen = (await (await visitor("GET", "/mcp/servers")).json()) as { servers: ServerRow[] };
    assert.ok(!seen.servers.some(s => s.id === realServer.id), "the institution's server leaked into a demo sandbox");
    const executions = (await (await visitor("GET", "/mcp/executions")).json()) as { executions: ExecRow[] };
    assert.ok(!executions.executions.some(e => e.parameters?.civilIdNumber === "299010100001"), "the institution's tool parameters leaked into a demo sandbox");

    /* ولا يحذف خادمها. */
    const removal = await visitor("DELETE", `/mcp/servers/${realServer.id}`);
    assert.equal(removal.status, 404, "a demo visitor must not be able to delete the institution's server");
    const adminView = (await (await admin("GET", "/mcp/servers")).json()) as { servers: ServerRow[] };
    assert.ok(adminView.servers.some(s => s.id === realServer.id), "the institution's server must survive a demo visitor");

    /* وما يسجّله الزائر يبقى في صندوقه: لا يظهر للمؤسسة ولا يُحتسب من حصّتها. */
    const demoReg = await visitor("POST", "/mcp/servers", { name: "خادم الزائر", endpointUrl: "https://visitor.example/mcp" });
    assert.equal(demoReg.status, 200, "registering inside the sandbox still works");
    const visitorView = (await (await visitor("GET", "/mcp/servers")).json()) as { servers: ServerRow[] };
    assert.ok(visitorView.servers.some(s => s.endpointUrl === "https://visitor.example/mcp"), "the visitor sees their own server");
    const adminAfter = (await (await admin("GET", "/mcp/servers")).json()) as { servers: ServerRow[] };
    assert.ok(!adminAfter.servers.some(s => s.endpointUrl === "https://visitor.example/mcp"), "a demo registration leaked into the institution");
    assert.equal(adminAfter.servers.filter(s => s.mode === "declared").length, 1, "only the institution's own declared server counts");

    /* صندوقان متجاوران لا يتشاركان أيضاً. */
    const other = demoVisitor(base);
    const otherView = (await (await other("GET", "/mcp/servers")).json()) as { servers: ServerRow[] };
    assert.ok(!otherView.servers.some(s => s.endpointUrl === "https://visitor.example/mcp"), "one sandbox leaked into another");
  } finally {
    server.close();
  }
});
