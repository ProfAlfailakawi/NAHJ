import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { openDatabase } from "./persistence.ts";
import {
  DEFAULT_CURRENCY, ensureBillingSchema, formatMoney, getInvoice, minorUnits,
  recordBillingEvent, recordPayment, type Invoice, type PaymentMethod,
} from "./billing.ts";

/*
 * بوابة الدفع.
 *
 * كانت الفوترة كاملةً إلا من طرفٍ واحد: المؤسسة ترى فاتورتها ولا تملك أن تدفعها.
 * فيتحوّل التحصيل إلى مطاردة — رسالة، ثم تحويل بنكي، ثم مرجعٌ يُكتب باليد في
 * لوحة المالك. وكل يومٍ بين «أصدرتُ الفاتورة» و«وصل المبلغ» هو يوم بلا نقد.
 *
 * وبُني هذا الملف على خمس قواعد، كلٌّ منها مكتوبةٌ بدم نظامٍ سقط بسببها:
 *
 *   ١. **لا بوابة مُدَّعاة.** بلا مفتاح مضبوط لا يُنشأ رابط دفع ولا يُعرض زرّ:
 *      يُقال صراحةً إن البوابة غير مربوطة وإن الدفع يُسجَّل يدوياً. ورابطٌ وهمي
 *      يقود المشتري إلى صفحة لا تعمل أسوأ من غياب الزرّ بكثير.
 *
 *   ٢. **لا يُصدَّق الردّ، يُسأل المزوّد.** الويب-هوك مجرّد إشعار: يُتحقق من
 *      توقيعه، ثم يُسأل المزوّد عن حالة العملية بمعرّفها قبل أن يُسجَّل فلسٌ
 *      واحد. من يسجّل الدفع من جسم الطلب يُسدَّد عنده بطلبٍ مُلفَّق.
 *
 *   ٣. **التسوية ذرّية.** المزوّدون يُعيدون إرسال الويب-هوك حتى يستلموا 200،
 *      وقد يصل الإشعار مرتين في اللحظة نفسها. فانتقال الحالة إلى «مدفوعة» يجري
 *      بجملة `UPDATE ... WHERE status <> 'paid'` ولا تُسجَّل الدفعة إلا إن غيّرت
 *      هي صفّاً. وإلا سُجِّلت الدفعة مرتين على فاتورة واحدة.
 *
 *   ٤. **المبلغ يُطابَق.** ما يُعيده المزوّد يُقارن بما أُنشئت به النيّة عملةً
 *      ومقداراً؛ وأي اختلاف يُوقف التسجيل ويُسجَّل للمراجعة البشرية. الدينار
 *      الكويتي ثلاث منازل، وأكثر تكاملات الدفع تفترض اثنتين فتخطئ بعشرة أضعاف.
 *
 *   ٥. **السرّ لا يخرج.** لا مفتاح ولا سرّ توقيع يُعاد في أي مسار؛ الحالة
 *      المعروضة تقول «مضبوط/غير مضبوط» ولا تقول أكثر.
 */

/* ------------------------------------------------------------ الإعداد */

export type PaymentProvider = "manual" | "myfatoorah" | "tap";

export interface GatewayConfig {
  provider: PaymentProvider;
  apiKey: string;
  webhookSecret: string;
  environment: "test" | "live";
  publicUrl: string;
  apiBase: string;
}

const PROVIDER_BASES: Record<Exclude<PaymentProvider, "manual">, { test: string; live: string }> = {
  myfatoorah: { test: "https://apitest.myfatoorah.com", live: "https://api.myfatoorah.com" },
  tap: { test: "https://api.tap.company", live: "https://api.tap.company" },
};

export const PROVIDER_LABEL_AR: Record<PaymentProvider, string> = {
  manual: "تسجيل يدوي (بلا بوابة)",
  myfatoorah: "ماي فاتورة — MyFatoorah",
  tap: "تاب — Tap Payments",
};

const env = (name: string) => String(process.env[name] || "").trim();

/**
 * يقرأ الإعداد عند كل نداء لا عند تحميل الملف.
 *
 * ضبطُ مفتاحٍ ثم إعادة التشغيل شيء، وضبطه ثم انتظار أن يعمل شيء آخر. والقراءة
 * الكسولة تجعل الفحوص تضبط بيئتها وتُلغيها بلا إعادة تحميل الوحدة.
 */
