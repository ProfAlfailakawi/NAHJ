import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowUpRight, BadgeCheck, CalendarClock, CheckCircle2, CircleSlash, CreditCard,
  FileText, Gauge, Layers, Receipt, RefreshCw, ShieldCheck, Sparkles, Timer, Wallet,
} from "lucide-react";
import { PageHeader, SectionTitle, Stat } from "../Primitives";
import {
  billingApi, money, paymentsApi,
  type BillingSnapshot, type GatewayState, type Plan, type PlanFeatureKey, type SubscriptionStatus,
} from "../../lib/api";

/*
 * شاشة الاشتراك — ما تراه المؤسسة المشترية.
 *
 * الغرض منها جواب واحد بلا التفاف: متى بدأ اشتراكنا، متى ينتهي، ما الباقة، ماذا
 * يشمل، كم استهلكنا منه، ماذا دُفع وماذا بقي. كل رقم هنا مصدره الخادم — لا شيء
 * يُحتسب في المتصفح، لأن ما يُحتسب في المتصفح لا يصلح أن يُطالب به أحد.
 */

interface Props {
  lang: "ar" | "en";
  snapshot: BillingSnapshot | null;
  plans: Plan[];
  loading: boolean;
  canRequest: boolean;
  /*
   * هل يملك صاحب الجلسة أن يدفع؟
   *
   * الخادم يقصر `POST /payments/checkout` على المشرف والمدير (والمالك). وزرٌّ
   * يُعرض لمن سيُردّ طلبه بـ403 أسوأ من غيابه: يَعِد المُطَّلع بقدرةٍ لا يملكها،
   * ويجعله يظنّ أن النظام معطّل لا أن الصلاحية ليست له.
   */
  canPay: boolean;
  onRefresh: () => void;
  notify: (text: string, error?: boolean) => void;
}

const STATUS_META: Record<SubscriptionStatus, { ar: string; en: string; tone: string; icon: React.ElementType }> = {
  trialing: { ar: "فترة تجربة", en: "Trial", tone: "sky", icon: Sparkles },
  active: { ar: "سارٍ", en: "Active", tone: "moss", icon: BadgeCheck },
  past_due: { ar: "مستحق غير مسدَّد", en: "Past due", tone: "amber", icon: AlertTriangle },
  grace: { ar: "مهلة سماح", en: "Grace period", tone: "amber", icon: Timer },
  suspended: { ar: "موقوف", en: "Suspended", tone: "rose", icon: CircleSlash },
  canceled: { ar: "ملغى عند النهاية", en: "Cancels at period end", tone: "violet", icon: CalendarClock },
  expired: { ar: "منتهٍ", en: "Expired", tone: "rose", icon: CircleSlash },
};

const FEATURE_LABELS: Record<PlanFeatureKey, { ar: string; en: string }> = {
  teachMode: { ar: "وضع التعليم (Teach)", en: "Teach Mode" },
  processIntelligence: { ar: "ذكاء العمليات واكتشاف التعارض", en: "Process intelligence" },
  shadowEngine: { ar: "محرّك الظل والمقارنة", en: "Shadow engine" },
  mcp: { ar: "بروتوكول MCP", en: "MCP protocol" },
  externalConnectors: { ar: "موصلات خارجية", en: "External connectors" },
  apiAccess: { ar: "واجهة برمجية", en: "API access" },
  sso: { ar: "دخول موحّد (SSO)", en: "Single sign-on" },
  customPolicies: { ar: "سياسات مخصّصة", en: "Custom policies" },
  whiteLabel: { ar: "علامة المؤسسة", en: "White label" },
  onPremise: { ar: "نشر داخل المؤسسة", en: "On-premise" },
  prioritySupport: { ar: "دعم بأولوية", en: "Priority support" },
  dedicatedSuccessManager: { ar: "مدير نجاح مخصّص", en: "Dedicated success manager" },
};

const FEATURE_ORDER = Object.keys(FEATURE_LABELS) as PlanFeatureKey[];

const CYCLE_LABEL = { monthly: { ar: "شهري", en: "Monthly" }, quarterly: { ar: "ربع سنوي", en: "Quarterly" }, annual: { ar: "سنوي", en: "Annual" } };

