import React from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { dataText } from "../lib/labels";
import { DnaCountUp } from "./dna";

export function PageHeader({ eyebrow, title, hint, action }: { eyebrow?: string; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="page-heading">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {hint && <p>{hint}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function SectionTitle({ title, meta, icon }: { title: React.ReactNode; meta?: string; icon?: React.ReactNode }) {
  return (
    <div className="section-title">
      <div className="flex items-center gap-2 min-w-0">
        {icon && <span className="section-icon">{icon}</span>}
        <h2>{title}</h2>
      </div>
      {meta && <span>{meta}</span>}
    </div>
  );
}

export function Stat({ value, label, tone = "moss", icon, spark, countUp, playKey, rise, index }: {
  value: string | number; label: string; tone?: "moss" | "sky" | "amber" | "rose" | "violet"; icon?: React.ReactNode; spark?: React.ReactNode;
  /** Plain counts only (never money): a numeric value rises 0 -> value once when first seen. */
  countUp?: boolean;
  playKey?: string;
  /** Subtle one-shot entrance (same as the governance tiles). `index` staggers neighbours. */
  rise?: boolean;
  index?: number;
}) {
  return (
    <div className={`stat-tile tone-${tone}`} data-rise={rise ? "" : undefined} style={rise && index ? ({ ["--i" as string]: Math.min(index, 6) } as React.CSSProperties) : undefined}>
      <div className="stat-top"><span>{label}</span>{icon && <span className="stat-icon">{icon}</span>}</div>
      <strong>{countUp && typeof value === "number" && Number.isFinite(value) ? <DnaCountUp value={value} playKey={playKey} /> : value}</strong>
      {spark && <span className="stat-spark">{spark}</span>}
    </div>
  );
}

export function IconTile({ icon, tone = "moss", size = "md" }: { icon: React.ReactNode; tone?: "moss" | "sky" | "amber" | "rose" | "violet" | "ink"; size?: "sm" | "md" | "lg" }) {
  return <span className={`icon-tile tone-${tone} size-${size}`}>{icon}</span>;
}

export function ToneDot({ tone = "moss" }: { tone?: "moss" | "sky" | "amber" | "rose" | "violet" }) {
  return <span className={`tone-dot tone-${tone}`} />;
}

export function ArrowIcon({ rtl = true }: { rtl?: boolean }) {
  const C = rtl ? ArrowLeft : ArrowRight;
  return <C className="w-4 h-4" />;
}

export function VisualButton({ icon, label, active = false, danger = false, onClick }: { icon: React.ReactNode; label: string; active?: boolean; danger?: boolean; onClick?: () => void }) {
  return (
    <button className={`visual-button ${active ? "active" : ""} ${danger ? "danger" : ""}`} onClick={onClick} aria-label={label} title={label}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

/*
 * نصٌّ يأتي من البيانات، يُعرض بالعربية الصافية. القيمة الأصلية تبقى في التلميح
 * كلما اختلف المعروض عنها، فلا يضيع المصطلح على من يبحث عنه.
 */
export function Dt({ t, ar = true }: { t: string | undefined | null; ar?: boolean }) {
  const raw = String(t ?? "");
  const shown = dataText(raw, ar);
  return shown === raw ? <>{raw}</> : <span title={raw}>{shown}</span>;
}
