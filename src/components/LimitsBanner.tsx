import React from "react";
import { Gauge } from "lucide-react";
import type { BillingSnapshot } from "../lib/api";

/*
 * شريط حدود الباقة: يظهر حين يبلغ أي حدٍّ 80% فأكثر، ويقول أيّ حدٍّ وماذا سيحدث عند بلوغه — قبل أن يتوقف شيء.
 * لا يظهر لمن لا يملك الاشتراك (مُطّلع/مسوّق) فلا يُرى ما لا يستطيع التصرف فيه.
 */
interface Props { snapshot: BillingSnapshot | null; lang: "ar" | "en"; canAct: boolean; onOpen: () => void }

export function limitMeters(snapshot: BillingSnapshot | null, ar: boolean) {
  if (!snapshot?.limits) return [];
  const { usage, limits, subscription } = snapshot;
  const rows: Array<{ label: string; used: number; limit: number | null }> = [
    { label: ar ? "المقاعد" : "Seats", used: usage.seats, limit: limits.seats === null ? null : Math.max(limits.seats, subscription?.seatsPurchased ?? 0) },
    { label: ar ? "المهارات" : "Skills", used: usage.skills, limit: limits.skills },
    { label: ar ? "حالات العمل هذا الشهر" : "Work items this month", used: usage.workItemsThisPeriod, limit: limits.workItemsPerMonth },
    { label: ar ? "الموصلات" : "Connectors", used: usage.connectors, limit: limits.connectors },
    { label: ar ? "خوادم MCP" : "MCP servers", used: usage.mcpServers, limit: limits.mcpServers },
    { label: ar ? "نداءات الذكاء هذا الشهر" : "AI calls this month", used: usage.aiCallsThisPeriod, limit: limits.aiCallsPerMonth },
  ];
  return rows.filter(row => row.limit !== null && row.limit > 0).map(row => ({ ...row, percent: Math.round((row.used / (row.limit as number)) * 100) }));
}

export function LimitsBanner({ snapshot, lang, canAct, onOpen }: Props) {
  const ar = lang === "ar";
  if (!canAct) return null;
  const hot = limitMeters(snapshot, ar).filter(row => row.percent >= 80);
  if (!hot.length) return null;
  const full = hot.filter(row => row.percent >= 100);
  const names = (full.length ? full : hot).map(row => row.label).join(ar ? "، " : ", ");
  const text = full.length
    ? (ar ? `بلغتم حدّ الباقة في: ${names}. الإضافة الجديدة متوقفة وبياناتكم محفوظة.` : `Plan limit reached: ${names}. New additions are paused; your data is safe.`)
    : (ar ? `اقتربتم من حدّ الباقة في: ${names} (80% فأكثر).` : `Approaching plan limit: ${names} (80%+).`);
  return (
    <div className={`sub-banner sub-banner--${full.length ? "warn" : "soft"}`} role="status">
      <Gauge aria-hidden="true" />
      <span>{text}</span>
      <button type="button" onClick={onOpen}>{ar ? "ترقية الباقة" : "Upgrade plan"}</button>
    </div>
  );
}
