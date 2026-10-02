import React, { useMemo, useState } from "react";
import { Bot, FileCheck2, LayoutList, Search, ShieldAlert, UserRound, Waypoints } from "lucide-react";
import type { AuditEvent } from "../../types";
import { Dt, PageHeader } from "../Primitives";
import { DnaHeat, DnaSegmented } from "../dna";
import { stampLabel, actionLabel, actorLabel, provenanceLabel, reasonLabel, riskLabel, dataText } from "../../lib/labels";

/*
 * سجلّ التدقيق.
 *
 * كان يعرض رموز الأحداث كما يكتبها المحرّك («APPROVE_ACTION_EXECUTION») ورمز
 * السياسة خاماً. صار يعرض اسم الحدث بالعربية ويُبقي الرمز في تلميح، ويعرض
 * سجلّ القرار المحفوظ مع الاعتماد: الإصدار والقاعدة والسبب.
 */

type Props = { lang: "ar" | "en"; events: AuditEvent[] };

export function AuditView({ lang, events }: Props) {
  const ar = lang === "ar";
  const [q, setQ] = useState("");
  /* مئتا حدث في صفحةٍ واحدة تُطيل الشاشة عشرين ألف بكسل: دفعاتٌ تُفتح بزرّ، والبحث يعمل على الكل. */
  const [shown, setShown] = useState(40);
  /* مرشّح سريع بحسب الفاعل أو الخطورة — عرضٌ لما في القائمة نفسها. */
  type Kind = "all" | "ai" | "human" | "system" | "risk";
  const [kind, setKind] = useState<Kind>("all");
  const isRisky = (e: AuditEvent) => e.risk === "high" || e.risk === "critical";
  const kindCounts = useMemo(() => ({
    all: events.length,
    ai: events.filter(e => e.actorType === "ai").length,
    human: events.filter(e => e.actorType === "human").length,
    system: events.filter(e => e.actorType !== "ai" && e.actorType !== "human").length,
    risk: events.filter(isRisky).length,
  }), [events]);
  const filtered = useMemo(() => events.filter(e =>
    (kind === "all" || (kind === "risk" ? isRisky(e) : kind === "system" ? e.actorType !== "ai" && e.actorType !== "human" : e.actorType === kind)) &&
    `${e.action} ${actionLabel(e.action, true)} ${e.actorName} ${actorLabel(e.actorName, true)} ${e.provenance} ${provenanceLabel(e.provenance, true)} ${e.details}`.toLowerCase().includes(q.toLowerCase())), [events, q, kind]);
  /* اليوم من نصّ العرض نفسه («اليوم، 21:13 م»): تُجمع الأحداث المتجاورة بيومها، والعدّ على كل المطابِق لا المعروض وحده. */
  const dayRuns = useMemo(() => {
    const dayOf = (x: AuditEvent) => stampLabel(x.timestamp, ar).match(/^(.*?)\s*[،,]\s*\d/)?.[1] || "";
    const runs = new Map<string, { day: string; events: AuditEvent[] }>();
    let cur: { day: string; events: AuditEvent[] } | null = null;
    for (const x of filtered) {
      const d = dayOf(x);
      if (d && cur && cur.day === d) cur.events.push(x);
      else if (d) { cur = { day: d, events: [x] }; runs.set(x.id, cur); }
      else cur = null;
    }
    return runs;
  }, [filtered, ar]);
  /* شريط حرارة: عمود لكل يوم (الأقدم أولاً، آخر 30 يوماً معروضاً) — الأحداث كلها، ثم عالية/حرجة الخطورة منها. */
  const heatDays = useMemo(() => Array.from(dayRuns.values()).slice(0, 30).reverse(), [dayRuns]);
  return (
    <div className="page-enter">
      <PageHeader eyebrow={ar ? "السجل والأدلة" : "AUDIT / EVIDENCE"} title={ar ? "كل خطوة لها أثر." : "Every step leaves evidence."}
        hint={ar ? "من فعل ماذا، بأي سياسة، وعلى أي مصدر — بدون كشف تفكير داخلي خاص." : "Who did what, under which policy and source — without exposing private chain-of-thought."} />
      <section className="audit-surface surface-strong">
        {heatDays.length > 1 && (
          <div className="audit-heat">
            <div><small>{ar ? "الأحداث لكل يوم" : "Events per day"}</small>
              <DnaHeat tone="accent" ariaLabel={ar ? "الأحداث لكل يوم" : "Events per day"}
                cells={heatDays.map((d, i) => ({ key: `${i}-${d.day}`, value: d.events.length, label: `${d.day}: ${d.events.length}` }))} /></div>
            <div><small>{ar ? "عالية وحرجة الخطورة" : "High and critical risk"}</small>
              <DnaHeat tone="danger" max={Math.max(1, ...heatDays.map(d => d.events.filter(isRisky).length))} ariaLabel={ar ? "الأحداث عالية الخطورة لكل يوم" : "High-risk events per day"}
                cells={heatDays.map((d, i) => ({ key: `${i}-${d.day}`, value: d.events.filter(isRisky).length, label: `${d.day}: ${d.events.filter(isRisky).length}` }))} /></div>
          </div>
        )}
        <DnaSegmented<Kind> className="audit-kinds" ariaLabel={ar ? "تصفية حسب الفاعل" : "Filter by actor"} value={kind}
          onChange={k => { setKind(k); setShown(40); }}
          options={[
            { value: "all", label: ar ? "الكل" : "All", icon: <LayoutList />, count: kindCounts.all },
            { value: "ai", label: ar ? "نهج" : "AI", icon: <Bot />, count: kindCounts.ai },
            { value: "human", label: ar ? "بشر" : "People", icon: <UserRound />, count: kindCounts.human },
            { value: "system", label: ar ? "النظام" : "System", icon: <Waypoints />, count: kindCounts.system },
            { value: "risk", label: ar ? "خطر" : "Risk", icon: <ShieldAlert />, count: kindCounts.risk },
          ]} />
        <div className="audit-search">
          <Search aria-hidden="true" />
          <input value={q} onChange={e => { setQ(e.target.value); setShown(40); }} aria-label={ar ? "ابحث في السجل" : "Search the audit trail"} placeholder={ar ? "ابحث في الأثر..." : "Search evidence..."} />
        </div>
        <div className="audit-timeline">
          {filtered.slice(0, shown).map((e, idx, list) => {
            const run = dayRuns.get(e.id);
            const day = run?.day || "";
            const startsDay = !!run;
            const dayEvents = run?.events || [];
            const record = e.record as { skill?: { name: string; version: number } | null; reason?: string; review?: { stats?: { passRate: number | null; shadowAgreement: number | null }; signedOffBy?: string } } | undefined;
            return (
              <React.Fragment key={e.id}>
              {startsDay && (
                <div className="audit-day" role="presentation">
                  <strong>{day}</strong>
                  <span className="audit-day-dots" aria-hidden="true">{dayEvents.map(x => <i key={x.id} data-risk={x.risk} />)}</span>
                  <small>{dayEvents.length}</small>
                </div>
              )}
              <article className="audit-item" data-risk={e.risk}>
                <span className={`audit-actor ${e.actorType} risk-${e.risk}`} aria-hidden="true">
                  {e.actorType === "ai" ? <Bot /> : e.actorType === "human" ? <UserRound /> : e.risk === "high" || e.risk === "critical" ? <ShieldAlert /> : <Waypoints />}
                </span>
                <div>
                  <div className="audit-head"><strong title={e.action}>{actionLabel(e.action, ar)}</strong><small>{stampLabel(e.timestamp, ar)} · {actorLabel(e.actorName, ar)} · {riskLabel(e.risk, ar)}</small></div>
                  <p className="audit-detail" title={dataText(e.details, ar)}><Dt t={e.details} ar={ar} /></p>
                  {record?.skill && <p className="audit-record">{ar ? `المهارة: ${dataText(record.skill.name, true)} — v${record.skill.version}` : `Skill: ${record.skill.name} — v${record.skill.version}`}</p>}
                  {record?.review?.signedOffBy && <p className="audit-record">{ar
                    ? `وقّع: ${record.review.signedOffBy} · نجاح التدرّب ${record.review.stats?.passRate ?? "—"}% · التطابق في الظل ${record.review.stats?.shadowAgreement ?? "—"}%`
                    : `Signed off by ${record.review.signedOffBy}`}</p>}
                  <div className="audit-tags">
                    {e.policyCode && <span title={e.policyCode}><FileCheck2 aria-hidden="true" />{reasonLabel(e.policyCode, ar)}</span>}
                    <span title={e.provenance}>{provenanceLabel(e.provenance, ar)}</span>
                  </div>
                </div>
              </article>
              </React.Fragment>
            );
          })}
        </div>
        {filtered.length > shown && (
          <button type="button" className="btn-secondary audit-more" onClick={() => setShown(v => v + 40)}>
            {ar ? `عرض ${Math.min(40, filtered.length - shown)} حدثاً أقدم (متبقٍ ${filtered.length - shown})` : `Show ${Math.min(40, filtered.length - shown)} older events (${filtered.length - shown} left)`}
          </button>
        )}
        {filtered.length === 0 && <p className="empty-note">{ar ? "لا أثر يطابق بحثك." : "No evidence matches your search."}</p>}
      </section>
    </div>
  );
}
