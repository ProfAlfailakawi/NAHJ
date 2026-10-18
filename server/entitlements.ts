import type { Request, Response } from "express";
import { db } from "./db.ts";
import { seatCount, type AuthenticatedRequest } from "./auth.ts";
import { checkLimit, getSubscription, getPlan, incrementUsage, readUsage } from "./billing.ts";
import type { PlanLimits } from "./billing.ts";
import { McpEngine } from "./engine/mcpEngine.ts";

/*
 * فرض حدود الباقة.
 *
 * كان المفروض فعلاً حدّ المقاعد وسقف الاستقلالية وحدهما، وبقية الحدود (المهارات، حالات
 * الشهر، نداءات الذكاء، الموصلات، خوادم MCP) تُعرض في شاشة الاشتراك ولا تمنع شيئاً —
 * فتبيع الباقة سقفاً لا يُنفَّذ. وهنا نقطة واحدة تُنفّذها كلها:
 *
 *   - **تحذير عند 80%**: حدثٌ في سجلّ التدقيق مرة واحدة لكل دورة (والواجهة ترسم شريطاً).
 *   - **منعٌ عند 100%**: ردّ 402 ودّي برمز PLAN_LIMIT يقول ما بلغتَه وكيف تتجاوزه — لا فشلٌ
 *     صامت ولا فقد بيانات: ما أُنجز يبقى، والمنع على *الإضافة الجديدة* وحدها.
 *   - **مالك المنصة يتجاوز**: هو من يبيع الباقة وقد يحتاج أن يعمل داخل أي مؤسسة.
 *   - **العدّاد الشهري يُصفَّر** بانتهاء الشهر الاشتراكي (انظر periodKey في billing.ts).
 */

export type LimitMetric = "seats" | "skills" | "workItemsPerMonth" | "connectors" | "mcpServers" | "aiCallsPerMonth";

export const LIMIT_LABEL_AR: Record<LimitMetric, string> = {
  seats: "المقاعد", skills: "المهارات", workItemsPerMonth: "حالات العمل هذا الشهر",
  connectors: "الموصلات", mcpServers: "خوادم MCP", aiCallsPerMonth: "نداءات الذكاء هذا الشهر",
};

export const WARN_AT = 0.8;

export function usageNow(metric: LimitMetric): number {
  switch (metric) {
    case "seats": return seatCount();
    case "skills": return db.skills.length;
    case "connectors": return db.connectors.length;
    case "mcpServers": return McpEngine.getServers().filter(server => server.mode === "declared").length;
    case "workItemsPerMonth": return readUsage("workItems");
    case "aiCallsPerMonth": return readUsage("aiCalls");
  }
}

const USAGE_KEY: Partial<Record<LimitMetric, string>> = { workItemsPerMonth: "workItems", aiCallsPerMonth: "aiCalls" };

/** يسجّل تحذير 80% مرة في الدورة. يُنادى بعد أي زيادة في الاستهلاك. */
export function noteUsage(metric: LimitMetric): void {
  if (db.isDemo) return;
  try {
    const check = checkLimit(metric as keyof PlanLimits, usageNow(metric), 0);
    if (check.limit === null || check.limit <= 0) return;
    if (check.used / check.limit < WARN_AT) return;
    if (incrementUsage(`warned:${metric}`, 1) !== 1) return;
    db.logAudit({
      actorType: "system", actorName: "حدود الباقة", action: "PLAN_LIMIT_WARNING",
      provenance: "Entitlements", risk: "low", latencyMs: 0, status: "warning",
      details: `بلغ استهلاك «${LIMIT_LABEL_AR[metric]}» ${Math.round((check.used / check.limit) * 100)}% من حدّ الباقة (${check.used}/${check.limit}).`,
    });
  } catch { /* التحذير لا يُسقط العملية */ }
}

export interface LimitDecision { allowed: boolean; message: string; limit: number | null; used: number }

export function friendlyBlockMessage(metric: LimitMetric, used: number, limit: number, planName: string): string {
  return `بلغتم حدّ «${LIMIT_LABEL_AR[metric]}» في باقة «${planName}» (${used} من ${limit}). ما أنجزتموه محفوظ ولم يُفقد شيء — الإضافة الجديدة وحدها متوقفة. لرفع الحدّ: افتحوا «الاشتراك» ← «ترقية باقة» أو راسلوا مالك المنصة.`;
}

/** هل تسمح الباقة بإضافة `adding` إلى هذا الحدّ؟ (لا يكتب شيئاً.) */
export function evaluate(metric: LimitMetric, adding = 1): LimitDecision {
  /* صندوق العرض لا يُحتسب ولا يُمنع: نشاط زوار /try لا يمسّ حصّة المؤسسة الحقيقية. */
  if (db.isDemo) return { allowed: true, message: "", limit: null, used: 0 };
  const used = usageNow(metric);
  const check = checkLimit(metric as keyof PlanLimits, used, adding);
  if (check.allowed) return { allowed: true, message: "", limit: check.limit, used };
  const plan = getPlan(getSubscription()?.planCode || "");
  return { allowed: false, message: friendlyBlockMessage(metric, used, check.limit ?? 0, plan?.nameAr || "الحالية"), limit: check.limit, used };
}

/** يحرس نقطة نهاية: يُرجع true إن منع وأرسل الردّ. مالك المنصة يمرّ دائماً. */
export function blockIfOverLimit(req: Request, res: Response, metric: LimitMetric, adding = 1): boolean {
  if ((req as AuthenticatedRequest).account?.role === "owner") return false;
  const decision = evaluate(metric, adding);
  if (decision.allowed) return false;
  recordBlock(metric, decision);
  res.status(402).json({ success: false, error: decision.message, message: decision.message, code: "PLAN_LIMIT", metric, used: decision.used, limit: decision.limit });
  return true;
}

export function recordBlock(metric: LimitMetric, decision: LimitDecision): void {
  if (db.isDemo) return;
  try {
    const count = incrementUsage(`blocked:${metric}`, 1);
    if (count > 3 && count % 20 !== 0) return;
    db.logAudit({
      actorType: "system", actorName: "حدود الباقة", action: "PLAN_LIMIT_BLOCKED",
      provenance: "Entitlements", risk: "medium", latencyMs: 0, status: "intercepted",
      details: `مُنعت إضافةٌ جديدة لأن «${LIMIT_LABEL_AR[metric]}» بلغ حدّ الباقة (${decision.used}/${decision.limit}). المحاولة رقم ${count} هذه الدورة.`,
    });
  } catch { /* ignore */ }
}

/** يُنادى بعد نجاح إضافةٍ تُحتسب شهرياً. */
export function countMonthly(metric: "workItemsPerMonth" | "aiCallsPerMonth"): void {
  if (db.isDemo) return;
  incrementUsage(USAGE_KEY[metric]!, 1);
  noteUsage(metric);
}
