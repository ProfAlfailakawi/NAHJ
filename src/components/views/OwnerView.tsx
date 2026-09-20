import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, BadgeDollarSign, CalendarPlus, CreditCard, Crown, DatabaseBackup, FilePlus2, History, Layers, PauseCircle,
  PlayCircle, Plus, RefreshCw, Save, Send, Trash2, TrendingUp, Wallet, X,
} from "lucide-react";
import { PageHeader, SectionTitle, Stat } from "../Primitives";
import {
  archiveApi, billingApi, fromMinor, money, notifyApi, paymentsApi, toMinor,
  type BillingCycle, type InvoiceLine, type OwnerOverview, type PaymentIntentView, type Plan, type PlanFeatureKey,
} from "../../lib/api";

/*
 * شاشة المالك.
 *
 * هذه ليست شاشة إدارة أخرى داخل المنتج — هي الجهة الأخرى من البيع كلها: من يملك
 * المنصة يضبط باقاته وأسعاره، يبدأ اشتراك المؤسسة ويمدّده ويجدّده، يُصدر فواتيره
 * ويسجّل دفعاته، ويرى إيراده. ولا يراها مشرف المؤسسة المشترية إطلاقاً.
 *
 * كل زرّ هنا يترك أثراً في سجلّ الفوترة باسم من ضغطه وتاريخه. عملية مالية بلا أثر
 * لا تُراجَع، ولا تُسوّى عند الخلاف.
 */

interface Props {
  lang: "ar" | "en";
  notify: (text: string, error?: boolean) => void;
  onChanged: () => void;
}

const CYCLES: BillingCycle[] = ["monthly", "quarterly", "annual"];
const CYCLE_AR: Record<BillingCycle, string> = { monthly: "شهري", quarterly: "ربع سنوي", annual: "سنوي" };
const METHODS = ["bank_transfer", "knet", "card", "cash", "cheque", "online", "credit"] as const;
const METHOD_AR: Record<string, string> = {
  bank_transfer: "تحويل بنكي", knet: "كي نت", card: "بطاقة", cash: "نقداً", cheque: "شيك", online: "إلكتروني", credit: "رصيد",
};

const FEATURE_KEYS: PlanFeatureKey[] = [
  "teachMode", "processIntelligence", "shadowEngine", "mcp", "externalConnectors",
  "apiAccess", "sso", "customPolicies", "whiteLabel", "onPremise", "prioritySupport", "dedicatedSuccessManager",
];
const FEATURE_AR: Record<PlanFeatureKey, string> = {
  teachMode: "وضع التعليم", processIntelligence: "ذكاء العمليات", shadowEngine: "محرّك الظل",
  mcp: "MCP", externalConnectors: "موصلات خارجية", apiAccess: "واجهة برمجية", sso: "دخول موحّد",
  customPolicies: "سياسات مخصّصة", whiteLabel: "علامة المؤسسة", onPremise: "نشر داخلي",
  prioritySupport: "دعم بأولوية", dedicatedSuccessManager: "مدير نجاح مخصّص",
};

const LIMIT_KEYS = ["seats", "skills", "workItemsPerMonth", "connectors", "mcpServers", "aiCallsPerMonth", "auditRetentionDays"] as const;
const LIMIT_AR: Record<string, string> = {
  seats: "المقاعد", skills: "المهارات", workItemsPerMonth: "حالات/شهر", connectors: "الموصلات",
  mcpServers: "خوادم MCP", aiCallsPerMonth: "نداءات ذكاء/شهر", auditRetentionDays: "احتفاظ التدقيق (يوم)",
};

const shortDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("ar-KW", { year: "numeric", month: "short", day: "numeric" }) : "—";

const forInput = (value: string | null | undefined) => (value ? new Date(value).toISOString().slice(0, 10) : "");

/** نموذج الباقة في الواجهة يتعامل بالوحدة الكبرى؛ التحويل يقع عند الإرسال فقط. */
interface PlanDraft {
  code: string; nameAr: string; nameEn: string; taglineAr: string; taglineEn: string; currency: string;
  priceMonthly: string; priceQuarterly: string; priceAnnual: string; setupFee: string; extraSeatMonthly: string;
  limits: Record<string, string>; features: Record<string, boolean>; isPublic: boolean; sortOrder: string;
}

const emptyDraft = (currency = "KWD"): PlanDraft => ({
  code: "", nameAr: "", nameEn: "", taglineAr: "", taglineEn: "", currency,
  priceMonthly: "0", priceQuarterly: "0", priceAnnual: "0", setupFee: "0", extraSeatMonthly: "0",
  limits: Object.fromEntries(LIMIT_KEYS.map(key => [key, ""])),
  features: Object.fromEntries(FEATURE_KEYS.map(key => [key, false])),
  isPublic: true, sortOrder: "100",
});

const draftFromPlan = (plan: Plan): PlanDraft => ({
  code: plan.code, nameAr: plan.nameAr, nameEn: plan.nameEn,
  taglineAr: plan.taglineAr, taglineEn: plan.taglineEn, currency: plan.currency,
  priceMonthly: fromMinor(plan.priceMonthly, plan.currency),
  priceQuarterly: fromMinor(plan.priceQuarterly, plan.currency),
  priceAnnual: fromMinor(plan.priceAnnual, plan.currency),
  setupFee: fromMinor(plan.setupFee, plan.currency),
  extraSeatMonthly: fromMinor(plan.extraSeatMonthly, plan.currency),
  limits: Object.fromEntries(LIMIT_KEYS.map(key => {
    const value = (plan.limits as unknown as Record<string, number | null>)[key];
    return [key, value === null || value === undefined ? "" : String(value)];
  })),
  features: Object.fromEntries(FEATURE_KEYS.map(key => [key, Boolean(plan.features[key])])),
  isPublic: plan.isPublic, sortOrder: String(plan.sortOrder),
});