/** تاريخ قصير بلا ساعة. الساعة في عقد سنوي ضجيج. */
const shortDate = (value: string | null | undefined, ar: boolean) =>
  value ? new Date(value).toLocaleDateString(ar ? "ar-KW" : "en-GB", { year: "numeric", month: "short", day: "numeric" }) : "—";

/**
 * شريط حياة الاشتراك.
 *
 * تاريخان مجرّدان لا يُفهمان بلمحة؛ الخطّ يفعل: أين نحن بين البداية والنهاية، وكم
 * بقي، وأين تقع مهلة السماح. ونسبة التقدّم تُحسب على الدورة الجارية لا على عمر
 * الاشتراك كله — لأن ما يهمّ هو متى ينتهي ما دُفع مقابله.
 */
function LifeBar({ snapshot, ar }: { snapshot: BillingSnapshot; ar: boolean }) {
  const subscription = snapshot.subscription;
  if (!subscription) return null;

  const start = new Date(subscription.currentPeriodStart).getTime();
  const end = new Date(subscription.currentPeriodEnd).getTime();
  const now = Date.now();
  const span = Math.max(1, end - start);
  const elapsed = Math.min(100, Math.max(0, ((now - start) / span) * 100));
  const state = snapshot.state;
  const tone = STATUS_META[state.status].tone;

  return (
    <div className="sub-life">
      <div className="sub-life-heads">
        <div>
          <small>{ar ? "بداية الدورة" : "Period start"}</small>
          <strong>{shortDate(subscription.currentPeriodStart, ar)}</strong>
        </div>
        <div className="sub-life-mid">
          <small>{ar ? "المتبقّي" : "Remaining"}</small>
          <strong className={`tone-text-${tone}`}>
            {state.daysRemaining > 0
              ? ar ? `${state.daysRemaining} يوماً` : `${state.daysRemaining} days`
              : state.graceDaysRemaining > 0
                ? ar ? `مهلة ${state.graceDaysRemaining} يوماً` : `${state.graceDaysRemaining} grace days`
                : ar ? "انتهت" : "Ended"}
          </strong>
        </div>
        <div className="sub-life-end">
          <small>{ar ? "نهاية الدورة" : "Period end"}</small>
          <strong>{shortDate(subscription.currentPeriodEnd, ar)}</strong>
        </div>
      </div>
      <div className={`sub-life-track tone-${tone}`}>
        <div className="sub-life-fill" style={{ width: `${elapsed}%` }} />
        {subscription.graceDays > 0 && (
          <div className="sub-life-grace" style={{ width: `${Math.min(30, (subscription.graceDays / (span / 86_400_000)) * 100)}%` }}
            title={ar ? `مهلة سماح ${subscription.graceDays} يوماً بعد الانتهاء` : `${subscription.graceDays} grace days after the end`} />
        )}
        <span className="sub-life-now" style={{ insetInlineStart: `${elapsed}%` }} />
      </div>
      <div className="sub-life-foot">
        <span>{ar ? "بداية الاشتراك" : "Subscription started"}: <b>{shortDate(subscription.startedAt, ar)}</b></span>
        <span>
          {ar ? "التجديد التلقائي" : "Auto-renew"}:{" "}
          <b className={subscription.autoRenew ? "tone-text-moss" : "tone-text-rose"}>
            {subscription.autoRenew ? (ar ? "مفعّل" : "On") : (ar ? "مُطفأ" : "Off")}
          </b>
        </span>
        {snapshot.nextRenewalAt && (
          <span>{ar ? "التجديد القادم" : "Next renewal"}: <b>{shortDate(snapshot.nextRenewalAt, ar)}</b>
            {snapshot.formatted.nextRenewalAmount ? ` — ${snapshot.formatted.nextRenewalAmount}` : ""}</span>
        )}
        <span>{ar ? "مهلة السماح" : "Grace"}: <b>{subscription.graceDays} {ar ? "يوماً" : "days"}</b></span>
      </div>
    </div>
  );
}

