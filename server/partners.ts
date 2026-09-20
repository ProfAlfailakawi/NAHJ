import { randomUUID } from "node:crypto";
import { openDatabase } from "./persistence.ts";
import {
  CURRENCY_MINOR_UNITS, DEFAULT_CURRENCY, addMonths, cycleMonths, daysBetween,
  formatMoney, recordBillingEvent, type BillingCycle,
} from "./billing.ts";

/*
 * المسوّقون والعمولات.
 *
 * نهج يُباع بوسطاء: مسوّقٌ يجلب شركةً، ويُتَّفق معه على نسبةٍ من قيمة العقد أو
 * مبلغٍ مقطوع. وكان ذلك كلّه خارج النظام — في رسائل واتفاقاتٍ شفهية ودفترٍ عند
 * المالك. فلا المسوّق يعرف ما استحقّ، ولا المالك يعرف ما عليه، والخلاف حتمي لأن
 * لا أحد ينظر إلى الرقم نفسه.
 *
 * وموضع هذه الوحدة مقصود: **دفترُ مبيعاتِ المالك، لا تعدّدُ مستأجرين.**
 *
 * النظام التشغيلي يبقى نشراً لكل مؤسسة كما هو. وما هنا سجلٌّ تجاري: كل شركة
 * عقدٌ بقيمته ومدّته والمسوّق الذي جلبها، وكل عمولة تُشتق من ذلك العقد. فلا
 * يحتاج إضافةُ مسوّقٍ إلى إعادة بناء المخزن ولا عزل البيانات التشغيلية — وهي
 * عملية معمارية كبيرة لا يستدعيها دفترُ عمولات.
 *
 * وقاعدة العزل هنا صارمة: **المسوّق لا يرى إلا شركاته وعمولته هو.** لا شركات
 * زميله، ولا إجمالي إيراد المالك، ولا أي بيانة تشغيلية من داخل أي مؤسسة. فهو
 * طرفٌ خارجي بحكم التعريف، وكل ما لا يخصّه لا يصل إليه أصلاً — لا يُخفى في
 * الواجهة بل لا يُرسَل من الخادم.
 */

/* ------------------------------------------------------------ الأنواع */

/** كيف تُحتسب العمولة. */
export type CommissionModel =
  | "percent_of_contract"   // نسبة من قيمة كل دورة يدفعها العميل
  | "fixed_per_cycle"       // مبلغ مقطوع عن كل دورة
  | "fixed_once";           // مبلغ مقطوع مرة واحدة عند التعاقد

export type PartnerStatus = "active" | "suspended";
export type ClientStatus = "prospect" | "active" | "past_due" | "churned";
export type CommissionStatus = "accrued" | "approved" | "paid" | "void";

