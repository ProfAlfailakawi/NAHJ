import React from "react";
import { AlertTriangle, CircleSlash, Timer } from "lucide-react";
import type { BillingSnapshot } from "../lib/api";

/*
 * شريط حالة الترخيص.
 *
 * لا يظهر لاشتراك سارٍ بعيد الانتهاء — الشريط الدائم يصير جزءاً من الأثاث فلا
 * يُقرأ حين يُصبح مهماً. يظهر عند أربع حالات فقط: قرب الانتهاء، مستحق غير مسدَّد،
 * مهلة سماح، وتجميد. وكلّ واحدة منها قرارٌ مطلوب من أحد، لا معلومة.
 */

const WARN_WITHIN_DAYS = 10;

interface Props {
  snapshot: BillingSnapshot | null;
  lang: "ar" | "en";
  onOpen: () => void;
}

export function SubscriptionBanner({ snapshot, lang, onOpen }: Props) {
  if (!snapshot?.subscription) return null;
  const ar = lang === "ar";
  const { state } = snapshot;

  const expiring = (state.status === "active" || state.status === "trialing" || state.status === "canceled")
    && state.daysRemaining <= WARN_WITHIN_DAYS;
  const urgent = state.status === "suspended" || state.status === "expired";
  const warning = state.status === "past_due" || state.status === "grace";

  if (!expiring && !urgent && !warning) return null;

  const tone = urgent ? "danger" : warning ? "warn" : "soft";
  const Icon = urgent ? CircleSlash : warning ? AlertTriangle : Timer;

  const text = urgent
    ? state.reason
    : warning
      ? state.reason
      : ar
        ? `${state.isTrial ? "فترة التجربة" : "الاشتراك"} ينتهي بعد ${state.daysRemaining} يوماً — في ${snapshot.subscription.currentPeriodEnd.slice(0, 10)}.`
        : `${state.isTrial ? "Your trial" : "Your subscription"} ends in ${state.daysRemaining} days.`;

  return (
    <div className={`sub-banner sub-banner--${tone}`} role="status">
      <Icon aria-hidden="true" />
      <span>{text}</span>
      <button type="button" onClick={onOpen}>{ar ? "تفاصيل الاشتراك" : "Subscription details"}</button>
    </div>
  );
}
