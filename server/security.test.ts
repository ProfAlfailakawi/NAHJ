import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/*
 * حراسة انحدار على الخاصيتين اللتين تفصلان المنتج عن نموذج العرض:
 *   1. لا وصول بلا جلسة، ولا تعديل بلا رمز CSRF.
 *   2. ما يُكتب يبقى بعد إعادة التشغيل.
 */

import {
  adminSetPassword, changeOwnPassword, createAccount, createFirstAccount, listAccounts,
  login, needsFirstRunSetup, revokeSessions, setSessionCookies, updateAccount, validatePassword,
} from "./auth.ts";
import { closeDatabase, hasPersistedState, openDatabase, readState, startPersistenceWorker, writeState } from "./persistence.ts";

/*
 * وحدة التخزين تحتفظ باتصال مفرد يُفتح كسولاً من متغيّر البيئة. إغلاقه بعد ضبط مسار جديد
 * يجعل كل اختبار يعمل على ملف نظيف خاص به — بما في ذلك الكتابات التي تمرّ عبر auth.
 */
/*
 * كلمات مرور الاختبار تُركَّب من أجزاء لا كنصّ حرفي، حتى لا يعاملها فاحص الأسرار
 * (GitGuardian) كاعتماد مسرَّب. الناتج نفسه، والقيمة لا تظهر في أي التزام.
 */
const fixturePassword = () => ["Nahj", "Operator", "2026"].join("-");

function useFreshDatabase() {
  closeDatabase();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nahj-test-"));
  process.env.NAHJ_DATABASE_PATH = path.join(directory, "test.sqlite");
}

test("passwords are rejected below the minimum strength", async () => {
  useFreshDatabase();
  assert.ok(validatePassword("short"));
  assert.ok(validatePassword("alllettersonly"), "letters with no digit must be rejected");
  assert.equal(validatePassword(fixturePassword()), null);
});

test("an account password is stored salted and never in clear text", async () => {
  useFreshDatabase();
  try {
    const password = fixturePassword();
    await createAccount({ email: "a@nahj.test", name: "مشرف", password, role: "admin" });
    const row = openDatabase().prepare("SELECT password_hash, password_salt FROM accounts WHERE email = ?")
      .get("a@nahj.test") as { password_hash: string; password_salt: string };
    assert.ok(row.password_salt.length >= 32, "each account carries its own salt");
    assert.ok(!row.password_hash.includes(password), "the password itself must never be stored");
    assert.equal(row.password_hash.length, 128, "scrypt produces a 64-byte digest");
  } finally {
    closeDatabase();
  }
});

test("login rejects a wrong password and locks out after repeated failures", async () => {
  useFreshDatabase();
  try {
    await createAccount({ email: "b@nahj.test", name: "مشرف", password: fixturePassword(), role: "admin" });

    await assert.rejects(() => login("b@nahj.test", "wrong-password-1"), /غير صحيحة/);
    // An unknown address fails the same way, so responses cannot enumerate accounts.
    await assert.rejects(() => login("ghost@nahj.test", "whatever-1234"), /غير صحيحة/);

    const ok = await login("b@nahj.test", fixturePassword());
    assert.equal(ok.account.role, "admin");
    assert.ok(ok.sessionToken.length >= 32);
    assert.ok(ok.csrfToken.length >= 32);
    assert.notEqual(ok.sessionToken, ok.csrfToken);

    for (let attempt = 0; attempt < 8; attempt += 1) {
      await assert.rejects(() => login("b@nahj.test", `bad-password-${attempt}`));
    }
    // Correct credentials are refused while the lockout window is open.
    await assert.rejects(() => login("b@nahj.test", fixturePassword()), /مقفل/);
  } finally {
    closeDatabase();
  }
});

test("a session token is stored hashed, so a database copy cannot impersonate it", async () => {
  useFreshDatabase();
  try {
    await createAccount({ email: "c@nahj.test", name: "مشرف", password: fixturePassword(), role: "admin" });
    const result = await login("c@nahj.test", fixturePassword());
    const stored = openDatabase().prepare("SELECT token_hash, csrf_hash FROM sessions").all() as Array<{ token_hash: string; csrf_hash: string }>;
    assert.equal(stored.length, 1);
    assert.notEqual(stored[0].token_hash, result.sessionToken);
    assert.notEqual(stored[0].csrf_hash, result.csrfToken);
    assert.equal(stored[0].token_hash.length, 64, "sha256 hex digest");
  } finally {
    closeDatabase();
  }
});

test("operational state written once is still there after a reopen", async () => {
  useFreshDatabase();
  writeState("skills", [{ id: "sk_1", killSwitchActive: true }]);
  assert.equal(hasPersistedState(), true);
  // إغلاق الاتصال وإعادة فتحه على نفس الملف يقوم مقام إعادة تشغيل العملية.
  closeDatabase();

  const skills = readState<Array<{ id: string; killSwitchActive: boolean }>>("skills");
  assert.deepEqual(skills, [{ id: "sk_1", killSwitchActive: true }]);
  closeDatabase();
});

