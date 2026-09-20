import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { NextFunction, Request, Response } from "express";
import { openDatabase } from "./persistence.ts";
import { DemoSandbox } from "./db.ts";
import { checkLimit } from "./billing.ts";

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

/*
 * الأدوار.
 *
 * `owner` هو مالك المنصة — من باعها ونشرها، لا مدير المؤسسة المشترية. وهو الوحيد
 * الذي يملك الترخيص: الباقات والاشتراك والفواتير والدفعات. و`admin` هو أعلى دور
 * داخل المؤسسة المشترية: يدير حساباتها وحوكمتها، ويرى اشتراكه وفواتيره، ولا يملك
 * أن يمدّد اشتراكه بنفسه.
 *
 * الفصل بينهما هو الفرق بين نظامٍ مُباع ونظامٍ مُسلَّم.
 */
export type AccountRole = "owner" | "admin" | "manager" | "operator" | "viewer" | "partner";
const ROLES: AccountRole[] = ["owner", "admin", "manager", "operator", "viewer", "partner"];

/*
 * الترتيب تصاعدي في الصلاحية، و`partner` خارجه عمداً بقيمة صفر.
 *
 * المسوّق ليس «أقلّ صلاحية» من المُطّلع — هو طرفٌ من سلسلةٍ أخرى تماماً: يرى
 * شركاته وعمولته، ولا يرى بيانةً تشغيلية واحدة من داخل أي مؤسسة. فوضعُه على
 * السُلّم نفسه كان سيجعله يرث ما دونه، وهو ما لا يملكه أصلاً.
 */
const ROLE_RANK: Record<AccountRole, number> = { partner: 0, viewer: 1, operator: 2, manager: 3, admin: 4, owner: 5 };

export const isPartnerRole = (role: string | undefined) => role === "partner";

export const isOwnerRole = (role: string | undefined) => role === "owner";

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

/*
 * `Secure` يُشتق من بروتوكول الطلب الفعلي لا من NODE_ENV.
 *
 * المتصفح يرفض تخزين كوكي `Secure` وارد عبر http، فربطها بـ NODE_ENV كان يجعل
 * كل نشر إنتاجي بلا TLS معطّلاً تماماً: الخادم ينشئ الجلسة ويردّ 201، والمتصفح
 * يرمي الكوكي، فيأتي الطلب التالي بلا جلسة ويردّ 401 — فشل يبدو كأنه كلمة مرور
 * خاطئة وهو ليس كذلك.
 *
 * والعَلَم لا يحمي شيئاً على http أصلاً: الكوكي يمرّ نصاً صريحاً بوجوده أو
 * بدونه، وكل ما يفعله هو منع التطبيق من العمل. ما يحمي فعلاً هو TLS.
 *
 * وبمجرد وضع TLS أمام الخادم — مباشرةً أو عبر وسيط يضيف X-Forwarded-Proto —
 * يعود `Secure` تلقائياً بلا تغيير إعدادات.
 */
function isSecureRequest(req: Request): boolean {
  if (req.secure) return true;
  const forwarded = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  return forwarded.toLowerCase() === "https";
}

let warnedInsecure = false;
function cookieSecureSuffix(req: Request): string {
  if (isSecureRequest(req)) return "; Secure";
  if (isProduction() && !warnedInsecure) {
    warnedInsecure = true;
    console.warn(
      "[NAHJ] تحذير: الجلسات تُصدَر عبر http بلا تشفير. كلمات المرور ورموز الجلسات " +
        "تمرّ نصاً صريحاً على الشبكة. ضع شهادة TLS أمام الخادم قبل أي استعمال حقيقي.",
    );
  }
  return "";
}

