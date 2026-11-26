import React, { useEffect, useMemo, useState } from "react";
import { BookMarked, Database, ShieldCheck } from "lucide-react";

/*
 * «عقل نهج بجوار المحادثة» — عرضٌ فقط مما في حالة المحاكاة نفسها.
 * لكل ردّ: المصدر من نوع بطاقته (cardType) والسياسة من metadata.policyApplied أو رمزٍ مذكور
 * في نصّه (POL-…). وما لا يذكره الردّ يُعرض «—» لا مصدراً مُخمَّناً. البوابة حاجزٌ يتبع approvalStatus.
 */
type Msg = { id: string; sender: "customer" | "ai" | "system"; text: string; cardType?: string; metadata?: Record<string, any> };

const SOURCE: Record<string, [string, string]> = {
  fee_quote: ["جدول الرسوم المعتمد", "Approved fee table"],
  document_request: ["متطلبات المستندات", "Document requirements"],
  booking_confirmation: ["نظام القبول (تنفيذ بعد الاعتماد)", "Admissions system (post-approval)"],
  approval_pending: ["بوابة القرار البشري", "Human decision gate"],
};

function policyOf(m: Msg): string | null {
  const meta = m.metadata?.policyApplied;
  if (typeof meta === "string" && meta) return meta;
  return /\bPOL-[A-Z]+-\d+\b/.exec(m.text)?.[0] || null;
}

export function ChatBrain({ ar, messages, approvalStatus }: { ar: boolean; messages: Msg[]; approvalStatus?: string }) {
  const replies = useMemo(() => messages.filter(m => m.sender !== "customer").map(m => ({
    m, policy: policyOf(m), source: m.cardType && SOURCE[m.cardType] ? (ar ? SOURCE[m.cardType][0] : SOURCE[m.cardType][1]) : null,
  })), [messages, ar]);
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => { setPicked(null); }, [replies.length]);
  const active = replies.find(r => r.m.id === picked) || replies[replies.length - 1];
  const policies = [...new Set(replies.map(r => r.policy).filter(Boolean) as string[])];
  const sources = [...new Set(replies.map(r => r.source).filter(Boolean) as string[])];
  const gate = approvalStatus === "pending" ? "closed" : approvalStatus === "approved" ? "open" : approvalStatus === "rejected" ? "rejected" : "idle";
  const gateText = {
    closed: ar ? "البوابة مغلقة — بانتظار قرارك" : "Gate closed — awaiting your decision",
    open: ar ? "اعتُمد القرار — البوابة مفتوحة" : "Approved — gate open",
    rejected: ar ? "رُفض — البوابة مغلقة" : "Rejected — gate closed",
    idle: ar ? "لا قرار حسّاس بعد" : "No sensitive decision yet",
  }[gate];

  return (
    <div className="chat-brain" aria-label={ar ? "ما يستند إليه كل ردّ" : "What each reply relies on"}>
      <div className="cb-head"><strong>{ar ? "عقل نهج" : "NAHJ brain"}</strong><small>{ar ? "السياسة والمصدر لكل ردّ" : "Policy and source per reply"}</small></div>
      {replies.length > 0 && (
        <div className="cb-replies" role="group" aria-label={ar ? "اختر ردّاً" : "Pick a reply"}>
          {replies.map((r, i) => <button key={r.m.id} type="button" aria-pressed={active?.m.id === r.m.id} className={`${active?.m.id === r.m.id ? "on" : ""} ${r.policy || r.source ? "has" : ""}`} onClick={() => setPicked(r.m.id)} title={r.m.text.slice(0, 120)}>{i + 1}</button>)}
        </div>
      )}
      <div className="cb-grid">
        <div className="cb-col">
          <span className="cb-cap"><ShieldCheck aria-hidden="true" />{ar ? "السياسات" : "Policies"}</span>
          {policies.length ? policies.map(p => <span key={p} className={`cb-node pol ${active?.policy === p ? "lit" : ""}`} dir="ltr">{p}</span>) : <span className="cb-node none">—</span>}
        </div>
        <div className="cb-col">
          <span className="cb-cap"><Database aria-hidden="true" />{ar ? "المصادر" : "Sources"}</span>
          {sources.length ? sources.map(s => <span key={s} className={`cb-node src ${active?.source === s ? "lit" : ""}`}>{s}</span>) : <span className="cb-node none">—</span>}
        </div>
      </div>
      {active && <p className="cb-active"><BookMarked aria-hidden="true" />{ar ? "هذا الردّ:" : "This reply:"} <b dir="ltr">{active.policy || "—"}</b> · <b>{active.source || (ar ? "غير مذكور" : "not stated")}</b></p>}
      <div className={`cb-gate g-${gate}`} role="img" aria-label={gateText}>
        <span className="cb-post" aria-hidden="true" /><span className="cb-arm" aria-hidden="true" /><span className="cb-post end" aria-hidden="true" />
        <small>{gateText}</small>
      </div>
    </div>
  );
}
