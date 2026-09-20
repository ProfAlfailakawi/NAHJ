import React, { useState } from "react";
import { FileCheck2, Info, KeyRound, PauseCircle, ShieldAlert, ShieldCheck, Siren, UserRoundCheck } from "lucide-react";
import { PageHeader, SectionTitle } from "../Primitives";
import { GovernanceShield } from "../Visuals";
import type { Measure } from "./AnalyticsView";

/*
 * شاشة الحوكمة.
 *
 * كانت تعرض أربع بطاقات وثلاث حلقات، كلها مكتوبة في الواجهة: «100% عزل
 * المؤسسة»، «RBAC»، «5 بوابات بشرية»، «0 تجاوزات»، وحلقات عند 92% و84% و100%.
 *
 * وأخطرها «0 تجاوزات». رقمٌ يدّعي إثباتاً لم يجرِ قطّ، على الشاشة التي يُفترض
 * أنها تُثبت أن الحوكمة تعمل. صار يُشتق بمطابقة الإجراءات عالية الخطورة بطلبات
 * الموافقة — فإن ظهر صفراً فلأننا بحثنا فلم نجد، وإن ظهر غير ذلك فهو ما يجب أن
 * يراه المسؤول.
 */

export interface GovernanceData {
  policiesActive: Measure;
  humanGates: Measure;
  approvalsPending: Measure;
  approvalsDecided: Measure;
  killSwitchesActive: Measure;
  interceptedActions: Measure;
  unapprovedHighRiskActions: Measure;
  auditCoveragePercent: Measure;
  riskDistribution: { low: number; medium: number; high: number; critical: number; total: number };
  autonomyDistribution: Record<string, number>;
}

type Props = {
  lang: "ar" | "en";
  paused: boolean;
  onPause: () => void;
  governance: GovernanceData | null;
};

const show = (measure: Measure | undefined, suffix = "") =>
  !measure || measure.value === null ? "—" : `${measure.value}${suffix}`;

