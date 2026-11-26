import React from "react";
import { Moon, Sun } from "lucide-react";
import { useInkTheme } from "../../lib/inkTheme";

/* زرّ «وضع الحبر» في شريط الأدوات: يقلب المظهر فقط، ويُحفظ الاختيار في هذا المتصفح. */
export function InkToggle({ ar }: { ar: boolean }) {
  const { ink, toggle } = useInkTheme();
  const dark = ink === "dark";
  const label = dark ? (ar ? "المظهر الفاتح" : "Light mode") : (ar ? "وضع الحبر (داكن)" : "Ink mode (dark)");
  return (
    <button type="button" className="top-icon ink-toggle" onClick={toggle} aria-pressed={dark} aria-label={label} title={label}>
      {dark ? <Sun aria-hidden="true"/> : <Moon aria-hidden="true"/>}
    </button>
  );
}
