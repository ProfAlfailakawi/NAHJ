import { formattedMoney } from "../../lib/labels";
import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, Building2, CalendarClock, CheckCircle2, Clock3, HandCoins, RefreshCw, Wallet,
} from "lucide-react";
import { PageHeader, SectionTitle, Stat } from "../Primitives";
import { SectorIcon } from "../SectorIcon";
import {
  CLIENT_STATUS_AR, COMMISSION_MODEL_AR, COMMISSION_STATUS_AR, money, partnersApi,
  type PartnerPortal,
} from "../../lib/api";

/*
 * لوحة المسوّق.
 *
 * كانت العمولات خارج النظام: رسائل واتفاقاتٌ شفهية ودفترٌ عند المالك. فلا
 * المسوّق يعرف ما استحقّ، ولا المالك يعرف ما عليه — والخلاف حتمي لأن لا أحد
 * ينظر إلى الرقم نفسه.
 *
 * وهذه الشاشة تُري المسوّق ما يخصّه وحده: شركاته، وما استُحقّ له، وما قُبض، وما
 * بقي. والعزل في الخادم لا هنا — ما لا يخصّه لا يصل إليه أصلاً، فلا شركات زميله
 * ولا إجمالي إيراد المالك ولا بيانة تشغيلية من داخل أي مؤسسة.
 */

interface Props {
  lang: "ar" | "en";
  notify: (text: string, error?: boolean) => void;
}

const SECTOR_AR: Record<string, string> = {
  education: "تعليم ومدارس", clinic: "عيادة ومركز طبي", law: "مكتب محاماة", retail: "تجزئة ومطاعم",
  logistics: "شحن ولوجستيات", realestate: "عقارات وإدارة أملاك", general: "نشاط عام",
};

