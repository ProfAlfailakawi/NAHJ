export class ApiError extends Error {
  status: number;
  payload: unknown;
  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

/** رمز CSRF يضعه الخادم في كوكي مقروء عمداً ليُعاد في ترويسة كل طلب مُعدِّل. */
export function csrfToken(): string {
  const match = document.cookie.split(";").map(part => part.trim().split("=")).find(([key]) => key === "nahj_csrf");
  return match ? decodeURIComponent(match.slice(1).join("=")) : "";
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || "GET").toUpperCase();
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(["GET", "HEAD"].includes(method) ? {} : { "X-CSRF-Token": csrfToken() }),
      ...(init?.headers || {}),
    },
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message?: unknown }).message || "API request failed")
        : `API request failed (${response.status})`;
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}

/*
 * الارتداد الصامت مقبول لأخطاء عابرة، لكن 401 ليست خطأً عابراً: تعني أن الجلسة انتهت.
 * ابتلاعها كان سيُظهر بيانات بذرة للمستخدم وكأنها سجلّه، فنُعيد رميها ليتعامل معها
 * التطبيق بإعادة عرض شاشة الدخول.
 */
export class UnauthorizedError extends Error {
  constructor() { super("SESSION_EXPIRED"); this.name = "UnauthorizedError"; }
}

export async function apiOrNull<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    return await api<T>(path, init);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) throw new UnauthorizedError();
    console.warn(`[NAHJ] API fallback for ${path}`, error);
    return null;
  }
}

