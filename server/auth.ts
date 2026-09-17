import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { NextFunction, Request, Response } from "express";
import { openDatabase } from "./persistence.ts";
import { DemoSandbox } from "./db.ts";

/*
 * المصادقة.
 *
 * لم تكن المنصة تملك أي طبقة مصادقة: كل مسار مفتوح، و`/switch-role` يسمح لأي زائر بأن
 * يصبح أي دور — في نظام فيه مفاتيح إيقاف وموافقات ومستويات استقلالية.
 *
 * التصميم: كلمة مرور بـscrypt (ملح لكل حساب)، جلسة في قاعدة البيانات، كوكي HttpOnly
 * وSameSite=Strict، ورمز CSRF مزدوج الإرسال لكل طلب مُعدِّل. الجلسة مخزَّنة مُجزَّأة فلا
 * يكفي تسريب القاعدة لانتحالها.
 */

const scrypt = promisify(scryptCallback) as (password: string, salt: string, keylen: number) => Promise<Buffer>;

const SESSION_COOKIE = "nahj_session";
const CSRF_COOKIE = "nahj_csrf";
const SESSION_HOURS = 8;
const MAX_FAILED_LOGINS = 8;
const LOCKOUT_MINUTES = 15;

export type AccountRole = "admin" | "manager" | "operator" | "viewer";
const ROLES: AccountRole[] = ["admin", "manager", "operator", "viewer"];

export interface Account {
  id: string;
  email: string;
  name: string;
  role: AccountRole;
  status: string;
}

export interface AuthenticatedRequest extends Request {
  account?: Account;
}

const now = () => new Date().toISOString();
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export function isProduction() {
  return process.env.NODE_ENV === "production";
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return { hash: derived.toString("hex"), salt };
}

async function verifyPassword(password: string, hash: string, salt: string) {
  const derived = await scrypt(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  // طول مختلف يعني عدم تطابق، لكن timingSafeEqual يرمي عليه — نتحقق أولاً.
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}

/** قواعد لا تُساوم: كلمة مرور قصيرة تجعل كل ما فوقها بلا معنى. */
export function validatePassword(password: unknown): string | null {
  if (typeof password !== "string" || password.length < 12) return "كلمة المرور يجب أن تكون 12 محرفاً على الأقل.";
  if (password.length > 200) return "كلمة المرور طويلة أكثر من اللازم.";
  if (!/[a-z]/i.test(password) || !/\d/.test(password)) return "كلمة المرور يجب أن تجمع حروفاً وأرقاماً.";
  return null;
}

const normalizeEmail = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const clean = value.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean) && clean.length <= 200 ? clean : undefined;
};

export interface CreateAccountInput {
  email: string;
  name: string;
  password: string;
  role?: AccountRole;
}

export async function createAccount(input: CreateAccountInput): Promise<Account> {
  const email = normalizeEmail(input.email);
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const passwordError = validatePassword(input.password);
  if (!email) throw new Error("البريد الإلكتروني غير صالح.");
  if (name.length < 2 || name.length > 120) throw new Error("الاسم غير صالح.");
  if (passwordError) throw new Error(passwordError);
  const role: AccountRole = input.role && ROLES.includes(input.role) ? input.role : "viewer";

  const { hash, salt } = await hashPassword(input.password);
  const id = `acc_${randomUUID()}`;
  const timestamp = now();
  openDatabase()
    .prepare(
      `INSERT INTO accounts(id, email, name, role, password_hash, password_salt, status, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`
    )
    .run(id, email, name, role, hash, salt, timestamp, timestamp);
  return { id, email, name, role, status: "ACTIVE" };
}

export function accountCount() {
  const row = openDatabase().prepare("SELECT COUNT(*) AS count FROM accounts").get() as { count: number };
  return Number(row?.count ?? 0);
}

/** هل النظام بلا أي حساب بعد؟ عندها فقط يُفتح مسار التهيئة الأولى. */
export function needsFirstRunSetup() {
  return accountCount() === 0;
}

/**
 * إنشاء حساب المشغّل الأول من الواجهة.
 *
 * بدون هذا المسار كان تفعيل المصادقة يقفل التطبيق على نفسه: شاشة دخول بلا أي حساب،
 * ولا طريقة لإنشاء واحد إلا بمتغيّرات بيئة يعرفها من نشر الخادم وحده.
 *
 * الشرط الحاسم: الإدراج نفسه مشروط بـ`WHERE NOT EXISTS (SELECT 1 FROM accounts)`، فالفحص
 * والكتابة عملية ذرّية واحدة. طلبان متزامنان لا ينشئان حسابين، وبعد أول حساب يُغلق المسار
 * إلى الأبد — لا نافذة يتسلل منها أحد لاحقاً.
 */