export function setSessionCookies(req: Request, res: Response, sessionToken: string, csrfToken: string) {
  const secure = cookieSecureSuffix(req);
  const maxAge = SESSION_HOURS * 60 * 60;
  res.append("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`);
  // رمز CSRF يجب أن يقرأه العميل ليعيده في ترويسة، فهو عمداً ليس HttpOnly.
  res.append("Set-Cookie", `${CSRF_COOKIE}=${encodeURIComponent(csrfToken)}; Path=/; SameSite=Strict; Max-Age=${maxAge}${secure}`);
}

export function clearSessionCookies(req: Request, res: Response) {
  const secure = cookieSecureSuffix(req);
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

/*
 * إدارة الحسابات.
 *
 * نهج بلا مزوّد بريد، فلا يوجد "نسيت كلمة المرور" يُرسل رابطاً. البديل الصادق هو ما
 * تفعله الأنظمة المغلقة: المشرف يُصدر كلمة مرور مؤقتة ويسلّمها بقناة يثق بها، ثم
 * يغيّرها صاحبها. لا ندّعي استعادة ذاتية لا نملك وسيلتها.
 */

export interface AccountSummary extends Account {
  createdAt: string;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  activeSessions: number;
}

export function listAccounts(): AccountSummary[] {
  const rows = openDatabase().prepare(
    `SELECT a.id, a.email, a.name, a.role, a.status, a.created_at, a.locked_until,
            (SELECT COUNT(*) FROM sessions s WHERE s.account_id = a.id AND s.expires_at > ?) AS active_sessions,
            (SELECT MAX(s2.created_at) FROM sessions s2 WHERE s2.account_id = a.id) AS last_login_at
     FROM accounts a ORDER BY a.created_at ASC`
  ).all(now()) as Array<Record<string, unknown>>;
  return rows.map(row => ({
    id: String(row.id), email: String(row.email), name: String(row.name),
    role: String(row.role) as AccountRole, status: String(row.status),
    createdAt: String(row.created_at),
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
    lockedUntil: row.locked_until ? String(row.locked_until) : null,
    activeSessions: Number(row.active_sessions ?? 0),
  }));
}

/* المالك يُدير النظام أيضاً، فهو يُعدّ ضمن من يملكون إدارته عند حساب "آخر مشرف". */
const adminCount = () => {
  const row = openDatabase().prepare("SELECT COUNT(*) AS count FROM accounts WHERE role IN ('admin','owner') AND status = 'ACTIVE'").get() as { count: number };
  return Number(row?.count ?? 0);
};

/**
 * يمنع إزالة آخر مشرف نشط — بخفض دوره أو بتعطيله.
 *
 * بدون هذا الحارس تستطيع بضغطة واحدة أن تترك النظام بلا أحد يملك إدارته، ولا يوجد
 * "نسيت كلمة المرور" ولا شاشة تهيئة تعيد فتحه (تُقفل بعد أول حساب). أي أن الخطأ
 * غير قابل للتراجع إلا بتحرير قاعدة البيانات يدوياً.
 */
function assertNotLastAdmin(accountId: string, nextRole: string, nextStatus: string) {
  const target = openDatabase().prepare('SELECT role, status FROM accounts WHERE id = ?').get(accountId) as
    | { role: string; status: string } | undefined;
  if (!target) return;
  const administers = (role: string) => role === 'admin' || role === 'owner';
  const wasActiveAdmin = administers(target.role) && target.status === 'ACTIVE';
  const staysActiveAdmin = administers(nextRole) && nextStatus === 'ACTIVE';
  if (wasActiveAdmin && !staysActiveAdmin && adminCount() <= 1) {
    throw Object.assign(new Error('لا يمكن إزالة آخر مشرف نشط — عيّن مشرفاً آخر أولاً.'), { status: 409 });
  }
}

export async function adminCreateAccount(input: CreateAccountInput): Promise<Account> {
  const existing = openDatabase().prepare('SELECT id FROM accounts WHERE email = ? LIMIT 1')
    .get(String(input.email || '').trim().toLowerCase());
  if (existing) throw Object.assign(new Error('هذا البريد مسجّل مسبقاً.'), { status: 409 });
  // لا يُصنع مالكٌ ثانٍ من شاشة الحسابات. المِلكية تُضبط عند النشر، لا بنموذج ويب.
  if (input.role === 'owner') {
    throw Object.assign(new Error('لا يُنشأ حساب مالك من هنا.'), { status: 403 });
  }
  /*
   * حدّ المقاعد.
   *
   * لا معنى لباقةٍ تقول "عشرة مقاعد" ثم يُنشئ النظام الحادي عشر بلا اعتراض. والرفض
   * هنا لا في الواجهة: الواجهة تُخبر، والخادم يمنع.
   */
  const seats = checkLimit('seats', accountCount());
  if (!seats.allowed) throw Object.assign(new Error(seats.reason), { status: 402, code: 'PLAN_LIMIT' });
  try {
    return await createAccount(input);
  } catch (error) {
    throw Object.assign(error as Error, { status: (error as { status?: number }).status || 400 });
  }
}

export function updateAccount(accountId: string, changes: { role?: AccountRole; status?: string }): AccountSummary {
  const db = openDatabase();
  const current = db.prepare('SELECT role, status FROM accounts WHERE id = ? LIMIT 1').get(accountId) as
    | { role: string; status: string } | undefined;
  if (!current) throw Object.assign(new Error('الحساب غير موجود.'), { status: 404 });

  const role = changes.role ?? (current.role as AccountRole);
  const status = changes.status ?? current.status;
  if (!ROLES.includes(role)) throw Object.assign(new Error('الدور غير صالح.'), { status: 400 });

  /*
   * حساب المالك خارج متناول شاشة الحسابات تماماً — لا خفضاً ولا تعليقاً.
   *
   * مشرف المؤسسة المشترية يمرّ من نفس الحارس الذي يمرّ منه المالك (`requireRole("admin")`)،
   * فبدون هذا السطر يستطيع بضغطة واحدة أن يعزل مالك المنصة عن ترخيصه ويصير هو من
   * يقرّر متى ينتهي اشتراكه. وترقية حساب إلى مالك ليست عملية إدارة حسابات أصلاً.
   */
  if (current.role === 'owner' && role !== 'owner') {
    throw Object.assign(new Error('حساب مالك المنصة لا يُخفَّض من هنا.'), { status: 403 });
  }
  if (current.role === 'owner' && status !== 'ACTIVE') {
    throw Object.assign(new Error('حساب مالك المنصة لا يُعلَّق.'), { status: 403 });
  }
  if (role === 'owner' && current.role !== 'owner') {
    throw Object.assign(new Error('الترقية إلى مالك المنصة لا تتم من شاشة الحسابات.'), { status: 403 });
  }
  if (!['ACTIVE', 'SUSPENDED'].includes(status)) throw Object.assign(new Error('حالة الحساب غير صالحة.'), { status: 400 });

  assertNotLastAdmin(accountId, role, status);

  db.prepare('UPDATE accounts SET role = ?, status = ?, updated_at = ? WHERE id = ?').run(role, status, now(), accountId);
  // تعطيل الحساب أو خفض دوره يطرد جلساته فوراً؛ وإلّا بقي الدور القديم سارياً حتى تنتهي.
  if (status !== 'ACTIVE' || role !== current.role) {
    db.prepare('DELETE FROM sessions WHERE account_id = ?').run(accountId);
  }
  return listAccounts().find(account => account.id === accountId)!;
}

/**
 * يمنع مشرف المؤسسة من الاستيلاء على حساب المالك.
 *
 * كان حارس الحسابات يمنع خفض دور المالك وتعطيله — ونسي أخطر طريق: إصدار كلمة
 * مرور مؤقتة له. مشرفُ المؤسسة المشترية يمرّ من نفس الحارس، فيستطيع أن يضبط
 * كلمة مرور المالك بنفسه، ويطرد جلساته، ثم يدخل باسمه ويملك الترخيص كاملاً:
 * الباقات والاشتراك والفواتير وإنهاء الخدمة.
 *
 * أي أن كل حماية وُضعت على دور المالك كانت تُلتَف بمسارٍ واحد غير محروس. والمالك
 * وحده يملك إعادة ضبط حسابه — ولديه «كلمة مروري» التي تشترط الحالية.
 */
function assertNotSeizingOwner(targetId: string, requesterId: string | undefined, action: string) {
  const target = openDatabase().prepare('SELECT role FROM accounts WHERE id = ? LIMIT 1').get(targetId) as
    | { role: string } | undefined;
  if (!target || target.role !== 'owner') return;
  if (requesterId && requesterId === targetId) return;
  throw Object.assign(new Error(`حساب مالك المنصة لا ${action} من هنا.`), { status: 403 });
}

/** يضبط كلمة مرور جديدة لحساب ويطرد جلساته. يستعمله المشرف لإصدار كلمة مؤقتة. */
export async function adminSetPassword(accountId: string, newPassword: unknown, requesterId?: string): Promise<void> {
  const passwordError = validatePassword(newPassword);
  if (passwordError) throw Object.assign(new Error(passwordError), { status: 400 });
  assertNotSeizingOwner(accountId, requesterId, 'تُضبط كلمة مروره');
  const db = openDatabase();
  const exists = db.prepare('SELECT id FROM accounts WHERE id = ? LIMIT 1').get(accountId);
  if (!exists) throw Object.assign(new Error('الحساب غير موجود.'), { status: 404 });

  const { hash, salt } = await hashPassword(String(newPassword));
  db.prepare('UPDATE accounts SET password_hash = ?, password_salt = ?, failed_login_count = 0, locked_until = NULL, updated_at = ? WHERE id = ?')
    .run(hash, salt, now(), accountId);
  db.prepare('DELETE FROM sessions WHERE account_id = ?').run(accountId);
}

/**
 * تغيير المستخدم كلمة مروره بنفسه. يتطلب كلمة المرور الحالية: بدونها يكفي جهاز
 * مفتوح بلا صاحبه لاختطاف الحساب نهائياً.
 */
export async function changeOwnPassword(accountId: string, currentPassword: unknown, newPassword: unknown): Promise<void> {
  const passwordError = validatePassword(newPassword);
  if (passwordError) throw Object.assign(new Error(passwordError), { status: 400 });

  const db = openDatabase();
  const row = db.prepare('SELECT password_hash, password_salt FROM accounts WHERE id = ? LIMIT 1').get(accountId) as
    | { password_hash: string; password_salt: string } | undefined;
  if (!row) throw Object.assign(new Error('الحساب غير موجود.'), { status: 404 });

  const valid = typeof currentPassword === 'string' && (await verifyPassword(currentPassword, row.password_hash, row.password_salt));
  if (!valid) throw Object.assign(new Error('كلمة المرور الحالية غير صحيحة.'), { status: 403 });

  const { hash, salt } = await hashPassword(String(newPassword));
  db.prepare('UPDATE accounts SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?')
    .run(hash, salt, now(), accountId);
}

/**
 * يُنهي كل جلسات حساب — للطرد الفوري عند فقدان جهاز.
 *
 * ومحروسٌ بنفس الحارس: طردُ المالك من جلساته لا يمنح صلاحيته، لكنه يقفله خارج
 * ترخيصه متى شاء مشرفُ المؤسسة — وهو ما لا يملكه عليه.
 */
export function revokeSessions(accountId: string, requesterId?: string): number {
  assertNotSeizingOwner(accountId, requesterId, 'تُنهى جلساته');
  const result = openDatabase().prepare('DELETE FROM sessions WHERE account_id = ?').run(accountId);
  return Number(result.changes ?? 0);
}

/**
 * حارس أدوار.
 *
 * `owner` يمرّ دائماً: هو مالك النظام، ولا معنى لأن يُمنع من شاشةٍ فيه. أي حارس
 * آخر يُطابق الدور المطلوب نصّاً — لا نستعمل الرتبة للتصعيد العام، لأن بعض
 * الحراس يقصدون دوراً بعينه لا "هذا الدور فما فوق".
 */
export function requireRole(...allowed: AccountRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.account) return res.status(401).json({ error: "يلزم تسجيل الدخول.", code: "AUTH_REQUIRED" });
    /*
     * المسوّق لا يمرّ من أي حارس تشغيلي مهما كان الدور المطلوب. وحدُّه مسارات
     * لوحته وحدها، وهي تحرسه بحارسها الخاص.
     */
    if (isPartnerRole(req.account.role) && !allowed.includes("partner")) {
      return res.status(403).json({ error: "هذا السطح ليس للمسوّقين.", code: "PARTNER_SCOPE" });
    }
    if (!isOwnerRole(req.account.role) && !allowed.includes(req.account.role)) {
      return res.status(403).json({ error: "لا تملك صلاحية تنفيذ هذه العملية.", code: "FORBIDDEN" });
    }
    next();
  };
}