export function gatewayConfig(): GatewayConfig {
  const raw = env("NAHJ_PAYMENT_PROVIDER").toLowerCase();
  const provider: PaymentProvider = raw === "myfatoorah" || raw === "tap" ? raw : "manual";
  const environment = env("NAHJ_PAYMENT_ENV").toLowerCase() === "live" ? "live" : "test";
  const explicitBase = env("NAHJ_PAYMENT_API_BASE");
  return {
    provider,
    apiKey: env("NAHJ_PAYMENT_API_KEY"),
    webhookSecret: env("NAHJ_PAYMENT_WEBHOOK_SECRET"),
    environment,
    publicUrl: env("NAHJ_PUBLIC_URL").replace(/\/+$/, ""),
    apiBase: (explicitBase || (provider === "manual" ? "" : PROVIDER_BASES[provider][environment])).replace(/\/+$/, ""),
  };
}

export interface GatewayStatus {
  provider: PaymentProvider;
  providerLabel: string;
  /** هل يمكن إنشاء رابط دفع الآن؟ */
  configured: boolean;
  environment: "test" | "live";
  /** ما ينقص ليصبح `configured` صحيحاً — يُعرض للمالك ليُكمله. */
  missing: string[];
  webhookUrl: string;
  returnUrl: string;
  /** إشعارٌ صريح حين لا بوابة: الدفع يُسجَّل يدوياً. */
  note: string;
}

const MISSING_LABELS: Record<string, string> = {
  NAHJ_PAYMENT_API_KEY: "مفتاح المزوّد (NAHJ_PAYMENT_API_KEY)",
  NAHJ_PAYMENT_WEBHOOK_SECRET: "سرّ التوقيع (NAHJ_PAYMENT_WEBHOOK_SECRET)",
  NAHJ_PUBLIC_URL: "عنوان النشر العلني (NAHJ_PUBLIC_URL)",
};

export function gatewayStatus(): GatewayStatus {
  const config = gatewayConfig();
  const missing: string[] = [];
  if (config.provider !== "manual") {
    if (!config.apiKey) missing.push(MISSING_LABELS.NAHJ_PAYMENT_API_KEY);
    if (!config.webhookSecret) missing.push(MISSING_LABELS.NAHJ_PAYMENT_WEBHOOK_SECRET);
    if (!config.publicUrl) missing.push(MISSING_LABELS.NAHJ_PUBLIC_URL);
  }
  const configured = config.provider !== "manual" && missing.length === 0;
  return {
    provider: config.provider,
    providerLabel: PROVIDER_LABEL_AR[config.provider],
    configured,
    environment: config.environment,
    missing,
    webhookUrl: config.publicUrl ? `${config.publicUrl}/api/payments/webhook/${config.provider}` : "",
    returnUrl: config.publicUrl ? `${config.publicUrl}/api/payments/return` : "",
    note: configured
      ? config.environment === "test"
        ? "البوابة مربوطة على بيئة الاختبار — العمليات لا تُحصِّل مالاً حقيقياً."
        : "البوابة مربوطة على البيئة الحيّة."
      : config.provider === "manual"
        ? "لا بوابة مربوطة. الفواتير تُسدَّد خارج المنصة ويُسجّل المالك الدفعة بمرجعها."
        : "المزوّد مُعلن لكن إعداده ناقص — لن يُنشأ رابط دفع حتى يكتمل.",
  };
}

/* -------------------------------------------------------------- المخطّط */

let schemaReady = false;

/**
 * جدول نيّات الدفع.
 *
 * `provider_ref` فريد: هو حبل النجاة عند تكرار الإشعار، وعند إعادة المزوّد
 * الإرسالَ بعد انقطاع. ونُخزّن المبلغ والعملة كما أُنشئت بهما النيّة لتُقارَن
 * لاحقاً بما يقوله المزوّد — لا نثق بأن أحداً لم يعبث بينهما.
 */
