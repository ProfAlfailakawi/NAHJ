import { randomUUID } from "node:crypto";
import { openDatabase } from "./persistence.ts";

/*
 * الاشتراك والفوترة — طبقة الترخيص.
 *
 * نهج يُباع للمؤسسات، ولم يكن في المنتج ما يقول متى بدأ اشتراك المؤسسة ومتى ينتهي،
 * ولا ما الباقة ولا ما الذي دُفع. ذلك ليس نقصاً في شاشة — هو نقص في المنتج نفسه:
 * منصة تُدير مفاتيح إيقاف وموافقات ومستويات استقلالية بلا حدٍّ يقول ما هو مشمول.
 *
 * ثلاث قواعد حكمت التصميم هنا:
 *
 *   ١. المال عدد صحيح. كل مبلغ يُخزَّن بالوحدة الصغرى (فلس للدينار الكويتي، وهو
 *      ثلاث منازل لا اثنتين). الكسور العشرية في المال تُنتج فروقاً لا يمكن تسويتها
 *      في فاتورة، ولا أحد يقبل فاتورة فيها 0.1 + 0.2.
 *
 *   ٢. الحالة تُشتق ولا تُخزَّن. `status` ليس عموداً يُحدَّث بمُجدوِل قد لا يعمل —
 *      بل دالةٌ من (تاريخ الانتهاء، الفواتير غير المسددة، مهلة السماح، الآن).
 *      خادمٌ توقّف أسبوعاً ثم عاد يُعطي الجواب الصحيح فوراً، ولا يوجد "اشتراك عالق
 *      على نشِط" لأن مهمة مجدولة فشلت بصمت.
 *
 *   ٣. لا انقطاع صامت. انتهاء الاشتراك يُجمّد الكتابة لا القراءة: المؤسسة تبقى
 *      ترى بياناتها وسجلّ تدقيقها وفواتيرها كاملة، ويتوقف التنفيذ والتعديل. حجب
 *      البيانات عمّن دفع مقابل جمعها ابتزاز لا سياسة تحصيل.
 */

/* ------------------------------------------------------------------ العملة */

/** المنازل العشرية لكل عملة. الدينار الكويتي ثلاث منازل — وهذا ما يكسر أغلب الأنظمة المستوردة. */
export const CURRENCY_MINOR_UNITS: Record<string, number> = {
  KWD: 3, BHD: 3, OMR: 3, JOD: 3, TND: 3,
  SAR: 2, AED: 2, QAR: 2, EGP: 2, USD: 2, EUR: 2, GBP: 2,
};

export const DEFAULT_CURRENCY = "KWD";

export const minorUnits = (currency: string) => CURRENCY_MINOR_UNITS[currency?.toUpperCase()] ?? 2;

/** يحوّل مبلغاً بالوحدة الصغرى إلى نصّ معروض. لا حساب يجري على هذا الناتج إطلاقاً. */
export function formatMoney(amountMinor: number, currency = DEFAULT_CURRENCY): string {
  const exponent = minorUnits(currency);
  const sign = amountMinor < 0 ? "-" : "";
  const absolute = Math.abs(Math.round(amountMinor));
  const divisor = 10 ** exponent;
  const whole = Math.floor(absolute / divisor);
  const fraction = String(absolute % divisor).padStart(exponent, "0");
  const grouped = whole.toLocaleString("en-US");
  return `${sign}${grouped}${exponent ? `.${fraction}` : ""} ${currency.toUpperCase()}`;
}

/* -------------------------------------------------------------- الأنواع */

export type BillingCycle = "monthly" | "quarterly" | "annual";

export type SubscriptionStatus =
  | "trialing"      // في فترة تجربة سارية
  | "active"        // مدفوع وسارٍ
  | "past_due"      // انتهت المدة وعليه مستحق، وما زال داخل مهلة السماح
  | "grace"         // انتهت المدة بلا تجديد، وما زال داخل مهلة السماح
  | "suspended"     // نفدت المهلة — الكتابة مجمّدة
  | "canceled"      // أُلغي بطلب المؤسسة ولم تنتهِ المدة بعد
  | "expired";      // انتهت المدة بعد إلغاء، أو أُنهي الترخيص

export type InvoiceStatus = "draft" | "issued" | "partially_paid" | "paid" | "overdue" | "void" | "refunded";

export type InvoiceKind = "subscription" | "setup" | "overage" | "adjustment" | "credit_note";

export type PaymentMethod = "bank_transfer" | "knet" | "card" | "cash" | "cheque" | "online" | "credit";

/** حدود الباقة. `null` تعني بلا حدّ. */
export interface PlanLimits {
  seats: number | null;
  skills: number | null;
  workItemsPerMonth: number | null;
  connectors: number | null;
  mcpServers: number | null;
  aiCallsPerMonth: number | null;
  /** أقصى مستوى استقلالية تسمح به الباقة (0..6). هذا ربطٌ مباشر بين التجارة والحوكمة. */
  maxAutonomyLevel: number;
  /** مدّة الاحتفاظ بسجلّ التدقيق بالأيام. */
  auditRetentionDays: number | null;
}

/** المزايا المفتوحة في الباقة. مفتاحٌ غير مذكور = مغلق. */
export interface PlanFeatures {
  teachMode?: boolean;
  shadowEngine?: boolean;
  processIntelligence?: boolean;
  mcp?: boolean;
  externalConnectors?: boolean;
  apiAccess?: boolean;
  sso?: boolean;
  customPolicies?: boolean;
  whiteLabel?: boolean;
  onPremise?: boolean;
  prioritySupport?: boolean;
  dedicatedSuccessManager?: boolean;
}

export interface Plan {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  taglineAr: string;
  taglineEn: string;
  currency: string;
  /** السعر بالوحدة الصغرى لكل دورة. */
  priceMonthly: number;
  priceQuarterly: number;
  priceAnnual: number;
  /** رسوم تأسيس تُحتسب مرة واحدة عند أول تفعيل. */
  setupFee: number;
  /** رسوم المقعد الإضافي فوق حدّ الباقة، لكل شهر. */
  extraSeatMonthly: number;
  limits: PlanLimits;
  features: PlanFeatures;
  isPublic: boolean;
  archived: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitAmount: number;
  amount: number;
}

export interface Invoice {
  id: string;
  number: string;
  kind: InvoiceKind;
  planCode: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  issuedAt: string;
  dueAt: string;
  currency: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  amountPaid: number;
  status: InvoiceStatus;
  lines: InvoiceLine[];
  notes: string;
}

export interface Payment {
  id: string;
  invoiceId: string | null;
  amount: number;
  currency: string;
  method: PaymentMethod;
  reference: string;
  paidAt: string;
  recordedBy: string;
  note: string;
}

export interface Subscription {
  id: string;
  planCode: string;
  cycle: BillingCycle;
  /** أول يوم في عمر الاشتراك — لا يتغيّر عند التجديد. هذا هو "بداية الاشتراك". */
  startedAt: string;
  currentPeriodStart: string;
  /** "نهاية الاشتراك" — نهاية الدورة الجارية. */
  currentPeriodEnd: string;
  trialEndsAt: string | null;
  autoRenew: boolean;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  /** أيام السماح بعد انتهاء المدة قبل تجميد الكتابة. */
  graceDays: number;
  /** خصم تعاقدي بالنقاط الأساسية (1200 = 12%). النقاط الأساسية تتجنّب كسور النسب. */
  discountBps: number;
  /** ضريبة/رسوم حكومية بالنقاط الأساسية. الكويت بلا ضريبة قيمة مضافة اليوم — والحقل جاهز ليومها. */
  taxBps: number;
  seatsPurchased: number;
  currency: string;
  /** ترخيص مُنهى نهائياً بقرار المالك — لا يُحيا بتجديد تلقائي. */
  terminated: boolean;
  notes: string;
  updatedAt: string;
}

export interface UsageSnapshot {
  seats: number;
  skills: number;
  workItemsThisPeriod: number;
  connectors: number;
  mcpServers: number;
  aiCallsThisPeriod: number;
}

/* ------------------------------------------------------------ أدوات الوقت */

const iso = (date: Date) => date.toISOString();
const nowIso = () => new Date().toISOString();

/**
 * يضيف شهوراً تقويمية مع تثبيت نهاية الشهر.
 *
 * اشتراك بدأ في 31 يناير يجب أن يُجدَّد في 28/29 فبراير لا في 2 أو 3 مارس. حساب
 * الشهر بثلاثين يوماً ينزلق تاريخ التجديد شهراً كاملاً خلال سنتين، ويُنتج فاتورة
 * لا يقبلها محاسب.
 */
export function addMonths(fromIso: string, months: number): string {
  const source = new Date(fromIso);
  const day = source.getUTCDate();
  const target = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1,
    source.getUTCHours(), source.getUTCMinutes(), source.getUTCSeconds(), source.getUTCMilliseconds()));
  const lastDayOfTargetMonth = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDayOfTargetMonth));
  return iso(target);
}

export function addDays(fromIso: string, days: number): string {
  const target = new Date(fromIso);
  target.setUTCDate(target.getUTCDate() + days);
  return iso(target);
}

export const cycleMonths = (cycle: BillingCycle) => (cycle === "annual" ? 12 : cycle === "quarterly" ? 3 : 1);

export function advancePeriod(fromIso: string, cycle: BillingCycle): string {
  return addMonths(fromIso, cycleMonths(cycle));
}

/** فرق الأيام، مُقرَّباً لأعلى: يومٌ متبقٍّ وساعتان هو "يومان" على الشاشة لا "يوم". */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.ceil((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000);
}

/* --------------------------------------------------------------- المخطّط */

let schemaReady = false;

