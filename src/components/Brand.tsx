import React from "react";

export function NahjMark({ size = 40, inverted = false }: { size?: number; inverted?: boolean }) {
  const ink = inverted ? "#fff" : "#10251f";
  const paper = inverted ? "rgba(255,255,255,.07)" : "#fffdf7";
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" fill="none" role="img" aria-label="نهج">
      <rect x="2" y="2" width="68" height="68" rx="23" fill={paper} stroke={inverted ? "rgba(255,255,255,.12)" : "rgba(16,37,31,.08)"}/>
      <path d="M18 18v12c0 7.2 5.8 13 13 13h9c7.8 0 14 6.2 14 14v3" stroke={ink} strokeWidth="4.6" strokeLinecap="round"/>
      <path d="M18 18h10M44 16h10v10" stroke="#2f7d65" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M31 43c7.4-7.2 11.8-11 18.8-11" stroke="#5e79e6" strokeWidth="3.2" strokeLinecap="round" strokeDasharray="2.5 6"/>
      <circle cx="18" cy="18" r="5" fill="#e0a04b"/>
      <circle cx="54" cy="60" r="5" fill="#5e79e6"/>
      <circle cx="38" cy="43" r="4.8" fill="#2f7d65" stroke="#fffdf7" strokeWidth="2"/>
    </svg>
  );
}

export function BrandLockup({ compact = false, inverted = false }: { compact?: boolean; inverted?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <NahjMark size={compact ? 37 : 44} inverted={inverted} />
      {!compact && (
        <div className="leading-none">
          <div className={`text-[18px] font-bold ${inverted ? "text-white" : "text-[var(--ink)]"}`}>نَهْج</div>
          <div className={`text-[9px] font-bold tracking-[.19em] mt-1.5 ${inverted ? "text-white/50" : "text-[var(--muted)]"}`}>NAHJ</div>
        </div>
      )}
    </div>
  );
}

/**
 * رمز «نهج» المجرّد بحجم الأيقونات (خط واحد بلون الحاضن): المسار نفسه من العلامة الكاملة
 * مختصراً، ويحلّ محل الروبوت في الأماكن التي تدل على أن الفاعل هو النظام.
 */
export function NahjGlyph(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M6 5v4.5A3.5 3.5 0 0 0 9.5 13h3a3.5 3.5 0 0 1 3.5 3.5V19" />
      <circle cx="6" cy="5" r="1.4" fill="currentColor" />
      <circle cx="16" cy="19" r="1.4" fill="currentColor" />
      <circle cx="11" cy="13" r="1.1" fill="currentColor" />
    </svg>
  );
}
