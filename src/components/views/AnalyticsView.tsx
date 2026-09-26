import React, { useState } from "react";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, Clock3, Gauge, Info, ShieldCheck, TimerReset } from "lucide-react";
import { PageHeader, SectionTitle } from "../Primitives";
import { ImpactHalo } from "../Visuals";

/*
 * شاشة الأثر.
 *
 * كانت كل أرقامها ثوابت: 412 مهمة، 84.5 ساعة، 78.4% أتمتة، ومنحنى أسبوعٍ مكتوب
 * بخمس نقاط. صارت تعرض ما يُشتق من المخزن وحده — وتقول «لا قياس بعد» حين لا
 * توجد بيانات، بدل أن تملأ الفراغ برقم.
 */

export interface Measure {
  value: number | null;
  basis: string;
  sampleSize: number;
}

export type AnalyticsData = {
  kpis: {
    totalTasksCompleted: number;
    totalHoursSaved: number;
    automationRatePercent: number | null;
    shadowMatchRatePercent: number | null;
    errorRatePercent: number | null;
    humanTakeoverPercent: number | null;
    avgProcessDurationMin: number | null;
    institutionalCoverageScore: number | null;
  };
  evidence?: Record<string, Measure>;
  trend?: { available: boolean; reason: string; points: { day: string; label: string; events: number }[] };
  riskDistribution: { low: number; medium: number; high: number; critical?: number; total?: number };
  topSkillsByUsage: { name: string; usageCount: number; hoursSaved: number; successRate: number; reliabilityTier: string }[];
  generatedAt?: string;
};

type Props = { lang: "ar" | "en"; data: AnalyticsData };

/** قيمةٌ قد لا تكون موجودة. `null` تُعرض «—» لا صفراً — والفرق بينهما كل شيء. */
const show = (value: number | null | undefined, suffix = "") =>
  value === null || value === undefined ? "—" : `${value}${suffix}`;

/**
 * مقياسٌ مع أساسه.
 *
 * الرقم وحده لا يُراجَع: «94%» من ماذا وعلى كم حالة؟ الأساس وحجم العيّنة خلف
 * أيقونة، فلا يزاحمان الرقم ولا يغيبان عمّن يسأل.
 */
function Metric({ icon, value, label, measure, ar }: { icon: React.ReactNode; value: string; label: string; measure?: Measure; ar: boolean }) {
  const [open, setOpen] = useState(false);
  const empty = value === "—";
  return (
    <div className={`impact-metric ${empty ? "is-empty" : ""}`}>
      <span>{icon}</span>
      <strong>{value}</strong>
      <small>{label}</small>
      {measure && (
        <button type="button" className="metric-basis-toggle" onClick={() => setOpen(v => !v)}
          aria-label={ar ? "أساس القياس" : "Measurement basis"} title={ar ? "أساس القياس" : "Measurement basis"}>
          <Info />
        </button>
      )}
      {measure && open && (
        <div className="metric-basis" role="note">
          <p>{measure.basis}</p>
          <small>{ar ? "حجم العيّنة" : "Sample"}: {measure.sampleSize}</small>
        </div>
      )}
    </div>
  );
}

