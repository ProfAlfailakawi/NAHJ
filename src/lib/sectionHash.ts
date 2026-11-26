import { flushSync } from "react-dom";
import type { SectionId } from "../components/Shell";

/*
 * روابط عميقة للأقسام: القسم الحالي يظهر في location.hash ويُستعاد عند التحميل والرجوع.
 *
 * إضافةٌ فقط: بلا جزء في العنوان يبقى القسم الافتراضي كما كان («اليوم»، أو الاشتراك عند
 * العودة من الدفع). ولوحات المالك والمسوّقين لا تُفتح من رابط — مدخلها القائمة وحدها، كما كانت.
 */
const RESTORABLE: SectionId[] = ["today", "learn", "teach", "skills", "practice", "work", "simulator", "connections", "analytics", "control", "audit", "accounts", "billing", "sectors", "people"];

export function sectionFromHash(hash = typeof window === "undefined" ? "" : window.location.hash): SectionId | null {
  const id = decodeURIComponent(hash.replace(/^#/, "")) as SectionId;
  return RESTORABLE.includes(id) ? id : null;
}

/* يكتب القسم في العنوان دون إعادة تحميل، ويُبقي المعاملات (مثل ?payment=) كما هي. */
export function writeSectionHash(section: SectionId, replace: boolean) {
  if (typeof window === "undefined") return;
  if (window.location.hash === `#${section}`) return;
  const url = `${window.location.pathname}${window.location.search}#${section}`;
  try { (replace ? history.replaceState : history.pushState).call(history, history.state, "", url); } catch { /* بيئة بلا history */ }
}

/* انتقالٌ مشترك بين الأقسام (View Transitions API) حيث يتوفّر، وبدونه تبديلٌ فوري كما كان. */
export function withViewTransition(update: () => void) {
  const doc = typeof document === "undefined" ? null : (document as Document & { startViewTransition?: (cb: () => void) => unknown });
  const reduced = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!doc?.startViewTransition || reduced) { update(); return; }
  try { doc.startViewTransition(() => { flushSync(update); }); } catch { update(); }
}