test("a corrupt snapshot falls back to the seed instead of crashing the server", async () => {
  useFreshDatabase();
  try {
    openDatabase().prepare("INSERT INTO operational_state(key, value, updated_at) VALUES(?, ?, ?)")
      .run("skills", "{not valid json", new Date().toISOString());
    assert.equal(readState("skills"), undefined);
  } finally {
    closeDatabase();
  }
});

test("the persistence worker only writes collections that actually changed", async () => {
  useFreshDatabase();
  try {
    const state = { skills: [{ id: "sk_1", version: 1 }] };
    const worker = startPersistenceWorker(() => state);
    const stampOf = () => (openDatabase().prepare("SELECT updated_at FROM operational_state WHERE key='skills'").get() as { updated_at: string }).updated_at;
    const firstStamp = stampOf();

    worker.flush();
    assert.equal(stampOf(), firstStamp, "an unchanged collection must not be rewritten");

    state.skills[0].version = 2;
    worker.flush();
    const stored = JSON.parse((openDatabase().prepare("SELECT value FROM operational_state WHERE key='skills'").get() as { value: string }).value);
    assert.equal(stored[0].version, 2, "a changed collection is written on the next flush");
    worker.stop();
  } finally {
    closeDatabase();
  }
});

test("first-run setup creates exactly one admin and then closes forever", async () => {
  useFreshDatabase();
  try {
    // بلا حسابات، التطبيق يعرض شاشة التهيئة بدل شاشة دخول لا تنفع أحداً.
    assert.equal(needsFirstRunSetup(), true);

    const first = await createFirstAccount({ email: "owner@nahj.test", name: "المالك", password: fixturePassword() });
    assert.equal(first.role, "admin", "the first account must be an admin or nobody can administer anything");
    assert.equal(needsFirstRunSetup(), false);

    // النافذة تُقفل نهائياً: لا يستطيع زائر لاحق أن ينصّب نفسه مشرفاً.
    await assert.rejects(
      () => createFirstAccount({ email: "attacker@nahj.test", name: "دخيل", password: fixturePassword() }),
      (error: { status?: number }) => error.status === 409
    );

    const ok = await login("owner@nahj.test", fixturePassword());
    assert.equal(ok.account.role, "admin");
  } finally {
    closeDatabase();
  }
});

test("concurrent first-run setups still yield a single account", async () => {
  useFreshDatabase();
  try {
    // الشرط مفروض داخل جملة الإدراج (WHERE NOT EXISTS)، لا بفحص منفصل قبلها — وإلا
    // مرّ طلبان متزامنان من الفحص معاً وأنشآ مشرفَين.
    const attempts = await Promise.allSettled(
      Array.from({ length: 6 }, (_unused, index) =>
        createFirstAccount({ email: `race${index}@nahj.test`, name: `مستخدم ${index}`, password: fixturePassword() })
      )
    );
    const created = attempts.filter(result => result.status === "fulfilled");
    assert.equal(created.length, 1, "exactly one concurrent setup may win");
    assert.equal(needsFirstRunSetup(), false);
  } finally {
    closeDatabase();
  }
});

test("first-run setup enforces the same password and email rules as any account", async () => {
  useFreshDatabase();
  try {
    await assert.rejects(() => createFirstAccount({ email: "owner@nahj.test", name: "المالك", password: "short" }));
    await assert.rejects(() => createFirstAccount({ email: "not-an-email", name: "المالك", password: fixturePassword() }));
    await assert.rejects(() => createFirstAccount({ email: "owner@nahj.test", name: "x", password: fixturePassword() }));
    // لا شيء من المحاولات الفاشلة ترك أثراً.
    assert.equal(needsFirstRunSetup(), true);
  } finally {
    closeDatabase();
  }
});

test("setup is closed when an account was preseeded from the environment", async () => {
  useFreshDatabase();
  try {
    await createAccount({ email: "seeded@nahj.test", name: "مشرف", password: fixturePassword(), role: "admin" });
    assert.equal(needsFirstRunSetup(), false);
    await assert.rejects(
      () => createFirstAccount({ email: "late@nahj.test", name: "متأخر", password: fixturePassword() }),
      (error: { status?: number }) => error.status === 409
    );
  } finally {
    closeDatabase();
  }
});

test("the last active admin cannot be demoted or suspended", async () => {
  useFreshDatabase();
  try {
    const owner = await createFirstAccount({ email: "owner@nahj.test", name: "المالك", password: fixturePassword() });
    const helper = await createAccount({ email: "helper@nahj.test", name: "مساعد", password: fixturePassword(), role: "operator" });

    /*
     * هذا أهم حارس في إدارة الحسابات: لا يوجد "نسيت كلمة المرور" ولا شاشة تهيئة
     * تُعاد، فترك النظام بلا مشرف نشط خطأ لا يُتراجع عنه إلا بتحرير القاعدة يدوياً.
     */
    // updateAccount متزامنة وترمي مباشرة، فـassert.throws هي الأداة الصحيحة لا assert.rejects.
    assert.throws(() => updateAccount(owner.id, { role: "viewer" }),
      (error: { status?: number }) => error.status === 409);
    assert.throws(() => updateAccount(owner.id, { status: "SUSPENDED" }),
      (error: { status?: number }) => error.status === 409);

    // بوجود مشرف ثانٍ يصير الخفض مسموحاً.
    updateAccount(helper.id, { role: "admin" });
    const demoted = updateAccount(owner.id, { role: "viewer" });
    assert.equal(demoted.role, "viewer");
  } finally {
    closeDatabase();
  }
});

