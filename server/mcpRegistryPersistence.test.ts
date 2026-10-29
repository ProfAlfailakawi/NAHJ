import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

/*
 * خوادم MCP التي تسجّلها المؤسسة تبقى بعد إعادة التشغيل.
 *
 * كان السجلّ في الذاكرة وحدها: يُبذر من التعريفات عند أول قراءة ويضيع مع كل
 * إعادة تشغيل أو نشر. كل عمليةٍ هنا عمليةٌ مستقلة على ملف SQLite واحد — كما
 * يحدث عند إعادة تشغيل الخادم فعلاً.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const dbUrl = pathToFileURL(path.join(here, "db.ts")).href;
const mcpUrl = pathToFileURL(path.join(here, "engine", "mcpEngine.ts")).href;
const databasePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nahj-mcp-persist-")), "test.sqlite");

/** يشغّل «إقلاعاً» جديداً للخادم: عملية جديدة تقرأ الملف نفسه، تنفّذ `body`، وتحفظ ثم تخرج. */
function boot(body: string): any {
  const script = `
    const { db, persistence, DemoSandbox, DEMO_SESSION_TTL_MS } = await import(${JSON.stringify(dbUrl)});
    const { McpEngine } = await import(${JSON.stringify(mcpUrl)});
    const out = await (async () => { ${body} })();
    persistence.flush();
    process.stdout.write("\\n@@" + JSON.stringify(out ?? null));
    process.exit(0);
  `;
  const stdout = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    env: { ...process.env, NAHJ_DATABASE_PATH: databasePath, NAHJ_FIREBASE_SYNC: "off" },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return JSON.parse(stdout.slice(stdout.lastIndexOf("@@") + 2));
}

const declaredEndpoints = (servers: Array<{ endpointUrl: string; mode: string }>) =>
  servers.filter((server) => server.mode === "declared").map((server) => server.endpointUrl).sort();

test("a registered MCP server survives a restart, a removed one stays removed, demo sandboxes stay ephemeral", { timeout: 240_000 }, () => {
  const first = boot(`
    const a = McpEngine.registerServer({ name: "خادم المالية", endpointUrl: "https://mcp.finance.example/sse", transport: "sse" });
    const b = McpEngine.registerServer({ name: "خادم الموارد", endpointUrl: "https://mcp.hr.example/sse", transport: "http" });
    /* زائر العرض يسجّل في صندوقه — لا يُحفظ ولا يظهر للمؤسسة. */
    const sessionId = "demo_" + "a".repeat(32);
    DemoSandbox.create(sessionId);
    DemoSandbox.run(sessionId, DEMO_SESSION_TTL_MS, () => {
      McpEngine.registerServer({ name: "خادم الزائر", endpointUrl: "https://visitor.example/sse", transport: "sse" });
    });
    return { a: a.id, b: b.id };
  `);

  const second = boot(`
    const servers = structuredClone(McpEngine.getServers());
    const sessionId = "demo_" + "b".repeat(32);
    DemoSandbox.create(sessionId);
    let sandbox = [];
    DemoSandbox.run(sessionId, DEMO_SESSION_TTL_MS, () => { sandbox = structuredClone(McpEngine.getServers()); });
    const removed = McpEngine.removeServer(servers.find((s) => s.endpointUrl === "https://mcp.hr.example/sse").id);
    return { servers, sandbox, removed, builtIn: servers.filter((s) => s.mode !== "declared").length };
  `);
  assert.deepEqual(
    declaredEndpoints(second.servers),
    ["https://mcp.finance.example/sse", "https://mcp.hr.example/sse"],
    "registered servers vanished on restart (or the visitor's server leaked in)",
  );
  assert.ok(second.servers.some((s: { id: string }) => s.id === first.a), "the server id changed across the restart");
  assert.ok(second.builtIn > 0, "built-in servers are missing");
  assert.equal(second.servers.length, new Set(second.servers.map((s: { id: string }) => s.id)).size, "duplicate server ids after restart");
  assert.deepEqual(declaredEndpoints(second.sandbox), [], "a demo sandbox sees the institution's registered servers");
  assert.equal(second.removed, true);

  const third = boot(`return { servers: McpEngine.getServers() };`);
  assert.deepEqual(declaredEndpoints(third.servers), ["https://mcp.finance.example/sse"], "a removed server came back after restart");
});