/**
 * حارس المالك — لإدارة الترخيص وحدها.
 *
 * ولا يمرّ منه زائر البيئة التجريبية رغم هويّته الاصطناعية: صندوقه في الذاكرة،
 * بينما جداول الفوترة في القاعدة الحقيقية. تمريره كان سيجعل أي زائر يُلغي اشتراك
 * المؤسسة أو يُصدر فواتير باسمها.
 */
export function requireOwner(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.account) return res.status(401).json({ error: "يلزم تسجيل الدخول.", code: "AUTH_REQUIRED" });
  if (req.account.id === "demo") {
    return res.status(403).json({ error: "إدارة الترخيص غير متاحة في البيئة التجريبية.", code: "DEMO_READONLY" });
  }
  if (!isOwnerRole(req.account.role)) {
    return res.status(403).json({ error: "هذه الشاشة لمالك المنصة وحده.", code: "OWNER_ONLY" });
  }
  next();
}

export const roleRank = (role: string | undefined) => ROLE_RANK[(role || "viewer") as AccountRole] ?? 0;

/**
 * حارس لوحة المسوّق.
 *
 * يمرّ منه المسوّق والمالك وحدهما: المسوّق ليرى لوحته، والمالك لأنه يملك النظام.
 * ولا يمرّ زائر البيئة التجريبية — صندوقه في الذاكرة بينما الدفتر التجاري في
 * القاعدة الحقيقية.
 */