/** عدّاد استهلاك واحد مقابل حدّ الباقة. `null` تعني بلا حدّ، فلا يُرسم شريط كاذب. */
function UsageMeter({ label, used, limit, ar }: { label: string; used: number; limit: number | null; ar: boolean }) {
  if (limit === null) {
    return (
      <div className="usage-meter is-unlimited">
        <div className="usage-meter-top"><span>{label}</span><b>{used.toLocaleString("en-US")} / ∞</b></div>
        <div className="usage-track"><div className="usage-fill tone-moss" style={{ width: "100%" }} /></div>
        <small>{ar ? "بلا حدّ في هذه الباقة" : "Unlimited on this plan"}</small>
      </div>
    );
  }
  const percent = limit === 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));
  const tone = percent >= 100 ? "rose" : percent >= 80 ? "amber" : "moss";
  return (
    <div className="usage-meter">
      <div className="usage-meter-top"><span>{label}</span><b>{used.toLocaleString("en-US")} / {limit.toLocaleString("en-US")}</b></div>
      <div className="usage-track"><div className={`usage-fill tone-${tone}`} style={{ width: `${percent}%` }} /></div>
      <small className={`tone-text-${tone}`}>
        {percent >= 100 ? (ar ? "بلغت الحدّ" : "Limit reached") : ar ? `${percent}% من الحدّ` : `${percent}% of limit`}
      </small>
    </div>
  );
}

const INVOICE_STATUS: Record<string, { ar: string; en: string; tone: string }> = {
  draft: { ar: "مسودة", en: "Draft", tone: "muted" },
  issued: { ar: "صادرة", en: "Issued", tone: "sky" },
  partially_paid: { ar: "مسدَّدة جزئياً", en: "Partially paid", tone: "amber" },
  paid: { ar: "مسدَّدة", en: "Paid", tone: "moss" },
  overdue: { ar: "متأخرة", en: "Overdue", tone: "rose" },
  void: { ar: "ملغاة", en: "Void", tone: "muted" },
  refunded: { ar: "مستردّة", en: "Refunded", tone: "violet" },
};

const METHOD_LABEL: Record<string, { ar: string; en: string }> = {
  bank_transfer: { ar: "تحويل بنكي", en: "Bank transfer" },
  knet: { ar: "كي نت", en: "KNET" },
  card: { ar: "بطاقة", en: "Card" },
  cash: { ar: "نقداً", en: "Cash" },
  cheque: { ar: "شيك", en: "Cheque" },
  online: { ar: "دفع إلكتروني", en: "Online" },
  credit: { ar: "رصيد", en: "Credit" },
};

