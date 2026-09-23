import React, { useCallback, useEffect, useState } from "react";
import { Copy, ExternalLink, Inbox, Presentation } from "lucide-react";
import { SectionTitle } from "../Primitives";
import { api } from "../../lib/api";

/*
 * البيع من لوحة المالك: طلبات العرض الواردة، وروابط العرض التجريبي.
 *
 * العرض لم يعد باباً مفتوحاً للزوار — صار أداةً يعرضها المالك. فالروابط هنا
 * (رابطٌ لكل قطاع) هي ما يفتحه في اجتماع أو يرسله لعميلٍ بعينه، والطلبات هي من
 * طلب أن يراه من الصفحة الرئيسية.
 */

type LeadStatus = "new" | "contacted" | "won" | "lost";
type Lead = { id: string; name: string; organization: string; sector: string; contact: string; message: string; status: LeadStatus; createdAt: string };
type Sector = { code: string; nameAr: string; logo: string };

const STATUS_AR: Record<LeadStatus, string> = { new: "جديد", contacted: "تم التواصل", won: "اشترك", lost: "لم يكمل" };
const STATUS_TONE: Record<LeadStatus, string> = { new: "sky", contacted: "amber", won: "moss", lost: "rose" };

export function OwnerSalesPanel({ notify }: { notify: (message: string, error?: boolean) => void }) {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [sectors, setSectors] = useState<Sector[]>([]);

  const loadLeads = useCallback(() => {
    api<{ leads: Lead[] }>("/owner/leads").then(data => setLeads(data.leads)).catch(() => setLeads([]));
  }, []);
  useEffect(() => { loadLeads(); }, [loadLeads]);
  useEffect(() => {
    fetch("/api/public/sectors").then(res => (res.ok ? res.json() : null))
      .then(data => { if (Array.isArray(data?.sectors)) setSectors(data.sectors); }).catch(() => undefined);
  }, []);

  const sectorName = (code: string) => sectors.find(sector => sector.code === code)?.nameAr || (code === "other" ? "قطاع آخر" : code || "—");

  const setStatus = async (id: string, status: LeadStatus) => {
    try {
      await api(`/owner/leads/${encodeURIComponent(id)}/status`, { method: "POST", body: JSON.stringify({ status }) });
      loadLeads();
    } catch (error) {
      notify(error instanceof Error ? error.message : "تعذّر التحديث.", true);
    }
  };

  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); notify("نُسخ الرابط"); }
    catch { notify(url); }
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const fresh = leads?.filter(lead => lead.status === "new").length || 0;

  return (
    <>
      <section className="surface-strong owner-block">
        <SectionTitle title="طلبات العرض" icon={<Inbox />} meta={leads ? (fresh ? `${fresh} جديد` : `${leads.length} طلب`) : ""} />
        {!leads ? (
          <p className="owner-hint">جارٍ التحميل...</p>
        ) : leads.length === 0 ? (
          <p className="owner-hint">لا طلبات بعد. تصل هنا من نموذج «اطلب عرضاً» في الصفحة الرئيسية، ويُرسل كل طلبٍ إلى بريدك إن رُبط البريد.</p>
        ) : (
          <div className="lead-list">
            {leads.slice(0, 50).map(lead => (
              <article key={lead.id} className={`lead-card status-${lead.status}`}>
                <div className="lead-head">
                  <strong>{lead.organization}</strong>
                  <i className={`ledger-badge tone-${STATUS_TONE[lead.status]}`}>{STATUS_AR[lead.status]}</i>
                </div>
                <div className="lead-meta">
                  <span>{lead.name}</span>
                  <span>{sectorName(lead.sector)}</span>
                  <span className="mono" dir="ltr">{lead.contact}</span>
                  <span>{new Date(lead.createdAt).toLocaleString("ar-KW")}</span>
                </div>
                {lead.message && <p>{lead.message}</p>}
                <div className="lead-actions" role="group" aria-label="حالة الطلب">
                  {(Object.keys(STATUS_AR) as LeadStatus[]).filter(status => status !== lead.status).map(status => (
                    <button key={status} type="button" className="btn-secondary" onClick={() => void setStatus(lead.id, status)}>{STATUS_AR[status]}</button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="surface-strong owner-block">
        <SectionTitle title="روابط العرض التجريبي" icon={<Presentation />} meta="لتقديم نهج لعميل" />
        <p className="owner-hint">
          كل رابط يفتح مؤسسةً نموذجية من القطاع في بيئةٍ معزولة ببيانات اصطناعية — لا تمسّ بيانات مؤسستك، وتُمحى خلال ساعة.
          افتحه في اجتماع، أو أرسله لعميلٍ بعينه. ولا يظهر العرض في الصفحة العامة ولا لموظفي المؤسسة.
        </p>
        <div className="demo-links">
          {sectors.map(sector => {
            const url = `${origin}/try/${sector.code}`;
            return (
              <div key={sector.code} className="demo-link">
                <span className="logo" aria-hidden="true">{sector.logo}</span>
                <strong>{sector.nameAr}</strong>
                <a className="btn-secondary" href={`/try/${sector.code}`} target="_blank" rel="noopener"><ExternalLink /> افتح</a>
                <button type="button" className="btn-secondary" onClick={() => void copy(url)} aria-label={`انسخ رابط عرض ${sector.nameAr}`}><Copy /> انسخ</button>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
