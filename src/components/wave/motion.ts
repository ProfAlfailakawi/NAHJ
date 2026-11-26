import { useEffect, useState } from "react";

/* هل طلب المستخدم تقليل الحركة؟ يتابع التغيير حيّاً، ويبدأ «نعم» حيث لا matchMedia (الحالة الساكنة آمنة). */
export function usePrefersReducedMotion() {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => typeof window === "undefined" || typeof window.matchMedia !== "function" ? true : window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const m = window.matchMedia(query);
    const on = () => setReduced(m.matches);
    m.addEventListener?.("change", on);
    return () => m.removeEventListener?.("change", on);
  }, []);
  return reduced;
}