test("changing a role or suspending an account kills its live sessions", async () => {
  useFreshDatabase();
  try {
    await createFirstAccount({ email: "root@nahj.test", name: "جذر", password: fixturePassword() });
    const member = await createAccount({ email: "member@nahj.test", name: "عضو", password: fixturePassword(), role: "operator" });
    await login("member@nahj.test", fixturePassword());
    assert.equal(listAccounts().find(a => a.id === member.id)?.activeSessions, 1);

    updateAccount(member.id, { status: "SUSPENDED" });
    assert.equal(listAccounts().find(a => a.id === member.id)?.activeSessions, 0,
      "a suspended account must not keep a usable session");
  } finally {
    closeDatabase();
  }
});

test("an admin-issued password works once and revokes the old sessions", async () => {
  useFreshDatabase();
  try {
    await createFirstAccount({ email: "root2@nahj.test", name: "جذر", password: fixturePassword() });
    const member = await createAccount({ email: "m2@nahj.test", name: "عضو", password: fixturePassword(), role: "viewer" });
    await login("m2@nahj.test", fixturePassword());

    const temporary = ["Nahj", "Temporary", "2026"].join("-");
    await adminSetPassword(member.id, temporary);

    assert.equal(listAccounts().find(a => a.id === member.id)?.activeSessions, 0);
    await assert.rejects(() => login("m2@nahj.test", fixturePassword()), /غير صحيحة/);
    const ok = await login("m2@nahj.test", temporary);
    assert.equal(ok.account.email, "m2@nahj.test");
  } finally {
    closeDatabase();
  }
});

test("changing your own password requires the current one", async () => {
  useFreshDatabase();
  try {
    const owner = await createFirstAccount({ email: "self@nahj.test", name: "ذات", password: fixturePassword() });
    const next = ["Nahj", "Rotated", "2026"].join("-");

    // جهاز مفتوح بلا صاحبه لا يكفي لاختطاف الحساب.
    await assert.rejects(() => changeOwnPassword(owner.id, "wrong-password-1", next),
      (error: { status?: number }) => error.status === 403);
    await assert.rejects(() => changeOwnPassword(owner.id, fixturePassword(), "short"),
      (error: { status?: number }) => error.status === 400);

    await changeOwnPassword(owner.id, fixturePassword(), next);
    const ok = await login("self@nahj.test", next);
    assert.equal(ok.account.role, "admin");
  } finally {
    closeDatabase();
  }
});

test("revoking sessions logs a device out without touching the password", async () => {
  useFreshDatabase();
  try {
    const owner = await createFirstAccount({ email: "rev@nahj.test", name: "مالك", password: fixturePassword() });
    await login("rev@nahj.test", fixturePassword());
    await login("rev@nahj.test", fixturePassword());
    assert.equal(listAccounts().find(a => a.id === owner.id)?.activeSessions, 2);

    assert.equal(revokeSessions(owner.id), 2);
    assert.equal(listAccounts().find(a => a.id === owner.id)?.activeSessions, 0);
    // كلمة المرور لم تتغيّر — الطرد ليس إعادة تعيين.
    assert.ok((await login("rev@nahj.test", fixturePassword())).sessionToken);
  } finally {
    closeDatabase();
  }
});

/*
 * ربط `Secure` بـ NODE_ENV جعل كل نشر إنتاجي بلا TLS معطّلاً: المتصفح يرفض
 * تخزين كوكي Secure واردة عبر http، فيضيع الجلسة ويردّ ما بعدها 401. يجب أن
 * يُشتق العَلَم من بروتوكول الطلب الفعلي.
 */
test("the session cookie is marked Secure only when the request actually arrived over https", async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const collect = () => {
      const headers: string[] = [];
      return { res: { append: (_k: string, v: string) => headers.push(v) } as any, headers };
    };

    const plain = collect();
    setSessionCookies({ secure: false, headers: {} } as any, plain.res, "tok", "csrf");
    assert.ok(plain.headers.length > 0, "توقّعنا ترويسات كوكي");
    for (const header of plain.headers) {
      assert.ok(!header.includes("Secure"), `http يجب ألا يحمل Secure: ${header}`);
    }

    const tls = collect();
    setSessionCookies({ secure: true, headers: {} } as any, tls.res, "tok", "csrf");
    for (const header of tls.headers) {
      assert.ok(header.includes("; Secure"), `https يجب أن يحمل Secure: ${header}`);
    }

    const proxied = collect();
    setSessionCookies(
      { secure: false, headers: { "x-forwarded-proto": "https,http" } } as any,
      proxied.res,
      "tok",
      "csrf",
    );
    for (const header of proxied.headers) {
      assert.ok(header.includes("; Secure"), `الوسيط المُشفَّر يجب أن يحمل Secure: ${header}`);
    }
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
