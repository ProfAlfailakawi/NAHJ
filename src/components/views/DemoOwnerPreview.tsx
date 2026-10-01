import React from "react";
import { Crown, HandCoins, Info } from "lucide-react";
import { PageHeader, SectionTitle, Stat } from "../Primitives";

/*
 * معاينة لوحة المالك والمسوّقين في العرض التجريبي.
 *
 * اللوحتان الحقيقيتان تقرآن دفتر الفوترة والمسوّقين في القاعدة الحقيقية، فتبقيان محجوبتين
 * عن الزائر. لكن من يعرض النظام على مشترٍ يريد أن يريه الجهة الأخرى من البيع أيضاً.
 *
 * فهذه صفحةٌ للقراءة فقط، بيانُها مكتوبٌ هنا ومؤسساتُها ومسوّقوها وأرقامُها مُختلَقة،
 * وتواريخها نسبيةٌ لليوم. لا تستدعي الخادم إطلاقاً، فلا يمكن أن تقرأ ما ليس لها ولا أن
 * تكتب شيئاً. وشارةٌ ظاهرة تقول إنها نموذج، حتى لا تُحمَل لقطةٌ منها على أنها أرقام فعلية.
 */

const dayOffset = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};
const fmt = (date: Date, ar: boolean) =>
  date.toLocaleDateString(ar ? "ar-KW" : "en-GB", { year: "numeric", month: "short", day: "numeric" });
const kwd = (value: number, ar: boolean) => `${value.toLocaleString("en-US")} ${ar ? "د.ك" : "KWD"}`;

const PLANS = [
  { ar: "أساسية", en: "Starter", monthly: 85, seats: 5, orgs: 3 },
  { ar: "احترافية", en: "Professional", monthly: 240, seats: 25, orgs: 5 },
  { ar: "مؤسسية", en: "Enterprise", monthly: 690, seats: 120, orgs: 2 },
] as const;

type OrgStatus = "active" | "trial" | "overdue";
const ORGS: Array<{ ar: string; en: string; sector: [string, string]; plan: number; status: OrgStatus; renew: number; amount: number }> = [
  { ar: "أكاديمية المستقبل الدولية", en: "Future Academy International", sector: ["تعليم", "Education"], plan: 2, status: "active", renew: 41, amount: 690 },
  { ar: "مركز الشفاء التخصصي", en: "Al-Shifa Specialist Centre", sector: ["عيادة", "Clinic"], plan: 1, status: "active", renew: 19, amount: 240 },
  { ar: "مكتب الميزان للمحاماة", en: "Al-Mizan Law Office", sector: ["محاماة", "Law"], plan: 1, status: "active", renew: 63, amount: 240 },
  { ar: "متاجر الواحة", en: "Al-Waha Stores", sector: ["تجزئة", "Retail"], plan: 1, status: "overdue", renew: -6, amount: 240 },
  { ar: "شركة المسار للشحن", en: "Al-Masar Shipping", sector: ["لوجستيات", "Logistics"], plan: 0, status: "trial", renew: 12, amount: 0 },
  { ar: "شركة الديرة العقارية", en: "Al-Dira Real Estate", sector: ["عقارات", "Real estate"], plan: 1, status: "active", renew: 27, amount: 240 },
  { ar: "مدرسة النور الأهلية", en: "Al-Noor Private School", sector: ["تعليم", "Education"], plan: 0, status: "active", renew: 33, amount: 85 },
  { ar: "عيادات الرعاية الأسرية", en: "Family Care Clinics", sector: ["عيادة", "Clinic"], plan: 0, status: "trial", renew: 5, amount: 0 },
];
const STATUS_LABEL: Record<OrgStatus, [string, string]> = { active: ["ساري", "Active"], trial: ["تجربة", "Trial"], overdue: ["متأخر", "Overdue"] };