export function requirePartnerOrOwner(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.account) return res.status(401).json({ error: "يلزم تسجيل الدخول.", code: "AUTH_REQUIRED" });
  if (req.account.id === "demo") {
    return res.status(403).json({ error: "دفتر المسوّقين غير متاح في البيئة التجريبية.", code: "DEMO_READONLY" });
  }
  if (!isPartnerRole(req.account.role) && !isOwnerRole(req.account.role)) {
    return res.status(403).json({ error: "هذه اللوحة للمسوّقين ومالك المنصة.", code: "PARTNER_ONLY" });
  }
  next();
}

/**
 * يضمن وجود مالك واحد على الأقل.
 *
 * ثلاث خطوات بترتيب مقصود:
 *   ١. مالكٌ موجود؟ لا شيء يُفعل — قرار قائم لا يُنقض عند كل إقلاع.
 *   ٢. `NAHJ_OWNER_EMAIL` يطابق حساباً؟ يُرقّى. هذه الطريقة الصريحة لمن ينشر.
 *   ٣. وإلا يُرقّى أقدم حساب — وهو حساب من هيّأ النظام، أي من نشره.
 *
 * بدون هذا لا يملك أحدٌ شاشة الترخيص إطلاقاً، وتبقى الفوترة بلا يد تديرها.
 */
