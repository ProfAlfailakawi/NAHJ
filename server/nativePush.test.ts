import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { EventEmitter } from "node:events";
import express from "express";
import type { AddressInfo } from "node:net";

/*
 * تنبيهات iOS (APNs) بعميل HTTP/2 محاكى — لا اتصال بـ Apple في الاختبار.
 *
 *   ١. بلا مفتاح في البيئة: لا اتصال ولا خطأ.
 *   ٢. التوكن الذي ترفضه Apple (410 / BadDeviceToken / Unregistered) يُحذف.
 *   ٣. كل إشعارٍ شخصيّ في الطابور يصل إلى أجهزة صاحبه، والرابط يفتح وجهته.
 *   ٤. طلب الاعتماد يصل إلى من يملك حسمه.
 *   ٥. التسجيل يحتاج دخولاً ويرفض التوكن غير الصالح.
 */

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nahj-push-"));
process.env.NAHJ_DATABASE_PATH = path.join(directory, "push.sqlite");
for (const name of ["APNS_KEY_P8", "APNS_KEY_ID", "APNS_TEAM_ID", "APNS_TOPIC", "NAHJ_MAIL_PROVIDER"]) delete process.env[name];

const { apiRouter, authRouter } = await import("./routes.ts");
const { createAccount } = await import("./auth.ts");
const { ensureSubscription } = await import("./billing.ts");
const { enqueue } = await import("./notify.ts");
const { createApnsSender, apnsPayload } = await import("./apnsPush.ts");
const {
  devicesFor, pushApprovalRequested, pushToAccounts, saveDevice, setApnsSender, urlForKind,
} = await import("./nativePush.ts");

const pw = () => ["Push", "Check", "2026"].join("-");
const TOKEN_A = "a".repeat(64);
const TOKEN_B = "b".repeat(64);

type Sent = { headers: Record<string, string>; body: string };

/** عميل HTTP/2 محاكى: يردّ لكل توكن بما في الجدول (الافتراضي 200). */
function fakeApns(replies: Record<string, { status: number; reason?: string }> = {}) {
  const sent: Sent[] = [];
  const connect = () => {
    const client = new EventEmitter() as EventEmitter & { request: Function; close: Function };
    client.close = () => undefined;
    client.request = (headers: Record<string, string>) => {
      const request = new EventEmitter() as EventEmitter & { end: Function; setEncoding: Function };
      request.setEncoding = () => undefined;
      request.end = (body: string) => {
        sent.push({ headers, body });
        const token = String(headers[":path"]).split("/").pop() || "";
        const reply = replies[token] || { status: 200 };
        setImmediate(() => {
          request.emit("response", { ":status": reply.status });
          if (reply.reason) request.emit("data", JSON.stringify({ reason: reply.reason }));
          request.emit("end");
        });
      };
      return request;
    };
    return client;
  };
  return { sent, connect };
}

const key = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const apnsEnv = { APNS_KEY_P8: key.replace(/\n/g, "\\n"), APNS_KEY_ID: "KEYID12345", APNS_TEAM_ID: "TEAMID1234", APNS_TOPIC: "com.dralfailakawi.nahj" };

const settle = () => new Promise(resolve => setTimeout(resolve, 30));

test("without APNs env nothing is sent and nothing fails", async () => {
  const account = await createAccount({ email: "quiet@nahj.test", name: "هادئ", password: pw(), role: "operator" });
  saveDevice(account.id, TOKEN_A);
  const fake = fakeApns();
  setApnsSender(createApnsSender({ env: () => ({}), connect: fake.connect as never }));
  assert.deepEqual(await pushToAccounts([account.id], { title: "x" }), { sent: 0, dropped: 0 });
  assert.equal(fake.sent.length, 0);
});