export function ensureBillingSchema(): void {
  const db = openDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS billing_plans (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      tagline_ar TEXT NOT NULL DEFAULT '',
      tagline_en TEXT NOT NULL DEFAULT '',
      currency TEXT NOT NULL DEFAULT 'KWD',
      price_monthly INTEGER NOT NULL DEFAULT 0,
      price_quarterly INTEGER NOT NULL DEFAULT 0,
      price_annual INTEGER NOT NULL DEFAULT 0,
      setup_fee INTEGER NOT NULL DEFAULT 0,
      extra_seat_monthly INTEGER NOT NULL DEFAULT 0,
      limits TEXT NOT NULL,
      features TEXT NOT NULL,
      is_public INTEGER NOT NULL DEFAULT 1,
      archived INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS billing_subscription (
      id TEXT PRIMARY KEY,
      plan_code TEXT NOT NULL,
      cycle TEXT NOT NULL DEFAULT 'monthly',
      started_at TEXT NOT NULL,
      current_period_start TEXT NOT NULL,
      current_period_end TEXT NOT NULL,
      trial_ends_at TEXT,
      auto_renew INTEGER NOT NULL DEFAULT 1,
      cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
      canceled_at TEXT,
      grace_days INTEGER NOT NULL DEFAULT 7,
      discount_bps INTEGER NOT NULL DEFAULT 0,
      tax_bps INTEGER NOT NULL DEFAULT 0,
      seats_purchased INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'KWD',
      terminated INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS billing_invoices (
      id TEXT PRIMARY KEY,
      number TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL DEFAULT 'subscription',
      plan_code TEXT,
      period_start TEXT,
      period_end TEXT,
      issued_at TEXT NOT NULL,
      due_at TEXT NOT NULL,
      currency TEXT NOT NULL,
      subtotal INTEGER NOT NULL,
      discount INTEGER NOT NULL DEFAULT 0,
      tax INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL,
      amount_paid INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'issued',
      lines TEXT NOT NULL DEFAULT '[]',
      notes TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_invoices_issued ON billing_invoices(issued_at DESC);
    CREATE TABLE IF NOT EXISTS billing_payments (
      id TEXT PRIMARY KEY,
      invoice_id TEXT REFERENCES billing_invoices(id) ON DELETE SET NULL,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL,
      method TEXT NOT NULL,
      reference TEXT NOT NULL DEFAULT '',
      paid_at TEXT NOT NULL,
      recorded_by TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_payments_invoice ON billing_payments(invoice_id);
    CREATE TABLE IF NOT EXISTS billing_events (
      id TEXT PRIMARY KEY,
      at TEXT NOT NULL,
      type TEXT NOT NULL,
      actor TEXT NOT NULL DEFAULT 'system',
      summary TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_billing_events_at ON billing_events(at DESC);
    CREATE TABLE IF NOT EXISTS billing_usage (
      period_key TEXT NOT NULL,
      metric TEXT NOT NULL,
      value INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (period_key, metric)
    );
  `);
  schemaReady = true;
}

const db = () => {
  if (!schemaReady) ensureBillingSchema();
  return openDatabase();
};

/**
 * يُعاد ضبطه من الاختبارات عند تبديل ملف القاعدة.
 * بدونه تظل `schemaReady` صحيحة بينما القاعدة الجديدة بلا جداول.
 */
export function resetBillingSchemaCache(): void {
  schemaReady = false;
}

/* ------------------------------------------------------------ سجلّ الأحداث */

export interface BillingEvent {
  id: string;
  at: string;
  type: string;
  actor: string;
  summary: string;
  detail: Record<string, unknown>;
}

export function recordBillingEvent(type: string, summary: string, actor = "system", detail: Record<string, unknown> = {}): BillingEvent {
  const event: BillingEvent = { id: `bev_${randomUUID()}`, at: nowIso(), type, actor, summary, detail };
  db().prepare("INSERT INTO billing_events(id, at, type, actor, summary, detail) VALUES(?, ?, ?, ?, ?, ?)")
    .run(event.id, event.at, event.type, event.actor, event.summary, JSON.stringify(event.detail));
  return event;
}

export function listBillingEvents(limit = 100): BillingEvent[] {
  const rows = db().prepare("SELECT * FROM billing_events ORDER BY at DESC LIMIT ?").all(Math.min(Math.max(limit, 1), 500)) as Array<Record<string, unknown>>;
  return rows.map(row => ({
    id: String(row.id), at: String(row.at), type: String(row.type), actor: String(row.actor),
    summary: String(row.summary), detail: safeJson(String(row.detail), {}),
  }));
}

function safeJson<T>(raw: string, fallback: T): T {
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

/* ---------------------------------------------------------------- الباقات */

const DEFAULT_LIMITS: PlanLimits = {
  seats: 5, skills: 10, workItemsPerMonth: 500, connectors: 3, mcpServers: 2,
  aiCallsPerMonth: 5_000, maxAutonomyLevel: 3, auditRetentionDays: 90,
};

function planFromRow(row: Record<string, unknown>): Plan {
  return {
    id: String(row.id),
    code: String(row.code),
    nameAr: String(row.name_ar),
    nameEn: String(row.name_en),
    taglineAr: String(row.tagline_ar ?? ""),
    taglineEn: String(row.tagline_en ?? ""),
    currency: String(row.currency),
    priceMonthly: Number(row.price_monthly),
    priceQuarterly: Number(row.price_quarterly),
    priceAnnual: Number(row.price_annual),
    setupFee: Number(row.setup_fee),
    extraSeatMonthly: Number(row.extra_seat_monthly),
    limits: { ...DEFAULT_LIMITS, ...safeJson<Partial<PlanLimits>>(String(row.limits), {}) },
    features: safeJson<PlanFeatures>(String(row.features), {}),
    isPublic: Number(row.is_public) === 1,
    archived: Number(row.archived) === 1,
    sortOrder: Number(row.sort_order),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function listPlans(includeArchived = false): Plan[] {
  const sql = includeArchived
    ? "SELECT * FROM billing_plans ORDER BY sort_order ASC, price_monthly ASC"
    : "SELECT * FROM billing_plans WHERE archived = 0 ORDER BY sort_order ASC, price_monthly ASC";
  return (db().prepare(sql).all() as Array<Record<string, unknown>>).map(planFromRow);
}

export function getPlan(code: string): Plan | undefined {
  const row = db().prepare("SELECT * FROM billing_plans WHERE code = ? LIMIT 1").get(code) as Record<string, unknown> | undefined;
  return row ? planFromRow(row) : undefined;
}

export interface PlanInput {
  code: string;
  nameAr: string;
  nameEn?: string;
  taglineAr?: string;
  taglineEn?: string;
  currency?: string;
  priceMonthly?: number;
  priceQuarterly?: number;
  priceAnnual?: number;
  setupFee?: number;
  extraSeatMonthly?: number;
  limits?: Partial<PlanLimits>;
  features?: PlanFeatures;
  isPublic?: boolean;
  sortOrder?: number;
}

const CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{1,38}$/;

/** مبلغ بالوحدة الصغرى: عدد صحيح غير سالب. أي شيء آخر يُرفض بدل أن يُقرَّب بصمت. */
function assertMinorAmount(value: unknown, field: string): number {
  const amount = Number(value ?? 0);
  if (!Number.isInteger(amount) || amount < 0 || amount > 1e15) {
    throw Object.assign(new Error(`قيمة غير صالحة لـ${field} — تُكتب المبالغ بالوحدة الصغرى كعدد صحيح.`), { status: 400 });
  }
  return amount;
}

function assertBps(value: unknown, field: string): number {
  const bps = Number(value ?? 0);
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw Object.assign(new Error(`${field} يجب أن تكون بين 0 و10000 نقطة أساس.`), { status: 400 });
  }
  return bps;
}

function normalizeLimits(input: Partial<PlanLimits> | undefined): PlanLimits {
  const merged = { ...DEFAULT_LIMITS, ...(input || {}) };
  const limit = (value: number | null | undefined): number | null => {
    if (value === null || value === undefined || value === -1) return null;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0) throw Object.assign(new Error("حدود الباقة تُكتب أعداداً صحيحة، أو null لبلا حدّ."), { status: 400 });
    return n;
  };
  return {
    seats: limit(merged.seats),
    skills: limit(merged.skills),
    workItemsPerMonth: limit(merged.workItemsPerMonth),
    connectors: limit(merged.connectors),
    mcpServers: limit(merged.mcpServers),
    aiCallsPerMonth: limit(merged.aiCallsPerMonth),
    maxAutonomyLevel: Math.max(0, Math.min(6, Number(merged.maxAutonomyLevel ?? 3) || 0)),
    auditRetentionDays: limit(merged.auditRetentionDays),
  };
}

export function upsertPlan(input: PlanInput, actor = "system"): Plan {
  const code = String(input.code || "").trim().toLowerCase();
  if (!CODE_PATTERN.test(code)) {
    throw Object.assign(new Error("رمز الباقة يجب أن يكون حروفاً لاتينية صغيرة وأرقاماً (2–39 محرفاً)."), { status: 400 });
  }
  const nameAr = String(input.nameAr || "").trim();
  if (nameAr.length < 2 || nameAr.length > 120) throw Object.assign(new Error("اسم الباقة غير صالح."), { status: 400 });

  const currency = String(input.currency || DEFAULT_CURRENCY).toUpperCase();
  if (!CURRENCY_MINOR_UNITS[currency]) throw Object.assign(new Error(`عملة غير مدعومة: ${currency}`), { status: 400 });

  const existing = getPlan(code);
  const timestamp = nowIso();
  const plan: Plan = {
    id: existing?.id || `plan_${randomUUID()}`,
    code,
    nameAr,
    nameEn: String(input.nameEn || existing?.nameEn || nameAr).trim(),
    taglineAr: String(input.taglineAr ?? existing?.taglineAr ?? "").trim().slice(0, 240),
    taglineEn: String(input.taglineEn ?? existing?.taglineEn ?? "").trim().slice(0, 240),
    currency,
    priceMonthly: assertMinorAmount(input.priceMonthly ?? existing?.priceMonthly ?? 0, "السعر الشهري"),
    priceQuarterly: assertMinorAmount(input.priceQuarterly ?? existing?.priceQuarterly ?? 0, "السعر الربعي"),
    priceAnnual: assertMinorAmount(input.priceAnnual ?? existing?.priceAnnual ?? 0, "السعر السنوي"),
    setupFee: assertMinorAmount(input.setupFee ?? existing?.setupFee ?? 0, "رسوم التأسيس"),
    extraSeatMonthly: assertMinorAmount(input.extraSeatMonthly ?? existing?.extraSeatMonthly ?? 0, "سعر المقعد الإضافي"),
    limits: normalizeLimits({ ...(existing?.limits || {}), ...(input.limits || {}) }),
    features: { ...(existing?.features || {}), ...(input.features || {}) },
    isPublic: input.isPublic ?? existing?.isPublic ?? true,
    archived: existing?.archived ?? false,
    sortOrder: Number.isInteger(input.sortOrder) ? Number(input.sortOrder) : existing?.sortOrder ?? 100,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  };

  db().prepare(
    `INSERT INTO billing_plans(id, code, name_ar, name_en, tagline_ar, tagline_en, currency,
       price_monthly, price_quarterly, price_annual, setup_fee, extra_seat_monthly,
       limits, features, is_public, archived, sort_order, created_at, updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(code) DO UPDATE SET
       name_ar=excluded.name_ar, name_en=excluded.name_en,
       tagline_ar=excluded.tagline_ar, tagline_en=excluded.tagline_en, currency=excluded.currency,
       price_monthly=excluded.price_monthly, price_quarterly=excluded.price_quarterly,
       price_annual=excluded.price_annual, setup_fee=excluded.setup_fee,
       extra_seat_monthly=excluded.extra_seat_monthly, limits=excluded.limits, features=excluded.features,
       is_public=excluded.is_public, sort_order=excluded.sort_order, updated_at=excluded.updated_at`
  ).run(
    plan.id, plan.code, plan.nameAr, plan.nameEn, plan.taglineAr, plan.taglineEn, plan.currency,
    plan.priceMonthly, plan.priceQuarterly, plan.priceAnnual, plan.setupFee, plan.extraSeatMonthly,
    JSON.stringify(plan.limits), JSON.stringify(plan.features),
    plan.isPublic ? 1 : 0, plan.archived ? 1 : 0, plan.sortOrder, plan.createdAt, plan.updatedAt,
  );

  recordBillingEvent(existing ? "plan.updated" : "plan.created", `الباقة «${plan.nameAr}»`, actor, { code: plan.code });
  return getPlan(code)!;
}

/**
 * أرشفة باقة بدل حذفها.
 *
 * الحذف يكسر كل فاتورة صادرة تشير إليها، ويجعل تاريخ التسعير غير قابل للتفسير بعد
 * سنة. والباقة التي عليها اشتراك قائم لا تُؤرشف إطلاقاً.
 */
export function archivePlan(code: string, actor = "system"): Plan {
  const plan = getPlan(code);
  if (!plan) throw Object.assign(new Error("الباقة غير موجودة."), { status: 404 });
  const subscription = getSubscription();
  if (subscription && subscription.planCode === code && !subscription.terminated) {
    throw Object.assign(new Error("لا يمكن أرشفة باقة عليها اشتراك قائم — انقل الاشتراك إلى باقة أخرى أولاً."), { status: 409 });
  }
  db().prepare("UPDATE billing_plans SET archived = 1, is_public = 0, updated_at = ? WHERE code = ?").run(nowIso(), code);
  recordBillingEvent("plan.archived", `أُرشفت الباقة «${plan.nameAr}»`, actor, { code });
  return getPlan(code)!;
}

export function restorePlan(code: string, actor = "system"): Plan {
  if (!getPlan(code)) throw Object.assign(new Error("الباقة غير موجودة."), { status: 404 });
  db().prepare("UPDATE billing_plans SET archived = 0, updated_at = ? WHERE code = ?").run(nowIso(), code);
  recordBillingEvent("plan.restored", `أُعيدت الباقة ${code}`, actor, { code });
  return getPlan(code)!;
}

/* ------------------------------------------------------ كتالوج الباقات الافتراضي */

/*
 * أسعار بالفلس الكويتي (1 د.ك = 1000 فلس). هذه نقطة بداية للمالك يعدّلها من
 * شاشته — وليست التزاماً تجارياً مكتوباً في الشيفرة.
 */
const SEED_PLANS: PlanInput[] = [
  {
    code: "trial", nameAr: "تجربة", nameEn: "Trial",
    taglineAr: "ثلاثون يوماً لتُثبت المنصة نفسها على عملك أنت.",
    taglineEn: "Thirty days to prove itself on your own work.",
    priceMonthly: 0, priceQuarterly: 0, priceAnnual: 0, setupFee: 0, sortOrder: 5, isPublic: false,
    limits: { seats: 3, skills: 3, workItemsPerMonth: 100, connectors: 2, mcpServers: 1, aiCallsPerMonth: 1_000, maxAutonomyLevel: 2, auditRetentionDays: 30 },
    features: { teachMode: true, processIntelligence: true },
  },
  {
    code: "starter", nameAr: "بداية", nameEn: "Starter",
    taglineAr: "قسم واحد يبدأ بتوثيق ما يعرفه، لا بأتمتة ما لا يعرفه.",
    taglineEn: "One department, codifying what it knows before automating anything.",
    priceMonthly: 149_000, priceQuarterly: 425_000, priceAnnual: 1_490_000, setupFee: 250_000,
    extraSeatMonthly: 12_000, sortOrder: 10,
    limits: { seats: 10, skills: 15, workItemsPerMonth: 1_000, connectors: 4, mcpServers: 2, aiCallsPerMonth: 20_000, maxAutonomyLevel: 3, auditRetentionDays: 180 },
    features: { teachMode: true, processIntelligence: true, shadowEngine: true },
  },
  {
    code: "growth", nameAr: "نمو", nameEn: "Growth",
    taglineAr: "عدة أقسام، وربطٌ حقيقي بالأنظمة، واستقلاليةٌ تُكتسب بالقياس.",
    taglineEn: "Several departments, real system connections, autonomy earned by measurement.",
    priceMonthly: 395_000, priceQuarterly: 1_125_000, priceAnnual: 3_950_000, setupFee: 500_000,
    extraSeatMonthly: 10_000, sortOrder: 20,
    limits: { seats: 40, skills: 80, workItemsPerMonth: 10_000, connectors: 15, mcpServers: 8, aiCallsPerMonth: 200_000, maxAutonomyLevel: 5, auditRetentionDays: 730 },
    features: { teachMode: true, processIntelligence: true, shadowEngine: true, mcp: true, externalConnectors: true, apiAccess: true, customPolicies: true, prioritySupport: true },
  },
  {
    code: "enterprise", nameAr: "مؤسسي", nameEn: "Enterprise",
    taglineAr: "بلا سقف تشغيلي، مع حوكمة ودخول موحّد ومدير نجاح مخصّص.",
    taglineEn: "No operational ceiling, with governance, SSO and a dedicated success manager.",
    priceMonthly: 950_000, priceQuarterly: 2_700_000, priceAnnual: 9_500_000, setupFee: 1_500_000,
    extraSeatMonthly: 8_000, sortOrder: 30,
    limits: { seats: null, skills: null, workItemsPerMonth: null, connectors: null, mcpServers: null, aiCallsPerMonth: null, maxAutonomyLevel: 6, auditRetentionDays: null },
    features: { teachMode: true, processIntelligence: true, shadowEngine: true, mcp: true, externalConnectors: true, apiAccess: true, sso: true, customPolicies: true, prioritySupport: true, dedicatedSuccessManager: true },
  },
  {
    code: "sovereign", nameAr: "سيادي", nameEn: "Sovereign",
    taglineAr: "نشرٌ داخل بنية المؤسسة، بعلامتها، ولا تخرج بيانة واحدة.",
    taglineEn: "Deployed inside the institution's own infrastructure, under its brand.",
    priceMonthly: 0, priceQuarterly: 0, priceAnnual: 24_000_000, setupFee: 5_000_000, sortOrder: 40,
    limits: { seats: null, skills: null, workItemsPerMonth: null, connectors: null, mcpServers: null, aiCallsPerMonth: null, maxAutonomyLevel: 6, auditRetentionDays: null },
    features: { teachMode: true, processIntelligence: true, shadowEngine: true, mcp: true, externalConnectors: true, apiAccess: true, sso: true, customPolicies: true, whiteLabel: true, onPremise: true, prioritySupport: true, dedicatedSuccessManager: true },
  },
];

/* ------------------------------------------------------------- الاشتراك */

const SUBSCRIPTION_ID = "current";

function subscriptionFromRow(row: Record<string, unknown>): Subscription {
  return {
    id: String(row.id),
    planCode: String(row.plan_code),
    cycle: String(row.cycle) as BillingCycle,
    startedAt: String(row.started_at),
    currentPeriodStart: String(row.current_period_start),
    currentPeriodEnd: String(row.current_period_end),
    trialEndsAt: row.trial_ends_at ? String(row.trial_ends_at) : null,
    autoRenew: Number(row.auto_renew) === 1,
    cancelAtPeriodEnd: Number(row.cancel_at_period_end) === 1,
    canceledAt: row.canceled_at ? String(row.canceled_at) : null,
    graceDays: Number(row.grace_days),
    discountBps: Number(row.discount_bps),
    taxBps: Number(row.tax_bps),
    seatsPurchased: Number(row.seats_purchased),
    currency: String(row.currency),
    terminated: Number(row.terminated) === 1,
    notes: String(row.notes ?? ""),
    updatedAt: String(row.updated_at),
  };
}

export function getSubscription(): Subscription | undefined {
  const row = db().prepare("SELECT * FROM billing_subscription WHERE id = ? LIMIT 1").get(SUBSCRIPTION_ID) as Record<string, unknown> | undefined;
  return row ? subscriptionFromRow(row) : undefined;
}

function writeSubscription(subscription: Subscription): Subscription {
  db().prepare(
    `INSERT INTO billing_subscription(id, plan_code, cycle, started_at, current_period_start, current_period_end,
       trial_ends_at, auto_renew, cancel_at_period_end, canceled_at, grace_days, discount_bps, tax_bps,
       seats_purchased, currency, terminated, notes, updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       plan_code=excluded.plan_code, cycle=excluded.cycle, started_at=excluded.started_at,
       current_period_start=excluded.current_period_start, current_period_end=excluded.current_period_end,
       trial_ends_at=excluded.trial_ends_at, auto_renew=excluded.auto_renew,
       cancel_at_period_end=excluded.cancel_at_period_end, canceled_at=excluded.canceled_at,
       grace_days=excluded.grace_days, discount_bps=excluded.discount_bps, tax_bps=excluded.tax_bps,
       seats_purchased=excluded.seats_purchased, currency=excluded.currency, terminated=excluded.terminated,
       notes=excluded.notes, updated_at=excluded.updated_at`
  ).run(
    SUBSCRIPTION_ID, subscription.planCode, subscription.cycle, subscription.startedAt,
    subscription.currentPeriodStart, subscription.currentPeriodEnd, subscription.trialEndsAt,
    subscription.autoRenew ? 1 : 0, subscription.cancelAtPeriodEnd ? 1 : 0, subscription.canceledAt,
    subscription.graceDays, subscription.discountBps, subscription.taxBps, subscription.seatsPurchased,
    subscription.currency, subscription.terminated ? 1 : 0, subscription.notes, nowIso(),
  );
  return getSubscription()!;
}

/* ------------------------------------------------------------- الفواتير */

function invoiceFromRow(row: Record<string, unknown>): Invoice {
  return {
    id: String(row.id),
    number: String(row.number),
    kind: String(row.kind) as InvoiceKind,
    planCode: row.plan_code ? String(row.plan_code) : null,
    periodStart: row.period_start ? String(row.period_start) : null,
    periodEnd: row.period_end ? String(row.period_end) : null,
    issuedAt: String(row.issued_at),
    dueAt: String(row.due_at),
    currency: String(row.currency),
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    tax: Number(row.tax),
    total: Number(row.total),
    amountPaid: Number(row.amount_paid),
    status: String(row.status) as InvoiceStatus,
    lines: safeJson<InvoiceLine[]>(String(row.lines), []),
    notes: String(row.notes ?? ""),
  };
}

export function listInvoices(limit = 60): Invoice[] {
  const rows = db().prepare("SELECT * FROM billing_invoices ORDER BY issued_at DESC, number DESC LIMIT ?")
    .all(Math.min(Math.max(limit, 1), 500)) as Array<Record<string, unknown>>;
  return rows.map(invoiceFromRow);
}

export function getInvoice(id: string): Invoice | undefined {
  const row = db().prepare("SELECT * FROM billing_invoices WHERE id = ? LIMIT 1").get(id) as Record<string, unknown> | undefined;
  return row ? invoiceFromRow(row) : undefined;
}

/**
 * رقم فاتورة متسلسل لكل سنة: NAHJ-2026-0001.
 *
 * يُشتق من أعلى رقم قائم لا من عدّاد منفصل، فلا ينزلق التسلسل عند حذف صفّ أو
 * استعادة نسخة احتياطية — والرقم المتسلسل غير المنقطع مطلبٌ محاسبي لا تجميل.
 */
function nextInvoiceNumber(issuedAt: string): string {
  const year = new Date(issuedAt).getUTCFullYear();
  const prefix = `NAHJ-${year}-`;
  const row = db().prepare("SELECT number FROM billing_invoices WHERE number LIKE ? ORDER BY number DESC LIMIT 1")
    .get(`${prefix}%`) as { number?: string } | undefined;
  const last = row?.number ? Number(row.number.slice(prefix.length)) : 0;
  return `${prefix}${String((Number.isFinite(last) ? last : 0) + 1).padStart(4, "0")}`;
}

export interface IssueInvoiceInput {
  kind?: InvoiceKind;
  planCode?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  currency?: string;
  lines: InvoiceLine[];
  discountBps?: number;
  taxBps?: number;
  dueInDays?: number;
  notes?: string;
  issuedAt?: string;
}

/**
 * يُصدر فاتورة.
 *
 * الخصم يُحسب على المجموع الفرعي، والضريبة على ما بعد الخصم — وهذا هو الترتيب
 * المحاسبي المعتاد؛ عكسه يُنتج ضريبةً على مبلغ لم يُحصَّل.
 */
export function issueInvoice(input: IssueInvoiceInput, actor = "system"): Invoice {
  const lines = (input.lines || []).map(line => ({
    description: String(line.description || "").slice(0, 240),
    quantity: Number(line.quantity ?? 1),
    unitAmount: assertMinorAmount(line.unitAmount, "سعر الوحدة"),
    amount: assertMinorAmount(Math.round(Number(line.quantity ?? 1) * Number(line.unitAmount ?? 0)), "قيمة السطر"),
  }));
  if (!lines.length) throw Object.assign(new Error("لا يمكن إصدار فاتورة بلا بنود."), { status: 400 });

  const currency = String(input.currency || getSubscription()?.currency || DEFAULT_CURRENCY).toUpperCase();
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
  const discountBps = assertBps(input.discountBps ?? 0, "الخصم");
  const taxBps = assertBps(input.taxBps ?? 0, "الضريبة");
  const discount = Math.round((subtotal * discountBps) / 10_000);
  const tax = Math.round(((subtotal - discount) * taxBps) / 10_000);
  const total = subtotal - discount + tax;

  const issuedAt = input.issuedAt || nowIso();
  const invoice: Invoice = {
    id: `inv_${randomUUID()}`,
    number: nextInvoiceNumber(issuedAt),
    kind: (input.kind || "subscription") as InvoiceKind,
    planCode: input.planCode ?? null,
    periodStart: input.periodStart ?? null,
    periodEnd: input.periodEnd ?? null,
    issuedAt,
    dueAt: addDays(issuedAt, Number.isInteger(input.dueInDays) ? Number(input.dueInDays) : 14),
    currency,
    subtotal, discount, tax, total,
    amountPaid: 0,
    // فاتورة بصفر (تجربة أو باقة مجانية) مسدّدة لحظة صدورها — وإلا علّقت الاشتراك بلا سبب.
    status: total === 0 ? "paid" : "issued",
    lines,
    notes: String(input.notes || "").slice(0, 1_000),
  };

  db().prepare(
    `INSERT INTO billing_invoices(id, number, kind, plan_code, period_start, period_end, issued_at, due_at,
       currency, subtotal, discount, tax, total, amount_paid, status, lines, notes)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    invoice.id, invoice.number, invoice.kind, invoice.planCode, invoice.periodStart, invoice.periodEnd,
    invoice.issuedAt, invoice.dueAt, invoice.currency, invoice.subtotal, invoice.discount, invoice.tax,
    invoice.total, invoice.amountPaid, invoice.status, JSON.stringify(invoice.lines), invoice.notes,
  );

  recordBillingEvent("invoice.issued", `فاتورة ${invoice.number} بقيمة ${formatMoney(invoice.total, currency)}`, actor, {
    invoiceId: invoice.id, number: invoice.number, total: invoice.total, currency,
  });
  return invoice;
}

export function voidInvoice(invoiceId: string, actor = "system"): Invoice {
  const invoice = getInvoice(invoiceId);
  if (!invoice) throw Object.assign(new Error("الفاتورة غير موجودة."), { status: 404 });
  if (invoice.amountPaid > 0) {
    throw Object.assign(new Error("فاتورة عليها دفعات لا تُلغى — أصدر إشعاراً دائناً بدلاً من ذلك."), { status: 409 });
  }
  db().prepare("UPDATE billing_invoices SET status = 'void' WHERE id = ?").run(invoiceId);
  recordBillingEvent("invoice.void", `أُلغيت الفاتورة ${invoice.number}`, actor, { invoiceId });
  return getInvoice(invoiceId)!;
}

/* -------------------------------------------------------------- الدفعات */

export interface RecordPaymentInput {
  invoiceId?: string | null;
  amount: number;
  currency?: string;
  method?: PaymentMethod;
  reference?: string;
  paidAt?: string;
  note?: string;
}

/**
 * تسجيل دفعة.
 *
 * نهج لا يستضيف صفحة دفعٍ ولا يلمس بطاقة: صفحة الدفع عند المزوّد، وما يُسجَّل
 * هنا هو *إثبات* الدفع بمرجعه. ويصل هذا الإثبات من طريقين — يد المالك بعد تحويلٍ
 * بنكي أو شيك، أو `settleIntent` في `payments.ts` بعد أن يؤكّد المزوّد التحصيل
 * (لا بعد أن يزعمه إشعار). والمسار واحد في الحالتين عمداً: دفترٌ واحد لا دفتران.
 */
export function recordPayment(input: RecordPaymentInput, actor = "system"): { payment: Payment; invoice: Invoice | null } {
  const amount = assertMinorAmount(input.amount, "قيمة الدفعة");
  if (amount === 0) throw Object.assign(new Error("لا تُسجَّل دفعة بصفر."), { status: 400 });

  const invoice = input.invoiceId ? getInvoice(String(input.invoiceId)) : undefined;
  if (input.invoiceId && !invoice) throw Object.assign(new Error("الفاتورة غير موجودة."), { status: 404 });
  if (invoice && invoice.status === "void") throw Object.assign(new Error("لا تُسدَّد فاتورة ملغاة."), { status: 409 });

  const currency = String(input.currency || invoice?.currency || getSubscription()?.currency || DEFAULT_CURRENCY).toUpperCase();
  if (invoice && currency !== invoice.currency) {
    throw Object.assign(new Error(`عملة الدفعة (${currency}) تخالف عملة الفاتورة (${invoice.currency}).`), { status: 400 });
  }
  if (invoice && invoice.amountPaid + amount > invoice.total) {
    throw Object.assign(new Error(`الدفعة تتجاوز المتبقّي على الفاتورة (${formatMoney(invoice.total - invoice.amountPaid, invoice.currency)}).`), { status: 400 });
  }

  const payment: Payment = {
    id: `pay_${randomUUID()}`,
    invoiceId: invoice?.id ?? null,
    amount,
    currency,
    method: (input.method || "bank_transfer") as PaymentMethod,
    reference: String(input.reference || "").slice(0, 120),
    paidAt: input.paidAt || nowIso(),
    recordedBy: actor,
    note: String(input.note || "").slice(0, 500),
  };

  const connection = db();
  connection.prepare(
    "INSERT INTO billing_payments(id, invoice_id, amount, currency, method, reference, paid_at, recorded_by, note) VALUES(?,?,?,?,?,?,?,?,?)"
  ).run(payment.id, payment.invoiceId, payment.amount, payment.currency, payment.method, payment.reference, payment.paidAt, payment.recordedBy, payment.note);

  let updated: Invoice | null = null;
  if (invoice) {
    const amountPaid = invoice.amountPaid + amount;
    const status: InvoiceStatus = amountPaid >= invoice.total ? "paid" : "partially_paid";
    connection.prepare("UPDATE billing_invoices SET amount_paid = ?, status = ? WHERE id = ?").run(amountPaid, status, invoice.id);
    updated = getInvoice(invoice.id)!;
  }

  recordBillingEvent("payment.recorded", `دفعة ${formatMoney(amount, currency)}${invoice ? ` على ${invoice.number}` : ""}`, actor, {
    paymentId: payment.id, invoiceId: payment.invoiceId, amount, method: payment.method, reference: payment.reference,
  });
  return { payment, invoice: updated };
}

export function listPayments(limit = 60): Payment[] {
  const rows = db().prepare("SELECT * FROM billing_payments ORDER BY paid_at DESC LIMIT ?")
    .all(Math.min(Math.max(limit, 1), 500)) as Array<Record<string, unknown>>;
  return rows.map(row => ({
    id: String(row.id),
    invoiceId: row.invoice_id ? String(row.invoice_id) : null,
    amount: Number(row.amount),
    currency: String(row.currency),
    method: String(row.method) as PaymentMethod,
    reference: String(row.reference ?? ""),
    paidAt: String(row.paid_at),
    recordedBy: String(row.recorded_by ?? ""),
    note: String(row.note ?? ""),
  }));
}

/** ما لم يُسدَّد بعد من فواتير غير ملغاة. */
export function outstandingBalance(): { amount: number; currency: string; invoices: Invoice[] } {
  const currency = getSubscription()?.currency || DEFAULT_CURRENCY;
  const invoices = listInvoices(500).filter(invoice =>
    invoice.status !== "void" && invoice.status !== "refunded" && invoice.amountPaid < invoice.total);
  return { amount: invoices.reduce((sum, invoice) => sum + (invoice.total - invoice.amountPaid), 0), currency, invoices };
}

/* --------------------------------------------------- دورة حياة الاشتراك */

export function priceFor(plan: Plan, cycle: BillingCycle): number {
  return cycle === "annual" ? plan.priceAnnual : cycle === "quarterly" ? plan.priceQuarterly : plan.priceMonthly;
}

const cycleLabel = (cycle: BillingCycle) => (cycle === "annual" ? "سنوي" : cycle === "quarterly" ? "ربع سنوي" : "شهري");

export interface StartSubscriptionInput {
  planCode: string;
  cycle?: BillingCycle;
  startedAt?: string;
  trialDays?: number;
  autoRenew?: boolean;
  graceDays?: number;
  discountBps?: number;
  taxBps?: number;
  seats?: number;
  notes?: string;
  /** أصدِر فاتورة الدورة الأولى (ورسوم التأسيس إن وُجدت) فوراً. */
  issueInvoice?: boolean;
}

/**
 * يبدأ اشتراكاً جديداً — أو يستبدل القائم بالكامل.
 *
 * يُستعمل عند البيع الأول وعند إعادة التعاقد بعد انقطاع. تغيير الباقة لاشتراك
 * سارٍ يمرّ من `changePlan` لا من هنا، لأن ذاك يحتاج تناسباً زمنياً.
 */
export function startSubscription(input: StartSubscriptionInput, actor = "system"): Subscription {
  const plan = getPlan(String(input.planCode));
  if (!plan) throw Object.assign(new Error("الباقة غير موجودة."), { status: 404 });
  if (plan.archived) throw Object.assign(new Error("لا يبدأ اشتراك على باقة مؤرشفة."), { status: 409 });

  const cycle = (["monthly", "quarterly", "annual"].includes(String(input.cycle)) ? input.cycle : "monthly") as BillingCycle;
  const startedAt = input.startedAt || nowIso();
  const trialDays = Math.max(0, Math.min(365, Number(input.trialDays ?? 0) || 0));
  const trialEndsAt = trialDays > 0 ? addDays(startedAt, trialDays) : null;
  // فترة التجربة هي الدورة الأولى: الفوترة تبدأ بعدها لا معها.
  const currentPeriodEnd = trialEndsAt || advancePeriod(startedAt, cycle);

  const subscription = writeSubscription({
    id: SUBSCRIPTION_ID,
    planCode: plan.code,
    cycle,
    startedAt,
    currentPeriodStart: startedAt,
    currentPeriodEnd,
    trialEndsAt,
    autoRenew: input.autoRenew ?? true,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    graceDays: Math.max(0, Math.min(90, Number(input.graceDays ?? 7) || 0)),
    discountBps: assertBps(input.discountBps ?? 0, "الخصم"),
    taxBps: assertBps(input.taxBps ?? 0, "الضريبة"),
    seatsPurchased: Math.max(0, Number(input.seats ?? plan.limits.seats ?? 0) || 0),
    currency: plan.currency,
    terminated: false,
    notes: String(input.notes || "").slice(0, 1_000),
    updatedAt: nowIso(),
  });

  recordBillingEvent("subscription.started",
    `بدأ اشتراك «${plan.nameAr}» (${cycleLabel(cycle)})${trialDays ? ` بتجربة ${trialDays} يوماً` : ""}`, actor,
    { planCode: plan.code, cycle, startedAt, currentPeriodEnd, trialDays });

  if (input.issueInvoice !== false && !trialEndsAt) {
    const lines: InvoiceLine[] = [];
    if (plan.setupFee > 0) lines.push({ description: `رسوم تأسيس — ${plan.nameAr}`, quantity: 1, unitAmount: plan.setupFee, amount: plan.setupFee });
    const price = priceFor(plan, cycle);
    lines.push({ description: `اشتراك ${plan.nameAr} — ${cycleLabel(cycle)}`, quantity: 1, unitAmount: price, amount: price });
    issueInvoice({
      kind: "subscription", planCode: plan.code, currency: plan.currency,
      periodStart: startedAt, periodEnd: currentPeriodEnd, lines,
      discountBps: subscription.discountBps, taxBps: subscription.taxBps,
    }, actor);
  }

  return getSubscription()!;
}

/** حقول يملك المالك تعديلها مباشرة على اشتراك قائم. */
export interface AmendSubscriptionInput {
  cycle?: BillingCycle;
  currentPeriodEnd?: string;
  autoRenew?: boolean;
  graceDays?: number;
  discountBps?: number;
  taxBps?: number;
  seats?: number;
  notes?: string;
  trialEndsAt?: string | null;
}

export function amendSubscription(input: AmendSubscriptionInput, actor = "system"): Subscription {
  const current = requireSubscription();
  const next: Subscription = { ...current };

  if (input.cycle && ["monthly", "quarterly", "annual"].includes(input.cycle)) next.cycle = input.cycle;
  if (input.currentPeriodEnd) {
    const end = new Date(input.currentPeriodEnd);
    if (Number.isNaN(end.getTime())) throw Object.assign(new Error("تاريخ نهاية غير صالح."), { status: 400 });
    if (end.toISOString() <= current.currentPeriodStart) {
      throw Object.assign(new Error("نهاية الدورة يجب أن تكون بعد بدايتها."), { status: 400 });
    }
    next.currentPeriodEnd = end.toISOString();
  }
  if (typeof input.autoRenew === "boolean") next.autoRenew = input.autoRenew;
  if (input.graceDays !== undefined) next.graceDays = Math.max(0, Math.min(90, Number(input.graceDays) || 0));
  if (input.discountBps !== undefined) next.discountBps = assertBps(input.discountBps, "الخصم");
  if (input.taxBps !== undefined) next.taxBps = assertBps(input.taxBps, "الضريبة");
  if (input.seats !== undefined) next.seatsPurchased = Math.max(0, Math.min(100_000, Number(input.seats) || 0));
  if (input.notes !== undefined) next.notes = String(input.notes).slice(0, 1_000);
  if (input.trialEndsAt !== undefined) next.trialEndsAt = input.trialEndsAt ? new Date(input.trialEndsAt).toISOString() : null;

  const saved = writeSubscription(next);
  recordBillingEvent("subscription.amended", "عُدّلت شروط الاشتراك", actor, { changes: input });
  return saved;
}

export interface ExtendInput { days?: number; months?: number; reason?: string }

/**
 * يمدّد نهاية الدورة الجارية بلا فاتورة.
 *
 * هذا ما يُستعمل فعلاً عند تعويض انقطاع خدمة أو تسوية تجارية — وبدونه يضطر المالك
 * إلى تعديل تاريخ في قاعدة البيانات يدوياً بلا أثر يشرح لماذا.
 */
export function extendSubscription(input: ExtendInput, actor = "system"): Subscription {
  const current = requireSubscription();
  const days = Math.max(0, Math.min(3_650, Number(input.days ?? 0) || 0));
  const months = Math.max(0, Math.min(120, Number(input.months ?? 0) || 0));
  if (!days && !months) throw Object.assign(new Error("حدّد أياماً أو شهوراً للتمديد."), { status: 400 });

  /*
   * التمديد ينطلق من اليوم لا من نهايةٍ مضت: اشتراك انتهى قبل شهرين ومُدّد "ثلاثين
   * يوماً" يجب أن يمنح ثلاثين يوماً قادمة، لا أن ينتهي قبل أمس.
   */
  const base = current.currentPeriodEnd > nowIso() ? current.currentPeriodEnd : nowIso();
  let end = base;
  if (months) end = addMonths(end, months);
  if (days) end = addDays(end, days);

  const saved = writeSubscription({ ...current, currentPeriodEnd: end, terminated: false });
  recordBillingEvent("subscription.extended",
    `مُدِّد الاشتراك إلى ${end.slice(0, 10)}${input.reason ? ` — ${input.reason}` : ""}`, actor,
    { from: current.currentPeriodEnd, to: end, days, months, reason: input.reason || "" });
  return saved;
}

/**
 * يجدّد دورة واحدة ويُصدر فاتورتها.
 *
 * يُستدعى يدوياً من شاشة المالك، وتلقائياً من `runBillingCycle` عند انقضاء المدة مع
 * تفعيل التجديد التلقائي. الدالة واحدة في الحالتين عمداً: مسارٌ تلقائي لا يمرّ بما
 * يمرّ به اليدوي هو مسارٌ لا يُختبر.
 */
export function renewSubscription(actor = "system", options: { issueInvoice?: boolean } = {}): { subscription: Subscription; invoice: Invoice | null } {
  const current = requireSubscription();
  const plan = getPlan(current.planCode);
  if (!plan) throw Object.assign(new Error("باقة الاشتراك غير موجودة."), { status: 409 });

  /*
   * التجديد ينطلق من نهاية الدورة السابقة ما دامت قريبة، فلا تضيع أيام على المؤسسة.
   * لكن اشتراكاً مضى على انتهائه أكثر من دورة كاملة يُجدَّد من اليوم: وإلا أصدرنا
   * فاتورة عن شهور لم تُقدَّم فيها خدمة.
   */
  const staleThreshold = advancePeriod(current.currentPeriodEnd, current.cycle);
  const periodStart = staleThreshold < nowIso() ? nowIso() : current.currentPeriodEnd;
  const periodEnd = advancePeriod(periodStart, current.cycle);

  const saved = writeSubscription({
    ...current,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    trialEndsAt: null, // التجديد ينهي التجربة بحكم التعريف
    cancelAtPeriodEnd: false,
    canceledAt: null,
    terminated: false,
  });

  let invoice: Invoice | null = null;
  if (options.issueInvoice !== false) {
    const price = priceFor(plan, current.cycle);
    const lines: InvoiceLine[] = [{
      description: `تجديد ${plan.nameAr} — ${cycleLabel(current.cycle)}`,
      quantity: 1, unitAmount: price, amount: price,
    }];

    // مقاعد فوق حدّ الباقة تُفوتر بسعر المقعد الإضافي، مضروباً بعدد شهور الدورة.
    const includedSeats = plan.limits.seats;
    if (includedSeats !== null && current.seatsPurchased > includedSeats && plan.extraSeatMonthly > 0) {
      const extra = current.seatsPurchased - includedSeats;
      const unit = plan.extraSeatMonthly * cycleMonths(current.cycle);
      lines.push({ description: `${extra} مقعد إضافي — ${cycleLabel(current.cycle)}`, quantity: extra, unitAmount: unit, amount: extra * unit });
    }

    invoice = issueInvoice({
      kind: "subscription", planCode: plan.code, currency: current.currency,
      periodStart, periodEnd, lines, discountBps: current.discountBps, taxBps: current.taxBps,
    }, actor);

    /*
     * الرصيد يُستهلك هنا.
     *
     * كان التخفيض يقيّد الفرق رصيداً للمؤسسة ثم لا يقرؤه أحد: `renewSubscription`
     * يُصدر فاتورة السعر الكامل، و`getAccountCredit` لا تُستعمل إلا في العرض. أي
     * أن الرصيد وعدٌ مكتوبٌ على الشاشة لا يُوفى أبداً، والمؤسسة تُحاسَب كاملاً في
     * كل تجديد تالٍ.
     *
     * ويُسدَّد كدفعة بوسيلة «رصيد» لا كخصم صامت على الفاتورة: الفاتورة تبقى
     * بقيمتها الحقيقية، ويظهر في سجلّ الدفعات من أين جاء السداد.
     */
    const credit = getAccountCredit();
    if (credit > 0 && invoice.total > invoice.amountPaid) {
      const applied = Math.min(credit, invoice.total - invoice.amountPaid);
      recordPayment({
        invoiceId: invoice.id, amount: applied, currency: invoice.currency,
        method: "credit", reference: "CREDIT",
        note: "استهلاك رصيد المؤسسة من تخفيض سابق.",
      }, actor);
      writeMeta("credit", credit - applied);
      recordBillingEvent("credit.consumed", `استُهلك ${formatMoney(applied, invoice.currency)} من الرصيد على ${invoice.number}`, actor,
        { invoiceId: invoice.id, applied, remaining: credit - applied });
      invoice = getInvoice(invoice.id)!;
    }
  }

  recordBillingEvent("subscription.renewed", `جُدِّد الاشتراك حتى ${periodEnd.slice(0, 10)}`, actor,
    { periodStart, periodEnd, invoiceId: invoice?.id || null });
  return { subscription: saved, invoice };
}

export interface ChangePlanInput {
  planCode: string;
  cycle?: BillingCycle;
  /** `immediate` يُفوتر الفرق تناسبياً الآن؛ `at_period_end` يؤجّل التغيير. */
  timing?: "immediate" | "at_period_end";
  reason?: string;
}

/**
 * ينقل الاشتراك إلى باقة أخرى.
 *
 * الترقية الفورية تُفوتر الفرق *للمتبقّي من الدورة وحده*. فوترة دورة كاملة عند ترقية
 * في يومها الأخير مطالبةٌ بمال مقابل خدمة قُدّمت أصلاً، والعميل يلحظها.
 */
export function changePlan(input: ChangePlanInput, actor = "system"): { subscription: Subscription; invoice: Invoice | null } {
  const current = requireSubscription();
  const plan = getPlan(String(input.planCode));
  if (!plan) throw Object.assign(new Error("الباقة غير موجودة."), { status: 404 });
  if (plan.archived) throw Object.assign(new Error("لا يُنقل اشتراك إلى باقة مؤرشفة."), { status: 409 });
  if (plan.code === current.planCode && (!input.cycle || input.cycle === current.cycle)) {
    throw Object.assign(new Error("الاشتراك على هذه الباقة والدورة أصلاً."), { status: 409 });
  }

  const cycle = (input.cycle || current.cycle) as BillingCycle;
  const timing = input.timing === "at_period_end" ? "at_period_end" : "immediate";

  if (timing === "at_period_end") {
    // لا تغيير في الشروط السارية — يُسجَّل الطلب ويُنفَّذ عند التجديد القادم.
    writeSubscription({ ...current, notes: `${current.notes}\n[مُجدوَل] الانتقال إلى ${plan.code}/${cycle} عند نهاية الدورة.`.trim().slice(0, 1_000) });
    setScheduledPlanChange(plan.code, cycle);
    recordBillingEvent("subscription.plan_change_scheduled", `سيُنقل إلى «${plan.nameAr}» عند نهاية الدورة`, actor, { planCode: plan.code, cycle });
    return { subscription: getSubscription()!, invoice: null };
  }

  const oldPlan = getPlan(current.planCode);
  const now = nowIso();
  const totalMs = new Date(current.currentPeriodEnd).getTime() - new Date(current.currentPeriodStart).getTime();
  const remainingMs = Math.max(0, new Date(current.currentPeriodEnd).getTime() - new Date(now).getTime());
  const remainingRatio = totalMs > 0 ? remainingMs / totalMs : 0;
  const cycleChanged = cycle !== current.cycle;

  /*
   * التناسب الزمني — والفخّ فيه تغيير الدورة.
   *
   * حساب نسبةٍ واحدة على سعرَي دورتين مختلفتين يُنتج عبثاً: اشتراك سنوي يُحوَّل
   * إلى شهري في أول الشهر يُقيَّد له رصيدٌ يقارب سعر السنة كاملة، ويُحاسَب على
   * جزءٍ من شهر واحد، وتبقى نهاية مدّته بعد أحد عشر شهراً وهو موسومٌ «شهري» —
   * أي سنةُ خدمةٍ مجاناً ورصيدٌ ضخم فوقها.
   *
   * فحين تتغيّر الدورة يُقوَّم المتبقّي بسعر اليوم من الدورة القديمة، وتبدأ دورة
   * جديدة كاملة من الآن بحدودٍ متّسقة مع وسمها. وحين لا تتغيّر الدورة يبقى
   * الحساب داخل الدورة نفسها وحدودها كما هي — وهي الحالة الشائعة.
   */
  const oldPeriodDays = Math.max(1, totalMs / 86_400_000);
  const remainingDays = Math.max(0, remainingMs / 86_400_000);
  const oldPrice = oldPlan ? priceFor(oldPlan, current.cycle) : 0;

  const proratedCredit = cycleChanged
    ? Math.round((oldPrice / oldPeriodDays) * remainingDays)
    : Math.round(oldPrice * remainingRatio);
  const proratedCharge = cycleChanged
    ? priceFor(plan, cycle)                      // دورة جديدة كاملة تبدأ الآن
    : Math.round(priceFor(plan, cycle) * remainingRatio);
  const difference = proratedCharge - proratedCredit;

  const periodStart = cycleChanged ? now : current.currentPeriodStart;
  const periodEnd = cycleChanged ? advancePeriod(now, cycle) : current.currentPeriodEnd;

  const saved = writeSubscription({
    ...current, planCode: plan.code, cycle, currency: plan.currency, trialEndsAt: null, terminated: false,
    currentPeriodStart: periodStart, currentPeriodEnd: periodEnd,
  });
  clearScheduledPlanChange();

  let invoice: Invoice | null = null;
  if (difference > 0) {
    invoice = issueInvoice({
      kind: "adjustment", planCode: plan.code, currency: plan.currency,
      periodStart, periodEnd,
      lines: [{
        description: cycleChanged
          ? `الانتقال إلى ${plan.nameAr} (${cycleLabel(cycle)}) بعد خصم المتبقّي من الدورة السابقة`
          : `فرق ترقية إلى ${plan.nameAr} للمتبقّي من الدورة`,
        quantity: 1, unitAmount: difference, amount: difference,
      }],
      discountBps: current.discountBps, taxBps: current.taxBps,
      notes: cycleChanged
        ? `دورة جديدة من ${periodStart.slice(0, 10)}. خُصم ${formatMoney(proratedCredit, plan.currency)} عن ${Math.round(remainingDays)} يوماً متبقّياً من الدورة السابقة.`
        : `تناسب زمني: ${Math.round(remainingRatio * 100)}% من الدورة متبقٍّ.`,
    }, actor);
  } else if (difference < 0) {
    // التخفيض لا يُعيد نقداً: يُسجَّل رصيداً يُخصم من التجديد القادم.
    addAccountCredit(-difference, plan.currency, `فرق تخفيض من ${oldPlan?.nameAr || current.planCode} إلى ${plan.nameAr}`, actor);
  }

  recordBillingEvent("subscription.plan_changed",
    `نُقل الاشتراك إلى «${plan.nameAr}» (${cycleLabel(cycle)})${input.reason ? ` — ${input.reason}` : ""}`, actor,
    { from: current.planCode, to: plan.code, difference, remainingRatio });
  return { subscription: saved, invoice };
}

/* --------------------------------------------- تغيير مجدول ورصيد المؤسسة */

/*
 * قيمتان صغيرتان لا تستحقّان جدولاً لكل منهما: تُحفظان في `operational_state`
 * بمفتاحيهما عبر نفس الجدول الذي يخدم الحالة التشغيلية.
 */
function readMeta<T>(key: string, fallback: T): T {
  const row = db().prepare("SELECT value FROM operational_state WHERE key = ?").get(`billing:${key}`) as { value?: string } | undefined;
  return row?.value ? safeJson<T>(row.value, fallback) : fallback;
}

function writeMeta(key: string, value: unknown): void {
  db().prepare(
    `INSERT INTO operational_state(key, value, updated_at) VALUES(?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(`billing:${key}`, JSON.stringify(value), nowIso());
}

export interface ScheduledPlanChange { planCode: string; cycle: BillingCycle }

export const getScheduledPlanChange = () => readMeta<ScheduledPlanChange | null>("scheduledPlanChange", null);
const setScheduledPlanChange = (planCode: string, cycle: BillingCycle) => writeMeta("scheduledPlanChange", { planCode, cycle });
const clearScheduledPlanChange = () => writeMeta("scheduledPlanChange", null);

export const getAccountCredit = () => Number(readMeta<number>("credit", 0)) || 0;

export function addAccountCredit(amount: number, currency: string, reason: string, actor = "system"): number {
  const next = getAccountCredit() + Math.round(amount);
  writeMeta("credit", next);
  recordBillingEvent("credit.added", `${formatMoney(Math.round(amount), currency)} رصيداً — ${reason}`, actor, { amount, reason });
  return next;
}

/* ---------------------------------------------------------- إلغاء وإنهاء */

export function cancelSubscription(atPeriodEnd: boolean, actor = "system", reason = ""): Subscription {
  const current = requireSubscription();
  const saved = writeSubscription({
    ...current,
    cancelAtPeriodEnd: true,
    autoRenew: false,
    canceledAt: nowIso(),
    // إلغاء فوري ينهي المدة الآن؛ وإلا فالمؤسسة تُكمل ما دفعت مقابله.
    currentPeriodEnd: atPeriodEnd ? current.currentPeriodEnd : nowIso(),
  });
  recordBillingEvent("subscription.canceled",
    atPeriodEnd ? "سيُنهى الاشتراك عند نهاية الدورة" : "أُنهي الاشتراك فوراً", actor, { reason, atPeriodEnd });
  return saved;
}

export function resumeSubscription(actor = "system"): Subscription {
  const current = requireSubscription();
  const saved = writeSubscription({ ...current, cancelAtPeriodEnd: false, canceledAt: null, autoRenew: true, terminated: false });
  recordBillingEvent("subscription.resumed", "أُلغي الإلغاء وعاد التجديد التلقائي", actor, {});
  return saved;
}

/** إنهاء الترخيص بقرار المالك — أقصى إجراء، ويُجمّد الكتابة فوراً. */
export function terminateSubscription(actor = "system", reason = ""): Subscription {
  const current = requireSubscription();
  const saved = writeSubscription({ ...current, terminated: true, autoRenew: false, cancelAtPeriodEnd: true, canceledAt: nowIso() });
  recordBillingEvent("subscription.terminated", `أُنهي الترخيص${reason ? ` — ${reason}` : ""}`, actor, { reason });
  return saved;
}

function requireSubscription(): Subscription {
  const subscription = getSubscription();
  if (!subscription) throw Object.assign(new Error("لا يوجد اشتراك بعد — ابدأ واحداً من شاشة المالك."), { status: 409 });
  return subscription;
}

/* ------------------------------------------------------- اشتقاق الحالة */

export interface SubscriptionState {
  status: SubscriptionStatus;
  /** هل الكتابة مسموحة؟ القراءة مسموحة دائماً. */
  writable: boolean;
  daysRemaining: number;
  /** الأيام المتبقية من مهلة السماح بعد انتهاء المدة، إن كنا داخلها. */
  graceDaysRemaining: number;
  isTrial: boolean;
  reason: string;
}

/**
 * الحالة مشتقّة من الوقت والفواتير — لا عمود يُحدَّث.
 *
 * الترتيب مقصود: الإنهاء يسبق كل شيء، ثم التجربة، ثم المدة السارية، ثم مهلة
 * السماح. وداخل المهلة نفرّق بين "انتهت ولم يُجدَّد" و"انتهت وعليه مستحق"، لأن
 * الرسالة التي تُعرض على المؤسسة تختلف — والثانية قابلة للحلّ بدفعة.
 */
export function evaluateSubscription(subscription: Subscription | undefined = getSubscription(), at = nowIso()): SubscriptionState {
  if (!subscription) {
    return { status: "expired", writable: true, daysRemaining: 0, graceDaysRemaining: 0, isTrial: false,
      reason: "لم يُسجَّل اشتراك بعد — المنصة مفتوحة حتى يضبط المالك الترخيص." };
  }
  if (subscription.terminated) {
    return { status: "expired", writable: false, daysRemaining: 0, graceDaysRemaining: 0, isTrial: false,
      reason: "أُنهي الترخيص بقرار المالك. البيانات والسجلّ تبقى متاحة للقراءة والتصدير." };
  }

  const end = subscription.currentPeriodEnd;
  const inTrial = Boolean(subscription.trialEndsAt && subscription.trialEndsAt > at);
  const daysRemaining = Math.max(0, daysBetween(at, end));

  if (end > at) {
    if (inTrial) {
      return { status: "trialing", writable: true, daysRemaining, graceDaysRemaining: 0, isTrial: true,
        reason: `فترة تجربة سارية — ${daysRemaining} يوماً متبقية.` };
    }
    if (subscription.cancelAtPeriodEnd) {
      return { status: "canceled", writable: true, daysRemaining, graceDaysRemaining: 0, isTrial: false,
        reason: `أُلغي التجديد — الخدمة مستمرة حتى ${end.slice(0, 10)}.` };
    }
    return { status: "active", writable: true, daysRemaining, graceDaysRemaining: 0, isTrial: false,
      reason: `اشتراك سارٍ حتى ${end.slice(0, 10)}.` };
  }

  const graceEnd = addDays(end, subscription.graceDays);
  const graceDaysRemaining = Math.max(0, daysBetween(at, graceEnd));
  const unpaid = outstandingBalance();

  if (graceEnd > at) {
    if (unpaid.amount > 0) {
      return { status: "past_due", writable: true, daysRemaining: 0, graceDaysRemaining, isTrial: false,
        reason: `مستحق غير مسدَّد ${formatMoney(unpaid.amount, unpaid.currency)} — تتوقف الكتابة بعد ${graceDaysRemaining} يوماً.` };
    }
    return { status: "grace", writable: true, daysRemaining: 0, graceDaysRemaining, isTrial: false,
      reason: `انتهت المدة ولم يُجدَّد — مهلة سماح ${graceDaysRemaining} يوماً.` };
  }

  return { status: "suspended", writable: false, daysRemaining: 0, graceDaysRemaining: 0, isTrial: false,
    reason: unpaid.amount > 0
      ? `الاشتراك موقوف لمستحق غير مسدَّد ${formatMoney(unpaid.amount, unpaid.currency)}. القراءة والتصدير متاحان.`
      : "انتهت المدة ومهلة السماح. القراءة والتصدير متاحان، والكتابة متوقفة حتى التجديد." };
}

/* ---------------------------------------------------- المُشغّل الدوري */

/**
 * يُجري ما يستحقّه الوقت: تجديد تلقائي عند الانقضاء، وتعليم الفواتير المتأخرة.
 *
 * مُصمَّم ليكون مُعاد التنفيذ بلا ضرر (idempotent): تشغيله عشر مرات في الدقيقة
 * يُنتج ما يُنتجه تشغيلٌ واحد. هذا شرطٌ لا تفاوض فيه لأي عمل مجدول يلمس المال.
 */
export function runBillingCycle(at = nowIso()): { renewed: boolean; overdueMarked: number } {
  const subscription = getSubscription();
  let renewed = false;

  const overdueMarked = Number(db().prepare(
    "UPDATE billing_invoices SET status = 'overdue' WHERE status IN ('issued','partially_paid') AND due_at < ? AND amount_paid < total"
  ).run(at).changes ?? 0);

  if (subscription && !subscription.terminated && subscription.currentPeriodEnd <= at) {
    if (subscription.autoRenew && !subscription.cancelAtPeriodEnd) {
      const scheduled = getScheduledPlanChange();
      if (scheduled && getPlan(scheduled.planCode)) {
        writeSubscription({ ...subscription, planCode: scheduled.planCode, cycle: scheduled.cycle });
        clearScheduledPlanChange();
        recordBillingEvent("subscription.plan_change_applied", `نُفِّذ الانتقال المجدول إلى ${scheduled.planCode}`, "system", scheduled as unknown as Record<string, unknown>);
      }
      renewSubscription("system");
      renewed = true;
    } else if (!subscription.canceledAt) {
      recordBillingEvent("subscription.lapsed", "انتهت المدة والتجديد التلقائي مُطفأ", "system", { end: subscription.currentPeriodEnd });
    }
  }

  return { renewed, overdueMarked };
}

let cycleTimer: NodeJS.Timeout | null = null;

/** يشغّل الدورة كل ساعة. `unref` حتى لا تمنع المؤقّتة الخروج النظيف. */
export function startBillingWorker(intervalMs = 60 * 60_000) {
  if (cycleTimer) return { stop: () => stopBillingWorker() };
  try { runBillingCycle(); } catch (error) { console.error("[NAHJ/billing] أول دورة فشلت:", error); }
  cycleTimer = setInterval(() => {
    try { runBillingCycle(); } catch (error) { console.error("[NAHJ/billing] دورة الفوترة فشلت:", error); }
  }, intervalMs);
  cycleTimer.unref?.();
  return { stop: () => stopBillingWorker() };
}

export function stopBillingWorker() {
  if (cycleTimer) { clearInterval(cycleTimer); cycleTimer = null; }
}

/* ------------------------------------------------------------- التهيئة */

/**
 * يزرع كتالوج الباقات مرة واحدة.
 *
 * لا يلمس باقة قائمة: المالك عدّل أسعاره، وإعادة الزرع فوقها عند كل إقلاع كانت
 * ستمسح تسعيره الحقيقي بأرقام افتراضية.
 */
export function seedDefaultPlans(): number {
  ensureBillingSchema();
  let created = 0;
  for (const seed of SEED_PLANS) {
    if (getPlan(seed.code)) continue;
    upsertPlan(seed, "system");
    created++;
  }
  return created;
}

/**
 * يضمن وجود اشتراك.
 *
 * نشرٌ جديد بلا اشتراك يبدأ بتجربة ثلاثين يوماً بدل أن يُقفل على نفسه أو يُفتح بلا
 * حدّ. والمالك يستبدلها بعقد حقيقي من شاشته.
 */
export function ensureSubscription(): Subscription {
  ensureBillingSchema();
  seedDefaultPlans();
  const existing = getSubscription();
  if (existing) return existing;
  const trialDays = Math.max(1, Math.min(365, Number(process.env.NAHJ_TRIAL_DAYS || 30) || 30));
  const subscription = startSubscription(
    { planCode: "trial", cycle: "monthly", trialDays, autoRenew: false, graceDays: 7, issueInvoice: false },
    "system",
  );
  console.log(`[NAHJ/billing] لا اشتراك سابق — فُتحت تجربة ${trialDays} يوماً حتى ${subscription.currentPeriodEnd.slice(0, 10)}.`);
  return subscription;
}

/* -------------------------------------------------------- الحدّ والقياس */

export interface EntitlementCheck {
  allowed: boolean;
  limit: number | null;
  used: number;
  reason: string;
}

/**
 * يفحص حدّاً عددياً من حدود الباقة.
 *
 * `used` هو ما قبل الإضافة، فالفحص "هل يسع واحداً آخر؟". فصل القياس عن القرار
 * يجعل الشاشة قادرة على عرض 7/10 قبل أن يصطدم المستخدم بالرفض.
 */
export function checkLimit(metric: keyof PlanLimits, used: number, adding = 1): EntitlementCheck {
  const subscription = getSubscription();
  const plan = subscription ? getPlan(subscription.planCode) : undefined;
  if (!plan) return { allowed: true, limit: null, used, reason: "لا باقة مضبوطة — بلا حدّ." };

  const raw = plan.limits[metric];
  if (typeof raw !== "number") return { allowed: true, limit: null, used, reason: "بلا حدّ في هذه الباقة." };

  // المقاعد المشتراة قد تتجاوز حدّ الباقة (مقاعد إضافية مدفوعة)، فهي السقف الفعلي.
  const effective = metric === "seats" ? Math.max(raw, subscription?.seatsPurchased ?? 0) : raw;
  const allowed = used + adding <= effective;
  return {
    allowed, limit: effective, used,
    reason: allowed ? "" : `بلغت حدّ الباقة «${plan.nameAr}» (${effective}). رقّ الباقة أو أضف مقاعد.`,
  };
}

export function hasFeature(feature: keyof PlanFeatures): boolean {
  const subscription = getSubscription();
  const plan = subscription ? getPlan(subscription.planCode) : undefined;
  if (!plan) return true;
  return Boolean(plan.features[feature]);
}

/** أقصى مستوى استقلالية تسمح به الباقة. الحوكمة تبقى فوقه — هذا سقف لا إذن. */
export function maxAutonomyLevel(): number {
  const subscription = getSubscription();
  const plan = subscription ? getPlan(subscription.planCode) : undefined;
  return plan ? plan.limits.maxAutonomyLevel : 6;
}

/* --------------------------------------------------------- عدّاد الدورة */

const periodKey = (subscription: Subscription | undefined) =>
  subscription ? `${subscription.currentPeriodStart.slice(0, 10)}_${subscription.currentPeriodEnd.slice(0, 10)}` : "unbound";

/** يزيد عدّاد استهلاك للدورة الجارية. العدّاد يُصفّر تلقائياً بتغيّر مفتاح الدورة. */
export function incrementUsage(metric: string, by = 1): number {
  const key = periodKey(getSubscription());
  const connection = db();
  connection.prepare(
    `INSERT INTO billing_usage(period_key, metric, value) VALUES(?, ?, ?)
     ON CONFLICT(period_key, metric) DO UPDATE SET value = value + excluded.value`
  ).run(key, metric, Math.max(0, Math.round(by)));
  const row = connection.prepare("SELECT value FROM billing_usage WHERE period_key = ? AND metric = ?").get(key, metric) as { value?: number } | undefined;
  return Number(row?.value ?? 0);
}

export function readUsage(metric: string): number {
  const row = db().prepare("SELECT value FROM billing_usage WHERE period_key = ? AND metric = ?")
    .get(periodKey(getSubscription()), metric) as { value?: number } | undefined;
  return Number(row?.value ?? 0);
}

/* -------------------------------------------------------------- اللقطة */

export interface BillingSnapshot {
  subscription: Subscription | null;
  plan: Plan | null;
  state: SubscriptionState;
  scheduledPlanChange: ScheduledPlanChange | null;
  usage: UsageSnapshot;
  limits: PlanLimits | null;
  features: PlanFeatures;
  outstanding: { amount: number; currency: string; invoiceCount: number };
  credit: number;
  invoices: Invoice[];
  payments: Payment[];
  currency: string;
  nextRenewalAt: string | null;
  nextRenewalAmount: number | null;
  lifetimePaid: number;
  formatted: {
    nextRenewalAmount: string | null;
    outstanding: string;
    lifetimePaid: string;
    credit: string;
  };
}

/** اللقطة الكاملة التي تبني عليها الشاشتان — شاشة المؤسسة وشاشة المالك. */
export function billingSnapshot(usage: UsageSnapshot, options: { invoiceLimit?: number } = {}): BillingSnapshot {
  ensureBillingSchema();
  const subscription = getSubscription() ?? null;
  const plan = subscription ? getPlan(subscription.planCode) ?? null : null;
  const state = evaluateSubscription(subscription ?? undefined);
  const outstanding = outstandingBalance();
  const invoices = listInvoices(options.invoiceLimit ?? 60);
  const payments = listPayments(60);
  const currency = subscription?.currency || plan?.currency || DEFAULT_CURRENCY;
  const nextRenewalAmount = plan && subscription && subscription.autoRenew && !subscription.cancelAtPeriodEnd
    ? priceFor(plan, subscription.cycle)
    : null;
  const lifetimePaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const credit = getAccountCredit();

  return {
    subscription, plan, state,
    scheduledPlanChange: getScheduledPlanChange(),
    usage,
    limits: plan?.limits ?? null,
    features: plan?.features ?? {},
    outstanding: { amount: outstanding.amount, currency: outstanding.currency, invoiceCount: outstanding.invoices.length },
    credit,
    invoices, payments, currency,
    nextRenewalAt: subscription && subscription.autoRenew && !subscription.cancelAtPeriodEnd ? subscription.currentPeriodEnd : null,
    nextRenewalAmount,
    lifetimePaid,
    formatted: {
      nextRenewalAmount: nextRenewalAmount === null ? null : formatMoney(nextRenewalAmount, currency),
      outstanding: formatMoney(outstanding.amount, currency),
      lifetimePaid: formatMoney(lifetimePaid, currency),
      credit: formatMoney(credit, currency),
    },
  };
}

/** أرقام المالك التجارية — لا تُعرض للمؤسسة. */
export function revenueSummary(): {
  currency: string;
  collectedLifetime: number;
  collectedThisYear: number;
  outstanding: number;
  invoicesIssued: number;
  invoicesOverdue: number;
  mrr: number;
  arr: number;
  formatted: Record<string, string>;
} {
  const subscription = getSubscription();
  const plan = subscription ? getPlan(subscription.planCode) : undefined;
  const currency = subscription?.currency || DEFAULT_CURRENCY;
  const payments = listPayments(500);
  const year = new Date().getUTCFullYear();

  const collectedLifetime = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const collectedThisYear = payments
    .filter(payment => new Date(payment.paidAt).getUTCFullYear() === year)
    .reduce((sum, payment) => sum + payment.amount, 0);

  const invoices = listInvoices(500);
  const outstanding = invoices
    .filter(invoice => invoice.status !== "void" && invoice.amountPaid < invoice.total)
    .reduce((sum, invoice) => sum + (invoice.total - invoice.amountPaid), 0);

  /*
   * الإيراد الشهري المتكرّر مُطبَّع على الشهر: باقة سنوية بـ12 شهراً تُقسم، لا
   * تُحسب كإيراد شهرٍ واحد. وحالةٌ غير قابلة للكتابة إيرادها المتكرّر صفر — لأنه
   * توقّف فعلاً، وعدّه يجمّل رقماً لا يُحصَّل.
   */
  const state = evaluateSubscription(subscription);
  const active = state.status === "active" || state.status === "canceled" || state.status === "past_due";
  const mrr = plan && subscription && active
    ? Math.round(priceFor(plan, subscription.cycle) / cycleMonths(subscription.cycle))
    : 0;

  const money = (amount: number) => formatMoney(amount, currency);
  return {
    currency, collectedLifetime, collectedThisYear, outstanding,
    invoicesIssued: invoices.filter(invoice => invoice.status !== "void").length,
    invoicesOverdue: invoices.filter(invoice => invoice.status === "overdue").length,
    mrr, arr: mrr * 12,
    formatted: {
      collectedLifetime: money(collectedLifetime),
      collectedThisYear: money(collectedThisYear),
      outstanding: money(outstanding),
      mrr: money(mrr),
      arr: money(mrr * 12),
    },
  };
}