export function AnalyticsView({ lang, data }: Props) {
  const ar = lang === "ar";
  const evidence = data.evidence || {};
  const trend = data.trend;
  const max = Math.max(...(trend?.points || []).map(point => point.events), 1);
  const risk = data.riskDistribution;
  const riskTotal = risk.total ?? (risk.low + risk.medium + risk.high + (risk.critical || 0));

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow={ar?"الأثر والعائد":"IMPACT / ROI"}
        title={ar ? "الأثر، لا عدد الرسائل." : "Measure outcomes, not messages."}
        hint={ar
          ? "كل رقم هنا مشتقّ من عمل مؤسستك. وما لا يمكن اشتقاقه يُقال إنه غير مقيس — لا يُملأ برقم."
          : "Every number is derived from your own work. What cannot be derived is reported as unmeasured."}
      />

      <div className="impact-layout">
        <section className="impact-hero surface">
          <ImpactHalo value={data.kpis.totalHoursSaved} />
          <div className="impact-hero-copy">
            <em>{ar ? "منذ الاعتماد" : "SINCE ADOPTION"}</em>
            <strong>{data.kpis.totalTasksCompleted.toLocaleString("en-US")}</strong>
            <span>{ar ? "مرة تنفيذ موثّقة" : "recorded executions"}</span>
          </div>
          <div className="impact-badges">
            <span><ArrowUpRight /> {show(data.kpis.automationRatePercent, "%")}</span>
            <span><ShieldCheck /> {show(data.kpis.shadowMatchRatePercent, "%")}</span>
            <span><ArrowDownRight /> {show(data.kpis.errorRatePercent, "%")}</span>
          </div>
        </section>

        <section className="impact-metrics surface-strong">
          <Metric ar={ar} icon={<Gauge />} value={show(data.kpis.institutionalCoverageScore, "%")}
            label={ar ? "تشغيل المهارات" : "activation"} measure={evidence.activationRatePercent} />
          <Metric ar={ar} icon={<Clock3 />} value={show(data.kpis.avgProcessDurationMin, ar ? " د" : "m")}
            label={ar ? "مدة العملية" : "duration"} measure={evidence.avgProcessDurationMin} />
          <Metric ar={ar} icon={<TimerReset />} value={show(data.kpis.humanTakeoverPercent, "%")}
            label={ar ? "استلام بشري" : "takeover"} measure={evidence.humanTakeoverPercent} />
          <Metric ar={ar} icon={<CheckCircle2 />} value={show(data.kpis.shadowMatchRatePercent, "%")}
            label={ar ? "تطابق الظل" : "shadow match"} measure={evidence.shadowMatchRatePercent} />
        </section>

        <section className="weekly-visual surface-strong">
          <SectionTitle title={ar ? "نبض الأسبوع" : "Week pulse"}
            meta={trend?.available ? (ar ? "من سجلّ التدقيق" : "from the audit trail") : undefined} />
          {/*
            * منحنى مخترع على مؤسسة لم تبدأ بعد هو أول كذبة يراها المشتري. حين لا
            * يكفي التاريخ يُقال السبب ويُترك المكان فارغاً.
          */}
          {trend?.available ? (
            <div className="bars">
              {trend.points.map(point => (
                <div key={point.day}>
                  <span style={{ height: `${Math.max(6, (point.events / max) * 100)}%` }} />
                  <b>{point.events}</b>
                  <small>{point.label.slice(0, 3)}</small>
                </div>
              ))}
            </div>
          ) : (
            <div className="metric-unavailable">
              <Info />
              <p>{trend?.reason || (ar ? "لا بيانات كافية بعد." : "Not enough data yet.")}</p>
            </div>
          )}
        </section>

        <section className="risk-visual surface">
          <SectionTitle title={ar ? "توزيع المخاطر" : "Risk distribution"}
            meta={ar ? `${riskTotal} مهارة` : `${riskTotal} skills`} />
          {riskTotal > 0 ? (
            <div className="risk-bar" role="img"
              aria-label={ar ? `منخفض ${risk.low}، متوسط ${risk.medium}، مرتفع ${risk.high}` : "risk distribution"}>
              {([["low", risk.low], ["medium", risk.medium], ["high", risk.high], ["critical", risk.critical || 0]] as const).map(([level, count]) =>
                count > 0 ? (
                  <span key={level} className={`risk-seg risk-${level}`} style={{ width: `${(count / riskTotal) * 100}%` }}
                    title={`${level}: ${count}`}>{count}</span>
                ) : null,
              )}
            </div>
          ) : (
            <div className="metric-unavailable"><Info /><p>{ar ? "لا مهارات موثّقة بعد." : "No codified skills yet."}</p></div>
          )}
        </section>

        <section className="top-skill-visual surface">
          <SectionTitle title={ar ? "أكثر المهارات أثرًا" : "Top skills"} />
          {data.topSkillsByUsage.length ? (
            <div className="top-skills">
              {data.topSkillsByUsage.slice(0, 5).map((skill, index) => (
                <div key={skill.name}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{skill.name}</strong>
                    <small>{skill.usageCount} · {skill.hoursSaved}h</small>
                  </div>
                  <b>{skill.successRate}%</b>
                </div>
              ))}
            </div>
          ) : (
            <div className="metric-unavailable"><Info /><p>{ar ? "لا مهارات بعد." : "No skills yet."}</p></div>
          )}
        </section>
      </div>
    </div>
  );
}