const NOTIFY_STATUS_AR: Record<string, string> = {
  sent: "أُرسل", pending: "في الطابور", failed: "فشل", skipped: "لم يُرسل",
};

const INTENT_STATUS_AR: Record<string, string> = {
  pending: "معلّقة",
  paid: "محصَّلة ومسجَّلة",
  failed: "فشلت",
  canceled: "أُلغيت",
  mismatch: "تحتاج مراجعة",
};

export function OwnerView({ lang, notify, onChanged }: Props) {
  const ar = lang === "ar";
  const [data, setData] = useState<OwnerOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [autonomyCeiling, setAutonomyCeiling] = useState("3");
  const [terminateText, setTerminateText] = useState("");
  /*
   * دفتر التحصيل الإلكتروني.
   *
   * وأهمّ ما فيه ليس القائمة بل `needsAttention`: عمليةٌ حُصِّلت بمبلغٍ مخالف أو
   * حُصِّلت ولم تُسجَّل. هذه لا تُدفن في سجلّ طويل — من يفوته سطرٌ منها يكتشفه
   * في مراجعةٍ بنكية بعد شهر.
   */
  const [gateway, setGateway] = useState<Awaited<ReturnType<typeof paymentsApi.ownerIntents>> | null>(null);
  const loadGateway = useCallback(() => {
    paymentsApi.ownerIntents().then(setGateway).catch(() => setGateway(null));
  }, []);
  useEffect(() => { loadGateway(); }, [loadGateway]);

  /*
   * النسخ الاحتياطي.
   *
   * وهو شأن من يملك النشر لا من يستعمله: المؤسسة تُصدّر بياناتها من شاشتها،
   * والمالك يضمن أن لها نسخةً إن ضاع القرص.
   */
  const [backups, setBackups] = useState<Awaited<ReturnType<typeof archiveApi.backups>> | null>(null);
  const loadBackups = useCallback(() => {
    archiveApi.backups().then(setBackups).catch(() => setBackups(null));
  }, []);
  useEffect(() => { loadBackups(); }, [loadBackups]);

  /* الإشعارات: ما أُرسل، وما تُرك لغياب مزوّد، وما فشل — ولماذا. */
  const [mailQueue, setMailQueue] = useState<Awaited<ReturnType<typeof notifyApi.state>> | null>(null);
  const loadMailQueue = useCallback(() => {
    notifyApi.state().then(setMailQueue).catch(() => setMailQueue(null));
  }, []);
  useEffect(() => { loadMailQueue(); }, [loadMailQueue]);

  const load = useCallback(async () => {
    try {
      setData(await billingApi.ownerOverview());
    } catch (error) {
      notify(error instanceof Error ? error.message : "تعذّر تحميل لوحة المالك.", true);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => { void load(); }, [load]);

  /** كل إجراء يمرّ من هنا: انشغال واحد، خطأ واحد، وإعادة تحميل واحدة بعد كل نجاح. */
  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      await load();
      onChanged();
      notify(success);
    } catch (error) {
      notify(error instanceof Error ? error.message : "تعذّرت العملية.", true);
    } finally {
      setBusy(false);
    }
  };

  const snapshot = data?.snapshot;
  const subscription = snapshot?.subscription || null;
  const revenue = data?.revenue;
  const plans = useMemo(() => data?.plans || [], [data]);
  const currency = snapshot?.currency || "KWD";

  /* نموذج شروط الاشتراك — حالة محلّية تُبذر من الخادم ولا تُعاد كتابتها تحت المستخدم. */
  const [terms, setTerms] = useState({ cycle: "monthly" as BillingCycle, periodEnd: "", autoRenew: true, graceDays: "7", discount: "0", tax: "0", seats: "0", notes: "" });
  const [termsLoadedFor, setTermsLoadedFor] = useState<string>("");
  useEffect(() => {
    if (!subscription || termsLoadedFor === subscription.updatedAt) return;
    setTerms({
      cycle: subscription.cycle,
      periodEnd: forInput(subscription.currentPeriodEnd),
      autoRenew: subscription.autoRenew,
      graceDays: String(subscription.graceDays),
      discount: (subscription.discountBps / 100).toString(),
      tax: (subscription.taxBps / 100).toString(),
      seats: String(subscription.seatsPurchased),
      notes: subscription.notes,
    });
    setTermsLoadedFor(subscription.updatedAt);
  }, [subscription, termsLoadedFor]);

  const [start, setStart] = useState({ planCode: "", cycle: "monthly" as BillingCycle, trialDays: "0", seats: "", notes: "", issueInvoice: true });
  const [extend, setExtend] = useState({ days: "30", months: "0", reason: "" });
  const [move, setMove] = useState({ planCode: "", cycle: "monthly" as BillingCycle, timing: "immediate" as "immediate" | "at_period_end", reason: "" });
  const [payment, setPayment] = useState({ invoiceId: "", amount: "", method: "bank_transfer", reference: "", note: "" });
  const [invoiceDraft, setInvoiceDraft] = useState<{ kind: string; notes: string; dueInDays: string; lines: { description: string; quantity: string; unitAmount: string }[] }>({
    kind: "adjustment", notes: "", dueInDays: "14", lines: [{ description: "", quantity: "1", unitAmount: "" }],
  });

  if (loading) {
    return <div className="page-enter"><PageHeader eyebrow="OWNER / المالك" title="جارٍ تحميل لوحة الترخيص..." /></div>;
  }

  const unpaidInvoices = (snapshot?.invoices || []).filter(invoice => invoice.status !== "void" && invoice.amountPaid < invoice.total);

  return (
    <div className="page-enter owner-view">
      <PageHeader
        eyebrow="OWNER CONSOLE / لوحة المالك"
        title={ar ? "ما بعتَه، وما استُحقّ عليه." : "What you sold, and what it owes."}
        hint={ar
          ? "الباقات والتسعير، بدء الاشتراك وتمديده وتجديده، الفواتير والدفعات، والإيراد. كل إجراء هنا يُسجَّل باسمك وتاريخه."
          : "Plans, pricing, subscription lifecycle, invoices, payments and revenue. Every action is logged."}
        action={<button className="btn-secondary" onClick={() => void load()}><RefreshCw /> تحديث</button>}
      />

      {revenue && (
        <div className="stat-grid">
          <Stat label="الإيراد الشهري المتكرّر" value={revenue.formatted.mrr} tone="moss" icon={<TrendingUp />} />
          <Stat label="الإيراد السنوي المتوقّع" value={revenue.formatted.arr} tone="sky" icon={<BadgeDollarSign />} />
          <Stat label="محصَّل هذا العام" value={revenue.formatted.collectedThisYear} tone="violet" icon={<Wallet />} />
          <Stat label="مستحق غير محصَّل" value={revenue.formatted.outstanding} tone={revenue.outstanding > 0 ? "rose" : "moss"} icon={<AlertTriangle />} />
          <Stat label="فواتير متأخرة" value={revenue.invoicesOverdue} tone={revenue.invoicesOverdue > 0 ? "amber" : "moss"} icon={<History />} />
        </div>
      )}

      {/* ---------------------------------------------- الاشتراك الجاري */}
      <section className="surface-strong owner-block">
        <SectionTitle title="اشتراك المؤسسة" icon={<Crown />}
          meta={subscription ? `${shortDate(subscription.startedAt)} → ${shortDate(subscription.currentPeriodEnd)}` : "لا اشتراك"} />

        {!subscription ? (
          <div className="owner-start">
            <p className="owner-hint">لا اشتراك مسجَّل. ابدأ واحداً ليصبح للمنصة ترخيصٌ يُقاس عليه.</p>
            <div className="owner-form">
              <label>الباقة
                <select value={start.planCode} onChange={event => setStart(v => ({ ...v, planCode: event.target.value }))}>
                  <option value="">— اختر —</option>
                  {plans.filter(plan => !plan.archived).map(plan => <option key={plan.code} value={plan.code}>{plan.nameAr}</option>)}
                </select>
              </label>
              <label>الدورة
                <select value={start.cycle} onChange={event => setStart(v => ({ ...v, cycle: event.target.value as BillingCycle }))}>
                  {CYCLES.map(cycle => <option key={cycle} value={cycle}>{CYCLE_AR[cycle]}</option>)}
                </select>
              </label>
              <label>أيام التجربة<input type="number" min={0} value={start.trialDays} onChange={event => setStart(v => ({ ...v, trialDays: event.target.value }))} /></label>
              <label>المقاعد<input type="number" min={0} value={start.seats} placeholder="حدّ الباقة" onChange={event => setStart(v => ({ ...v, seats: event.target.value }))} /></label>
              <label className="owner-check">
                <input type="checkbox" checked={start.issueInvoice} onChange={event => setStart(v => ({ ...v, issueInvoice: event.target.checked }))} />
                أصدر فاتورة الدورة الأولى
              </label>
              <label className="owner-wide">ملاحظات العقد<input value={start.notes} onChange={event => setStart(v => ({ ...v, notes: event.target.value }))} /></label>
            </div>
            <button className="btn-primary" disabled={busy || !start.planCode}
              onClick={() => void run(() => billingApi.startSubscription({
                planCode: start.planCode, cycle: start.cycle,
                trialDays: Number(start.trialDays) || 0,
                seats: start.seats === "" ? undefined : Number(start.seats),
                notes: start.notes, issueInvoice: start.issueInvoice,
              }), "بدأ الاشتراك")}>
              <PlayCircle /> ابدأ الاشتراك
            </button>
          </div>
        ) : (
          <>
            <div className="owner-summary">
              <div><small>الحالة</small><strong>{snapshot?.state.reason}</strong></div>
              <div><small>الباقة</small><strong>{snapshot?.plan?.nameAr || subscription.planCode}</strong></div>
              <div><small>بداية الاشتراك</small><strong>{shortDate(subscription.startedAt)}</strong></div>
              <div><small>نهاية الدورة</small><strong>{shortDate(subscription.currentPeriodEnd)}</strong></div>
              <div><small>التجديد التلقائي</small><strong>{subscription.autoRenew ? "مفعّل" : "مُطفأ"}</strong></div>
              <div><small>رصيد المؤسسة</small><strong>{snapshot?.formatted.credit}</strong></div>
            </div>

            <div className="owner-form">
              <label>الدورة
                <select value={terms.cycle} onChange={event => setTerms(v => ({ ...v, cycle: event.target.value as BillingCycle }))}>
                  {CYCLES.map(cycle => <option key={cycle} value={cycle}>{CYCLE_AR[cycle]}</option>)}
                </select>
              </label>
              <label>نهاية الدورة<input type="date" value={terms.periodEnd} onChange={event => setTerms(v => ({ ...v, periodEnd: event.target.value }))} /></label>
              <label>مهلة السماح (يوم)<input type="number" min={0} max={90} value={terms.graceDays} onChange={event => setTerms(v => ({ ...v, graceDays: event.target.value }))} /></label>
              <label>الخصم %<input type="number" min={0} max={100} step="0.01" value={terms.discount} onChange={event => setTerms(v => ({ ...v, discount: event.target.value }))} /></label>
              <label>الضريبة %<input type="number" min={0} max={100} step="0.01" value={terms.tax} onChange={event => setTerms(v => ({ ...v, tax: event.target.value }))} /></label>
              <label>المقاعد المتعاقد عليها<input type="number" min={0} value={terms.seats} onChange={event => setTerms(v => ({ ...v, seats: event.target.value }))} /></label>
              <label className="owner-check">
                <input type="checkbox" checked={terms.autoRenew} onChange={event => setTerms(v => ({ ...v, autoRenew: event.target.checked }))} />
                تجديد تلقائي
              </label>
              <label className="owner-wide">ملاحظات<input value={terms.notes} onChange={event => setTerms(v => ({ ...v, notes: event.target.value }))} /></label>
            </div>

            <div className="owner-actions">
              <button className="btn-primary" disabled={busy}
                onClick={() => void run(() => billingApi.amendSubscription({
                  cycle: terms.cycle,
                  currentPeriodEnd: terms.periodEnd ? new Date(`${terms.periodEnd}T23:59:59Z`).toISOString() : undefined,
                  autoRenew: terms.autoRenew,
                  graceDays: Number(terms.graceDays) || 0,
                  discountBps: Math.round(Number(terms.discount) * 100) || 0,
                  taxBps: Math.round(Number(terms.tax) * 100) || 0,
                  seats: Number(terms.seats) || 0,
                  notes: terms.notes,
                }), "حُفظت شروط الاشتراك")}>
                <Save /> احفظ الشروط
              </button>
              <button className="btn-secondary" disabled={busy}
                onClick={() => void run(() => billingApi.renew(true), "جُدِّد الاشتراك وصدرت فاتورته")}>
                <RefreshCw /> جدّد دورة + فاتورة
              </button>
              <button className="btn-secondary" disabled={busy}
                onClick={() => void run(() => billingApi.renew(false), "جُدِّد الاشتراك بلا فاتورة")}>
                جدّد بلا فاتورة
              </button>
              {subscription.cancelAtPeriodEnd || subscription.terminated ? (
                <button className="btn-secondary" disabled={busy} onClick={() => void run(() => billingApi.resume(), "استُؤنف الاشتراك")}>
                  <PlayCircle /> استأنف
                </button>
              ) : (
                <button className="btn-secondary" disabled={busy}
                  onClick={() => void run(() => billingApi.cancel(true, "بطلب المؤسسة"), "سيُنهى عند نهاية الدورة")}>
                  <PauseCircle /> ألغِ عند النهاية
                </button>
              )}
            </div>

            {/* التمديد بلا فاتورة — لتعويض انقطاع أو تسوية تجارية، بأثرٍ يشرح لماذا. */}
            <div className="owner-subform">
              <h4><CalendarPlus /> تمديد بلا فاتورة</h4>
              <div className="owner-form">
                <label>أيام<input type="number" min={0} value={extend.days} onChange={event => setExtend(v => ({ ...v, days: event.target.value }))} /></label>
                <label>شهور<input type="number" min={0} value={extend.months} onChange={event => setExtend(v => ({ ...v, months: event.target.value }))} /></label>
                <label className="owner-wide">السبب (يُحفظ في السجلّ)<input value={extend.reason} onChange={event => setExtend(v => ({ ...v, reason: event.target.value }))} /></label>
              </div>
              <button className="btn-secondary" disabled={busy}
                onClick={() => void run(() => billingApi.extend({ days: Number(extend.days) || 0, months: Number(extend.months) || 0, reason: extend.reason }), "مُدِّد الاشتراك")}>
                مدّد
              </button>
            </div>

            {/* نقل الباقة — فوراً بتناسب زمني، أو مجدولاً عند نهاية الدورة. */}
            <div className="owner-subform">
              <h4><Layers /> نقل إلى باقة أخرى</h4>
              <div className="owner-form">
                <label>الباقة
                  <select value={move.planCode} onChange={event => setMove(v => ({ ...v, planCode: event.target.value }))}>
                    <option value="">— اختر —</option>
                    {plans.filter(plan => !plan.archived).map(plan => <option key={plan.code} value={plan.code}>{plan.nameAr}</option>)}
                  </select>
                </label>
                <label>الدورة
                  <select value={move.cycle} onChange={event => setMove(v => ({ ...v, cycle: event.target.value as BillingCycle }))}>
                    {CYCLES.map(cycle => <option key={cycle} value={cycle}>{CYCLE_AR[cycle]}</option>)}
                  </select>
                </label>
                <label>التوقيت
                  <select value={move.timing} onChange={event => setMove(v => ({ ...v, timing: event.target.value as "immediate" | "at_period_end" }))}>
                    <option value="immediate">فوراً (بتناسب زمني)</option>
                    <option value="at_period_end">عند نهاية الدورة</option>
                  </select>
                </label>
                <label className="owner-wide">السبب<input value={move.reason} onChange={event => setMove(v => ({ ...v, reason: event.target.value }))} /></label>
              </div>
              <button className="btn-secondary" disabled={busy || !move.planCode}
                onClick={() => void run(() => billingApi.changePlan(move), "نُقل الاشتراك")}>
                انقل
              </button>
              <p className="owner-hint">
                الترقية الفورية تُفوتر فرق المتبقّي من الدورة وحده. والتخفيض لا يُعيد نقداً — يُقيَّد رصيداً يُخصم من التجديد القادم.
              </p>
            </div>

            {/* الإنهاء يُجمّد كتابة المؤسسة فوراً، فيُطلب كتابته لا ضغطه. */}
            <div className="owner-subform danger">
              <h4><AlertTriangle /> إنهاء الترخيص</h4>
              <p className="owner-hint">
                يوقف الكتابة على المؤسسة فوراً. القراءة والتصدير يبقيان — بياناتها لها. اكتب <code>TERMINATE</code> للتأكيد.
              </p>
              <div className="owner-form">
                <label>التأكيد<input value={terminateText} onChange={event => setTerminateText(event.target.value)} placeholder="TERMINATE" /></label>
              </div>
              <button className="btn-danger" disabled={busy || terminateText !== "TERMINATE"}
                onClick={() => void run(async () => { await billingApi.terminate("قرار المالك"); setTerminateText(""); }, "أُنهي الترخيص")}>
                أنهِ الترخيص
              </button>
            </div>
          </>
        )}
      </section>

      {/* --------------------------------------------- الإشعارات */}
      <section className="surface-strong owner-block">
        <SectionTitle title="الإشعارات" icon={<Send />}
          meta={mailQueue?.status.configured ? mailQueue.status.provider : "لا مزوّد بريد"} />

        {!mailQueue ? (
          <p className="owner-hint">جارٍ قراءة حالة الإشعارات...</p>
        ) : (
          <>
            <p className="owner-hint">{mailQueue.status.note}</p>
            {mailQueue.status.missing.length > 0 && (
              <ul className="owner-missing">
                {mailQueue.status.missing.map(item => <li key={item}><AlertTriangle /> {item}</li>)}
              </ul>
            )}

            <div className="stat-grid compact">
              <Stat label="أُرسلت" value={mailQueue.status.counts.sent} tone="moss" icon={<Send />} />
              <Stat label="في الطابور" value={mailQueue.status.counts.pending} tone="sky" icon={<History />} />
              <Stat label="لم تُرسل (لا مزوّد)" value={mailQueue.status.counts.skipped} tone={mailQueue.status.counts.skipped ? "amber" : "sky"} icon={<AlertTriangle />} />
              <Stat label="فشلت" value={mailQueue.status.counts.failed} tone={mailQueue.status.counts.failed ? "rose" : "moss"} icon={<AlertTriangle />} />
            </div>

            {mailQueue.status.configured && (
              <button className="btn-secondary" disabled={busy}
                onClick={() => void run(async () => { await notifyApi.flush(); loadMailQueue(); }, "أُفرغ الطابور")}>
                <Send /> أرسل ما في الطابور الآن
              </button>
            )}

            {mailQueue.recent.length > 0 && (
              <div className="ledger compact" style={{ marginTop: 10 }}>
                <div className="ledger-head four">
                  <span>الحدث</span><span>إلى</span><span>الحالة</span><span>السبب</span>
                </div>
                {mailQueue.recent.slice(0, 10).map(item => (
                  <div key={item.id} className="ledger-row four static">
                    <span>{item.subject}</span>
                    <span className="mono">{item.recipient}</span>
                    <span><i className={`ledger-badge tone-${item.status === "sent" ? "moss" : item.status === "failed" ? "rose" : item.status === "pending" ? "sky" : "amber"}`}>
                      {NOTIFY_STATUS_AR[item.status] || item.status}
                    </i></span>
                    <span className="owner-hint">{item.lastError || "—"}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="owner-hint">
              لا يُرسل نهج كلمة مرور ولا رابط دخول في بريد — البريد قناة تُخزَّن وتُعاد توجيهاً. الكلمة المؤقتة تُسلَّم باليد.
            </p>
          </>
        )}
      </section>

      {/* --------------------------------------------- النسخ الاحتياطي */}
      <section className="surface-strong owner-block">
        <SectionTitle title="النسخ الاحتياطي" icon={<DatabaseBackup />}
          meta={backups?.status.enabled ? `كل ${backups.status.intervalHours} ساعة` : "دوريٌّ معطّل"} />

        {!backups ? (
          <p className="owner-hint">جارٍ قراءة حالة النسخ...</p>
        ) : (
          <>
            <p className="owner-hint">{backups.status.note}</p>
            <div className="stat-grid compact">
              <Stat label="نسخ محفوظة" value={backups.status.count} tone="sky" icon={<DatabaseBackup />} />
              <Stat label="آخر نسخة" value={backups.status.latest ? new Date(backups.status.latest.createdAt).toLocaleString("ar-KW") : "لا شيء"} tone={backups.status.latest ? "moss" : "amber"} icon={<History />} />
              <Stat label="الاحتفاظ" value={`${backups.status.retention} نسخة`} tone="violet" icon={<Layers />} />
            </div>

            {/* غياب أي نسخة ليس تفصيلاً: هو الفارق بين عطلٍ وكارثة. */}
            {!backups.status.latest && (
              <p className="owner-hint tone-text-amber">
                <AlertTriangle /> لا توجد نسخة واحدة بعد. اضغط «انسخ الآن» ثم تأكد أن مجلد النسخ على قرصٍ دائم غير قرص القاعدة.
              </p>
            )}

            <button className="btn-primary" disabled={busy}
              onClick={() => void run(async () => { await archiveApi.runBackup(); loadBackups(); }, "كُتبت النسخة")}>
              <DatabaseBackup /> انسخ الآن
            </button>

            {backups.files.length > 0 && (
              <div className="ledger compact" style={{ marginTop: 10 }}>
                <div className="ledger-head four">
                  <span>الملف</span><span>الحجم</span><span>التاريخ</span><span></span>
                </div>
                {backups.files.slice(0, 8).map(file => (
                  <div key={file.name} className="ledger-row four static">
                    <span className="mono">{file.name}</span>
                    <span className="mono">{file.size}</span>
                    <span>{new Date(file.createdAt).toLocaleString("ar-KW")}</span>
                    <span />
                  </div>
                ))}
              </div>
            )}
            <p className="owner-hint">
              الاستعادة موصوفة في <code>BACKUP.md</code>: أوقف الخدمة، ضع الملف مكان القاعدة، ثم شغّلها.
            </p>
          </>
        )}
      </section>

      {/* --------------------------------------------- بوابة الدفع */}
      <section className="surface-strong owner-block">
        <SectionTitle title="بوابة الدفع" icon={<CreditCard />}
          meta={gateway?.gateway.configured ? `${gateway.gateway.providerLabel} — ${gateway.gateway.environment === "live" ? "حيّة" : "اختبار"}` : "غير مربوطة"} />

        {!gateway ? (
          <p className="owner-hint">جارٍ قراءة حالة البوابة...</p>
        ) : !gateway.gateway.configured ? (
          <>
            {/* لا وسمَ أخضر لبوابةٍ غير مربوطة: يُقال ما ينقص ليُضبط. */}
            <p className="owner-hint">{gateway.gateway.note}</p>
            {gateway.gateway.missing.length > 0 && (
              <ul className="owner-missing">
                {gateway.gateway.missing.map(item => <li key={item}><AlertTriangle /> {item}</li>)}
              </ul>
            )}
            <p className="owner-hint">
              الخطوات كاملة في <code>PAYMENTS.md</code>: مفتاح المزوّد، وسرّ التوقيع، وعنوان النشر — ثم إعادة تشغيل الخدمة.
            </p>
          </>
        ) : (
          <>
            <p className="owner-hint">{gateway.gateway.note}</p>
            <div className="owner-form">
              <label>عنوان الإشعار (يُسجَّل عند المزوّد)
                <input readOnly value={gateway.gateway.webhookUrl} />
              </label>
              <label>عنوان العودة
                <input readOnly value={gateway.gateway.returnUrl} />
              </label>
            </div>
          </>
        )}

        {gateway && gateway.needsAttention.length > 0 && (
          <div className="owner-attention">
            <h4><AlertTriangle /> عمليات تحتاج تدخّلك ({gateway.needsAttention.length})</h4>
            {gateway.needsAttention.map((intent: PaymentIntentView) => (
              <div key={intent.id} className="owner-attention-row">
                <span className="mono">{intent.invoiceNumber}</span>
                <span className="mono">{intent.formattedAmount}</span>
                <span className="mono">{intent.providerRef}</span>
                <span>{intent.failureReason}</span>
              </div>
            ))}
          </div>
        )}

        {gateway && gateway.intents.length > 0 && (
          <div className="ledger compact">
            <div className="ledger-head four">
              <span>الفاتورة</span><span>المبلغ</span><span>مرجع المزوّد</span><span>الحالة</span>
            </div>
            {gateway.intents.slice(0, 12).map((intent: PaymentIntentView) => (
              <div key={intent.id} className="ledger-row four static">
                <span className="mono">{intent.invoiceNumber}</span>
                <span className="mono">{intent.formattedAmount}</span>
                <span className="mono">{intent.providerRef}</span>
                <span><i className={`ledger-badge tone-${intent.status === "paid" ? "moss" : intent.status === "pending" ? "sky" : intent.status === "mismatch" ? "rose" : "muted"}`}>
                  {INTENT_STATUS_AR[intent.status] || intent.status}
                </i></span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ------------------------------------------------ تسجيل دفعة */}
      <section className="surface-strong owner-block">
        <SectionTitle title="تسجيل دفعة" icon={<Wallet />} meta="إثبات دفعٍ وقع خارج المنصة" />
        <div className="owner-form">
          <label>الفاتورة
            <select value={payment.invoiceId} onChange={event => {
              const invoice = unpaidInvoices.find(item => item.id === event.target.value);
              setPayment(v => ({ ...v, invoiceId: event.target.value, amount: invoice ? fromMinor(invoice.total - invoice.amountPaid, invoice.currency) : v.amount }));
            }}>
              <option value="">— بلا فاتورة (دفعة على الحساب) —</option>
              {unpaidInvoices.map(invoice => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.number} — متبقٍّ {money(invoice.total - invoice.amountPaid, invoice.currency)}
                </option>
              ))}
            </select>
          </label>
          <label>المبلغ ({currency})<input inputMode="decimal" value={payment.amount} onChange={event => setPayment(v => ({ ...v, amount: event.target.value }))} /></label>
          <label>الوسيلة
            <select value={payment.method} onChange={event => setPayment(v => ({ ...v, method: event.target.value }))}>
              {METHODS.map(method => <option key={method} value={method}>{METHOD_AR[method]}</option>)}
            </select>
          </label>
          <label>المرجع<input value={payment.reference} onChange={event => setPayment(v => ({ ...v, reference: event.target.value }))} placeholder="رقم الحوالة / الإيصال" /></label>
          <label className="owner-wide">ملاحظة<input value={payment.note} onChange={event => setPayment(v => ({ ...v, note: event.target.value }))} /></label>
        </div>
        <button className="btn-primary" disabled={busy || !payment.amount}
          onClick={() => void run(async () => {
            await billingApi.recordPayment({
              invoiceId: payment.invoiceId || null,
              amount: toMinor(payment.amount, currency),
              currency, method: payment.method, reference: payment.reference, note: payment.note,
            });
            setPayment({ invoiceId: "", amount: "", method: "bank_transfer", reference: "", note: "" });
          }, "سُجّلت الدفعة")}>
          <Wallet /> سجّل الدفعة
        </button>
      </section>

      {/* ------------------------------------------------ فاتورة يدوية */}
      <section className="surface-strong owner-block">
        <SectionTitle title="إصدار فاتورة" icon={<FilePlus2 />} meta="رسوم تأسيس، تجاوز حدّ، أو تسوية" />
        <div className="owner-form">
          <label>النوع
            <select value={invoiceDraft.kind} onChange={event => setInvoiceDraft(v => ({ ...v, kind: event.target.value }))}>
              <option value="subscription">اشتراك</option>
              <option value="setup">رسوم تأسيس</option>
              <option value="overage">تجاوز حدّ</option>
              <option value="adjustment">تسوية</option>
            </select>
          </label>
          <label>الاستحقاق بعد (يوم)<input type="number" min={0} value={invoiceDraft.dueInDays} onChange={event => setInvoiceDraft(v => ({ ...v, dueInDays: event.target.value }))} /></label>
          <label className="owner-wide">ملاحظات<input value={invoiceDraft.notes} onChange={event => setInvoiceDraft(v => ({ ...v, notes: event.target.value }))} /></label>
        </div>
        <div className="invoice-lines">
          {invoiceDraft.lines.map((line, index) => (
            <div key={index} className="invoice-line-row">
              <input placeholder="وصف البند" value={line.description}
                onChange={event => setInvoiceDraft(v => ({ ...v, lines: v.lines.map((item, i) => i === index ? { ...item, description: event.target.value } : item) }))} />
              <input placeholder="الكمية" inputMode="numeric" value={line.quantity}
                onChange={event => setInvoiceDraft(v => ({ ...v, lines: v.lines.map((item, i) => i === index ? { ...item, quantity: event.target.value } : item) }))} />
              <input placeholder={`سعر الوحدة (${currency})`} inputMode="decimal" value={line.unitAmount}
                onChange={event => setInvoiceDraft(v => ({ ...v, lines: v.lines.map((item, i) => i === index ? { ...item, unitAmount: event.target.value } : item) }))} />
              <button type="button" className="icon-button" disabled={invoiceDraft.lines.length === 1}
                onClick={() => setInvoiceDraft(v => ({ ...v, lines: v.lines.filter((_, i) => i !== index) }))} aria-label="احذف البند"><X /></button>
            </div>
          ))}
          <button type="button" className="btn-secondary"
            onClick={() => setInvoiceDraft(v => ({ ...v, lines: [...v.lines, { description: "", quantity: "1", unitAmount: "" }] }))}>
            <Plus /> بند آخر
          </button>
        </div>
        <button className="btn-primary" disabled={busy || !invoiceDraft.lines.some(line => line.description && line.unitAmount)}
          onClick={() => void run(async () => {
            const lines: InvoiceLine[] = invoiceDraft.lines
              .filter(line => line.description && line.unitAmount)
              .map(line => {
                const quantity = Math.max(1, Number(line.quantity) || 1);
                const unitAmount = toMinor(line.unitAmount, currency);
                return { description: line.description, quantity, unitAmount, amount: quantity * unitAmount };
              });
            await billingApi.issueInvoice({
              kind: invoiceDraft.kind, currency, lines,
              dueInDays: Number(invoiceDraft.dueInDays) || 14,
              notes: invoiceDraft.notes,
              discountBps: subscription?.discountBps ?? 0,
              taxBps: subscription?.taxBps ?? 0,
            });
            setInvoiceDraft({ kind: "adjustment", notes: "", dueInDays: "14", lines: [{ description: "", quantity: "1", unitAmount: "" }] });
          }, "صدرت الفاتورة")}>
          <FilePlus2 /> أصدر الفاتورة
        </button>
      </section>

      {/* ------------------------------------------------ الباقات */}
      <section className="surface-strong owner-block">
        <SectionTitle title="الباقات والتسعير" icon={<Layers />} meta={`${plans.length}`}
        />
        <div className="owner-plans">
          {plans.map(plan => (
            <article key={plan.code} className={`owner-plan ${plan.archived ? "is-archived" : ""}`}>
              <div className="owner-plan-head">
                <div>
                  <strong>{plan.nameAr}</strong>
                  <small className="mono">{plan.code}</small>
                </div>
                <div className="owner-plan-price">{plan.priceMonthly > 0 ? `${money(plan.priceMonthly, plan.currency)} / شهر` : "بالتفاوض"}</div>
              </div>
              <p className="owner-plan-tag">{plan.taglineAr}</p>
              <div className="owner-plan-meta">
                <span>مقاعد: <b>{plan.limits.seats ?? "∞"}</b></span>
                <span>مهارات: <b>{plan.limits.skills ?? "∞"}</b></span>
                <span>سقف: <b>L{plan.limits.maxAutonomyLevel}</b></span>
                <span>{plan.isPublic ? "معروضة" : "مخفية"}</span>
                {plan.archived && <span className="owner-plan-archived">مؤرشفة</span>}
              </div>
              <div className="owner-plan-actions">
                <button className="btn-secondary" onClick={() => { setDraft(draftFromPlan(plan)); setAutonomyCeiling(String(plan.limits.maxAutonomyLevel)); }}>تحرير</button>
                {plan.archived ? (
                  <button className="btn-secondary" disabled={busy} onClick={() => void run(() => billingApi.restorePlan(plan.code), "أُعيدت الباقة")}>استعادة</button>
                ) : (
                  <button className="btn-secondary" disabled={busy} onClick={() => void run(() => billingApi.archivePlan(plan.code), "أُرشفت الباقة")}><Trash2 /> أرشفة</button>
                )}
              </div>
            </article>
          ))}
          <button className="owner-plan owner-plan-new" onClick={() => { setDraft(emptyDraft(currency)); setAutonomyCeiling("3"); }}>
            <Plus /> باقة جديدة
          </button>
        </div>

        {draft && (
          <div className="owner-plan-editor">
            <h4>{plans.some(plan => plan.code === draft.code) ? `تحرير «${draft.nameAr || draft.code}»` : "باقة جديدة"}</h4>
            <div className="owner-form">
              <label>الرمز (لاتيني)<input value={draft.code} disabled={plans.some(plan => plan.code === draft.code)}
                onChange={event => setDraft(v => v && ({ ...v, code: event.target.value.toLowerCase() }))} /></label>
              <label>الاسم بالعربية<input value={draft.nameAr} onChange={event => setDraft(v => v && ({ ...v, nameAr: event.target.value }))} /></label>
              <label>الاسم بالإنجليزية<input value={draft.nameEn} onChange={event => setDraft(v => v && ({ ...v, nameEn: event.target.value }))} /></label>
              <label>العملة<input value={draft.currency} onChange={event => setDraft(v => v && ({ ...v, currency: event.target.value.toUpperCase() }))} /></label>
              <label className="owner-wide">الوصف بالعربية<input value={draft.taglineAr} onChange={event => setDraft(v => v && ({ ...v, taglineAr: event.target.value }))} /></label>
              <label className="owner-wide">الوصف بالإنجليزية<input value={draft.taglineEn} onChange={event => setDraft(v => v && ({ ...v, taglineEn: event.target.value }))} /></label>
              <label>سعر شهري<input inputMode="decimal" value={draft.priceMonthly} onChange={event => setDraft(v => v && ({ ...v, priceMonthly: event.target.value }))} /></label>
              <label>سعر ربعي<input inputMode="decimal" value={draft.priceQuarterly} onChange={event => setDraft(v => v && ({ ...v, priceQuarterly: event.target.value }))} /></label>
              <label>سعر سنوي<input inputMode="decimal" value={draft.priceAnnual} onChange={event => setDraft(v => v && ({ ...v, priceAnnual: event.target.value }))} /></label>
              <label>رسوم تأسيس<input inputMode="decimal" value={draft.setupFee} onChange={event => setDraft(v => v && ({ ...v, setupFee: event.target.value }))} /></label>
              <label>مقعد إضافي/شهر<input inputMode="decimal" value={draft.extraSeatMonthly} onChange={event => setDraft(v => v && ({ ...v, extraSeatMonthly: event.target.value }))} /></label>
              <label>سقف الاستقلالية (0–6)<input type="number" min={0} max={6} value={autonomyCeiling} onChange={event => setAutonomyCeiling(event.target.value)} /></label>
              <label>الترتيب<input type="number" value={draft.sortOrder} onChange={event => setDraft(v => v && ({ ...v, sortOrder: event.target.value }))} /></label>
              <label className="owner-check">
                <input type="checkbox" checked={draft.isPublic} onChange={event => setDraft(v => v && ({ ...v, isPublic: event.target.checked }))} />
                تُعرض للمؤسسة
              </label>
            </div>

            <h5>الحدود <small>اتركه فارغاً لبلا حدّ</small></h5>
            <div className="owner-form">
              {LIMIT_KEYS.map(key => (
                <label key={key}>{LIMIT_AR[key]}
                  <input inputMode="numeric" placeholder="∞" value={draft.limits[key] ?? ""}
                    onChange={event => setDraft(v => v && ({ ...v, limits: { ...v.limits, [key]: event.target.value } }))} />
                </label>
              ))}
            </div>

            <h5>المزايا</h5>
            <div className="owner-features">
              {FEATURE_KEYS.map(key => (
                <label key={key} className={draft.features[key] ? "on" : ""}>
                  <input type="checkbox" checked={Boolean(draft.features[key])}
                    onChange={event => setDraft(v => v && ({ ...v, features: { ...v.features, [key]: event.target.checked } }))} />
                  {FEATURE_AR[key]}
                </label>
              ))}
            </div>

            <div className="owner-actions">
              <button className="btn-primary" disabled={busy || !draft.code || !draft.nameAr}
                onClick={() => void run(async () => {
                  const limits: Record<string, number | null> = { maxAutonomyLevel: Math.max(0, Math.min(6, Number(autonomyCeiling) || 0)) };
                  for (const key of LIMIT_KEYS) {
                    const raw = draft.limits[key];
                    limits[key] = raw === "" || raw === undefined ? null : Math.max(0, Math.round(Number(raw) || 0));
                  }
                  await billingApi.savePlan({
                    code: draft.code, nameAr: draft.nameAr, nameEn: draft.nameEn || draft.nameAr,
                    taglineAr: draft.taglineAr, taglineEn: draft.taglineEn, currency: draft.currency,
                    priceMonthly: toMinor(draft.priceMonthly, draft.currency),
                    priceQuarterly: toMinor(draft.priceQuarterly, draft.currency),
                    priceAnnual: toMinor(draft.priceAnnual, draft.currency),
                    setupFee: toMinor(draft.setupFee, draft.currency),
                    extraSeatMonthly: toMinor(draft.extraSeatMonthly, draft.currency),
                    limits, features: draft.features,
                    isPublic: draft.isPublic, sortOrder: Number(draft.sortOrder) || 100,
                  });
                  setDraft(null);
                }, "حُفظت الباقة")}>
                <Save /> احفظ الباقة
              </button>
              <button className="btn-secondary" onClick={() => setDraft(null)}>إلغاء</button>
            </div>
          </div>
        )}
      </section>

      {/* ------------------------------------------------ السجلّ */}
      <section className="surface-strong owner-block">
        <SectionTitle title="سجلّ الترخيص" icon={<History />} meta={`${data?.events.length ?? 0}`} />
        <div className="owner-events">
          {(data?.events || []).map(event => (
            <div key={event.id} className={`owner-event ${event.type.startsWith("request.") ? "is-request" : ""}`}>
              <span className="mono owner-event-type">{event.type}</span>
              <span className="owner-event-summary">{event.summary}</span>
              <span className="owner-event-meta">{event.actor} · {new Date(event.at).toLocaleString("ar-KW")}</span>
            </div>
          ))}
          {!data?.events.length && <p className="owner-hint">لا حركة بعد.</p>}
        </div>
      </section>
    </div>
  );
}