/* حالة فارغة: رمزٌ ونصٌّ بدل سطرٍ مجرّد. */
const EmptyNote = ({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) => (
  <div className="partner-empty">{icon}<p>{children}</p></div>
);

const shortDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("ar-KW-u-nu-latn", { year: "numeric", month: "short", day: "numeric" }) : "—";

const modelSummary = (portal: PartnerPortal) => {
  const { model, rateBps, fixedAmount, currency, durationMonths } = portal.partner;
  const base = model === "percent_of_contract"
    ? `${(rateBps / 100).toFixed(2)}% من قيمة كل دورة`
    : model === "fixed_per_cycle"
      ? `${money(fixedAmount, currency, true)} عن كل دورة`
      : `${money(fixedAmount, currency, true)} مرة واحدة عند التعاقد`;
  return durationMonths > 0 ? `${base} — لمدّة ${durationMonths} شهراً من بدء العقد` : `${base} — ما دام العميل مشتركاً`;
};

export function PartnerPortalView({ lang, notify }: Props) {
  const ar = lang === "ar";
  const [portal, setPortal] = useState<PartnerPortal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [openClient, setOpenClient] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPortal(await partnersApi.me());
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذّر تحميل اللوحة.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return <div className="page-enter"><PageHeader eyebrow={ar?"المسوّق":"PARTNER"} title={ar ? "جارٍ التحميل..." : "Loading..."} /></div>;
  }

  if (error || !portal) {
    return (
      <div className="page-enter">
        <PageHeader eyebrow={ar?"المسوّق":"PARTNER"} title={ar ? "لوحتك غير متاحة." : "Portal unavailable."} />
        <section className="surface-strong sub-empty">
          <AlertTriangle />
          <p>{error || (ar ? "تعذّر تحميل اللوحة." : "Could not load.")}</p>
          <button className="btn-secondary" onClick={() => void load()}><RefreshCw /> {ar ? "إعادة المحاولة" : "Retry"}</button>
        </section>
      </div>
    );
  }

  const { totals, clients, commissions } = portal;

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow={ar?"لوحة المسوّق":"PARTNER"}
        title={`أهلاً ${portal.partner.name}.`}
        hint={ar
          ? "شركاتك، وما استُحقّ لك، وما قُبض، وما بقي. الأرقام هنا هي نفسها التي يراها مالك المنصة — لا دفتران."
          : "Your companies and your commission — the same figures the platform owner sees."}
        action={<button className="btn-secondary" onClick={() => void load()}><RefreshCw /> {ar ? "تحديث" : "Refresh"}</button>}
      />

      {/* المبلغ المستحقّ لك الآن هو أهمّ رقمٍ هنا — يتصدّر الصفحة، وتحته نسبة ما قُبض مما استُحقّ. */}
      <section className={`partner-hero ${totals.due > 0 ? "has-due" : ""}`} aria-label={ar ? "المستحقّ لك الآن" : "Due to you now"}>
        <div className="partner-hero-main">
          <span>{ar ? "المستحقّ لك الآن" : "Due to you now"}</span>
          <strong className="mono">{formattedMoney(totals.formatted.due, ar)}</strong>
        </div>
        <div className="partner-hero-split">
          <div className="partner-hero-bar" role="img" aria-label={ar ? `قُبض ${totals.accrued > 0 ? Math.round(totals.paid / totals.accrued * 100) : 0}% مما استُحقّ` : "Share paid"}>
            <i style={{ width: `${totals.accrued > 0 ? Math.min(100, Math.round(totals.paid / totals.accrued * 100)) : 0}%` }} />
          </div>
          <div className="partner-hero-legend">
            <span><i className="paid" />{ar ? "ما قُبض" : "Paid"} <b className="mono">{formattedMoney(totals.formatted.paid, ar)}</b></span>
            <span><i className="accrued" />{ar ? "إجمالي ما استُحقّ" : "Accrued"} <b className="mono">{formattedMoney(totals.formatted.accrued, ar)}</b></span>
          </div>
        </div>
      </section>

      <div className="stat-grid">
        <Stat label={ar ? "شركاتك" : "Companies"} value={clients.length} tone="sky" icon={<Building2 />} />
        <Stat label={ar ? "إجمالي ما استُحقّ" : "Accrued"} value={formattedMoney(totals.formatted.accrued, ar)} tone="violet" icon={<HandCoins />} />
        <Stat label={ar ? "ما قُبض" : "Paid"} value={formattedMoney(totals.formatted.paid, ar)} tone="moss" icon={<CheckCircle2 />} />
        <Stat label={ar ? "المستحقّ لك الآن" : "Due to you"} value={formattedMoney(totals.formatted.due, ar)} tone={totals.due > 0 ? "amber" : "moss"} icon={<Wallet />} />
      </div>

      {/* الاتفاق مكتوبٌ على الشاشة، فلا يبقى في الذاكرة وحدها. */}
      <section className="surface-strong sub-block partner-agreement">
        <SectionTitle title={ar ? "اتفاقك" : "Your agreement"} icon={<HandCoins />}
          meta={COMMISSION_MODEL_AR[portal.partner.model]} />
        <p>{modelSummary(portal)}</p>
      </section>

      <section className="surface-strong sub-block">
        <SectionTitle title={ar ? "شركاتك" : "Your companies"} icon={<Building2 />} meta={`${clients.length}`} />
        {!clients.length ? (
          <EmptyNote icon={<Building2 />}>{ar ? "لا شركات مسجّلة تحتك بعد." : "No companies assigned yet."}</EmptyNote>
        ) : (
          <div className="partner-clients">
            {clients.map(client => {
              const open = openClient === client.id;
              const clientCommissions = commissions.filter(commission => commission.clientId === client.id);
              return (
                <article key={client.id} className={`partner-client status-${client.status}`}>
                  <button className="partner-client-head" onClick={() => setOpenClient(open ? null : client.id)}>
                    <SectorIcon code={client.sector} size="sm" />
                    <div>
                      <strong>{client.name}</strong>
                      <small>{(ar && SECTOR_AR[client.sector]) || client.sector || "—"}</small>
                    </div>
                    <span className={`client-badge status-${client.status}`}>{CLIENT_STATUS_AR[client.status]}</span>
                    <span className="partner-client-amount mono">{client.commissionFormatted}</span>
                  </button>

                  <div className="partner-client-meta">
                    <span>{ar ? "قيمة الدورة" : "Cycle value"}: <b className="mono">{money(client.contractValue, client.currency, ar)}</b></span>
                    <span>{ar ? "بدأ" : "Started"}: <b>{shortDate(client.startedAt)}</b></span>
                    <span>{ar ? "ينتهي" : "Ends"}: <b>{shortDate(client.endsAt)}</b></span>
                    <span className={client.daysToRenewal <= 30 ? "tone-text-amber" : ""}>
                      <CalendarClock /> {client.daysToRenewal} {ar ? "يوماً للتجديد" : "days to renewal"}
                    </span>
                  </div>

                  {open && (
                    <div className="partner-client-detail">
                      {!clientCommissions.length ? (
                        <EmptyNote icon={<Clock3 />}>{ar ? "لا عمولات مستحقّة بعد على هذه الشركة." : "No commissions yet."}</EmptyNote>
                      ) : (
                        clientCommissions.map(commission => (
                          <div key={commission.id} className="partner-commission-row">
                            <span>{shortDate(commission.periodStart)} → {shortDate(commission.periodEnd)}</span>
                            <span className="mono">{money(commission.amount, commission.currency, ar)}</span>
                            <span><i className={`ledger-badge tone-${commission.status === "paid" ? "moss" : commission.status === "void" ? "muted" : "amber"}`}>
                              {COMMISSION_STATUS_AR[commission.status]}
                            </i></span>
                            <span className="mono partner-ref">{commission.paymentReference || (commission.paidAt ? "—" : "")}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="surface-strong sub-block">
        <SectionTitle title={ar ? "كشف العمولات" : "Commission statement"} icon={<Clock3 />} meta={`${commissions.length}`} />
        {!commissions.length ? (
          <EmptyNote icon={<HandCoins />}>{ar ? "لا عمولات بعد." : "No commissions yet."}</EmptyNote>
        ) : (
          <div className="ledger compact">
            <div className="ledger-head four">
              <span>{ar ? "الدورة" : "Period"}</span>
              <span>{ar ? "الشركة" : "Company"}</span>
              <span>{ar ? "المبلغ" : "Amount"}</span>
              <span>{ar ? "الحالة" : "Status"}</span>
            </div>
            {commissions.map(commission => (
              <div key={commission.id} className="ledger-row four static">
                <span>{shortDate(commission.periodStart)}</span>
                <span>{clients.find(client => client.id === commission.clientId)?.name || "—"}</span>
                <span className="mono">{money(commission.amount, commission.currency, ar)}</span>
                <span><i className={`ledger-badge tone-${commission.status === "paid" ? "moss" : commission.status === "void" ? "muted" : "amber"}`}>
                  {COMMISSION_STATUS_AR[commission.status]}
                </i></span>
              </div>
            ))}
          </div>
        )}
        <p className="sub-footnote">
          {ar
            ? "العمولة تُستحقّ عن كل دورة يبدأها العميل، وتُعلَّم مدفوعةً حين يسجّل المالك الدفع بمرجعه. وما تراه هنا هو دفتر المالك نفسه."
            : "Commission accrues per cycle and is marked paid when the owner records the payment."}
        </p>
      </section>
    </div>
  );
}
