import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import express from "express";
import type { AddressInfo } from "node:net";

/*
 * حراسة على طريق الإعدادات إلى الخادم الحيّ، وعلى نشر العملاء.
 *
 * كان الخادم يُشغَّل بمتغيّرين فقط، فلا طريق لمفتاح دفعٍ ولا بريدٍ إليه — أي أن
 * ربط الدفع مستحيلٌ مهما ضُبط. وما يُمسك هنا: أن ملف الإعدادات يُقرأ، وأن أداة
 * تحريره تقبل ما يقرؤه الخادم فعلاً وترفض الأخطاء الإملائية، وأن نشر العميل
 * يُطفئ التسويق.
 */

const SCRIPT = path.resolve("scripts/server-env.sh");
const run = (file: string, ...args: string[]) =>
  spawnSync("bash", [SCRIPT, "--file", file, ...args], { encoding: "utf8" });

test("أداة الإعدادات: تضبط وتستبدل وتحذف، وتقنّع الأسرار، وتحمي الملف", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nahj-env-")), "nahj.env");
  assert.equal(run(file, "set", "NAHJ_CONTACT_EMAIL=a@b.co", 'NAHJ_LEGAL_NAME=شركة "نهج" & شركاه', "NAHJ_PAYMENT_API_KEY=sk_test_1234567890").status, 0);
  assert.equal(run(file, "set", "NAHJ_CONTACT_EMAIL=new@b.co").status, 0);
  const content = fs.readFileSync(file, "utf8");
  assert.match(content, /^NAHJ_CONTACT_EMAIL=new@b\.co$/m, "القيمة تُستبدل لا تتكرّر");
  assert.equal(content.match(/NAHJ_CONTACT_EMAIL=/g)?.length, 1);
  assert.match(content, /^NAHJ_LEGAL_NAME=شركة "نهج" & شركاه$/m, "الاقتباس والرموز تصل كما هي");
  assert.equal((fs.statSync(file).mode & 0o777).toString(8), "600", "ملف الأسرار لصاحبه وحده");

  const listed = run(file, "list").stdout;
  assert.ok(!listed.includes("sk_test_1234567890"), "السرّ ظهر كاملاً في القائمة");
  assert.match(listed, /sk_t…/);

  assert.equal(run(file, "unset", "NAHJ_LEGAL_NAME").status, 0);
  assert.ok(!fs.readFileSync(file, "utf8").includes("NAHJ_LEGAL_NAME"));
});

test("أداة الإعدادات ترفض الخطأ الإملائي وما يفصل الخادم عن بياناته", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nahj-env-")), "nahj.env");
  for (const pair of ["NAHJ_PAYMENT_APIKEY=x", "NODE_ENV=development", "NAHJ_DATABASE_PATH=/tmp/x", "PORT=80", "novalue"]) {
    const result = run(file, "set", pair);
    assert.notEqual(result.status, 0, `قُبل «${pair}»`);
  }
  assert.notEqual(run(file, "set", "NAHJ_MAIL_FROM=a\nNAHJ_ADMIN_PASSWORD=x").status, 0, "سطرٌ جديد يحقن إعداداً ثانياً");
  assert.equal(fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "", "", "رفضٌ كتب شيئاً");
});

test("كل إعدادٍ يقرؤه الخادم تقبله أداة الإعدادات — إلا ما يفصله عن بياناته", () => {
  const source = [
    "server.ts",
    ...fs.readdirSync("server").filter(name => name.endsWith(".ts") && !name.endsWith(".test.ts")).map(name => `server/${name}`),
    ...fs.readdirSync("server/engine").filter(name => name.endsWith(".ts")).map(name => `server/engine/${name}`),
  ].map(file => fs.readFileSync(file, "utf8")).join("\n");
  const read = new Set([...source.matchAll(/process\.env\.([A-Z_]+)|env\("([A-Z_]+)"\)/g)].map(match => match[1] || match[2]));
  const script = fs.readFileSync(SCRIPT, "utf8");
  const allowed = new Set((/ALLOWED_KEYS=\(([\s\S]*?)\)/.exec(script)?.[1] || "").split(/\s+/).filter(Boolean));
  const excluded = new Set(["NODE_ENV", "PORT", "NAHJ_DATABASE_PATH", "NAHJ_DATA_DIR"]);
  for (const key of read) {
    if (excluded.has(key)) assert.ok(!allowed.has(key), `«${key}» يجب ألا يُضبط من الأداة`);
    else assert.ok(allowed.has(key), `الخادم يقرأ «${key}» والأداة لا تقبله — لا طريق له إلى الخادم`);
  }
});

test("النشر يُمرّر ملف الإعدادات والعنوان العلني، ويُطفئ التسويق للعميل", () => {
  const deploy = fs.readFileSync("scripts/deploy-vm.sh", "utf8");
  assert.match(deploy, /--env-file "\$ENV_FILE"/);
  assert.match(deploy, /NAHJ_PUBLIC_URL=https:\/\/\$\{DOMAIN\}/);
  assert.match(deploy, /NAHJ_MARKETING=off/);
  assert.equal(spawnSync("bash", ["-n", "scripts/deploy-vm.sh"]).status, 0);
  assert.equal(spawnSync("bash", ["-n", SCRIPT]).status, 0);

  const ci = fs.readFileSync(".github/workflows/ci.yml", "utf8");
  assert.match(ci, /pull_request/, "الفحوص لا تعمل على طلبات الدمج");
  assert.match(ci, /npm test/);
  assert.match(ci, /npm run typecheck/);

  const docker = fs.readFileSync("Dockerfile", "utf8");
  assert.match(docker, /scripts\/verify-env\.mjs/, "الفاحص لا يصل إلى الحاوية");
});

test("نشر العميل (NAHJ_MARKETING=off): الجذر للتطبيق، ولا طلبات عرض ولا فهرسة", async () => {
  process.env.NAHJ_DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nahj-mkt-")), "t.sqlite");
  const { publicRouter } = await import("./publicPages.ts");
  const app = express();
  app.use(express.json());
  app.use(publicRouter);
  app.get("/", (_req, res) => { res.send("SPA"); });
  const server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    assert.match(await (await fetch(`${base}/`)).text(), /lead-form/, "نشرك يعرض الصفحة التسويقية");
    process.env.NAHJ_MARKETING = "off";
    assert.equal(await (await fetch(`${base}/`)).text(), "SPA", "نشر العميل يفتح التطبيق مباشرة");
    assert.deepEqual(await (await fetch(`${base}/api/public/site`)).json(), { marketing: false });
    assert.match(await (await fetch(`${base}/robots.txt`)).text(), /Disallow: \/\n/);
    const lead = await fetch(`${base}/api/public/leads`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "س", organization: "م", contact: "a@b.co" }),
    });
    assert.equal(lead.status, 404);
  } finally {
    delete process.env.NAHJ_MARKETING;
    server.close();
  }
});