test("sends over HTTP/2 with the topic and drops dead tokens", async () => {
  const account = await createAccount({ email: "two@nahj.test", name: "جهازان", password: pw(), role: "operator" });
  saveDevice(account.id, TOKEN_A);
  saveDevice(account.id, TOKEN_B);
  const fake = fakeApns({ [TOKEN_B]: { status: 410, reason: "Unregistered" } });
  setApnsSender(createApnsSender({ env: () => apnsEnv, connect: fake.connect as never }));
  const result = await pushToAccounts([account.id], { title: "تنبيه", body: "نص", url: "/#billing" });
  assert.deepEqual(result, { sent: 1, dropped: 1 });
  assert.equal(fake.sent[0].headers["apns-topic"], "com.dralfailakawi.nahj");
  assert.match(fake.sent[0].headers.authorization, /^bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  assert.equal(JSON.parse(fake.sent[0].body).url, "/#billing");
  assert.deepEqual(devicesFor([account.id]), [TOKEN_A], "the token Apple rejected is gone");

  const bad = fakeApns({ [TOKEN_A]: { status: 400, reason: "BadDeviceToken" } });
  setApnsSender(createApnsSender({ env: () => apnsEnv, connect: bad.connect as never }));
  await pushToAccounts([account.id], { title: "x" });
  assert.deepEqual(devicesFor([account.id]), []);
});

test("every personal notification in the queue also pushes to its owner", async () => {
  const account = await createAccount({ email: "admin@nahj.test", name: "مشرفة", password: pw(), role: "admin" });
  saveDevice(account.id, TOKEN_A);
  const fake = fakeApns();
  setApnsSender(createApnsSender({ env: () => apnsEnv, connect: fake.connect as never }));
  enqueue({ kind: "invoice.issued", dedupeKey: "invoice.issued:t1:admin@nahj.test", recipient: "Admin@nahj.test", subject: "فاتورة INV-1", body: "صدرت فاتورة جديدة.\nالرقم: INV-1" });
  await settle();
  assert.equal(fake.sent.length, 1);
  const payload = JSON.parse(fake.sent[0].body);
  assert.equal(payload.aps.alert.title, "فاتورة INV-1");
  assert.equal(payload.url, "/#billing");
  assert.equal(urlForKind("autopilot.emergency_pause"), "/#control");

  /* التكرار يرفضه الطابور، فلا يُدفع مرتين. */
  enqueue({ kind: "invoice.issued", dedupeKey: "invoice.issued:t1:admin@nahj.test", recipient: "admin@nahj.test", subject: "فاتورة INV-1", body: "x" });
  await settle();
  assert.equal(fake.sent.length, 1);

  /* طلب اعتماد يشترط المشرف: لا يصل إلى المدير. */
  const manager = await createAccount({ email: "mgr@nahj.test", name: "مدير", password: pw(), role: "manager" });
  saveDevice(manager.id, TOKEN_B);
  pushApprovalRequested({ id: "appr_x", workTitle: "استرداد رسوم", actionName: "refund", requiredRole: "admin" });
  await settle();
  const paths = fake.sent.slice(1).map(item => item.headers[":path"]);
  assert.deepEqual(paths, [`/3/device/${TOKEN_A}`]);
  assert.equal(JSON.parse(fake.sent[1].body).url, "/#approval=appr_x");
  assert.ok(apnsPayload({ title: "t" }).includes('"sound":"default"'));
});

test("the subscribe route needs a session, validates the token and is open to viewers", async () => {
  await createAccount({ email: "viewer@nahj.test", name: "مشاهد", password: pw(), role: "viewer" });
  ensureSubscription();
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
  app.use("/api", apiRouter);
  const server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  try {
    const anonymous = await fetch(`${base}/push/subscribe-native`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: TOKEN_A }) });
    assert.equal(anonymous.status, 401);

    const login = await fetch(`${base}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "viewer@nahj.test", password: pw() }) });
    const cookie = (login.headers.getSetCookie?.() || []).map(c => c.split(";")[0]).join("; ");
    const { csrfToken, account } = await login.json() as { csrfToken: string; account: { id: string } };
    const post = (url: string, body: unknown) => fetch(`${base}${url}`, { method: "POST", headers: { "content-type": "application/json", cookie, "x-csrf-token": csrfToken }, body: JSON.stringify(body) });

    assert.equal((await post("/push/subscribe-native", { token: "zz" })).status, 400);
    const saved = await post("/push/subscribe-native", { token: TOKEN_B.toUpperCase() });
    assert.equal(saved.status, 200);
    assert.deepEqual(devicesFor([account.id]), [TOKEN_B]);
    const status = await (await fetch(`${base}/push/status`, { headers: { cookie } })).json() as { ids: string[] };
    assert.equal(status.ids.length, 1);
    assert.equal((await post("/push/unsubscribe-native", { token: TOKEN_B })).status, 200);
    assert.deepEqual(devicesFor([account.id]), []);
  } finally {
    server.close();
  }
});
