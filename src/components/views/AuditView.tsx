import React, { useMemo, useState } from "react";
import { Bot, FileCheck2, Search, ShieldAlert, UserRound, Waypoints } from "lucide-react";
import type { AuditEvent } from "../../types";
import { PageHeader } from "../Primitives";
import { reasonLabel, riskLabel } from "../../lib/labels";

/*
 * سجلّ التدقيق.
 *
 * كان يعرض رموز الأحداث كما يكتبها المحرّك («APPROVE_ACTION_EXECUTION») ورمز
 * السياسة خاماً. صار يعرض اسم الحدث بالعربية ويُبقي الرمز في تلميح، ويعرض
 * سجلّ القرار المحفوظ مع الاعتماد: الإصدار والقاعدة والسبب.
 */
const ACTION_AR: Record<string, string> = {
  APPROVE_ACTION_EXECUTION: "اعتماد وتنفيذ",
  REJECT_ACTION_EXECUTION: "رفض طلب",
  PROMOTE_SKILL_AUTONOMY: "تغيير مستوى الاستقلالية",
  ROLLBACK_SKILL_VERSION: "استرجاع إصدار مهارة",
  KILL_SWITCH_ENGAGED: "إيقاف مهارة",
  KILL_SWITCH_DISENGAGED: "استئناف مهارة",
  EMERGENCY_PAUSE_AUTOPILOT: "إيقاف طارئ للتنفيذ الآلي",
  EMERGENCY_RESUME_AUTOPILOT: "استئناف بعد الإيقاف الطارئ",
  HUMAN_TAKEOVER: "استلام بشري",
  RESUME_AI_EXECUTION: "إعادة التنفيذ إلى نهج",
  RUN_SHADOW_COMPARISON: "مقارنة الظل",
  ASSIGN_SKILL_BACKUP: "إسناد بديل لمهارة",
  UPDATE_SKILL_TRANSLATION: "تحديث النص الإنجليزي",
  ORGANIZATION_CONFIGURED: "إعداد المؤسسة",
};

const actionLabel = (action: string, ar: boolean) => (ar ? ACTION_AR[action] : undefined) || action;

type Props = { lang: "ar" | "en"; events: AuditEvent[] };

export function AuditView({ lang, events }: Props) {
  const ar = lang === "ar";
  const [q, setQ] = useState("");
  const filtered = useMemo(() => events.filter(e =>
    `${e.action} ${actionLabel(e.action, true)} ${e.actorName} ${e.provenance} ${e.details}`.toLowerCase().includes(q.toLowerCase())), [events, q]);
  return (
    <div className="page-enter">
      <PageHeader eyebrow={ar ? "السجل والأدلة" : "AUDIT / EVIDENCE"} title={ar ? "كل خطوة لها أثر." : "Every step leaves evidence."}
        hint={ar ? "من فعل ماذا، بأي سياسة، وعلى أي مصدر — بدون كشف تفكير داخلي خاص." : "Who did what, under which policy and source — without exposing private chain-of-thought."} />
      <section className="audit-surface surface-strong">
        <div className="audit-search">
          <Search aria-hidden="true" />
          <input value={q} onChange={e => setQ(e.target.value)} aria-label={ar ? "ابحث في السجل" : "Search the audit trail"} placeholder={ar ? "ابحث في الأثر..." : "Search evidence..."} />
        </div>
        <div className="audit-timeline">
          {filtered.map(e => {
            const record = e.record as { skill?: { name: string; version: number } | null; reason?: string; review?: { stats?: { passRate: number | null; shadowAgreement: number | null }; signedOffBy?: string } } | undefined;
            return (
              <article key={e.id}>
                <span className={`audit-actor ${e.actorType} risk-${e.risk}`} aria-hidden="true">
                  {e.actorType === "ai" ? <Bot /> : e.actorType === "human" ? <UserRound /> : e.risk === "high" || e.risk === "critical" ? <ShieldAlert /> : <Waypoints />}
                </span>
                <div>
                  <div className="audit-head"><strong title={e.action}>{actionLabel(e.action, ar)}</strong><small>{e.timestamp} · {e.actorName} · {riskLabel(e.risk, ar)}</small></div>
                  <p>{e.details}</p>
                  {record?.skill && <p className="audit-record">{ar ? `المهارة: ${record.skill.name} — v${record.skill.version}` : `Skill: ${record.skill.name} — v${record.skill.version}`}</p>}
                  {record?.review?.signedOffBy && <p className="audit-record">{ar
                    ? `وقّع: ${record.review.signedOffBy} · نجاح التدرّب ${record.review.stats?.passRate ?? "—"}% · التطابق في الظل ${record.review.stats?.shadowAgreement ?? "—"}%`
                    : `Signed off by ${record.review.signedOffBy}`}</p>}
                  <div className="audit-tags">
                    {e.policyCode && <span title={e.policyCode}><FileCheck2 aria-hidden="true" />{reasonLabel(e.policyCode, ar)}</span>}
                    <span>{e.provenance}</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