export function BillingView({ lang, snapshot, plans, loading, canRequest, canPay, onRefresh, notify }: Props) {
  const ar = lang === "ar";
  const [openInvoice, setOpenInvoice] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [requestNote, setRequestNote] = useState("");
  /*
   * حالة بوابة الدفع.
   *
   * `null` تعني «لم تُقرأ بعد» لا «غير مربوطة» — والفرق مهم: زرّ دفعٍ يظهر ثم
   * يختفي أسوأ من زرٍّ يتأخر لحظة.
   */
  const [gateway, setGateway] = useState<GatewayState | null>(null);
  const [payingInvoice, setPayingInvoice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    paymentsApi.gateway()
      .then(state => { if (alive) setGateway(state); })
      .catch(() => { if (alive) setGateway(null); });
    return () => { alive = false; };
  }, []);

  /*
   * نتيجة العودة من صفحة المزوّد.
   *
   * الخادم يسأل البوابة ثم يُعيد المتصفح بـ`?payment=`؛ وتُقرأ مرةً واحدة ثم
   * تُنزع من العنوان حتى لا يعيد التحديثُ عرضَ بشارةٍ قديمة.
   */
  const [payResult, setPayResult] = useState<string | null>(null);
  useEffect(() => {
    const outcome = new URLSearchParams(window.location.search).get("payment");
    if (!outcome) return;
    setPayResult(outcome);
    const url = new URL(window.location.href);
    url.searchParams.delete("payment");
    url.hash = "";
    window.history.replaceState({}, "", url.toString());
    if (outcome === "paid") onRefresh();
  }, [onRefresh]);

  const publicPlans = useMemo(() => plans.filter(plan => plan.isPublic && !plan.archived), [plans]);

  if (loading && !snapshot) {
    return <div className="page-enter"><PageHeader eyebrow="SUBSCRIPTION / الاشتراك" title={ar ? "جارٍ قراءة الترخيص..." : "Reading the licence..."} /></div>;
  }
  if (!snapshot) {
    return (
      <div className="page-enter">
        <PageHeader eyebrow="SUBSCRIPTION / الاشتراك" title={ar ? "تعذّر قراءة الاشتراك." : "Could not read the subscription."} />
        <section className="surface-strong sub-empty">
          <AlertTriangle />
          <p>{ar ? "لم يستجب الخادم لطلب حالة الترخيص. أعد المحاولة، وإن تكرّر فالخادم هو المشكلة لا حسابك." : "The server did not answer the licence request."}</p>
          <button className="btn-secondary" onClick={onRefresh}><RefreshCw /> {ar ? "إعادة المحاولة" : "Retry"}</button>
        </section>
      </div>
    );
  }

  const { state, subscription, plan, usage, limits, features } = snapshot;
  const meta = STATUS_META[state.status];
  const StatusIcon = meta.icon;

  /**
   * يفتح صفحة الدفع عند المزوّد.
   *
   * ولا يُرسل مبلغاً: الخادم يشتقّه من المتبقّي. والانتقال يجري في اللسان نفسه
   * عمداً — نافذةٌ جديدة تحجبها المتصفحات فيظنّ الدافع أن الزرّ معطّل.
   */
  const payInvoice = async (invoiceId: string) => {
    setPayingInvoice(invoiceId);
    try {
      const session = await paymentsApi.checkout(invoiceId);
      if (!session?.url) throw new Error(ar ? "لم تُعِد البوابة رابطاً." : "The gateway returned no link.");
      window.location.href = session.url;
    } catch (error) {
      notify(error instanceof Error ? error.message : ar ? "تعذّر فتح صفحة الدفع." : "Could not open the payment page.", true);
      setPayingInvoice(null);
    }
  };

  const sendRequest = async (kind: string) => {
    setRequesting(true);
    try {
      await billingApi.request(kind, requestNote);
      setRequestNote("");
      notify(ar ? "وصل طلبك إلى مالك المنصة، ومسجَّل بتاريخه في سجلّ الاشتراك." : "Your request reached the platform owner.");
    } catch (error) {
      notify(error instanceof Error ? error.message : ar ? "تعذّر إرسال الطلب." : "Could not send the request.", true);
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="SUBSCRIPTION / الاشتراك"
        title={ar ? "ترخيصك، بكل تفاصيله." : "Your licence, in full."}
        hint={ar
          ? "متى بدأ، متى ينتهي، ما الباقة وما تشمله، كم استُهلك منها، وما صدر وما سُدِّد — بلا رقم واحد مخفيّ."
          : "When it started, when it ends, what the plan covers, how much is used, what was invoiced and paid."}
        action={<button className="btn-secondary" onClick={onRefresh}><RefreshCw /> {ar ? "تحديث" : "Refresh"}</button>}
      />

      {snapshot.isDemo && (
        <div className="sub-demo-note"><AlertTriangle /> {snapshot.demoNote}</div>
      )}

      {/* الحالة أولاً، وبصوت عالٍ: من يفتح هذه الشاشة يفتحها لسؤال واحد. */}
      <section className={`surface-strong sub-headline tone-${meta.tone}`}>
        <div className="sub-headline-icon"><StatusIcon /></div>
        <div className="sub-headline-body">
          <div className="sub-headline-top">
            <strong>{ar ? meta.ar : meta.en}</strong>
            {plan && <span className="sub-plan-chip">{ar ? plan.nameAr : plan.nameEn}</span>}
            {subscription && <span className="sub-cycle-chip">{ar ? CYCLE_LABEL[subscription.cycle].ar : CYCLE_LABEL[subscription.cycle].en}</span>}
            {!state.writable && <span className="sub-frozen-chip">{ar ? "الكتابة مجمّدة" : "Writes frozen"}</span>}
          </div>
          <p>{state.reason}</p>
          {!state.writable && (
            <p className="sub-readonly-note">
              {ar
                ? "بياناتك وسجلّ تدقيقك وفواتيرك تبقى مقروءة وقابلة للتصدير كاملة. المتوقّف هو التنفيذ والتعديل، لا الوصول إلى ما جمعته."
                : "Your data, audit trail and invoices stay readable and exportable. Only execution and editing stop."}
            </p>
          )}
        </div>
      </section>

      <div className="stat-grid sub-stats">
        <Stat label={ar ? "المتبقّي من الدورة" : "Days remaining"} value={state.daysRemaining} tone={state.daysRemaining <= 7 ? "amber" : "moss"} icon={<Timer />} />
        <Stat label={ar ? "التجديد القادم" : "Next renewal"} value={snapshot.formatted.nextRenewalAmount || (ar ? "لا تجديد" : "None")} tone="sky" icon={<CalendarClock />} />
        <Stat label={ar ? "مستحق غير مسدَّد" : "Outstanding"} value={snapshot.formatted.outstanding} tone={snapshot.outstanding.amount > 0 ? "rose" : "moss"} icon={<Wallet />} />
        <Stat label={ar ? "إجمالي ما سُدِّد" : "Paid to date"} value={snapshot.formatted.lifetimePaid} tone="violet" icon={<Receipt />} />
        <Stat label={ar ? "سقف الاستقلالية" : "Autonomy ceiling"} value={`L${limits?.maxAutonomyLevel ?? 6}`} tone="amber" icon={<ShieldCheck />} />
      </div>

      <section className="surface-strong sub-block">
        <SectionTitle title={ar ? "مدّة الاشتراك" : "Subscription term"} icon={<CalendarClock />}
          meta={subscription ? `${shortDate(subscription.startedAt, ar)} → ${shortDate(subscription.currentPeriodEnd, ar)}` : undefined} />
        <LifeBar snapshot={snapshot} ar={ar} />
        {snapshot.scheduledPlanChange && (
          <div className="sub-scheduled">
            <ArrowUpRight />
            {ar
              ? `انتقالٌ مجدول إلى باقة «${snapshot.scheduledPlanChange.planCode}» عند نهاية الدورة الحالية.`
              : `Scheduled move to "${snapshot.scheduledPlanChange.planCode}" at the end of this period.`}
          </div>
        )}
      </section>

      {/* الاستهلاك مقابل الحدّ: الرقم وحده لا يقول شيئاً بلا سقفه. */}
      {limits && (
        <section className="surface-strong sub-block">
          <SectionTitle title={ar ? "الاستهلاك مقابل حدود الباقة" : "Usage against plan limits"} icon={<Gauge />}
            meta={ar ? "يُقاس من نظامك، لا يُصرَّح به" : "Measured, not declared"} />
          <div className="usage-grid">
            <UsageMeter ar={ar} label={ar ? "المقاعد (الحسابات)" : "Seats"} used={usage.seats} limit={limits.seats === null ? null : Math.max(limits.seats, subscription?.seatsPurchased ?? 0)} />
            <UsageMeter ar={ar} label={ar ? "المهارات الموثّقة" : "Codified skills"} used={usage.skills} limit={limits.skills} />
            <UsageMeter ar={ar} label={ar ? "حالات العمل هذه الدورة" : "Work items this period"} used={usage.workItemsThisPeriod} limit={limits.workItemsPerMonth} />
            <UsageMeter ar={ar} label={ar ? "الموصلات" : "Connectors"} used={usage.connectors} limit={limits.connectors} />
            <UsageMeter ar={ar} label={ar ? "نداءات الذكاء هذه الدورة" : "AI calls this period"} used={usage.aiCallsThisPeriod} limit={limits.aiCallsPerMonth} />
          </div>
        </section>
      )}

      {/* ما تشمله الباقة — بالمفتوح والمغلق معاً، فالمغلق هو ما يُشترى. */}
      {plan && (
        <section className="surface-strong sub-block">
          <SectionTitle title={ar ? `ما تشمله باقة «${plan.nameAr}»` : `What "${plan.nameEn}" includes`} icon={<Layers />}
            meta={plan.taglineAr && ar ? plan.taglineAr : plan.taglineEn} />
          <div className="feature-grid">
            {FEATURE_ORDER.map(key => {
              const on = Boolean(features[key]);
              return (
                <div key={key} className={`feature-cell ${on ? "on" : "off"}`}>
                  {on ? <CheckCircle2 /> : <CircleSlash />}
                  <span>{ar ? FEATURE_LABELS[key].ar : FEATURE_LABELS[key].en}</span>
                </div>
              );
            })}
          </div>
          {subscription && (subscription.discountBps > 0 || subscription.taxBps > 0) && (
            <div className="sub-terms">
              {subscription.discountBps > 0 && <span>{ar ? "خصم تعاقدي" : "Contract discount"}: <b>{(subscription.discountBps / 100).toFixed(2)}%</b></span>}
              {subscription.taxBps > 0 && <span>{ar ? "ضريبة/رسوم" : "Tax"}: <b>{(subscription.taxBps / 100).toFixed(2)}%</b></span>}
              <span>{ar ? "المقاعد المتعاقد عليها" : "Contracted seats"}: <b>{subscription.seatsPurchased}</b></span>
            </div>
          )}
        </section>
      )}

      {/* الباقات — ليعرف المشتري ما فوق باقته، لا ليشتري بضغطة. */}
      {publicPlans.length > 0 && (
        <section className="surface-strong sub-block">
          <SectionTitle title={ar ? "الباقات" : "Plans"} icon={<Layers />} meta={ar ? "الأسعار بالعملة المتعاقد بها" : "Prices in the contracted currency"} />
          <div className="plan-grid">
            {publicPlans.map(item => {
              const current = plan?.code === item.code;
              return (
                <article key={item.code} className={`plan-card ${current ? "is-current" : ""}`}>
                  {current && <span className="plan-current-flag">{ar ? "باقتك الحالية" : "Your plan"}</span>}
                  <h4>{ar ? item.nameAr : item.nameEn}</h4>
                  <p className="plan-tagline">{ar ? item.taglineAr : item.taglineEn}</p>
                  <div className="plan-price">
                    <strong>{item.priceMonthly > 0 ? money(item.priceMonthly, item.currency) : (ar ? "بالتفاوض" : "On request")}</strong>
                    {item.priceMonthly > 0 && <small>/ {ar ? "شهرياً" : "month"}</small>}
                  </div>
                  {item.priceAnnual > 0 && (
                    <div className="plan-annual">{ar ? "سنوياً" : "Annually"}: {money(item.priceAnnual, item.currency)}</div>
                  )}
                  {item.setupFee > 0 && (
                    <div className="plan-setup">{ar ? "رسوم تأسيس مرة واحدة" : "One-time setup"}: {money(item.setupFee, item.currency)}</div>
                  )}
                  <ul className="plan-limits">
                    <li>{ar ? "مقاعد" : "Seats"}: <b>{item.limits.seats ?? "∞"}</b></li>
                    <li>{ar ? "مهارات" : "Skills"}: <b>{item.limits.skills ?? "∞"}</b></li>
                    <li>{ar ? "حالات شهرياً" : "Work items / mo"}: <b>{item.limits.workItemsPerMonth?.toLocaleString("en-US") ?? "∞"}</b></li>
                    <li>{ar ? "سقف الاستقلالية" : "Autonomy ceiling"}: <b>L{item.limits.maxAutonomyLevel}</b></li>
                  </ul>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* نتيجة العودة من صفحة المزوّد — تُقال كما هي، لا "شكراً" مهما حدث. */}
      {payResult && (
        <section className={`surface-strong sub-block pay-result tone-${payResult === "paid" ? "moss" : payResult === "pending" ? "amber" : "rose"}`} role="status">
          {payResult === "paid" ? <CheckCircle2 /> : <AlertTriangle />}
          <p>
            {payResult === "paid"
              ? (ar ? "وصل السداد وسُجِّل على الفاتورة." : "Payment received and recorded.")
              : payResult === "pending"
                ? (ar ? "لم تكتمل العملية عند المزوّد بعد. إن خُصم المبلغ فسيظهر هنا حال تأكيد البوابة." : "The payment is still pending at the provider.")
                : payResult === "mismatch"
                  ? (ar ? "حُصِّل مبلغ يخالف قيمة الفاتورة — العملية موقوفة للمراجعة ولم تُسجَّل." : "A mismatched amount was captured — held for review.")
                  : (ar ? "لم تكتمل عملية الدفع." : "The payment did not go through.")}
          </p>
          <button className="btn-secondary" onClick={() => setPayResult(null)}>{ar ? "إخفاء" : "Dismiss"}</button>
        </section>
      )}

      {/* الفواتير — بالبنود، لا بمجموعٍ يُطلب تصديقه. */}
      <section className="surface-strong sub-block">
        <SectionTitle title={ar ? "الفواتير" : "Invoices"} icon={<FileText />} meta={`${snapshot.invoices.length}`} />
        {!snapshot.invoices.length ? (
          <p className="sub-empty-line">{ar ? "لا فواتير بعد." : "No invoices yet."}</p>
        ) : (
          <div className="ledger">
            <div className="ledger-head">
              <span>{ar ? "الرقم" : "Number"}</span>
              <span>{ar ? "المدة" : "Period"}</span>
              <span>{ar ? "الاستحقاق" : "Due"}</span>
              <span>{ar ? "الإجمالي" : "Total"}</span>
              <span>{ar ? "المسدَّد" : "Paid"}</span>
              <span>{ar ? "الحالة" : "Status"}</span>
            </div>
            {snapshot.invoices.map(invoice => {
              const status = INVOICE_STATUS[invoice.status] || { ar: invoice.status, en: invoice.status, tone: "muted" };
              const open = openInvoice === invoice.id;
              return (
                <React.Fragment key={invoice.id}>
                  <button className={`ledger-row ${open ? "open" : ""}`} onClick={() => setOpenInvoice(open ? null : invoice.id)}>
                    <span className="mono">{invoice.number}</span>
                    <span>{invoice.periodStart ? `${shortDate(invoice.periodStart, ar)} → ${shortDate(invoice.periodEnd, ar)}` : shortDate(invoice.issuedAt, ar)}</span>
                    <span>{shortDate(invoice.dueAt, ar)}</span>
                    <span className="mono">{money(invoice.total, invoice.currency)}</span>
                    <span className="mono">{money(invoice.amountPaid, invoice.currency)}</span>
                    <span><i className={`ledger-badge tone-${status.tone}`}>{ar ? status.ar : status.en}</i></span>
                  </button>
                  {open && (
                    <div className="ledger-detail">
                      {invoice.lines.map((line, index) => (
                        <div key={index} className="ledger-line">
                          <span>{line.description}</span>
                          <span className="mono">{line.quantity} × {money(line.unitAmount, invoice.currency)}</span>
                          <span className="mono">{money(line.amount, invoice.currency)}</span>
                        </div>
                      ))}
                      <div className="ledger-totals">
                        <span>{ar ? "المجموع الفرعي" : "Subtotal"}: <b className="mono">{money(invoice.subtotal, invoice.currency)}</b></span>
                        {invoice.discount > 0 && <span>{ar ? "الخصم" : "Discount"}: <b className="mono">-{money(invoice.discount, invoice.currency)}</b></span>}
                        {invoice.tax > 0 && <span>{ar ? "الضريبة" : "Tax"}: <b className="mono">{money(invoice.tax, invoice.currency)}</b></span>}
                        <span>{ar ? "الإجمالي" : "Total"}: <b className="mono">{money(invoice.total, invoice.currency)}</b></span>
                      </div>
                      {invoice.notes && <p className="ledger-note">{invoice.notes}</p>}

                      {/*
                        * الدفع من داخل الفاتورة نفسها.
                        *
                        * وبلا بوابةٍ مربوطة لا يُعرض زرٌّ يقود إلى لا شيء — تُقال
                        * الطريقة الفعلية للسداد صراحةً. وعد دفعٍ لا يعمل يُكلّف
                        * أكثر ممّا يُكلّف غيابه.
                      */}
                      {invoice.status !== "void" && invoice.amountPaid < invoice.total && (
                        <div className="invoice-pay">
                          {gateway?.configured && canPay ? (
                            <>
                              <button
                                className="btn-primary"
                                disabled={payingInvoice === invoice.id}
                                onClick={() => void payInvoice(invoice.id)}
                              >
                                <CreditCard />
                                {payingInvoice === invoice.id
                                  ? (ar ? "جارٍ فتح صفحة الدفع..." : "Opening payment page...")
                                  : (ar ? `ادفع ${money(invoice.total - invoice.amountPaid, invoice.currency)}` : `Pay ${money(invoice.total - invoice.amountPaid, invoice.currency)}`)}
                              </button>
                              <small>
                                {gateway.providerLabel}
                                {gateway.environment === "test" && (ar ? " — بيئة اختبار، لا تُحصَّل مبالغ حقيقية" : " — test environment")}
                              </small>
                            </>
                          ) : (
                            <small className="invoice-pay-manual">
                              {gateway?.configured
                                ? (ar
                                  ? "السداد من هذه الشاشة متاح للمشرف أو المدير — راجع من يملك الصرف في مؤسستك."
                                  : "Paying from this screen is available to an admin or a manager.")
                                : (ar
                                  ? "لا بوابة دفع مربوطة في هذا النشر — تُسدَّد الفاتورة بتحويل بنكي أو كي نت، ويُسجّل مالك المنصة الدفعة بمرجعها فتظهر هنا."
                                  : "No payment gateway is connected — settle by transfer and the owner records the payment with its reference.")}
                            </small>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </section>

      <section className="surface-strong sub-block">
        <SectionTitle title={ar ? "الدفعات" : "Payments"} icon={<CreditCard />} meta={`${snapshot.payments.length}`} />
        {!snapshot.payments.length ? (
          <p className="sub-empty-line">{ar ? "لا دفعات مسجّلة." : "No payments recorded."}</p>
        ) : (
          <div className="ledger compact">
            <div className="ledger-head four">
              <span>{ar ? "التاريخ" : "Date"}</span>
              <span>{ar ? "المبلغ" : "Amount"}</span>
              <span>{ar ? "الوسيلة" : "Method"}</span>
              <span>{ar ? "المرجع" : "Reference"}</span>
            </div>
            {snapshot.payments.map(payment => (
              <div key={payment.id} className="ledger-row four static">
                <span>{shortDate(payment.paidAt, ar)}</span>
                <span className="mono">{money(payment.amount, payment.currency)}</span>
                <span>{ar ? (METHOD_LABEL[payment.method]?.ar || payment.method) : (METHOD_LABEL[payment.method]?.en || payment.method)}</span>
                <span className="mono">{payment.reference || "—"}</span>
              </div>
            ))}
          </div>
        )}
        <p className="sub-footnote">
          {ar
            ? "نهج لا يستضيف بوابة دفع ولا يحتفظ ببيانات بطاقة. الدفع يتم بقناتك المعتادة، ويُسجَّل هنا بمرجعه إثباتاً."
            : "NAHJ hosts no payment gateway and stores no card data. Payment happens on your usual channel and is recorded here with its reference."}
        </p>
      </section>

      {/* قناة طلب داخل المنتج: بدونها يخرج الطلب إلى رسالة تضيع. */}
      {canRequest && !snapshot.isDemo && (
        <section className="surface-strong sub-block sub-request">
          <SectionTitle title={ar ? "طلب يتعلق بالاشتراك" : "Subscription request"} icon={<ArrowUpRight />}
            meta={ar ? "يصل إلى مالك المنصة مؤرَّخاً باسمك" : "Reaches the platform owner, stamped with your name"} />
          <textarea
            value={requestNote}
            onChange={event => setRequestNote(event.target.value)}
            maxLength={1000}
            placeholder={ar ? "اكتب ما تحتاجه — عدد المقاعد، الباقة المطلوبة، أو سؤالاً عن فاتورة." : "What you need — seats, plan, or a question about an invoice."}
          />
          <div className="sub-request-actions">
            <button className="btn-primary" disabled={requesting} onClick={() => void sendRequest("renew")}>{ar ? "طلب تجديد" : "Request renewal"}</button>
            <button className="btn-secondary" disabled={requesting} onClick={() => void sendRequest("upgrade")}>{ar ? "ترقية باقة" : "Upgrade plan"}</button>
            <button className="btn-secondary" disabled={requesting} onClick={() => void sendRequest("seats")}>{ar ? "مقاعد إضافية" : "More seats"}</button>
            <button className="btn-secondary" disabled={requesting} onClick={() => void sendRequest("question")}>{ar ? "استفسار" : "Question"}</button>
          </div>
        </section>
      )}
    </div>
  );
}