function ensurePaymentSchema(): void {
  if (schemaReady) return;
  ensureBillingSchema();
  const db = openDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_intents (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_ref TEXT NOT NULL,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      checkout_url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      settled_at TEXT,
      payment_id TEXT,
      failure_reason TEXT NOT NULL DEFAULT ''
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_intent_provider_ref ON payment_intents(provider, provider_ref);
    CREATE INDEX IF NOT EXISTS idx_intent_invoice ON payment_intents(invoice_id, status);
  `);
  schemaReady = true;
}

/** تُستدعى من الفحوص عند تبديل ملف القاعدة. */
export function resetPaymentSchemaCache(): void {
  schemaReady = false;
}

export type IntentStatus = "pending" | "paid" | "failed" | "canceled" | "mismatch";

export interface PaymentIntent {
  id: string;
  invoiceId: string;
  provider: PaymentProvider;
  providerRef: string;
  amount: number;
  currency: string;
  status: IntentStatus;
  checkoutUrl: string;
  createdAt: string;
  updatedAt: string;
  settledAt: string | null;
  paymentId: string | null;
  failureReason: string;
}

const nowIso = () => new Date().toISOString();

const rowToIntent = (row: Record<string, unknown>): PaymentIntent => ({
  id: String(row.id),
  invoiceId: String(row.invoice_id),
  provider: String(row.provider) as PaymentProvider,
  providerRef: String(row.provider_ref),
  amount: Number(row.amount),
  currency: String(row.currency),
  status: String(row.status) as IntentStatus,
  checkoutUrl: String(row.checkout_url ?? ""),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  settledAt: row.settled_at ? String(row.settled_at) : null,
  paymentId: row.payment_id ? String(row.payment_id) : null,
  failureReason: String(row.failure_reason ?? ""),
});

export function getIntent(id: string): PaymentIntent | undefined {
  ensurePaymentSchema();
  const row = openDatabase().prepare("SELECT * FROM payment_intents WHERE id = ? LIMIT 1").get(id) as Record<string, unknown> | undefined;
  return row ? rowToIntent(row) : undefined;
}

export function findIntentByRef(provider: PaymentProvider, providerRef: string): PaymentIntent | undefined {
  ensurePaymentSchema();
  const row = openDatabase()
    .prepare("SELECT * FROM payment_intents WHERE provider = ? AND provider_ref = ? LIMIT 1")
    .get(provider, providerRef) as Record<string, unknown> | undefined;
  return row ? rowToIntent(row) : undefined;
}

export function listIntents(limit = 50): PaymentIntent[] {
  ensurePaymentSchema();
  const rows = openDatabase()
    .prepare("SELECT * FROM payment_intents ORDER BY created_at DESC LIMIT ?")
    .all(Math.min(Math.max(limit, 1), 500)) as Array<Record<string, unknown>>;
  return rows.map(rowToIntent);
}

/* ------------------------------------------------------------- المبالغ */

/** من الوحدة الصغرى إلى نصٍّ عشري كما يطلبه المزوّدون. الدينار ثلاث منازل. */
export function toMajorString(amountMinor: number, currency: string): string {
  const exponent = minorUnits(currency);
  const sign = amountMinor < 0 ? "-" : "";
  const absolute = Math.abs(Math.round(amountMinor));
  const divisor = 10 ** exponent;
  const whole = Math.floor(absolute / divisor);
  if (!exponent) return `${sign}${whole}`;
  return `${sign}${whole}.${String(absolute % divisor).padStart(exponent, "0")}`;
}

/** ومن نصّ المزوّد إلى الوحدة الصغرى. `Math.round` بعد الضرب لا قبله. */
export function toMinorAmount(value: unknown, currency: string): number {
  const numeric = typeof value === "number" ? value : Number(String(value ?? "").replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(numeric)) return NaN;
  return Math.round(numeric * 10 ** minorUnits(currency));
}

/* -------------------------------------------------------- ناقل الطلبات */

export interface TransportRequest {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
}

export type Transport = (request: TransportRequest) => Promise<{ status: number; body: string }>;

/*
 * الناقل الافتراضي هو `fetch` الحقيقي — وطلبٌ إلى الشبكة يخرج فعلاً.
 *
 * ويُبدَّل في الفحوص بناقلٍ يردّ أجوبة المزوّد المعروفة، فتُختبر المطابقة
 * والتوقيع والتكرار بلا مفتاح ولا إنترنت.
 */
let transport: Transport = async request => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    });
    return { status: response.status, body: await response.text() };
  } finally {
    clearTimeout(timer);
  }
};

export function setPaymentTransport(next: Transport | null): void {
  transport = next || transport;
}

const parseJson = (body: string): Record<string, any> => {
  try { return JSON.parse(body) as Record<string, any>; } catch { return {}; }
};

/* ------------------------------------------------------------ المزوّدون */

interface CheckoutRequest {
  invoice: Invoice;
  amount: number;
  reference: string;
  payerName: string;
  payerEmail: string;
  payerPhone: string;
  returnUrl: string;
}

interface CheckoutResponse {
  providerRef: string;
  checkoutUrl: string;
}

interface RemoteState {
  status: "paid" | "pending" | "failed";
  amount: number;
  currency: string;
  raw: Record<string, any>;
}

const gatewayError = (message: string, status = 502) => Object.assign(new Error(message), { status });

const adapters: Record<Exclude<PaymentProvider, "manual">, {
  checkout(config: GatewayConfig, request: CheckoutRequest): Promise<CheckoutResponse>;
  fetchState(config: GatewayConfig, providerRef: string): Promise<RemoteState>;
  verifySignature(config: GatewayConfig, rawBody: string, headers: Record<string, string>): boolean;
  refFromWebhook(payload: Record<string, any>): string;
}> = {
  /* ------------------------------------------------------- ماي فاتورة */
  myfatoorah: {
    async checkout(config, request) {
      const response = await transport({
        url: `${config.apiBase}/v2/SendPayment`,
        method: "POST",
        headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          NotificationOption: "LNK",
          CustomerName: request.payerName,
          CustomerEmail: request.payerEmail || undefined,
          CustomerMobile: request.payerPhone || undefined,
          InvoiceValue: Number(toMajorString(request.amount, request.invoice.currency)),
          DisplayCurrencyIso: request.invoice.currency,
          CustomerReference: request.reference,
          UserDefinedField: request.reference,
          CallBackUrl: `${request.returnUrl}?ref=${encodeURIComponent(request.reference)}`,
          ErrorUrl: `${request.returnUrl}?ref=${encodeURIComponent(request.reference)}&failed=1`,
          InvoiceItems: request.invoice.lines.map(line => ({
            ItemName: line.description.slice(0, 100),
            Quantity: Math.max(1, Math.round(line.quantity)),
            UnitPrice: Number(toMajorString(line.unitAmount, request.invoice.currency)),
          })),
        }),
      });
      const payload = parseJson(response.body);
      if (response.status >= 400 || payload.IsSuccess === false) {
        throw gatewayError(`رفض ماي فاتورة إنشاء العملية: ${payload.Message || response.status}`);
      }
      const providerRef = String(payload?.Data?.InvoiceId ?? "");
      const checkoutUrl = String(payload?.Data?.InvoiceURL ?? "");
      if (!providerRef || !checkoutUrl) throw gatewayError("ردّ ماي فاتورة بلا رابط دفع أو معرّف عملية.");
      return { providerRef, checkoutUrl };
    },

    async fetchState(config, providerRef) {
      const response = await transport({
        url: `${config.apiBase}/v2/GetPaymentStatus`,
        method: "POST",
        headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ Key: providerRef, KeyType: "InvoiceId" }),
      });
      const payload = parseJson(response.body);
      if (response.status >= 400 || payload.IsSuccess === false) {
        throw gatewayError(`تعذّر سؤال ماي فاتورة عن حالة العملية: ${payload.Message || response.status}`);
      }
      const data = payload?.Data || {};
      const currency = String(data.InvoiceDisplayValue ? data.InvoiceDisplayValue.replace(/[\d.,\s]/g, "") : "" ) || String(data.InvoiceCurrency || DEFAULT_CURRENCY);
      const transactions: Array<Record<string, any>> = Array.isArray(data.InvoiceTransactions) ? data.InvoiceTransactions : [];
      const paidTransaction = transactions.find(tx => String(tx.TransactionStatus || "").toLowerCase() === "succss"
        || String(tx.TransactionStatus || "").toLowerCase() === "success");
      const status = String(data.InvoiceStatus || "").toLowerCase();
      return {
        status: status === "paid" || !!paidTransaction ? "paid" : status === "failed" || status === "expired" ? "failed" : "pending",
        amount: toMinorAmount(paidTransaction?.PaidCurrencyValue ?? data.InvoiceValue, currency),
        currency: String(paidTransaction?.PaidCurrency || currency).toUpperCase(),
        raw: data,
      };
    },

    /*
     * توقيع ماي فاتورة: HMAC-SHA256 بالسرّ على جسم الطلب كما وصل، مُرمَّزاً
     * base64 في ترويسة `MyFatoorah-Signature`. والمقارنة بزمنٍ ثابت.
     */
    verifySignature(config, rawBody, headers) {
      const provided = headers["myfatoorah-signature"] || headers["x-nahj-signature"] || "";
      if (!provided) return false;
      const expected = createHmac("sha256", config.webhookSecret).update(rawBody, "utf8").digest("base64");
      return constantTimeEquals(provided.trim(), expected);
    },

    refFromWebhook(payload) {
      return String(payload?.Data?.InvoiceId ?? payload?.InvoiceId ?? payload?.Data?.Invoice?.Id ?? "");
    },
  },

  /* -------------------------------------------------------------- تاب */
  tap: {
    async checkout(config, request) {
      const response = await transport({
        url: `${config.apiBase}/v2/charges`,
        method: "POST",
        headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          amount: Number(toMajorString(request.amount, request.invoice.currency)),
          currency: request.invoice.currency,
          threeDSecure: true,
          description: `فاتورة ${request.invoice.number}`,
          reference: { order: request.reference, transaction: request.reference },
          customer: { first_name: request.payerName, email: request.payerEmail || undefined },
          source: { id: "src_all" },
          post: { url: gatewayStatus().webhookUrl },
          redirect: { url: `${request.returnUrl}?ref=${encodeURIComponent(request.reference)}` },
        }),
      });
      const payload = parseJson(response.body);
      if (response.status >= 400 || payload.errors) {
        throw gatewayError(`رفضت تاب إنشاء العملية: ${payload?.errors?.[0]?.description || response.status}`);
      }
      const providerRef = String(payload.id ?? "");
      const checkoutUrl = String(payload?.transaction?.url ?? "");
      if (!providerRef || !checkoutUrl) throw gatewayError("ردّ تاب بلا رابط دفع أو معرّف عملية.");
      return { providerRef, checkoutUrl };
    },

    async fetchState(config, providerRef) {
      const response = await transport({
        url: `${config.apiBase}/v2/charges/${encodeURIComponent(providerRef)}`,
        method: "GET",
        headers: { authorization: `Bearer ${config.apiKey}` },
      });
      const payload = parseJson(response.body);
      if (response.status >= 400 || payload.errors) {
        throw gatewayError(`تعذّر سؤال تاب عن حالة العملية: ${payload?.errors?.[0]?.description || response.status}`);
      }
      const status = String(payload.status || "").toUpperCase();
      const currency = String(payload.currency || DEFAULT_CURRENCY).toUpperCase();
      return {
        status: status === "CAPTURED" ? "paid" : status === "FAILED" || status === "DECLINED" || status === "CANCELLED" ? "failed" : "pending",
        amount: toMinorAmount(payload.amount, currency),
        currency,
        raw: payload,
      };
    },

    /*
     * تاب تُرسل `hashstring`: HMAC-SHA256 بالسرّ على حقولٍ مرتّبة بعينها، لا
     * على الجسم كاملاً. فتُركَّب السلسلة بالترتيب نفسه وإلا رُفض كل إشعار صحيح.
     */
    verifySignature(config, rawBody, headers) {
      const provided = headers.hashstring || headers["x-nahj-signature"] || "";
      if (!provided) return false;
      const payload = parseJson(rawBody);
      const toHash = [
        `x_id${payload.id ?? ""}`,
        `x_amount${payload.amount ?? ""}`,
        `x_currency${payload.currency ?? ""}`,
        `x_gateway_reference${payload?.reference?.gateway ?? ""}`,
        `x_payment_reference${payload?.reference?.payment ?? ""}`,
        `x_status${payload.status ?? ""}`,
        `x_created${payload.transaction?.created ?? ""}`,
      ].join("");
      const expected = createHmac("sha256", config.webhookSecret).update(toHash, "utf8").digest("hex");
      return constantTimeEquals(provided.trim(), expected);
    },

    refFromWebhook(payload) {
      return String(payload?.id ?? "");
    },
  },
};

/** مقارنةٌ بزمنٍ ثابت لا تُسرّب طول التطابق. */
export function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/* ------------------------------------------------------- إنشاء العملية */

export interface CheckoutInput {
  invoiceId: string;
  payerName?: string;
  payerEmail?: string;
  payerPhone?: string;
}

/** ما يتبقّى على الفاتورة — وهو سقف أي عملية دفع. */
export const remainingOn = (invoice: Invoice) => Math.max(0, invoice.total - invoice.amountPaid);

/**
 * يُنشئ عملية دفع مستضافة عند المزوّد ويُعيد رابطها.
 *
 * ولا يُنشئ رابطين لفاتورةٍ واحدة بلا داعٍ: نيّةٌ معلّقة قائمة بالمبلغ نفسه
 * تُعاد كما هي. فالضغط مرّتين على الزرّ لا يُخلّف عمليتين معلّقتين عند المزوّد،
 * ولا يُسدَّد بهما مرّتان.
 */
export async function createCheckout(input: CheckoutInput, actor = "system"): Promise<PaymentIntent> {
  ensurePaymentSchema();
  const status = gatewayStatus();
  if (!status.configured) {
    throw Object.assign(
      new Error(status.provider === "manual"
        ? "لا بوابة دفع مربوطة في هذا النشر — تُسدَّد الفاتورة خارج المنصة ويُسجّل المالك الدفعة بمرجعها."
        : `إعداد بوابة الدفع ناقص: ${status.missing.join("، ")}.`),
      { status: 409, code: "GATEWAY_NOT_CONFIGURED" },
    );
  }

  const invoice = getInvoice(String(input.invoiceId || ""));
  if (!invoice) throw Object.assign(new Error("الفاتورة غير موجودة."), { status: 404 });
  if (invoice.status === "void") throw Object.assign(new Error("لا تُسدَّد فاتورة ملغاة."), { status: 409 });
  const amount = remainingOn(invoice);
  if (amount <= 0) throw Object.assign(new Error("الفاتورة مسدّدة بالكامل."), { status: 409 });

  const db = openDatabase();
  const existing = db.prepare(
    "SELECT * FROM payment_intents WHERE invoice_id = ? AND status = 'pending' AND amount = ? AND provider = ? ORDER BY created_at DESC LIMIT 1",
  ).get(invoice.id, amount, status.provider) as Record<string, unknown> | undefined;
  if (existing) {
    const intent = rowToIntent(existing);
    /* رابطٌ قائم وصالح يُعاد كما هو؛ وما تجاوز الساعتين يُترك ويُنشأ غيره. */
    if (Date.now() - new Date(intent.createdAt).getTime() < 2 * 60 * 60_000 && intent.checkoutUrl) return intent;
  }

  const config = gatewayConfig();
  const id = `pi_${randomUUID()}`;
  const reference = `${invoice.number}:${id}`;
  const adapter = adapters[config.provider as Exclude<PaymentProvider, "manual">];

  const result = await adapter.checkout(config, {
    invoice,
    amount,
    reference,
    payerName: String(input.payerName || "").slice(0, 80) || "عميل نهج",
    payerEmail: String(input.payerEmail || "").slice(0, 120),
    payerPhone: String(input.payerPhone || "").slice(0, 20),
    returnUrl: status.returnUrl,
  });

  /*
   * مرجعٌ أعاده المزوّد ونحمله سلفاً.
   *
   * يحدث حين يُعيد المزوّد المرجع نفسه لعمليةٍ قائمة (وهو سلوكٌ مقصود عند
   * بعضهم)، وحين تُعاد المحاولة بعد انقطاع. وبلا معالجة ينكسر القيد الفريد
   * فيصل نصّ خطأ SQLite إلى شاشة المشتري — وهو تسريبُ بنيةٍ داخلية وإخفاقٌ
   * بلا معنى في آن.
   *
   * فإن كان المرجع لنفس الفاتورة وما زال معلّقاً: تُحدَّث النيّة القائمة وتُعاد.
   * وإن كان لفاتورةٍ أخرى: يُرفض صراحةً ويُسجَّل — ربطُ تحصيلٍ بفاتورةٍ خاطئة
   * أسوأ من رفضٍ مفهوم.
   */
  const at = nowIso();
  const clashing = findIntentByRef(config.provider, result.providerRef);
  if (clashing) {
    if (clashing.invoiceId === invoice.id && clashing.status === "pending") {
      db.prepare("UPDATE payment_intents SET checkout_url = ?, amount = ?, updated_at = ? WHERE id = ?")
        .run(result.checkoutUrl, amount, at, clashing.id);
      return getIntent(clashing.id)!;
    }
    recordBillingEvent("payment.intent.conflict", "أعاد المزوّد مرجع عمليةٍ مستعملاً سلفاً", actor, {
      providerRef: result.providerRef, heldBy: clashing.id, heldInvoice: clashing.invoiceId, requestedInvoice: invoice.id,
    });
    throw Object.assign(
      new Error("أعاد المزوّد مرجع عملية مستعملاً لفاتورة أخرى — لم يُنشأ رابط. أعد المحاولة، وإن تكرّر فراجع لوحة المزوّد."),
      { status: 409, code: "PROVIDER_REF_CONFLICT" },
    );
  }

  db.prepare(
    `INSERT INTO payment_intents(id, invoice_id, provider, provider_ref, amount, currency, status, checkout_url, created_at, updated_at)
     VALUES(?,?,?,?,?,?,'pending',?,?,?)`,
  ).run(id, invoice.id, config.provider, result.providerRef, amount, invoice.currency, result.checkoutUrl, at, at);

  recordBillingEvent("payment.intent.created", `عملية دفع ${formatMoney(amount, invoice.currency)} على ${invoice.number}`, actor, {
    intentId: id, invoiceId: invoice.id, provider: config.provider, providerRef: result.providerRef, environment: config.environment,
  });

  return getIntent(id)!;
}

/* ------------------------------------------------------------ التسوية */

export interface SettleResult {
  intent: PaymentIntent;
  /** هل سُجِّلت دفعةٌ في هذا النداء بالذات؟ يبقى `false` عند التكرار. */
  recorded: boolean;
  reason?: string;
}

const METHOD_BY_PROVIDER: Record<PaymentProvider, PaymentMethod> = {
  manual: "bank_transfer",
  myfatoorah: "knet",
  tap: "card",
};

/**
 * يسأل المزوّد عن حالة العملية، ثم يُسوّيها مرةً واحدة مهما تكرّر النداء.
 *
 * وترتيب الخطوات مقصود: المبلغ يُطابَق قبل أي كتابة، والانتقال إلى «مدفوعة»
 * يجري بشرطٍ في جملة التحديث نفسها — فالإشعاران المتزامنان لا ينجح منهما إلا
 * واحد، والثاني يجد صفراً مُغيَّراً فيخرج بلا تسجيل.
 */
export async function settleIntent(intentId: string, actor = "gateway"): Promise<SettleResult> {
  ensurePaymentSchema();
  const intent = getIntent(intentId);
  if (!intent) throw Object.assign(new Error("عملية الدفع غير موجودة."), { status: 404 });
  if (intent.status === "paid") return { intent, recorded: false, reason: "سُوّيت سابقاً" };

  const config = gatewayConfig();
  if (intent.provider === "manual" || !adapters[intent.provider as Exclude<PaymentProvider, "manual">]) {
    throw gatewayError("لا مزوّد لتسوية هذه العملية.", 409);
  }
  const remote = await adapters[intent.provider as Exclude<PaymentProvider, "manual">].fetchState(config, intent.providerRef);

  const db = openDatabase();
  const touch = (status: IntentStatus, failureReason = "") => {
    db.prepare("UPDATE payment_intents SET status = ?, updated_at = ?, failure_reason = ? WHERE id = ?")
      .run(status, nowIso(), failureReason, intent.id);
  };

  if (remote.status === "pending") {
    touch("pending");
    return { intent: getIntent(intent.id)!, recorded: false, reason: "لم تكتمل بعد" };
  }
  if (remote.status === "failed") {
    touch("failed", "أبلغ المزوّد بفشل العملية");
    recordBillingEvent("payment.intent.failed", `فشلت عملية دفع على الفاتورة`, actor, { intentId: intent.id, providerRef: intent.providerRef });
    return { intent: getIntent(intent.id)!, recorded: false, reason: "فشلت عند المزوّد" };
  }

  /* مدفوعة عند المزوّد — تُطابَق قبل أن تُصدَّق. */
  const mismatch =
    remote.currency.toUpperCase() !== intent.currency.toUpperCase() ? `العملة المحصَّلة (${remote.currency}) تخالف عملة العملية (${intent.currency})`
      : !Number.isFinite(remote.amount) ? "لم يُعِد المزوّد مبلغاً مقروءاً"
        : remote.amount !== intent.amount ? `المبلغ المحصَّل (${formatMoney(remote.amount, remote.currency)}) يخالف المطلوب (${formatMoney(intent.amount, intent.currency)})`
          : "";
  if (mismatch) {
    touch("mismatch", mismatch);
    recordBillingEvent("payment.intent.mismatch", `عملية دفع تحتاج مراجعة: ${mismatch}`, actor, {
      intentId: intent.id, providerRef: intent.providerRef, expected: intent.amount, received: remote.amount,
    });
    return { intent: getIntent(intent.id)!, recorded: false, reason: mismatch };
  }

  /*
   * البوابة الذرّية. من يصل ثانياً يجد `changes === 0` فينصرف بلا تسجيل.
   */
  const claimed = db.prepare("UPDATE payment_intents SET status = 'paid', updated_at = ? WHERE id = ? AND status <> 'paid'")
    .run(nowIso(), intent.id);
  if (Number(claimed.changes) !== 1) {
    return { intent: getIntent(intent.id)!, recorded: false, reason: "سُوّيت في نداءٍ متزامن" };
  }

  try {
    const { payment } = recordPayment({
      invoiceId: intent.invoiceId,
      amount: intent.amount,
      currency: intent.currency,
      method: METHOD_BY_PROVIDER[intent.provider],
      reference: intent.providerRef,
      note: `تحصيل عبر ${PROVIDER_LABEL_AR[intent.provider]} (${config.environment === "live" ? "حيّة" : "اختبار"})`,
    }, actor);
    db.prepare("UPDATE payment_intents SET payment_id = ?, settled_at = ? WHERE id = ?").run(payment.id, nowIso(), intent.id);
    return { intent: getIntent(intent.id)!, recorded: true };
  } catch (error) {
    /*
     * فشل التسجيل بعد نجاح التحصيل أسوأ حالةٍ ممكنة: المال قُبض ولا أثر له.
     * فتُعاد الحالة ويُسجَّل الحدث ليُعاد المحاولة، ولا يُبتلع الخطأ.
     */
    touch("mismatch", error instanceof Error ? error.message : "تعذّر تسجيل الدفعة");
    recordBillingEvent("payment.settlement.failed", "حُصِّل المبلغ ولم تُسجَّل الدفعة — يلزم تدخّل", actor, {
      intentId: intent.id, providerRef: intent.providerRef, error: String(error instanceof Error ? error.message : error),
    });
    throw error;
  }
}

/* ---------------------------------------------------------- الويب-هوك */

export interface WebhookResult {
  handled: boolean;
  intentId?: string;
  recorded?: boolean;
  reason?: string;
}

/**
 * يستقبل إشعار المزوّد.
 *
 * ولا يقرأ منه إلا معرّف العملية: الحالة والمبلغ يُسألان من المزوّد مباشرة.
 * فجسم الطلب — حتى بعد التحقق من توقيعه — ليس مصدر حقيقةٍ عن المال.
 */
export async function handleWebhook(
  providerParam: string,
  rawBody: string,
  headers: Record<string, string>,
): Promise<WebhookResult> {
  ensurePaymentSchema();
  const config = gatewayConfig();
  const provider = String(providerParam || "").toLowerCase() as PaymentProvider;

  if (provider !== config.provider || provider === "manual") {
    throw Object.assign(new Error("مزوّد غير مُفعَّل في هذا النشر."), { status: 404 });
  }
  if (!config.webhookSecret) {
    throw Object.assign(new Error("لا سرّ توقيع مضبوط — لا يُقبل إشعار غير موقَّع."), { status: 503 });
  }

  const adapter = adapters[provider as Exclude<PaymentProvider, "manual">];
  if (!adapter.verifySignature(config, rawBody, headers)) {
    throw Object.assign(new Error("توقيع الإشعار غير صالح."), { status: 401, code: "BAD_SIGNATURE" });
  }

  const providerRef = adapter.refFromWebhook(parseJson(rawBody));
  if (!providerRef) return { handled: false, reason: "إشعار بلا معرّف عملية" };

  const intent = findIntentByRef(provider, providerRef);
  /*
   * عمليةٌ لا نعرفها ليست خطأً يُعاد إرساله: قد تكون من نشرٍ آخر يشارك المفتاح
   * نفسه. تُقبل بـ200 ولا يُكتب شيء — وإلا ظلّ المزوّد يعيدها إلى الأبد.
   */
  if (!intent) return { handled: false, reason: "عملية غير معروفة لهذا النشر" };

  const result = await settleIntent(intent.id, `webhook:${provider}`);
  return { handled: true, intentId: intent.id, recorded: result.recorded, reason: result.reason };
}

/**
 * عودة الدافع من صفحة المزوّد.
 *
 * ولا يُعتدّ بما تحمله العودة من حالة: المرجع وحده يُقرأ ثم تُسأل البوابة. فمن
 * يفتح رابط العودة بيده لا يجعل فاتورته مدفوعة.
 */
export async function settleByReference(reference: string, actor = "return"): Promise<SettleResult | null> {
  ensurePaymentSchema();
  const intentId = String(reference || "").split(":").pop() || "";
  if (!intentId.startsWith("pi_")) return null;
  const intent = getIntent(intentId);
  if (!intent) return null;
  if (intent.status === "paid") return { intent, recorded: false, reason: "سُوّيت سابقاً" };
  return settleIntent(intent.id, actor);
}

/** كل ما يخصّ فاتورةً بعينها من عمليات — يُعرض للمالك. */
export function intentsForInvoice(invoiceId: string): PaymentIntent[] {
  ensurePaymentSchema();
  const rows = openDatabase()
    .prepare("SELECT * FROM payment_intents WHERE invoice_id = ? ORDER BY created_at DESC")
    .all(invoiceId) as Array<Record<string, unknown>>;
  return rows.map(rowToIntent);
}
