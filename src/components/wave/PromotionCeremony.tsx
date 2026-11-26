import React, { useState } from "react";
import { Award, Check, Copy, Share2, ShieldCheck } from "lucide-react";
import type { AuditEvent, Skill } from "../../types";
import { Dialog } from "../Dialog";
import { LADDER_NAME_AR, dataText } from "../../lib/labels";

const STAGES_EN = ["Observe", "Practice", "Shadow", "Suggest", "Prepare", "Approval", "Autopilot"];

/*
 * «حفل الترقية» — يظهر بعد ترقيةٍ موقَّعة نجحت فعلاً (رجع الخادم بالمهارة في المستوى الجديد).
 * لا يكتب شيئاً: السُّلّم من المستويين، والختم باسم الموقّع كما سجّله الخادم في سجلّ التدقيق
 * (PROMOTE_SKILL_AUTONOMY)، وإن لم يصل السطر بعد يُعرض «—» لا اسمٌ مُخمَّن.
 */
export function PromotionCeremony({ ar, skill, from, to, signer, at, onClose }: {
  ar: boolean; skill: Skill; from: number; to: number; signer: string | null; at: Date; onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const name = ar ? dataText(skill.name, ar) : (skill.nameEn || skill.name);
  const level = (i: number) => (ar ? LADDER_NAME_AR[i] : STAGES_EN[i]);
  const date = at.toLocaleDateString(ar ? "ar-KW-u-nu-latn" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
  const text = ar
    ? `شهادة ترقية — نهج\n«${name}» صعدت من المستوى ${from} (${level(from)}) إلى المستوى ${to} (${level(to)}).\nوقّعها: ${signer || "—"} · ${date}\nموثوقية المهارة: ${skill.reliabilityScore}%`
    : `Promotion certificate — NAHJ\n“${name}” rose from L${from} (${level(from)}) to L${to} (${level(to)}).\nSigned by: ${signer || "—"} · ${date}\nReliability: ${skill.reliabilityScore}%`;
  const share = async () => {
    const nav = navigator as Navigator & { share?: (d: { title: string; text: string }) => Promise<void> };
    try {
      if (nav.share) { await nav.share({ title: ar ? "شهادة ترقية" : "Promotion certificate", text }); return; }
      await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 2200);
    } catch { /* أُلغيت المشاركة أو حُجبت الحافظة: لا شيء يُكتب */ }
  };
  const canNativeShare = typeof navigator !== "undefined" && "share" in navigator;
  return (
    <Dialog open onClose={onClose} className="approval-sheet ceremony-sheet" closeLabel={ar ? "إغلاق شهادة الترقية" : "Close certificate"}
      icon={<Award />} eyebrow={ar ? "ترقية موقَّعة" : "Signed promotion"} title={ar ? `«${name}» صعدت درجة` : `“${name}” climbed a rung`}>
      <div className="ceremony">
        <ol className="ceremony-ladder" aria-label={ar ? `السُّلّم: من ${from} إلى ${to}` : `Ladder: from ${from} to ${to}`} style={{ ["--from" as string]: from, ["--to" as string]: to } as React.CSSProperties}>
          {[6, 5, 4, 3, 2, 1, 0].map(i => (
            <li key={i} className={i === to ? "now" : i === from ? "was" : i < to ? "done" : ""} aria-current={i === to ? "step" : undefined}>
              <b dir="ltr">L{i}</b><span>{level(i)}</span>
              {i === to && <em className="ceremony-token" aria-hidden="true"><ShieldCheck /></em>}
            </li>
          ))}
        </ol>
        <article className="ceremony-cert" aria-label={ar ? "شهادة الترقية" : "Promotion certificate"}>
          <header><Award aria-hidden="true" /><span>{ar ? "شهادة ترقية" : "Promotion certificate"}</span><small dir="ltr">NAHJ</small></header>
          <strong className="cert-skill">{name}</strong>
          <p className="cert-move"><span dir="ltr">L{from}</span> {level(from)} <i aria-hidden="true">←</i> <span dir="ltr">L{to}</span> {level(to)}</p>
          <dl>
            <div><dt>{ar ? "الموثوقية" : "Reliability"}</dt><dd>{skill.reliabilityScore}%</dd></div>
            <div><dt>{ar ? "التاريخ" : "Date"}</dt><dd>{date}</dd></div>
            <div><dt>{ar ? "الإصدار" : "Version"}</dt><dd dir="ltr">v{skill.activeVersion}</dd></div>
          </dl>
          <div className="cert-stamp" role="img" aria-label={ar ? `ختم التوقيع: ${signer || "غير متاح بعد"}` : `Signature stamp: ${signer || "not available yet"}`}>
            <span>{ar ? "وقّعها" : "Signed by"}</span>
            <strong>{signer || "—"}</strong>
            <small>{ar ? "من سجلّ التدقيق" : "from the audit log"}</small>
          </div>
        </article>
      </div>
      <div className="approval-actions">
        <button type="button" onClick={onClose}>{ar ? "إغلاق" : "Close"}</button>
        <button type="button" className="approve" onClick={() => void share()}>
          {copied ? <Check aria-hidden="true" /> : canNativeShare ? <Share2 aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? (ar ? "نُسخ نص الشهادة" : "Certificate text copied") : canNativeShare ? (ar ? "شارك الشهادة" : "Share certificate") : (ar ? "انسخ نص الشهادة" : "Copy certificate text")}
        </button>
      </div>
    </Dialog>
  );
}

/* اسم الموقّع: أحدث سطر ترقية لهذه المهارة في السجل بعد لحظة الطلب. */
export function signerFromAudit(audit: AuditEvent[] | undefined, skill: Skill, since: number): string | null {
  const rows = (audit || []).filter(e => e.action === "PROMOTE_SKILL_AUTONOMY" && (!e.at || Date.parse(e.at) >= since - 5000)
    && (!e.details || e.details.includes(skill.name) || e.details.includes(skill.id) || (skill.nameEn ? e.details.includes(skill.nameEn) : false)));
  rows.sort((a, b) => (Date.parse(b.at || "") || 0) - (Date.parse(a.at || "") || 0));
  return rows[0]?.actorName || null;
}