const PARTNERS = [
  { ar: "مها الدوسري", en: "Maha Al-Dosari", code: "MAHA-DEMO", leads: 14, won: 5, rate: 10, pending: 410, paid: 960 },
  { ar: "عادل الراشد", en: "Adel Al-Rashid", code: "ADEL-DEMO", leads: 9, won: 3, rate: 10, pending: 180, paid: 540 },
  { ar: "شركة الأفق للاستشارات", en: "Al-Ofuq Consulting", code: "OFUQ-DEMO", leads: 22, won: 8, rate: 12, pending: 760, paid: 1650 },
  { ar: "ريم القطان", en: "Reem Al-Qattan", code: "REEM-DEMO", leads: 6, won: 1, rate: 10, pending: 85, paid: 0 },
  { ar: "فريق التحوّل الرقمي", en: "Digital Shift Team", code: "SHIFT-DEMO", leads: 11, won: 4, rate: 12, pending: 0, paid: 1120 },
];

export function DemoOwnerPreview({ lang, kind }: { lang: "ar" | "en"; kind: "owner" | "partners" }) {
  const ar = lang === "ar";
  const t = (a: string, e: string) => (ar ? a : e);
  const mrr = ORGS.filter(org => org.status !== "trial").reduce((sum, org) => sum + org.amount, 0);
  const invoices = ORGS.filter(org => org.amount > 0).map((org, index) => ({
    no: `INV-DEMO-${String(1040 + index)}`,
    org: ar ? org.ar : org.en,
    amount: org.amount,
    issued: dayOffset(-(index * 3 + 2)),
    state: org.status === "overdue" ? "overdue" : index % 3 === 2 ? "open" : "paid",
  }));
  const invoiceState: Record<string, [string, string]> = { paid: ["مسدّدة", "Paid"], open: ["مفتوحة", "Open"], overdue: ["متأخرة", "Overdue"] };

  return (
    <>
      <PageHeader
        eyebrow={kind === "owner" ? t("لوحة المالك", "Owner console") : t("المسوّقون", "Partners")}
        title={kind === "owner" ? t("المنصة من جهة البيع", "The platform from the selling side") : t("المسوّقون بالعمولة", "Commission partners")}
        hint={kind === "owner"
          ? t("هكذا يرى مالك المنصة باقاته ومؤسساته وفواتيره.", "How the platform owner sees plans, organisations and invoices.")
          : t("هكذا يتابع المالك المسوّقين وطلباتهم وعمولاتهم.", "How the owner follows partners, their leads and commissions.")}
      />
      <div className="demo-banner" role="note">
        <Info aria-hidden="true" />
        <p>
          <span>{t("نموذج توضيحي للقراءة فقط", "Read-only illustration")}</span>{" — "}
          {t("كل الأسماء والأرقام مُختلَقة ولا تقرأ من سجلّ الفوترة الحقيقي. لا يُحفظ أو يُرسل شيءٌ من هنا.",
            "Every name and figure is invented and nothing is read from the real billing ledger. Nothing here is saved or sent.")}
        </p>
      </div>

      {kind === "owner" ? (
        <>
          <div className="stat-grid">
            <Stat value={kwd(mrr, ar)} label={t("الإيراد الشهري المتكرر", "Monthly recurring revenue")} tone="moss" icon={<Crown />} />
            <Stat value={ORGS.filter(o => o.status === "active").length} label={t("مؤسسات فعّالة", "Active organisations")} tone="sky" />
            <Stat value={ORGS.filter(o => o.status === "trial").length} label={t("في التجربة", "On trial")} tone="amber" />
            <Stat value={ORGS.filter(o => o.status === "overdue").length} label={t("متأخرة السداد", "Overdue")} tone="rose" />
          </div>
          <section className="surface-strong owner-block">
            <SectionTitle title={t("الباقات", "Plans")} />
            <div className="demo-ledger"><table>
              <thead><tr><th>{t("الباقة", "Plan")}</th><th>{t("شهرياً", "Monthly")}</th><th>{t("المقاعد", "Seats")}</th><th>{t("مؤسسات", "Organisations")}</th></tr></thead>
              <tbody>{PLANS.map(plan => <tr key={plan.en}><td>{ar ? plan.ar : plan.en}</td><td>{kwd(plan.monthly, ar)}</td><td>{plan.seats}</td><td>{plan.orgs}</td></tr>)}</tbody>
            </table></div>
          </section>
          <section className="surface-strong owner-block">
            <SectionTitle title={t("المؤسسات المشتركة", "Subscribed organisations")} meta={String(ORGS.length)} />
            <div className="demo-ledger"><table>
              <thead><tr><th>{t("المؤسسة", "Organisation")}</th><th>{t("القطاع", "Sector")}</th><th>{t("الباقة", "Plan")}</th><th>{t("الحالة", "Status")}</th><th>{t("التجديد", "Renewal")}</th></tr></thead>
              <tbody>{ORGS.map(org => (
                <tr key={org.en}>
                  <td>{ar ? org.ar : org.en}</td><td>{org.sector[ar ? 0 : 1]}</td><td>{ar ? PLANS[org.plan].ar : PLANS[org.plan].en}</td>
                  <td>{STATUS_LABEL[org.status][ar ? 0 : 1]}</td><td>{fmt(dayOffset(org.renew), ar)}</td>
                </tr>))}</tbody>
            </table></div>
          </section>
          <section className="surface-strong owner-block">
            <SectionTitle title={t("آخر الفواتير", "Recent invoices")} />
            <div className="demo-ledger"><table>
              <thead><tr><th>{t("الرقم", "No.")}</th><th>{t("المؤسسة", "Organisation")}</th><th>{t("المبلغ", "Amount")}</th><th>{t("الإصدار", "Issued")}</th><th>{t("الحالة", "Status")}</th></tr></thead>
              <tbody>{invoices.map(inv => <tr key={inv.no}><td>{inv.no}</td><td>{inv.org}</td><td>{kwd(inv.amount, ar)}</td><td>{fmt(inv.issued, ar)}</td><td>{invoiceState[inv.state][ar ? 0 : 1]}</td></tr>)}</tbody>
            </table></div>
          </section>
        </>
      ) : (
        <>
          <div className="stat-grid">
            <Stat value={PARTNERS.length} label={t("مسوّقون", "Partners")} tone="sky" icon={<HandCoins />} />
            <Stat value={PARTNERS.reduce((s, p) => s + p.leads, 0)} label={t("طلبات محالة", "Referred leads")} tone="moss" />
            <Stat value={PARTNERS.reduce((s, p) => s + p.won, 0)} label={t("اشتراكات مكتملة", "Converted")} tone="violet" />
            <Stat value={kwd(PARTNERS.reduce((s, p) => s + p.pending, 0), ar)} label={t("عمولات مستحقة", "Commission due")} tone="amber" />
          </div>
          <section className="surface-strong owner-block">
            <SectionTitle title={t("دفتر المسوّقين", "Partner ledger")} />
            <div className="demo-ledger"><table>
              <thead><tr><th>{t("المسوّق", "Partner")}</th><th>{t("الرمز", "Code")}</th><th>{t("طلبات", "Leads")}</th><th>{t("اشتراكات", "Converted")}</th><th>{t("النسبة", "Rate")}</th><th>{t("مستحق", "Due")}</th><th>{t("مدفوع", "Paid")}</th></tr></thead>
              <tbody>{PARTNERS.map(p => (
                <tr key={p.code}><td>{ar ? p.ar : p.en}</td><td>{p.code}</td><td>{p.leads}</td><td>{p.won}</td><td>{p.rate}%</td><td>{kwd(p.pending, ar)}</td><td>{kwd(p.paid, ar)}</td></tr>))}</tbody>
            </table></div>
          </section>
        </>
      )}
    </>
  );
}
