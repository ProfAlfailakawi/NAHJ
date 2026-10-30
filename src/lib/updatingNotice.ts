/**
 * ── «نُحدّث البرنامج» داخل التطبيق ─────────────────────────────────────────
 *
 * أثناء النشر تتوقّف حاوية نهج ثم تعود، فيجيب Caddy أمامها طلباتِ /api بـ502
 * بلا JSON، أو ينقطع الاتصال لحظةَ إعادة تشغيله. خادمُنا نفسه يجيب /api بـJSON
 * دائماً (حتى أخطاؤه)، فجوابٌ 5xx بغير JSON ليس منه.
 *
 * هنا يُعرف ذلك، ويظهر شريطٌ هادئ واحد بدل «تعذّر إتمام الطلب (502)»، ويسأل
 * /api/health كل ثلاث ثوانٍ حتى يعود الخادم فيختفي ويُعلم من ينتظر.
 */

const UPDATING_STATUSES = new Set([500, 502, 503, 504]);

const english = () => typeof document !== "undefined" && document.documentElement?.lang === "en";

export const UPDATING_MESSAGE = "نُحدّث البرنامج الآن، لحظاتٍ ونعود.";
export const UPDATING_WRITE_MESSAGE = `${UPDATING_MESSAGE} إن كنت تحفظ تغييراً فتأكّد من حالته بعد عودتنا.`;
const UPDATING_MESSAGE_EN = "NAHJ is updating — back in a moment.";
const UPDATING_WRITE_MESSAGE_EN = `${UPDATING_MESSAGE_EN} If you were saving a change, check it once we are back.`;

export const updatingMessage = (isWrite = false) =>
  english() ? (isWrite ? UPDATING_WRITE_MESSAGE_EN : UPDATING_MESSAGE_EN) : (isWrite ? UPDATING_WRITE_MESSAGE : UPDATING_MESSAGE);

/** يُطلق على window حين يعود الخادم. */
export const SERVER_BACK_EVENT = "nahj:server-back";

/** جوابُ المنصّة لا جوابُ البرنامج: 5xx بغير JSON. */
export const isPlatformUpdating = (status: number, contentType: string | null | undefined) =>
  UPDATING_STATUSES.has(status) && !String(contentType || "").includes("application/json");

/** انقطاعٌ والجهازُ متّصل (لا إلغاءٌ مقصود): الخادم يتبدّل. */
export const isServerSwapDrop = (error: unknown) =>
  !(error instanceof Error && error.name === "AbortError")
  && typeof navigator !== "undefined" && navigator.onLine !== false;

/** هل يجيب الخادم أصلاً؟ */
export const serverAnswers = () =>
  fetch("/api/health", { cache: "no-store", credentials: "same-origin" }).then(response => response.ok, () => false);

let notice: HTMLElement | null = null;
const waiting = new Set<() => void>();

/**
 * يُظهر الشريطَ مرّةً واحدة مهما تكرّر الطلب، ويسأل `probe` كل ثلاث ثوانٍ
 * (ويتباطأ إلى خمس عشرة)، فإذا أجاب أخفاه ونادى `onBack` ومن سبقه.
 */
export function showUpdatingNotice(probe: () => Promise<boolean> = serverAnswers, onBack?: () => void): void {
  if (onBack) waiting.add(onBack);
  if (notice || typeof document === "undefined" || !document.body) return;
  const bar = document.createElement("div");
  bar.className = "nahj-updating-notice";
  bar.setAttribute("role", "status");
  bar.setAttribute("aria-live", "polite");
  bar.dir = english() ? "ltr" : "rtl";
  bar.textContent = updatingMessage();
  bar.style.cssText = [
    "position:fixed", "inset-inline:0", "bottom:max(18px,env(safe-area-inset-bottom))", "margin:0 auto", "width:max-content", "max-width:calc(100vw - 32px)",
    "z-index:2147483000", "padding:11px 18px", "border-radius:var(--r-md,14px)", "font-family:inherit", "font-size:var(--fs-sm,14px)", "font-weight:700", "line-height:1.6",
    "background:var(--white,#fffdf7)", "color:var(--ink,#10251f)", "border:1px solid var(--line-strong,rgba(16,37,31,.16))",
    "box-shadow:0 14px 36px rgba(16,37,31,.16)", "text-align:center", "pointer-events:none",
  ].join(";");
  document.body.appendChild(bar);
  notice = bar;
  let tries = 0;
  const ask = async () => {
    const back = await probe().catch(() => false);
    if (!back) { tries++; window.setTimeout(ask, Math.min(15_000, 3000 * Math.pow(1.3, Math.max(0, tries - 5)))); return; }
    bar.remove();
    notice = null;
    const callbacks = [...waiting];
    waiting.clear();
    callbacks.forEach(callback => { try { callback(); } catch { /* one waiter must not stop the others */ } });
    window.dispatchEvent(new Event(SERVER_BACK_EVENT));
  };
  window.setTimeout(ask, 3000);
}