export async function createFirstAccount(input: { email: string; name: string; password: string }): Promise<Account> {
  const email = normalizeEmail(input.email);
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const passwordError = validatePassword(input.password);
  if (!email) throw Object.assign(new Error("البريد الإلكتروني غير صالح."), { status: 400 });
  if (name.length < 2 || name.length > 120) throw Object.assign(new Error("الاسم غير صالح."), { status: 400 });
  if (passwordError) throw Object.assign(new Error(passwordError), { status: 400 });

  const { hash, salt } = await hashPassword(input.password);
  const id = `acc_${randomUUID()}`;
  const timestamp = now();
  const result = openDatabase()
    .prepare(
      `INSERT INTO accounts(id, email, name, role, password_hash, password_salt, status, created_at, updated_at)
       SELECT ?, ?, ?, 'admin', ?, ?, 'ACTIVE', ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM accounts)`
    )
    .run(id, email, name, hash, salt, timestamp, timestamp);

  if (Number(result.changes) !== 1) {
    throw Object.assign(new Error("تمت تهيئة النظام مسبقاً. سجّل الدخول بحسابك."), { status: 409 });
  }
  console.log(`[NAHJ] First operator account created through setup: ${email}`);
  return { id, email, name, role: "admin", status: "ACTIVE" };
}

/**
 * ينشئ حساب المشغّل الأول من متغيّرات البيئة إن لم يوجد أي حساب.
 * بدونه لا يمكن الدخول أصلاً بعد تفعيل المصادقة.
 */
export async function bootstrapFirstAccount() {
  if (accountCount() > 0) return null;
  const email = process.env.NAHJ_ADMIN_EMAIL;
  const password = process.env.NAHJ_ADMIN_PASSWORD;
  if (!email || !password) {
    console.log("[NAHJ] No accounts yet — first-run setup is open. Create the operator account in the browser, or preseed it with NAHJ_ADMIN_EMAIL/NAHJ_ADMIN_PASSWORD.");
    return null;
  }
  try {
    const account = await createAccount({
      email,
      name: process.env.NAHJ_ADMIN_NAME || "مشرف النظام",
      password,
      role: "admin",
    });
    console.log(`[NAHJ] Bootstrapped first admin account: ${account.email}`);
    return account;
  } catch (error) {
    console.error("[NAHJ] Failed to bootstrap admin account:", error instanceof Error ? error.message : error);
    return null;
  }
}

type AccountRow = {
  id: string; email: string; name: string; role: string; status: string;
  password_hash: string; password_salt: string; failed_login_count: number; locked_until: string | null;
};

function publicAccount(row: AccountRow): Account {
  return { id: row.id, email: row.email, name: row.name, role: row.role as AccountRole, status: row.status };
}

export interface LoginResult {
  account: Account;
  sessionToken: string;
  csrfToken: string;
  expiresAt: string;
}

export async function login(email: unknown, password: unknown): Promise<LoginResult> {
  const normalized = normalizeEmail(email);
  const db = openDatabase();
  const row = normalized
    ? (db.prepare("SELECT * FROM accounts WHERE email = ? LIMIT 1").get(normalized) as AccountRow | undefined)
    : undefined;

  /*
   * حتى مع بريد غير موجود نُجري اشتقاقاً وهمياً: بدونه يفرّق زمنُ الاستجابة بين بريد
   * مسجَّل وغير مسجَّل، فيصبح تعداد الحسابات ممكناً بالقياس وحده.
   */
  if (!row) {
    await scrypt(typeof password === "string" ? password : "", "decoy-salt", 64);
    throw Object.assign(new Error("البريد الإلكتروني أو كلمة المرور غير صحيحة."), { status: 401 });
  }
  if (row.status !== "ACTIVE") {
    throw Object.assign(new Error("هذا الحساب موقوف. راجع مشرف النظام."), { status: 403 });
  }
  if (row.locked_until && row.locked_until > now()) {
    throw Object.assign(new Error("الحساب مقفل مؤقتاً بعد محاولات فاشلة متتالية. حاول لاحقاً."), { status: 429 });
  }

  const valid = typeof password === "string" && (await verifyPassword(password, row.password_hash, row.password_salt));
  if (!valid) {
    const failures = Number(row.failed_login_count) + 1;
    const lockedUntil = failures >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString() : null;
    db.prepare("UPDATE accounts SET failed_login_count = ?, locked_until = ?, updated_at = ? WHERE id = ?")
      .run(failures, lockedUntil, now(), row.id);
    throw Object.assign(new Error("البريد الإلكتروني أو كلمة المرور غير صحيحة."), { status: 401 });
  }

  db.prepare("UPDATE accounts SET failed_login_count = 0, locked_until = NULL, updated_at = ? WHERE id = ?").run(now(), row.id);

  const sessionToken = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60_000).toISOString();
  db.prepare("INSERT INTO sessions(token_hash, account_id, csrf_hash, expires_at, created_at) VALUES(?, ?, ?, ?, ?)")
    .run(sha256(sessionToken), row.id, sha256(csrfToken), expiresAt, now());

  return { account: publicAccount(row), sessionToken, csrfToken, expiresAt };
}

