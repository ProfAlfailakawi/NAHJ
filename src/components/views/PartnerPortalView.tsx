import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, Building2, CalendarClock, CheckCircle2, Clock3, HandCoins, RefreshCw, Wallet,
} from "lucide-react";
import { PageHeader, SectionTitle, Stat } from "../Primitives";
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

const shortDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("ar-KW", { year: "numeric", month: "short", day: "numeric" }) : "—";

const modelSummary = (portal: PartnerPortal) => {
  const { model, rateBps, fixedAmount, currency, durationMonths } = portal.partner;
  const base = model === "percent_of_contract"
    ? `${(rateBps / 100).toFixed(2)}% من قيمة كل دورة`
    : model === "fixed_per_cycle"
      ? `${money(fixedAmount, currency)} عن كل دورة`
      : `${money(fixedAmount, currency)} مرة واحدة عند التعاقد`;
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
    return <div className="page-enter"><PageHeader eyebrow="PARTNER / المسوّق" title={ar ? "جارٍ التحميل..." : "Loading..."} /></div>;
  }

  if (error || !portal) {
    return (
      <div className="page-enter">
        <PageHeader eyebrow="PARTNER / المسوّق" title={ar ? "لوحتك غير متاحة." : "Portal unavailable."} />
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
        eyebrow="PARTNER / لوحة المسوّق"
        title={`أهلاً ${portal.partner.name}.`}
        hint={ar
          ? "شركاتك، وما استُحقّ لك، وما قُبض، وما بقي. الأرقام هنا هي نفسها التي يراها مالك المنصة — لا دفتران."
          : "Your companies and your commission — the same figures the platform owner sees."}
        action={<button className="btn-secondary" onClick={() => void load()}><RefreshCw /> {ar ? "تحديث" : "Refresh"}</button>}
      />

      <div className="stat-grid">
        <Stat label={ar ? "شركاتك" : "Companies"} value={clients.length} tone="sky" icon={<Building2 />} />
        <Stat label={ar ? "إجمالي ما استُحقّ" : "Accrued"} value={totals.formatted.accrued} tone="violet" icon={<HandCoins />} />
        <Stat label={ar ? "ما قُبض" : "Paid"} value={totals.formatted.paid} tone="moss" icon={<CheckCircle2 />} />
        <Stat label={ar ? "المستحقّ لك الآن" : "Due to you"} value={totals.formatted.due} tone={totals.due > 0 ? "amber" : "moss"} icon={<Wallet />} />
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
          <p className="sub-empty-line">{ar ? "لا شركات مسجّلة تحتك بعد." : "No companies assigned yet."}</p>
        ) : (
          <div className="partner-clients">
            {clients.map(client => {
              const open = openClient === client.id;
              const clientCommissions = commissions.filter(commission => commission.clientId === client.id);
              return (
                <article key={client.id} className={`partner-client status-${client.status}`}>
                  <button className="partner-client-head" onClick={() => setOpenClient(open ? null : client.id)}>
                    <div>
                      <strong>{client.name}</strong>
                      <small>{client.sector || "—"}</small>
                    </div>
                    <span className={`client-badge status-${client.status}`}>{CLIENT_STATUS_AR[client.status]}</span>
                    <span className="partner-client-amount mono">{client.commissionFormatted}</span>
                  </button>

                  <div className="partner-client-meta">
                    <span>{ar ? "قيمة الدورة" : "Cycle value"}: <b className="mono">{money(client.contractValue, client.currency)}</b></span>
                    <span>{ar ? "بدأ" : "Started"}: <b>{shortDate(client.startedAt)}</b></span>
                    <span>{ar ? "ينتهي" : "Ends"}: <b>{shortDate(client.endsAt)}</b></span>
                    <span className={client.daysToRenewal <= 30 ? "tone-text-amber" : ""}>
                      <CalendarClock /> {client.daysToRenewal} {ar ? "يوماً للتجديد" : "days to renewal"}
                    </span>
                  </div>

                  {open && (
                    <div className="partner-client-detail">
                      {!clientCommissions.length ? (
                        <p className="sub-empty-line">{ar ? "لا عمولات مستحقّة بعد على هذه الشركة." : "No commissions yet."}</p>
                      ) : (
                        clientCommissions.map(commission => (
                          <div key={commission.id} className="partner-commission-row">
                            <span>{shortDate(commission.periodStart)} → {shortDate(commission.periodEnd)}</span>
                            <span className="mono">{money(commission.amount, commission.currency)}</span>
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
          <p className="sub-empty-line">{ar ? "لا عمولات بعد." : "No commissions yet."}</p>
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
                <span className="mono">{money(commission.amount, commission.currency)}</span>
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