function Guard({ icon, measure, label, ar, alarming = false, suffix = "" }: {
  icon: React.ReactNode; measure?: Measure; label: string; ar: boolean; alarming?: boolean; suffix?: string;
}) {
  const [open, setOpen] = useState(false);
  const value = show(measure, suffix);
  /* التجاوزات تُلوَّن بالخطر فقط حين توجد فعلاً — لا لونَ إنذارٍ على صفر. */
  const hot = alarming && typeof measure?.value === "number" && measure.value > 0;
  return (
    <div className={`guard-tile ${hot ? "is-alarming" : ""} ${value === "—" ? "is-empty" : ""}`}>
      <span>{icon}</span>
      <strong>{value}</strong>
      <small>{label}</small>
      {measure && (
        <button type="button" className="metric-basis-toggle" onClick={() => setOpen(v => !v)}
          aria-label={ar ? "أساس القياس" : "Basis"} title={ar ? "أساس القياس" : "Basis"}><Info /></button>
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

export function ControlView({ lang, paused, onPause, governance }: Props) {
  const ar = lang === "ar";
  const autonomy = governance?.autonomyDistribution || {};
  const autonomyTotal = Object.values(autonomy).reduce((sum, count) => sum + count, 0);
  const bypasses = governance?.unapprovedHighRiskActions;
  const hasBypasses = typeof bypasses?.value === "number" && bypasses.value > 0;

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="CONTROL / SAFETY"
        title={ar ? "الاستقلالية لها حدود." : "Autonomy has boundaries."}
        hint={ar
          ? "الأرقام هنا مشتقّة من سياسات مؤسستك وموافقاتها وسجلّ تدقيقها — لا من إعدادات عرض."
          : "These figures are derived from your own policies, approvals and audit trail."}
      />

      <div className="control-layout">
        <section className={`control-core surface ${paused ? "paused" : ""}`}>
          <GovernanceShield paused={paused} />
          <div className="control-state">
            <em>{paused ? "PAUSED" : "PROTECTED"}</em>
            <strong>{paused ? (ar ? "التنفيذ متوقف" : "Execution paused") : (ar ? "ضمن الحدود" : "Within guardrails")}</strong>
          </div>
          <button className={paused ? "btn-primary" : "emergency-button"} onClick={onPause}>
            {paused ? <ShieldCheck /> : <Siren />}
            {paused ? (ar ? "استأنف بعد المراجعة" : "Resume safely") : (ar ? "إيقاف طارئ" : "Emergency pause")}
          </button>
        </section>

        <section className="guardrails surface-strong">
          <SectionTitle title={ar ? "حواجز القرار" : "Guardrails"}
            meta={ar ? "مشتقّة من بياناتك" : "derived from your data"} icon={<ShieldCheck />} />
          <div className="guardrail-grid">
            <Guard ar={ar} icon={<FileCheck2 />} measure={governance?.policiesActive} label={ar ? "سياسات سارية" : "Active policies"} />
            <Guard ar={ar} icon={<UserRoundCheck />} measure={governance?.humanGates} label={ar ? "بوابات بشرية" : "Human gates"} />
            <Guard ar={ar} icon={<KeyRound />} measure={governance?.killSwitchesActive} label={ar ? "مفاتيح إيقاف مفعّلة" : "Kill switches"} />
            <Guard ar={ar} icon={<ShieldAlert />} measure={governance?.interceptedActions} label={ar ? "إجراءات اعتُرضت" : "Intercepted"} />
          </div>

          {/*
            * التجاوزات تستحقّ سطراً خاصاً لا بطاقةً بين البطاقات: هذا هو الرقم
            * الذي يُسأل عنه المسؤول، وهو الذي كان مخترعاً.
          */}
          <div className={`bypass-line ${hasBypasses ? "is-alarming" : "is-clear"}`}>
            {hasBypasses ? <ShieldAlert /> : <ShieldCheck />}
            <div>
              <strong>
                {hasBypasses
                  ? ar ? `${bypasses!.value} إجراء عالي الخطورة بلا موافقة مقابلة` : `${bypasses!.value} high-risk actions without approval`
                  : ar ? "لا تجاوزات" : "No bypasses"}
              </strong>
              <p>{bypasses?.basis || (ar ? "لم يُقَس بعد." : "Not measured yet.")}</p>
            </div>
          </div>

          <div className="policy-rings">
            <span>
              <i style={{ width: `${governance?.auditCoveragePercent.value ?? 0}%` }} />
              <b>{ar ? "تغطية الأثر" : "Audit coverage"} — {show(governance?.auditCoveragePercent, "%")}</b>
            </span>
            <span>
              <i style={{ width: autonomyTotal ? `${Math.round(((autonomy.L0 || 0) + (autonomy.L1 || 0) + (autonomy.L2 || 0)) / autonomyTotal * 100)}%` : "0%" }} />
              <b>{ar ? "مهارات تحت الملاحظة (L0–L2)" : "Under observation (L0–L2)"}</b>
            </span>
            <span>
              <i style={{ width: governance ? `${governance.riskDistribution.total ? Math.round((governance.riskDistribution.high + governance.riskDistribution.critical) / governance.riskDistribution.total * 100) : 0}%` : "0%" }} />
              <b>{ar ? "مهارات عالية الخطورة" : "High-risk skills"}</b>
            </span>
          </div>

          {!governance && (
            <div className="metric-unavailable">
              <Info /><p>{ar ? "تعذّر قراءة أرقام الحوكمة من الخادم." : "Could not read governance figures."}</p>
            </div>
          )}
        </section>
      </div>

      {/* سُلّم الاستقلالية — أين تقف مهارات المؤسسة فعلاً. */}
      {autonomyTotal > 0 && (
        <section className="surface-strong autonomy-spread">
          <SectionTitle title={ar ? "أين تقف مهاراتك على سُلّم الاستقلالية" : "Where your skills sit on the ladder"}
            meta={ar ? `${autonomyTotal} مهارة` : `${autonomyTotal} skills`} icon={<PauseCircle />} />
          <div className="ladder-spread">
            {["L0", "L1", "L2", "L3", "L4", "L5", "L6"].map(level => {
              const count = autonomy[level] || 0;
              return (
                <div key={level} className={count ? "has" : ""}>
                  <i style={{ height: `${autonomyTotal ? Math.max(4, (count / autonomyTotal) * 100) : 4}%` }} />
                  <b>{count}</b>
                  <small>{level}</small>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
