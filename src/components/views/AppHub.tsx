import React from "react";
import {
  ArrowUpLeft, BarChart3, BookOpenCheck, BrainCircuit, History, MessagesSquare, PlugZap, ShieldCheck, Sparkles, UserRoundCheck, Workflow
} from "lucide-react";
import type { SectionId } from "../Shell";
import { hoursLabel } from "../../lib/labels";

/*
 * خريطة التطبيق كلّه — عرضٌ فقط.
 *
 * لا تحسب شيئاً ولا تجلب شيئاً: كل رقمٍ هنا يصلها مما تحمله «اليوم» أصلاً،
 * ومن لا رقم له يُعرض «—». والفتح يمرّ عبر `onNavigate` نفسها.
 */
type Props = {
  ar: boolean;
  onNavigate: (s: SectionId) => void;
  documented: number;
  active: number;
  pending: number;
  practice: number;
  workActive: number;
  hours: number | string;
  policies: number | null;
  singlePerson: number;
  auditToday: number;
};

type HubNode = {
  id: SectionId; icon: React.ElementType; label: string;
  value: string; hint?: string; attention?: boolean; ring?: number;
};

export function AppHub(p: Props) {
  const { ar, onNavigate } = p;
  const nodes: HubNode[] = [
    { id: "learn", icon: Sparkles, label: ar ? "يتعلّم" : "Learn", value: String(p.pending), hint: ar ? "اقتراح تعلّم بانتظارك" : "proposals waiting" },
    { id: "skills", icon: BrainCircuit, label: ar ? "المهارات" : "Skills", value: String(p.active),
      hint: ar ? `من ${p.documented} مهارة موثقة، ${p.active} فعّالة` : `of ${p.documented} documented, ${p.active} active`,
      ring: p.documented > 0 ? Math.min(1, p.active / p.documented) : undefined },
    { id: "practice", icon: BookOpenCheck, label: ar ? "التدرّب" : "Practice", value: String(p.practice), hint: ar ? "حالة اختبار" : "test cases" },
    { id: "work", icon: Workflow, label: ar ? "العمل" : "Work", value: String(p.workActive), hint: ar ? "حالة عمل جارية" : "work items in progress" },
    { id: "simulator", icon: MessagesSquare, label: ar ? "المحادثة" : "Simulator", value: "—" },
    { id: "connections", icon: PlugZap, label: ar ? "الربط" : "Connections", value: "—" },
    { id: "analytics", icon: BarChart3, label: ar ? "الأثر" : "Impact", value: hoursLabel(p.hours, ar), hint: ar ? "وقت مستعاد هذا الشهر" : "time back this month" },
    { id: "control", icon: ShieldCheck, label: ar ? "الحوكمة" : "Control", value: p.policies == null ? "—" : String(p.policies), hint: p.policies == null ? undefined : (ar ? "سياسة فعّالة" : "active policies") },
    { id: "people", icon: UserRoundCheck, label: ar ? "الأشخاص" : "People", value: String(p.singlePerson), attention: p.singlePerson > 0, hint: ar ? "مهارة تعتمد على شخص واحد" : "single-person skills" },
    { id: "audit", icon: History, label: ar ? "السجل" : "Audit", value: String(p.auditToday), hint: ar ? "حدث مسجّل اليوم" : "events today" },
  ];
  const [focus, setFocus] = React.useState<SectionId>("skills");
  const cur = nodes.find(n => n.id === focus) ?? nodes[1];
  const R = 2 * Math.PI * 26;

  return (
    <section className="apphub surface" aria-label={ar ? "خريطة نهج" : "NAHJ map"}>
      <div className="apphub-stage">
        <svg className="apphub-spokes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {nodes.map((n, i) => {
            const a = (-90 + i * 36) * Math.PI / 180;
            return <line key={n.id} x1="50" y1="50" x2={50 + 40 * Math.cos(a)} y2={50 + 38 * Math.sin(a)} vectorEffect="non-scaling-stroke" className={n.id === focus ? "on" : ""}/>;
          })}
        </svg>
        <div className="apphub-core" role="img" aria-label={ar ? `${p.documented} مهارة موثقة` : `${p.documented} documented skills`}>
          <BrainCircuit strokeWidth={1.4}/>
          <strong>{p.documented}</strong>
          <small>{ar ? "مهارة موثقة" : "documented skills"}</small>
        </div>
        {nodes.map((n, i) => {
          const a = (-90 + i * 36) * Math.PI / 180;
          const Icon = n.icon;
          return (
            <button key={n.id} type="button" className={`apphub-node${n.id === focus ? " sel" : ""}${n.attention ? " attn" : ""}`}
              style={{ left: `${50 + 40 * Math.cos(a)}%`, top: `${50 + 38 * Math.sin(a)}%` }}
              aria-pressed={n.id === focus}
              aria-label={`${n.label}: ${n.value}`}
              onClick={() => setFocus(n.id)}>
              <span className="apphub-disc">
                {n.ring != null && <svg className="apphub-ring" viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="30" r="26" strokeDasharray={`${R * n.ring} ${R}`} transform="rotate(-90 30 30)"/></svg>}
                <Icon className="apphub-ico" strokeWidth={1.25}/>
              </span>
              <span className="apphub-label">{n.label}</span>
              <b className="apphub-val">{n.value}</b>
            </button>
          );
        })}
      </div>
      <aside className="apphub-focus" aria-live="polite">
        <div className="apphub-focus-text">
          <em>{ar ? "القسم المحدد" : "SELECTED"}</em>
          <h3>{cur.label}</h3>
          <strong className="apphub-big">{cur.value}</strong>
          {cur.hint && <p>{cur.hint}</p>}
        </div>
        <button type="button" className="apphub-open" onClick={() => onNavigate(cur.id)} aria-label={`${ar ? "فتح" : "Open"} ${cur.label}`}>
          <span>{ar ? "فتح" : "Open"}</span><ArrowUpLeft/>
        </button>
      </aside>
    </section>
  );
}