export interface Partner {
  id: string;
  name: string;
  email: string;
  phone: string;
  /** يُربط بحساب دخول ليرى لوحته. فارغ = مسوّق مسجَّل بلا وصول بعد. */
  accountId: string | null;
  status: PartnerStatus;
  model: CommissionModel;
  /** النسبة بالنقاط الأساسية (1500 = 15%). تُستعمل مع percent_of_contract. */
  rateBps: number;
  /** المبلغ المقطوع بالوحدة الصغرى. يُستعمل مع الصيغتين المقطوعتين. */
  fixedAmount: number;
  currency: string;
  /** مدّة استحقاق العمولة بالشهور من بدء العقد. 0 = بلا حدّ (ما دام العميل). */
  durationMonths: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Client {
  id: string;
  name: string;
  sector: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  /** المسوّق الذي جلبها. null = مبيعات مباشرة. */
  partnerId: string | null;
  planCode: string;
  cycle: BillingCycle;
  /** قيمة الدورة الواحدة بالوحدة الصغرى. */
  contractValue: number;
  currency: string;
  startedAt: string;
  /** نهاية العقد الحالية. */
  endsAt: string;
  status: ClientStatus;
  /** عنوان النشر الخاص بها، إن وُجد. */
  deploymentUrl: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Commission {
  id: string;
  partnerId: string;
  clientId: string;
  /** الدورة التي استُحقّت عنها. */
  periodStart: string;
  periodEnd: string;
  /** أساس الاحتساب — قيمة الدورة وقتها. يُحفظ فلا يتغيّر بتغيّر العقد لاحقاً. */
  baseAmount: number;
  model: CommissionModel;
  rateBps: number;
  amount: number;
  currency: string;
  status: CommissionStatus;
  paidAt: string | null;
  paymentReference: string;
  note: string;
  createdAt: string;
}

/* ----------------------------------------------------------- المخطّط */

let schemaReady = false;

export function ensurePartnerSchema(): void {
  const db = openDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS partners (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      account_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      model TEXT NOT NULL DEFAULT 'percent_of_contract',
      rate_bps INTEGER NOT NULL DEFAULT 0,
      fixed_amount INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'KWD',
      duration_months INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_partners_email ON partners(email);
    CREATE INDEX IF NOT EXISTS idx_partners_account ON partners(account_id);

    CREATE TABLE IF NOT EXISTS partner_clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sector TEXT NOT NULL DEFAULT '',
      contact_name TEXT NOT NULL DEFAULT '',
      contact_email TEXT NOT NULL DEFAULT '',
      contact_phone TEXT NOT NULL DEFAULT '',
      partner_id TEXT REFERENCES partners(id) ON DELETE SET NULL,
      plan_code TEXT NOT NULL DEFAULT '',
      cycle TEXT NOT NULL DEFAULT 'monthly',
      contract_value INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'KWD',
      started_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      deployment_url TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_clients_partner ON partner_clients(partner_id);

    CREATE TABLE IF NOT EXISTS partner_commissions (
      id TEXT PRIMARY KEY,
      partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL REFERENCES partner_clients(id) ON DELETE CASCADE,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      base_amount INTEGER NOT NULL DEFAULT 0,
      model TEXT NOT NULL,
      rate_bps INTEGER NOT NULL DEFAULT 0,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'accrued',
      paid_at TEXT,
      payment_reference TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_commissions_partner ON partner_commissions(partner_id);
    /*
     * الفريد يمنع ازدواج الاستحقاق عن الدورة نفسها.
     *
     * توليد العمولات عملية مُعادة التنفيذ (تُنادى دورياً وعند كل فتح للوحة)،
     * وبلا هذا القيد كان كل تشغيل يضيف استحقاقاً جديداً عن الشهر نفسه — فيصير
     * الدفتر يُضاعف ما على المالك كلما فُتحت الشاشة.
     */
    CREATE UNIQUE INDEX IF NOT EXISTS idx_commissions_period
      ON partner_commissions(partner_id, client_id, period_start);
  `);
  schemaReady = true;
}

const db = () => {
  if (!schemaReady) ensurePartnerSchema();
  return openDatabase();
};

export function resetPartnerSchemaCache(): void { schemaReady = false; }

const now = () => new Date().toISOString();

/* ---------------------------------------------------------- التحقّق */

const normalizeEmail = (value: unknown) => {
  const clean = String(value ?? "").trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean) && clean.length <= 200 ? clean : "";
};

function assertMinor(value: unknown, field: string): number {
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

const MODELS: CommissionModel[] = ["percent_of_contract", "fixed_per_cycle", "fixed_once"];

/* --------------------------------------------------------- المسوّقون */

function partnerFromRow(row: Record<string, unknown>): Partner {
  return {
    id: String(row.id), name: String(row.name), email: String(row.email), phone: String(row.phone ?? ""),
    accountId: row.account_id ? String(row.account_id) : null,
    status: String(row.status) as PartnerStatus,
    model: String(row.model) as CommissionModel,
    rateBps: Number(row.rate_bps), fixedAmount: Number(row.fixed_amount),
    currency: String(row.currency), durationMonths: Number(row.duration_months),
    notes: String(row.notes ?? ""), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

export interface PartnerInput {
  name: string; email: string; phone?: string; accountId?: string | null;
  model?: CommissionModel; rateBps?: number; fixedAmount?: number;
  currency?: string; durationMonths?: number; notes?: string; status?: PartnerStatus;
}

export function upsertPartner(input: PartnerInput, id?: string, actor = "system"): Partner {
  const name = String(input.name ?? "").trim();
  const email = normalizeEmail(input.email);
  if (name.length < 2 || name.length > 120) throw Object.assign(new Error("اسم المسوّق غير صالح."), { status: 400 });
  if (!email) throw Object.assign(new Error("بريد المسوّق غير صالح."), { status: 400 });

  const currency = String(input.currency || DEFAULT_CURRENCY).toUpperCase();
  if (!CURRENCY_MINOR_UNITS[currency]) throw Object.assign(new Error(`عملة غير مدعومة: ${currency}`), { status: 400 });

  const model = MODELS.includes(input.model as CommissionModel) ? input.model as CommissionModel : "percent_of_contract";
  const rateBps = assertBps(input.rateBps ?? 0, "نسبة العمولة");
  const fixedAmount = assertMinor(input.fixedAmount ?? 0, "مبلغ العمولة");

  /*
   * اتفاقٌ بلا قيمة ليس اتفاقاً. رفضُه هنا أرحم من دفترٍ يُراكم عمولاتٍ بصفر ثم
   * يُكتشف عند أول مطالبة.
   */
  if (model === "percent_of_contract" && rateBps === 0) {
    throw Object.assign(new Error("نسبة العمولة صفر — حدّد النسبة المتّفق عليها."), { status: 400 });
  }
  if (model !== "percent_of_contract" && fixedAmount === 0) {
    throw Object.assign(new Error("مبلغ العمولة صفر — حدّد المبلغ المتّفق عليه."), { status: 400 });
  }

  const existing = id ? getPartner(id) : undefined;
  if (id && !existing) throw Object.assign(new Error("المسوّق غير موجود."), { status: 404 });

  const duplicate = db().prepare("SELECT id FROM partners WHERE email = ? AND id != ? LIMIT 1")
    .get(email, existing?.id ?? "") as { id?: string } | undefined;
  if (duplicate) throw Object.assign(new Error("هذا البريد مسجَّل لمسوّق آخر."), { status: 409 });

  const partner: Partner = {
    id: existing?.id || `prt_${randomUUID()}`,
    name, email,
    phone: String(input.phone ?? existing?.phone ?? "").trim().slice(0, 40),
    accountId: input.accountId === undefined ? existing?.accountId ?? null : (input.accountId || null),
    status: input.status ?? existing?.status ?? "active",
    model, rateBps, fixedAmount, currency,
    durationMonths: Math.max(0, Math.min(600, Number(input.durationMonths ?? existing?.durationMonths ?? 0) || 0)),
    notes: String(input.notes ?? existing?.notes ?? "").slice(0, 1_000),
    createdAt: existing?.createdAt || now(),
    updatedAt: now(),
  };

  db().prepare(
    `INSERT INTO partners(id, name, email, phone, account_id, status, model, rate_bps, fixed_amount,
       currency, duration_months, notes, created_at, updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, email=excluded.email, phone=excluded.phone, account_id=excluded.account_id,
       status=excluded.status, model=excluded.model, rate_bps=excluded.rate_bps,
       fixed_amount=excluded.fixed_amount, currency=excluded.currency,
       duration_months=excluded.duration_months, notes=excluded.notes, updated_at=excluded.updated_at`
  ).run(partner.id, partner.name, partner.email, partner.phone, partner.accountId, partner.status,
    partner.model, partner.rateBps, partner.fixedAmount, partner.currency, partner.durationMonths,
    partner.notes, partner.createdAt, partner.updatedAt);

  recordBillingEvent(existing ? "partner.updated" : "partner.created", `المسوّق «${partner.name}»`, actor, { partnerId: partner.id });
  return getPartner(partner.id)!;
}

export function getPartner(id: string): Partner | undefined {
  const row = db().prepare("SELECT * FROM partners WHERE id = ? LIMIT 1").get(id) as Record<string, unknown> | undefined;
  return row ? partnerFromRow(row) : undefined;
}

/** يجد المسوّق المرتبط بحساب دخول. هو أساس عزل لوحة المسوّق. */
export function getPartnerByAccount(accountId: string): Partner | undefined {
  const row = db().prepare("SELECT * FROM partners WHERE account_id = ? LIMIT 1").get(accountId) as Record<string, unknown> | undefined;
  return row ? partnerFromRow(row) : undefined;
}

export function listPartners(): Partner[] {
  return (db().prepare("SELECT * FROM partners ORDER BY created_at ASC").all() as Array<Record<string, unknown>>)
    .map(partnerFromRow);
}

export function deletePartner(id: string, actor = "system"): void {
  const partner = getPartner(id);
  if (!partner) throw Object.assign(new Error("المسوّق غير موجود."), { status: 404 });
  const clients = listClients({ partnerId: id });
  if (clients.length) {
    throw Object.assign(new Error(`لا يُحذف مسوّق تحته ${clients.length} شركة — انقلها أولاً.`), { status: 409 });
  }
  const paid = db().prepare("SELECT COUNT(*) AS count FROM partner_commissions WHERE partner_id = ? AND status = 'paid'")
    .get(id) as { count: number };
  if (Number(paid?.count ?? 0) > 0) {
    throw Object.assign(new Error("لا يُحذف مسوّق له عمولات مدفوعة — علّقه بدل ذلك."), { status: 409 });
  }
  db().prepare("DELETE FROM partners WHERE id = ?").run(id);
  recordBillingEvent("partner.deleted", `حُذف المسوّق «${partner.name}»`, actor, { partnerId: id });
}

/* ---------------------------------------------------------- الشركات */

function clientFromRow(row: Record<string, unknown>): Client {
  return {
    id: String(row.id), name: String(row.name), sector: String(row.sector ?? ""),
    contactName: String(row.contact_name ?? ""), contactEmail: String(row.contact_email ?? ""),
    contactPhone: String(row.contact_phone ?? ""),
    partnerId: row.partner_id ? String(row.partner_id) : null,
    planCode: String(row.plan_code ?? ""), cycle: String(row.cycle) as BillingCycle,
    contractValue: Number(row.contract_value), currency: String(row.currency),
    startedAt: String(row.started_at), endsAt: String(row.ends_at),
    status: String(row.status) as ClientStatus,
    deploymentUrl: String(row.deployment_url ?? ""), notes: String(row.notes ?? ""),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

export interface ClientInput {
  name: string; sector?: string; contactName?: string; contactEmail?: string; contactPhone?: string;
  partnerId?: string | null; planCode?: string; cycle?: BillingCycle; contractValue?: number;
  currency?: string; startedAt?: string; endsAt?: string; status?: ClientStatus;
  deploymentUrl?: string; notes?: string;
}

export function upsertClient(input: ClientInput, id?: string, actor = "system"): Client {
  const name = String(input.name ?? "").trim();
  if (name.length < 2 || name.length > 160) throw Object.assign(new Error("اسم الشركة غير صالح."), { status: 400 });

  const existing = id ? getClient(id) : undefined;
  if (id && !existing) throw Object.assign(new Error("الشركة غير موجودة."), { status: 404 });

  const partnerId = input.partnerId === undefined ? existing?.partnerId ?? null : (input.partnerId || null);
  if (partnerId && !getPartner(partnerId)) throw Object.assign(new Error("المسوّق غير موجود."), { status: 404 });

  const currency = String(input.currency || existing?.currency || DEFAULT_CURRENCY).toUpperCase();
  if (!CURRENCY_MINOR_UNITS[currency]) throw Object.assign(new Error(`عملة غير مدعومة: ${currency}`), { status: 400 });

  const cycle = (["monthly", "quarterly", "annual"].includes(String(input.cycle))
    ? input.cycle : existing?.cycle ?? "monthly") as BillingCycle;
  const startedAt = input.startedAt ? new Date(input.startedAt).toISOString() : existing?.startedAt || now();
  const endsAt = input.endsAt ? new Date(input.endsAt).toISOString() : existing?.endsAt || addMonths(startedAt, cycleMonths(cycle));
  if (endsAt <= startedAt) throw Object.assign(new Error("نهاية العقد يجب أن تكون بعد بدايته."), { status: 400 });

  const client: Client = {
    id: existing?.id || `cli_${randomUUID()}`,
    name,
    sector: String(input.sector ?? existing?.sector ?? "").slice(0, 80),
    contactName: String(input.contactName ?? existing?.contactName ?? "").slice(0, 120),
    contactEmail: String(input.contactEmail ?? existing?.contactEmail ?? "").slice(0, 200),
    contactPhone: String(input.contactPhone ?? existing?.contactPhone ?? "").slice(0, 40),
    partnerId,
    planCode: String(input.planCode ?? existing?.planCode ?? "").slice(0, 40),
    cycle,
    contractValue: assertMinor(input.contractValue ?? existing?.contractValue ?? 0, "قيمة العقد"),
    currency, startedAt, endsAt,
    status: input.status ?? existing?.status ?? "active",
    deploymentUrl: String(input.deploymentUrl ?? existing?.deploymentUrl ?? "").slice(0, 300),
    notes: String(input.notes ?? existing?.notes ?? "").slice(0, 1_000),
    createdAt: existing?.createdAt || now(),
    updatedAt: now(),
  };

  db().prepare(
    `INSERT INTO partner_clients(id, name, sector, contact_name, contact_email, contact_phone, partner_id,
       plan_code, cycle, contract_value, currency, started_at, ends_at, status, deployment_url, notes,
       created_at, updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, sector=excluded.sector, contact_name=excluded.contact_name,
       contact_email=excluded.contact_email, contact_phone=excluded.contact_phone,
       partner_id=excluded.partner_id, plan_code=excluded.plan_code, cycle=excluded.cycle,
       contract_value=excluded.contract_value, currency=excluded.currency, started_at=excluded.started_at,
       ends_at=excluded.ends_at, status=excluded.status, deployment_url=excluded.deployment_url,
       notes=excluded.notes, updated_at=excluded.updated_at`
  ).run(client.id, client.name, client.sector, client.contactName, client.contactEmail, client.contactPhone,
    client.partnerId, client.planCode, client.cycle, client.contractValue, client.currency,
    client.startedAt, client.endsAt, client.status, client.deploymentUrl, client.notes,
    client.createdAt, client.updatedAt);

  recordBillingEvent(existing ? "client.updated" : "client.created", `الشركة «${client.name}»`, actor,
    { clientId: client.id, partnerId: client.partnerId });
  return getClient(client.id)!;
}

export function getClient(id: string): Client | undefined {
  const row = db().prepare("SELECT * FROM partner_clients WHERE id = ? LIMIT 1").get(id) as Record<string, unknown> | undefined;
  return row ? clientFromRow(row) : undefined;
}

export function listClients(filter: { partnerId?: string } = {}): Client[] {
  const rows = filter.partnerId
    ? db().prepare("SELECT * FROM partner_clients WHERE partner_id = ? ORDER BY created_at DESC").all(filter.partnerId)
    : db().prepare("SELECT * FROM partner_clients ORDER BY created_at DESC").all();
  return (rows as Array<Record<string, unknown>>).map(clientFromRow);
}

export function deleteClient(id: string, actor = "system"): void {
  const client = getClient(id);
  if (!client) throw Object.assign(new Error("الشركة غير موجودة."), { status: 404 });
  const paid = db().prepare("SELECT COUNT(*) AS count FROM partner_commissions WHERE client_id = ? AND status = 'paid'")
    .get(id) as { count: number };
  if (Number(paid?.count ?? 0) > 0) {
    throw Object.assign(new Error("لا تُحذف شركة عليها عمولات مدفوعة — علّم حالتها «منتهية» بدل ذلك."), { status: 409 });
  }
  db().prepare("DELETE FROM partner_clients WHERE id = ?").run(id);
  recordBillingEvent("client.deleted", `حُذفت الشركة «${client.name}»`, actor, { clientId: id });
}

/* -------------------------------------------------------- العمولات */

function commissionFromRow(row: Record<string, unknown>): Commission {
  return {
    id: String(row.id), partnerId: String(row.partner_id), clientId: String(row.client_id),
    periodStart: String(row.period_start), periodEnd: String(row.period_end),
    baseAmount: Number(row.base_amount), model: String(row.model) as CommissionModel,
    rateBps: Number(row.rate_bps), amount: Number(row.amount), currency: String(row.currency),
    status: String(row.status) as CommissionStatus,
    paidAt: row.paid_at ? String(row.paid_at) : null,
    paymentReference: String(row.payment_reference ?? ""), note: String(row.note ?? ""),
    createdAt: String(row.created_at),
  };
}

/**
 * يحسب عمولة دورة واحدة.
 *
 * مفصولةٌ عن التوليد عمداً: الحساب يُختبر وحده، وتُعرض قيمته على الشاشة قبل
 * الاستحقاق — فيرى المسوّق والمالك الرقم نفسه قبل أن يصير التزاماً.
 */
export function computeCommission(partner: Partner, contractValue: number, cycleIndex: number): number {
  if (partner.model === "fixed_once") return cycleIndex === 0 ? partner.fixedAmount : 0;
  if (partner.model === "fixed_per_cycle") return partner.fixedAmount;
  return Math.round((contractValue * partner.rateBps) / 10_000);
}

/**
 * يولّد الاستحقاقات المستحقّة حتى اليوم.
 *
 * مُعاد التنفيذ بلا ضرر: القيد الفريد على (مسوّق، شركة، بداية الدورة) يمنع
 * ازدواج الاستحقاق. وبدونه كان كل فتحٍ للوحة يضيف عمولةً جديدة عن الشهر نفسه،
 * فيتضاعف ما على المالك كلما نُظر إلى الشاشة.
 *
 * ولا يولّد للمستقبل: دورةٌ لم تبدأ بعد لم تُقدَّم خدمتها ولم تُحصَّل قيمتها.
 */
export function accrueCommissions(at = now(), actor = "system"): { created: number } {
  ensurePartnerSchema();
  let created = 0;

  for (const client of listClients()) {
    if (!client.partnerId) continue;
    if (client.status === "prospect" || client.status === "churned") continue;

    const partner = getPartner(client.partnerId);
    if (!partner || partner.status !== "active") continue;

    const months = cycleMonths(client.cycle);
    let periodStart = client.startedAt;
    let index = 0;

    while (periodStart <= at) {
      const periodEnd = addMonths(periodStart, months);

      /*
       * حدّ مدّة الاستحقاق: اتفاقٌ لسنةٍ لا يُنتج عمولةً في الثالثة.
       *
       * ويُحسب بعدّ الدورات لا بقسمة الأيام على 30.44: التقريب كان يُدخل دورةً
       * زائدة عند الحدّ تماماً — ستة أشهر تُنتج سبع عمولات — لأن الشهر التقويمي
       * لا يساوي متوسّطه. وعدد الدورات معلومٌ بالضبط من موضعها في التسلسل.
       */
      if (partner.durationMonths > 0 && index * months >= partner.durationMonths) break;

      const amount = computeCommission(partner, client.contractValue, index);
      if (amount > 0) {
        const result = db().prepare(
          `INSERT INTO partner_commissions(id, partner_id, client_id, period_start, period_end,
             base_amount, model, rate_bps, amount, currency, status, created_at)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'accrued', ?
           WHERE NOT EXISTS (
             SELECT 1 FROM partner_commissions
             WHERE partner_id = ? AND client_id = ? AND period_start = ?
           )`
        ).run(`com_${randomUUID()}`, partner.id, client.id, periodStart, periodEnd,
          client.contractValue, partner.model, partner.rateBps, amount, client.currency, now(),
          partner.id, client.id, periodStart);
        if (Number(result.changes) === 1) created++;
      }

      periodStart = periodEnd;
      index++;
      /* حارسٌ ضدّ دورة لا تنتهي لو أُفسد تاريخ ما. */
      if (index > 600) break;
    }
  }

  if (created > 0) recordBillingEvent("commission.accrued", `استُحقّت ${created} عمولة`, actor, { created });
  return { created };
}

export function listCommissions(filter: { partnerId?: string; clientId?: string } = {}): Commission[] {
  const clauses: string[] = [];
  const params: string[] = [];
  if (filter.partnerId) { clauses.push("partner_id = ?"); params.push(filter.partnerId); }
  if (filter.clientId) { clauses.push("client_id = ?"); params.push(filter.clientId); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db().prepare(`SELECT * FROM partner_commissions ${where} ORDER BY period_start DESC`).all(...params);
  return (rows as Array<Record<string, unknown>>).map(commissionFromRow);
}

/** يُعلّم عمولات مدفوعة. المالك وحده، وبمرجع يُثبت الدفع. */
export function payCommissions(ids: string[], reference: string, actor = "system"): { paid: number; amount: number; currency: string } {
  ensurePartnerSchema();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) throw Object.assign(new Error("لم تُحدَّد عمولات."), { status: 400 });

  const connection = db();
  let paid = 0;
  let amount = 0;
  let currency = DEFAULT_CURRENCY;

  for (const id of unique) {
    const row = connection.prepare("SELECT * FROM partner_commissions WHERE id = ? LIMIT 1").get(id) as Record<string, unknown> | undefined;
    if (!row) continue;
    const commission = commissionFromRow(row);
    /* المدفوعة لا تُدفع مرتين، والملغاة لا تُدفع. */
    if (commission.status === "paid" || commission.status === "void") continue;
    connection.prepare("UPDATE partner_commissions SET status = 'paid', paid_at = ?, payment_reference = ? WHERE id = ?")
      .run(now(), String(reference || "").slice(0, 120), id);
    paid++;
    amount += commission.amount;
    currency = commission.currency;
  }

  if (paid > 0) {
    recordBillingEvent("commission.paid", `دُفعت ${paid} عمولة بقيمة ${formatMoney(amount, currency)}`, actor,
      { paid, amount, reference });
  }
  return { paid, amount, currency };
}

export function voidCommission(id: string, note: string, actor = "system"): Commission {
  const connection = db();
  const row = connection.prepare("SELECT * FROM partner_commissions WHERE id = ? LIMIT 1").get(id) as Record<string, unknown> | undefined;
  if (!row) throw Object.assign(new Error("العمولة غير موجودة."), { status: 404 });
  const commission = commissionFromRow(row);
  if (commission.status === "paid") {
    throw Object.assign(new Error("عمولة مدفوعة لا تُلغى — سوِّها باتفاق مكتوب."), { status: 409 });
  }
  connection.prepare("UPDATE partner_commissions SET status = 'void', note = ? WHERE id = ?")
    .run(String(note || "").slice(0, 500), id);
  recordBillingEvent("commission.void", `أُلغيت عمولة ${formatMoney(commission.amount, commission.currency)}`, actor, { id, note });
  return commissionFromRow(connection.prepare("SELECT * FROM partner_commissions WHERE id = ?").get(id) as Record<string, unknown>);
}

/* ----------------------------------------------------------- اللقطات */

export interface CommissionTotals {
  accrued: number; paid: number; due: number; currency: string;
  formatted: { accrued: string; paid: string; due: string };
}

function totalsFrom(commissions: Commission[], currency: string): CommissionTotals {
  const live = commissions.filter(commission => commission.status !== "void");
  const accrued = live.reduce((sum, commission) => sum + commission.amount, 0);
  const paid = live.filter(commission => commission.status === "paid")
    .reduce((sum, commission) => sum + commission.amount, 0);
  return {
    accrued, paid, due: accrued - paid, currency,
    formatted: {
      accrued: formatMoney(accrued, currency),
      paid: formatMoney(paid, currency),
      due: formatMoney(accrued - paid, currency),
    },
  };
}

export interface PartnerPortal {
  partner: Omit<Partner, "notes">;
  clients: Array<Client & { commissionToDate: number; commissionFormatted: string; daysToRenewal: number }>;
  commissions: Commission[];
  totals: CommissionTotals;
}

/**
 * لوحة المسوّق — ما يراه هو وحده.
 *
 * كل شيء هنا مُقيَّد بمعرّفه: شركاته، وعمولاته، ومجاميعها. ولا يُرسَل إليه إجمالي
 * إيراد المالك ولا شركات زميله ولا أي بيانة تشغيلية من داخل أي مؤسسة. والعزل
 * في الاستعلام لا في الواجهة — فما لا يخصّه لا يغادر الخادم أصلاً.
 *
 * و`notes` محذوفة عمداً: حقل المالك لملاحظاته على المسوّق، لا لعين المسوّق.
 */
export function partnerPortal(partnerId: string): PartnerPortal | undefined {
  const partner = getPartner(partnerId);
  if (!partner) return undefined;

  accrueCommissions();

  const clients = listClients({ partnerId });
  const commissions = listCommissions({ partnerId });
  const today = now();

  const { notes: _ownerNotes, ...safePartner } = partner;

  return {
    partner: safePartner,
    clients: clients.map(client => {
      const forClient = commissions.filter(commission => commission.clientId === client.id && commission.status !== "void");
      const total = forClient.reduce((sum, commission) => sum + commission.amount, 0);
      return {
        ...client,
        commissionToDate: total,
        commissionFormatted: formatMoney(total, client.currency),
        daysToRenewal: Math.max(0, daysBetween(today, client.endsAt)),
      };
    }),
    commissions,
    totals: totalsFrom(commissions, partner.currency),
  };
}

export interface PartnerOverview {
  partners: Array<Partner & { clientCount: number; totals: CommissionTotals }>;
  clients: Client[];
  commissions: Commission[];
  totals: CommissionTotals;
  /** إجمالي قيمة العقود الجارية — رقم المالك وحده. */
  contractedValue: number;
  contractedValueFormatted: string;
}

/** لوحة المالك: كل المسوّقين وكل الشركات وكل العمولات. */
export function partnerOverview(): PartnerOverview {
  ensurePartnerSchema();
  accrueCommissions();

  const partners = listPartners();
  const clients = listClients();
  const commissions = listCommissions();
  const currency = partners[0]?.currency || DEFAULT_CURRENCY;

  const contractedValue = clients
    .filter(client => client.status === "active" || client.status === "past_due")
    .reduce((sum, client) => sum + client.contractValue, 0);

  return {
    partners: partners.map(partner => ({
      ...partner,
      clientCount: clients.filter(client => client.partnerId === partner.id).length,
      totals: totalsFrom(commissions.filter(commission => commission.partnerId === partner.id), partner.currency),
    })),
    clients,
    commissions,
    totals: totalsFrom(commissions, currency),
    contractedValue,
    contractedValueFormatted: formatMoney(contractedValue, currency),
  };
}