export function ensureOwnerAccount(): Account | null {
  const db = openDatabase();
  const existing = db.prepare("SELECT id, email, name, role, status FROM accounts WHERE role = 'owner' LIMIT 1").get() as
    | { id: string; email: string; name: string; role: string; status: string } | undefined;
  if (existing) return { ...existing, role: "owner" as AccountRole };

  const declared = normalizeEmail(process.env.NAHJ_OWNER_EMAIL);
  const candidate = (declared
    ? db.prepare("SELECT id, email, name, status FROM accounts WHERE email = ? LIMIT 1").get(declared)
    : db.prepare("SELECT id, email, name, status FROM accounts ORDER BY created_at ASC LIMIT 1").get()) as
    | { id: string; email: string; name: string; status: string } | undefined;

  if (!candidate) {
    if (declared) console.log(`[NAHJ] NAHJ_OWNER_EMAIL=${declared} لا يطابق أي حساب بعد — سيُرقّى حين يُنشأ.`);
    return null;
  }

  db.prepare("UPDATE accounts SET role = 'owner', updated_at = ? WHERE id = ?").run(now(), candidate.id);
  console.log(`[NAHJ] مالك المنصة: ${candidate.email}${declared ? " (من NAHJ_OWNER_EMAIL)" : " (أقدم حساب)"}`);
  return { id: candidate.id, email: candidate.email, name: candidate.name, role: "owner", status: candidate.status };
}

export const authCookieNames = { session: SESSION_COOKIE, csrf: CSRF_COOKIE };
