import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/*
 * حدّ محاولات الدخول لكل IP يبقى بعد إعادة التشغيل — كان خريطةً في الذاكرة.
 */
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nahj-throttle-"));
process.env.NAHJ_DATABASE_PATH = path.join(directory, "test.sqlite");

const { ipBlocked, recordIpFailure, resetLoginThrottleSchemaCache, LOGIN_IP_MAX_FAILURES, LOGIN_IP_WINDOW_MS } = await import("./loginThrottle.ts");
const { closeDatabase } = await import("./persistence.ts");

test("failures accumulate, block at the limit, and survive a database reopen", () => {
  const now = Date.now();
  for (let i = 0; i < LOGIN_IP_MAX_FAILURES - 1; i++) recordIpFailure("10.0.0.9", now);
  assert.equal(ipBlocked("10.0.0.9", now), false, "blocked before the limit");
  recordIpFailure("10.0.0.9", now);
  assert.equal(ipBlocked("10.0.0.9", now), true);

  /* «إعادة تشغيل»: تُغلق القاعدة وتُفتح من الملف نفسه. */
  closeDatabase();
  resetLoginThrottleSchemaCache();
  assert.equal(ipBlocked("10.0.0.9", now), true, "the counter was lost on restart");
  assert.equal(ipBlocked("10.0.0.10", now), false, "another IP is not affected");
});

test("the window expires and the counter restarts from one", () => {
  const now = Date.now();
  const later = now + LOGIN_IP_WINDOW_MS + 1;
  assert.equal(ipBlocked("10.0.0.9", later), false, "still blocked after the window");
  assert.equal(recordIpFailure("10.0.0.9", later), 1);
});

test("the login route uses the persistent throttle, not an in-memory map", () => {
  const routes = fs.readFileSync("server/routes.ts", "utf8");
  assert.doesNotMatch(routes, /loginFailuresByIp\s*=\s*new Map/);
  assert.match(routes, /from "\.\/loginThrottle\.ts"/);
});