export const authApi = {
  status: () => api<{ needsSetup: boolean }>("/auth/status"),
  setup: (name: string, email: string, password: string) =>
    api<{ account: { id: string; email: string; name: string; role: string }; csrfToken: string }>(
      "/auth/setup", { method: "POST", body: JSON.stringify({ name, email, password }) }
    ),
  me: () => api<{ account: { id: string; email: string; name: string; role: string } }>("/auth/me"),
  login: (email: string, password: string) =>
    api<{ account: { id: string; email: string; name: string; role: string }; csrfToken: string }>(
      "/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }
    ),
  logout: () => api<void>("/auth/logout", { method: "POST" }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api<{ ok: boolean }>("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),
};

export interface AccountSummary {
  id: string; email: string; name: string; role: string; status: string;
  createdAt: string; lastLoginAt: string | null; lockedUntil: string | null; activeSessions: number;
}

/** إدارة الحسابات — المشرف وحده، ومحجوبة عن البيئة التجريبية. */
export const accountsApi = {
  list: () => api<{ accounts: AccountSummary[] }>("/auth/accounts"),
  create: (body: { name: string; email: string; password: string; role: string }) =>
    api<{ account: AccountSummary }>("/auth/accounts", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: { role?: string; status?: string }) =>
    api<{ account: AccountSummary }>(`/auth/accounts/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }),
  setPassword: (id: string, newPassword: string) =>
    api<{ ok: boolean }>(`/auth/accounts/${encodeURIComponent(id)}/password`, { method: "POST", body: JSON.stringify({ newPassword }) }),
  revokeSessions: (id: string) =>
    api<{ revoked: number }>(`/auth/accounts/${encodeURIComponent(id)}/revoke-sessions`, { method: "POST", body: "{}" }),
};

/* ---------------------------------------------------------------- الترخيص */

export type BillingCycle = "monthly" | "quarterly" | "annual";
export type SubscriptionStatus =
  | "trialing" | "active" | "past_due" | "grace" | "suspended" | "canceled" | "expired";

export interface PlanLimits {
  seats: number | null; skills: number | null; workItemsPerMonth: number | null;
  connectors: number | null; mcpServers: number | null; aiCallsPerMonth: number | null;
  maxAutonomyLevel: number; auditRetentionDays: number | null;
}

export type PlanFeatureKey =
  | "teachMode" | "shadowEngine" | "processIntelligence" | "mcp" | "externalConnectors"
  | "apiAccess" | "sso" | "customPolicies" | "whiteLabel" | "onPremise"
  | "prioritySupport" | "dedicatedSuccessManager";

export type PlanFeatures = Partial<Record<PlanFeatureKey, boolean>>;

export interface Plan {
  id: string; code: string; nameAr: string; nameEn: string; taglineAr: string; taglineEn: string;
  currency: string; priceMonthly: number; priceQuarterly: number; priceAnnual: number;
  setupFee: number; extraSeatMonthly: number; limits: PlanLimits; features: PlanFeatures;
  isPublic: boolean; archived: boolean; sortOrder: number; createdAt: string; updatedAt: string;
}

export interface InvoiceLine { description: string; quantity: number; unitAmount: number; amount: number }

export interface Invoice {
  id: string; number: string; kind: string; planCode: string | null;
  periodStart: string | null; periodEnd: string | null; issuedAt: string; dueAt: string;
  currency: string; subtotal: number; discount: number; tax: number; total: number;
  amountPaid: number; status: string; lines: InvoiceLine[]; notes: string;
}

export interface Payment {
  id: string; invoiceId: string | null; amount: number; currency: string;
  method: string; reference: string; paidAt: string; recordedBy: string; note: string;
}

export interface Subscription {
  id: string; planCode: string; cycle: BillingCycle; startedAt: string;
  currentPeriodStart: string; currentPeriodEnd: string; trialEndsAt: string | null;
  autoRenew: boolean; cancelAtPeriodEnd: boolean; canceledAt: string | null;
  graceDays: number; discountBps: number; taxBps: number; seatsPurchased: number;
  currency: string; terminated: boolean; notes: string; updatedAt: string;
}

export interface SubscriptionState {
  status: SubscriptionStatus; writable: boolean; daysRemaining: number;
  graceDaysRemaining: number; isTrial: boolean; reason: string;
}

export interface UsageSnapshot {
  seats: number; skills: number; workItemsThisPeriod: number;
  connectors: number; mcpServers: number; aiCallsThisPeriod: number;
}

export interface BillingSnapshot {
  subscription: Subscription | null;
  plan: Plan | null;
  state: SubscriptionState;
  scheduledPlanChange: { planCode: string; cycle: BillingCycle } | null;
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
  formatted: { nextRenewalAmount: string | null; outstanding: string; lifetimePaid: string; credit: string };
  isDemo?: boolean;
  demoNote?: string;
  viewerRole?: string;
  isOwner?: boolean;
}

export interface BillingEvent {
  id: string; at: string; type: string; actor: string; summary: string; detail: Record<string, unknown>;
}

export interface RevenueSummary {
  currency: string; collectedLifetime: number; collectedThisYear: number; outstanding: number;
  invoicesIssued: number; invoicesOverdue: number; mrr: number; arr: number;
  formatted: Record<string, string>;
}

export interface OwnerOverview {
  snapshot: BillingSnapshot; revenue: RevenueSummary; plans: Plan[]; events: BillingEvent[];
}

const post = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });

export const billingApi = {
  subscription: () => api<BillingSnapshot>("/billing/subscription"),
  plans: () => api<{ plans: Plan[]; currency: string }>("/billing/plans"),
  request: (kind: string, message: string) => post<{ ok: boolean }>("/billing/request", { kind, message }),

  ownerOverview: () => api<OwnerOverview>("/billing/owner/overview"),
  savePlan: (plan: Record<string, unknown>) => post<{ plan: Plan }>("/billing/owner/plans", plan),
  archivePlan: (code: string) => post<{ plan: Plan }>(`/billing/owner/plans/${encodeURIComponent(code)}/archive`, {}),
  restorePlan: (code: string) => post<{ plan: Plan }>(`/billing/owner/plans/${encodeURIComponent(code)}/restore`, {}),

  startSubscription: (body: Record<string, unknown>) => post<{ subscription: Subscription }>("/billing/owner/subscription/start", body),
  amendSubscription: (body: Record<string, unknown>) =>
    api<{ subscription: Subscription }>("/billing/owner/subscription", { method: "PATCH", body: JSON.stringify(body) }),
  renew: (issueInvoice = true) => post<{ subscription: Subscription; invoice: Invoice | null }>("/billing/owner/subscription/renew", { issueInvoice }),
  extend: (body: { days?: number; months?: number; reason?: string }) => post<{ subscription: Subscription }>("/billing/owner/subscription/extend", body),
  changePlan: (body: Record<string, unknown>) => post<{ subscription: Subscription; invoice: Invoice | null }>("/billing/owner/subscription/change-plan", body),
  cancel: (atPeriodEnd: boolean, reason = "") => post<{ subscription: Subscription }>("/billing/owner/subscription/cancel", { atPeriodEnd, reason }),
  resume: () => post<{ subscription: Subscription }>("/billing/owner/subscription/resume", {}),
  terminate: (reason: string) => post<{ subscription: Subscription }>("/billing/owner/subscription/terminate", { confirm: "TERMINATE", reason }),

  issueInvoice: (body: Record<string, unknown>) => post<{ invoice: Invoice }>("/billing/owner/invoices", body),
  voidInvoice: (id: string) => post<{ invoice: Invoice }>(`/billing/owner/invoices/${encodeURIComponent(id)}/void`, {}),
  recordPayment: (body: Record<string, unknown>) => post<{ payment: Payment; invoice: Invoice | null }>("/billing/owner/payments", body),
};

/** المنازل العشرية لكل عملة — الدينار الكويتي ثلاث لا اثنتان. */
const MINOR_UNITS: Record<string, number> = {
  KWD: 3, BHD: 3, OMR: 3, JOD: 3, TND: 3,
  SAR: 2, AED: 2, QAR: 2, EGP: 2, USD: 2, EUR: 2, GBP: 2,
};

export const currencyExponent = (currency: string) => MINOR_UNITS[(currency || "KWD").toUpperCase()] ?? 2;

/** يعرض مبلغاً مخزَّناً بالوحدة الصغرى. لا حساب يجري على الناتج. */
export function money(amountMinor: number, currency = "KWD"): string {
  const exponent = currencyExponent(currency);
  const sign = amountMinor < 0 ? "-" : "";
  const absolute = Math.abs(Math.round(amountMinor));
  const divisor = 10 ** exponent;
  const whole = Math.floor(absolute / divisor).toLocaleString("en-US");
  const fraction = String(absolute % divisor).padStart(exponent, "0");
  return `${sign}${whole}${exponent ? `.${fraction}` : ""} ${(currency || "KWD").toUpperCase()}`;
}

/** يحوّل ما كتبه المالك بالوحدة الكبرى (12.500) إلى وحدة صغرى صحيحة (12500). */
export function toMinor(input: string | number, currency = "KWD"): number {
  const exponent = currencyExponent(currency);
  const value = Number(String(input).replace(/,/g, "").trim());
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 10 ** exponent);
}

export const fromMinor = (amountMinor: number, currency = "KWD") =>
  (amountMinor / 10 ** currencyExponent(currency)).toFixed(currencyExponent(currency));
