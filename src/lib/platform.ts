type CapacitorLike = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};

/**
 * True only inside the native iOS app (Capacitor, hosted mode), where Capacitor
 * injects `window.Capacitor`. App Store Guideline 3.1.1 / 3.1.3(c): the iOS app
 * must not show prices, plans or point to buying elsewhere, so those surfaces
 * are hidden there. Always false on the website, SSR and tests.
 */
export function isAppleNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const cap = (window as unknown as { Capacitor?: CapacitorLike }).Capacitor;
    return Boolean(cap?.isNativePlatform?.()) && cap?.getPlatform?.() === "ios";
  } catch {
    return false;
  }
}

/** Neutral replacement for every price / plan surface inside the iOS app. */
export const APPLE_PLANS_NOTICE = {
  ar: "تُرتَّب الباقات مع مؤسستك.",
  en: "Plans are arranged with your organisation.",
};
