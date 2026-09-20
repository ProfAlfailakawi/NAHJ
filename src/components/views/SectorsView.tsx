import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Building2, CheckCircle2, Layers, MessageSquare, RefreshCw, ShieldCheck } from "lucide-react";
import { PageHeader, SectionTitle } from "../Primitives";
import { sectorsApi, type SectorChannel, type SectorSummary } from "../../lib/api";

/*
 * شاشة النشاط.
 *
 * كان نهج عامّاً في قلبه وتعليمياً في كل بيانة فيه، فمن يُعرض عليه من عيادة أو
 * مكتب محاماة يُطالَب بأن يتخيّل. وهذه الشاشة تُغنيه عن التخيّل: يختار نشاطه
 * فيرى مهاراته وسياساته وأنظمته وشخصية من يحادثه.
 *
 * والتبديل هادم — يُقال ذلك صراحةً قبله لا بعده.
 */

interface Props {
  lang: "ar" | "en";
  canApply: boolean;
  isDemo: boolean;
  notify: (text: string, error?: boolean) => void;
  onApplied: () => void;
}

export function SectorsView({ lang, canApply, isDemo, notify, onApplied }: Props) {
  const ar = lang === "ar";
  const [sectors, setSectors] = useState<SectorSummary[]>([]);
  const [current, setCurrent] = useState("");
  const [channel, setChannel] = useState<SectorChannel | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await sectorsApi.list();
      setSectors(data.sectors);
      setCurrent(data.current);
      setChannel(data.channel);
    } catch (error) {
      notify(error instanceof Error ? error.message : ar ? "تعذّر جلب الأنشطة." : "Could not load sectors.", true);
    } finally {
      setLoading(false);
    }
  }, [ar, notify]);

  useEffect(() => { void load(); }, [load]);

  const apply = async (code: string) => {
    setBusy(true);
    try {
      const result = await sectorsApi.apply(code);
      setConfirming(null);
      await load();
      onApplied();
      notify(ar
        ? `تم تركيب الحزمة — ${result.counts.skills} مهارة و${result.counts.policies} سياسة.`
        : `Pack applied — ${result.counts.skills} skills, ${result.counts.policies} policies.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : ar ? "تعذّر التبديل." : "Could not switch.", true);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="page-enter"><PageHeader eyebrow="SECTOR / النشاط" title={ar ? "جارٍ القراءة..." : "Loading..."} /></div>;
  }

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="SECTOR / النشاط"
        title={ar ? "نهج ليس نظام مدارس." : "NAHJ is not a school system."}
        hint={ar
          ? "القلب عامّ: يتعلّم كيف تعمل المؤسسة أياً كان نشاطها. والحزمة هنا عقلٌ تشغيلي كامل لقطاع — مهاراته وسياساته وأنظمته ومن يحادثه — لا ألوانٌ وأسماء."
          : "The core is sector-agnostic. A pack is a full operating brain for an industry, not a theme."}
        action={<button className="btn-secondary" onClick={() => void load()}><RefreshCw /> {ar ? "تحديث" : "Refresh"}</button>}
      />

      {isDemo && (
        <div className="sub-demo-note">
          <ShieldCheck />
          {ar
            ? "أنت في صندوق معزول — بدّل النشاط كما تشاء. لا شيء من هذا يمسّ بيانات مؤسسة حقيقية."
            : "You are in an isolated sandbox — switch freely."}
        </div>
      )}

      {channel && (
        <section className="surface-strong sub-block">
          <SectionTitle title={ar ? "من يحادث مؤسستك الآن" : "Who talks to your organization"} icon={<MessageSquare />} />
          <div className="channel-preview">
            <strong>{channel.counterpart}</strong>
            <p>{channel.welcome}</p>
            <div className="channel-prompts">
              {channel.samplePrompts.map(prompt => <span key={prompt}>{prompt}</span>)}
            </div>
          </div>
        </section>
      )}

      <section className="surface-strong sub-block">
        <SectionTitle title={ar ? "الأنشطة الجاهزة" : "Available sectors"} icon={<Layers />} meta={`${sectors.length}`} />
        <div className="sector-grid">
          {sectors.map(sector => {
            const active = sector.code === current;
            return (
              <article key={sector.code} className={`sector-card ${active ? "is-current" : ""}`}>
                <div className="sector-head">
                  <span className="sector-logo" aria-hidden="true">{sector.logo}</span>
                  <div>
                    <strong>{ar ? sector.nameAr : sector.nameEn}</strong>
                    <small>{sector.organizationName}</small>
                  </div>
                  {active && <i className="sector-flag"><CheckCircle2 /> {ar ? "الحالي" : "Current"}</i>}
                </div>
                <p>{sector.descriptionAr}</p>
                <div className="sector-counts">
                  <span><b>{sector.skills}</b> {ar ? "مهارة" : "skills"}</span>
                  <span><b>{sector.policies}</b> {ar ? "سياسة" : "policies"}</span>
                  <span><b>{sector.connectors}</b> {ar ? "موصل" : "connectors"}</span>
                </div>

                {!active && canApply && !sector.isSeeded && (
                  confirming === sector.code ? (
                    <div className="sector-confirm">
                      {/* الهدم يُقال قبله لا بعده. */}
                      <AlertTriangle />
                      <p>{ar
                        ? "سيُمحى ما في العقل الآن: المهارات والسياسات والموصلات وحالات العمل. سجلّ التدقيق يبقى."
                        : "This erases skills, policies, connectors and work items. The audit trail is kept."}</p>
                      <div>
                        <button className="btn-danger" disabled={busy} onClick={() => void apply(sector.code)}>
                          {busy ? (ar ? "جارٍ..." : "Working...") : ar ? "نعم، ركّب الحزمة" : "Yes, apply"}
                        </button>
                        <button className="btn-secondary" disabled={busy} onClick={() => setConfirming(null)}>
                          {ar ? "تراجع" : "Cancel"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button className="btn-secondary sector-apply" onClick={() => setConfirming(sector.code)}>
                      <Building2 /> {ar ? "ركّب هذه الحزمة" : "Apply this pack"}
                    </button>
                  )
                )}

                {sector.isSeeded && !active && (
                  <p className="sector-note">{ar
                    ? "الحزمة المبذورة في النشر — لإعادتها أعد التهيئة."
                    : "The seeded pack — re-initialize the deployment to restore it."}</p>
                )}
              </article>
            );
          })}
        </div>

        {!canApply && (
          <p className="sector-note">{ar
            ? "تركيب الحزم متاح للمشرف فأعلى."
            : "Applying a pack is available to admins and above."}</p>
        )}
      </section>
    </div>
  );
}
