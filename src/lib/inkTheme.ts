import { useCallback, useEffect, useState } from "react";

/*
 * «وضع الحبر»: مظهرٌ داكن اختياري على #14130F (لون خلفية غلاف التطبيق الداكن في apple/app.config.json).
 *
 * لا يغيّر شيئاً في السلوك: يضع data-theme="dark" على الجذر فتنقلب رموز :root في
 * src/visual-wave.css. الاختيار يُحفظ في المتصفح، وبغيابه يبقى الفاتح كما كان (الداكن باختيار صريح فقط).
 */
export type InkChoice = "light" | "dark";
const KEY = "nahj-theme";
const media = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null);

function stored(): InkChoice | null {
  try { const v = window.localStorage.getItem(KEY); return v === "light" || v === "dark" ? v : null; } catch { return null; }
}
export function resolvedInk(): InkChoice {
  return stored() ?? "light";
}
function apply(choice: InkChoice) {
  const root = document.documentElement;
  if (choice === "dark") root.setAttribute("data-theme", "dark"); else root.removeAttribute("data-theme");
  root.style.colorScheme = choice;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    if (!meta.hasAttribute("data-light")) meta.setAttribute("data-light", meta.getAttribute("content") || "");
    meta.setAttribute("content", choice === "dark" ? "#14130F" : meta.getAttribute("data-light") || "");
  }
}
/* يُنادى مرة عند الإقلاع قبل أول رسم، ويتابع تغيّر تفضيل النظام ما دام المستخدم لم يختر. */
export function installInkTheme() {
  if (typeof document === "undefined") return;
  apply(resolvedInk());
  media()?.addEventListener?.("change", () => { if (!stored()) { apply(resolvedInk()); window.dispatchEvent(new Event("nahj:ink")); } });
}
export function useInkTheme() {
  const [ink, setInk] = useState<InkChoice>(() => (typeof document === "undefined" ? "light" : resolvedInk()));
  useEffect(() => {
    const sync = () => setInk(resolvedInk());
    window.addEventListener("nahj:ink", sync);
    return () => window.removeEventListener("nahj:ink", sync);
  }, []);
  const toggle = useCallback(() => {
    const next: InkChoice = resolvedInk() === "dark" ? "light" : "dark";
    try { window.localStorage.setItem(KEY, next); } catch { /* التخزين محجوب: يبقى الاختيار لهذه الجلسة */ }
    apply(next); setInk(next); window.dispatchEvent(new Event("nahj:ink"));
  }, []);
  return { ink, toggle };
}
