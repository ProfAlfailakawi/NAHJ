import assert from "node:assert/strict";
import test from "node:test";

const { storageStatus } = await import("./persistence.ts");

test("حالة التخزين: Neon دائم، وCloud Run بلا Neon مؤقت، والمجلد الخارجي مجهول", () => {
  const saved = { ...process.env };
  try {
    process.env.NODE_ENV = "production";
    delete process.env.NAHJ_NEON_URL; delete process.env.K_SERVICE;
    process.env.NAHJ_DATABASE_PATH = "/var/nahj/nahj.sqlite";
    assert.equal(storageStatus().durable, "unknown");
    assert.equal(storageStatus().mode, "volume");

    process.env.K_SERVICE = "nahj";
    assert.equal(storageStatus().durable, "no", "Cloud Run بلا Neon عُدّ دائماً");
    assert.match(storageStatus().message, /NAHJ_NEON_URL/);

    process.env.NAHJ_NEON_URL = "postgresql://neon.example/db";
    assert.equal(storageStatus().durable, "yes");

    delete process.env.NAHJ_NEON_URL; delete process.env.K_SERVICE;
    process.env.NAHJ_DATABASE_PATH = `${process.cwd()}/var/nahj.sqlite`;
    assert.equal(storageStatus().durable, "no", "مسار داخل مجلد التطبيق عُدّ دائماً");

    process.env.NODE_ENV = "development";
    assert.equal(storageStatus().mode, "development");
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});