export function logout(sessionToken: string | undefined) {
  if (!sessionToken) return;
  openDatabase().prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(sessionToken));
}

export function purgeExpiredSessions() {
  openDatabase().prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now());
}

function readCookie(req: Request, name: string) {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export function setSessionCookies(res: Response, sessionToken: string, csrfToken: string) {
  const secure = isProduction() ? "; Secure" : "";
  const maxAge = SESSION_HOURS * 60 * 60;
  res.append("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`);
  // رمز CSRF يجب أن يقرأه العميل ليعيده في ترويسة، فهو عمداً ليس HttpOnly.
  res.append("Set-Cookie", `${CSRF_COOKIE}=${encodeURIComponent(csrfToken)}; Path=/; SameSite=Strict; Max-Age=${maxAge}${secure}`);
}

export function clearSessionCookies(res: Response) {
  const secure = isProduction() ? "; Secure" : "";
  res.append("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
  res.append("Set-Cookie", `${CSRF_COOKIE}=; Path=/; SameSite=Strict; Max-Age=0${secure}`);
}

type SessionRow = { account_id: string; csrf_hash: string; expires_at: string };

export function resolveSession(req: Request) {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return undefined;
  const db = openDatabase();
  const session = db.prepare("SELECT account_id, csrf_hash, expires_at FROM sessions WHERE token_hash = ? LIMIT 1")
    .get(sha256(token)) as SessionRow | undefined;
  if (!session) return undefined;
  if (session.expires_at <= now()) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
    return undefined;
  }
  const row = db.prepare("SELECT * FROM accounts WHERE id = ? LIMIT 1").get(session.account_id) as AccountRow | undefined;
  // حساب أُوقف أثناء جلسة قائمة لا يكمل الجلسة.
  if (!row || row.status !== "ACTIVE") return undefined;
  return { account: publicAccount(row), csrfHash: session.csrf_hash };
}

/**
 * هوية اصطناعية للزائر التجريبي. لا تُخزَّن ولا تُمنح أي وصول حقيقي: الطلب مربوط أصلاً
 * بصندوق الزائر في الذاكرة عبر AsyncLocalStorage، وكل مسار كتابة في `Store` يفحص
 * `isDemo` قبل أي مزامنة. فدورها هو إرضاء حُرّاس الأدوار داخل الصندوق فقط.
 */
const DEMO_ACCOUNT: Account = {
  id: "demo",
  email: "demo@nahj.local",
  name: "زائر البيئة التجريبية",
  role: "admin",
  status: "ACTIVE",
};

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  /*
   * البيئة التجريبية مفتوحة بلا حساب عمداً — هذا كل الغرض منها. السماح هنا آمن لأن
   * الطلب لا يستطيع بلوغ بيانات المؤسسة إطلاقاً: `db` وكيلٌ يتحوّل إلى نسخة الزائر
   * الخاصة، ولا شيء منها يُكتب إلى Firestore ولا إلى القرص.
   */
  if (DemoSandbox.isDemoRequest()) {
    req.account = DEMO_ACCOUNT;
    return next();
  }

  const session = resolveSession(req);
  if (!session) return res.status(401).json({ error: "يلزم تسجيل الدخول.", code: "AUTH_REQUIRED" });
  req.account = session.account;

  // الطلبات المُعدِّلة تحتاج رمز CSRF مطابقاً للمخزَّن مع الجلسة.
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const provided = req.header("x-csrf-token");
    if (!provided || sha256(provided) !== session.csrfHash) {
      return res.status(403).json({ error: "رمز الحماية غير صالح.", code: "CSRF_INVALID" });
    }
  }
  next();
}

/** حارس أدوار. الترتيب تصاعدي في الصلاحية. */
export function requireRole(...allowed: AccountRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.account) return res.status(401).json({ error: "يلزم تسجيل الدخول.", code: "AUTH_REQUIRED" });
    if (!allowed.includes(req.account.role)) {
      return res.status(403).json({ error: "لا تملك صلاحية تنفيذ هذه العملية.", code: "FORBIDDEN" });
    }
    next();
  };
}

export const authCookieNames = { session: SESSION_COOKIE, csrf: CSRF_COOKIE };
