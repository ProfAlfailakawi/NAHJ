import React from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

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

export function SectionTitle({ title, meta, icon }: { title: string; meta?: string; icon?: React.ReactNode }) {
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

export function Stat({ value, label, tone = "moss", icon }: { value: string | number; label: string; tone?: "moss" | "sky" | "amber" | "rose" | "violet"; icon?: React.ReactNode }) {
  return (
    <div className={`stat-tile tone-${tone}`}>
      <div className="stat-top"><span>{label}</span>{icon && <span className="stat-icon">{icon}</span>}</div>
      <strong>{value}</strong>
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
