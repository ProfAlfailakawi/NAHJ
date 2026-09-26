import React, { useId } from "react";
import { FlaskConical, LogOut, RefreshCw } from "lucide-react";

/*
 * شريط البيئة التجريبية — ظاهرٌ دائماً ما دام العرض مفتوحاً.
 *
 * كانت الإشارة شارةً صغيرة بأيقونة في شريط الأدوات، تُفوَّت بسهولة في لقطة
 * شاشة أو عرضٍ على عميل. الشريط يقول بالكلام إن البيانات اصطناعية، ومعه
 * مبدّل القطاع ليُعرض المنتج على عيادةٍ أو مكتب محاماة بلا خروج ودخول.
 */

export interface DemoSector { code: string; nameAr: string; nameEn: string; logo?: string }

type Props = {
  lang: "ar" | "en";
  sector: string | null;
  sectors: DemoSector[];
  busy: boolean;
  onSwitch: (sector: string) => void;
  onReset?: () => void;
  onExit?: () => void;
};

export function DemoBanner({ lang, sector, sectors, busy, onSwitch, onReset, onExit }: Props) {
  const ar = lang === "ar";
  const selectId = useId();
  return (
    <div className="demo-banner" role="region" aria-label={ar ? "بيئة تجريبية" : "Demo environment"}>
      <FlaskConical aria-hidden="true" />
      <p><strong>{ar ? "بيئة تجريبية معزولة" : "Isolated demo environment"}</strong>
        <span>{ar ? " — كل ما تراه بيانات اصطناعية، ولا شيء يُحفظ في المؤسسة." : " — everything here is synthetic and nothing is saved to the organization."}</span></p>
      {sectors.length > 0 && (
        <div className="demo-banner-switch">
          <label htmlFor={selectId}>{ar ? "القطاع" : "Sector"}</label>
          <select id={selectId} value={sector || ""} disabled={busy} onChange={event => onSwitch(event.target.value)}>
            {sectors.map(item => <option key={item.code} value={item.code}>{item.logo ? `${item.logo} ` : ""}{ar ? item.nameAr : item.nameEn}</option>)}
          </select>
        </div>
      )}
      {onReset && <button type="button" onClick={onReset} disabled={busy}><RefreshCw aria-hidden="true" />{ar ? "إعادة البيانات" : "Reset"}</button>}
      {onExit && <button type="button" onClick={onExit} disabled={busy}><LogOut aria-hidden="true" />{ar ? "خروج من العرض" : "Exit demo"}</button>}
    </div>
  );
}
