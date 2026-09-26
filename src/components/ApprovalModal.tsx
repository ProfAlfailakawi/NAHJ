import React, { useEffect, useId, useState } from "react";
import { Check, FileCheck2, Hand, ShieldCheck, X } from "lucide-react";
import type { ApprovalRequest } from "../types";
import { apiOrNull } from "../lib/api";
import { reasonLabel, riskLabel, ROLE_LABEL_AR } from "../lib/labels";
import { Dialog } from "./Dialog";

/*
 * بوابة الاعتماد — سجلّ قرار لا زرّ موافقة.
 *
 * يرى المعتمِد قبل أن يضغط: أيّ إصدارٍ من المهارة سينفّذ، والدليل الذي بُني عليه
 * الطلب، والقاعدة التي أوقفت التنفيذ، وما الذي سيُكتب على النظام. والسبب إلزاميٌّ
 * حين تكون الخطورة عالية أو حرجة، ويُحفظ مع القرار في سجل التدقيق.
 */

export interface DecisionRecordView {
  skill: { id: string; name: string; version: number; autonomyLevel: number; changeSummary: string } | null;
  policy: { code: string; description: string; riskLevel: string; requiredRole: string; provenance: string };
  evidence: { label: string; value: string }[];
  preview: { field: string; before: string; after: string }[];
  compliance: { preset: string; redactedFields?: string[]; conflictMatches?: string[]; cashAmount?: number; cashLimit?: number } | null;
  reasonRequired: boolean;
}

type Props = {
  lang: "ar" | "en";
  approval: ApprovalRequest | null;
  busy?: boolean;
  onClose: () => void;
  onApprove: (id: string, reason: string) => void;
  onReject: (id: string, reason: string) => void;
  onTakeOver: (id: string) => void;
};

export function ApprovalModal({ lang, approval, busy = false, onClose, onApprove, onReject, onTakeOver }: Props) {
  const ar = lang === "ar";
  const [reason, setReason] = useState("");
  const [record, setRecord] = useState<DecisionRecordView | null>(null);
  const [loading, setLoading] = useState(false);
  const reasonId = useId();
  const reasonHintId = useId();
  const approvalId = approval?.id;

  useEffect(() => {
    setReason("");
    setRecord(null);
    if (!approvalId) return;
    let alive = true;
    setLoading(true);
    void apiOrNull<{ record: DecisionRecordView }>(`/approvals/${approvalId}/record`)
      .then(data => { if (alive) setRecord(data?.record || null); })
      .catch(() => { /* السجل إضافة — تعذّره لا يمنع القرار، والخادم يفرض السبب على أي حال. */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [approvalId]);

  if (!approval) return null;

  const reasonRequired = record?.reasonRequired ?? (approval.riskLevel === "high" || approval.riskLevel === "critical");
  const reasonMissing = reasonRequired && reason.trim().length < 3;
  const risk = riskLabel(approval.riskLevel, ar);

  return (
    <Dialog
      open
      onClose={onClose}
      busy={busy}
      closeLabel={ar ? "إغلاق نافذة الاعتماد" : "Close approval dialog"}
      icon={<ShieldCheck />}
      eyebrow={ar ? "بوابة الاعتماد" : "Approval gate"}
      title={ar ? "قرارك مطلوب" : "Your decision is required"}
      className="approval-sheet decision-sheet"
    >
      <div className="approval-object">
        <strong>{approval.workTitle}</strong>
        <p>{approval.reasonDescription}</p>
        <div>
          <span title={approval.reasonCode}><FileCheck2 aria-hidden="true" />{reasonLabel(approval.reasonCode, ar)}</span>
          <span className={`risk-chip risk-${approval.riskLevel}`}>{risk}</span>
          {approval.requiredRole && <span>{ar ? `يعتمده: ${ROLE_LABEL_AR[approval.requiredRole] || approval.requiredRole}` : `Approver: ${approval.requiredRole}`}</span>}
        </div>
      </div>

      <div className="decision-record" aria-busy={loading}>
        {loading && <p className="decision-muted">{ar ? "يُحمَّل سجل القرار…" : "Loading decision record…"}</p>}
        {record && <>
          <section>
            <h3>{ar ? "المهارة التي ستنفّذ" : "Skill that will execute"}</h3>
            {record.skill
              ? <p><strong>{record.skill.name}</strong> · {ar ? "الإصدار" : "version"} v{record.skill.version}{record.skill.changeSummary ? ` — ${record.skill.changeSummary}` : ""}</p>
              : <p className="decision-muted">{ar ? "الطلب غير مرتبط بمهارة مسجّلة." : "Not linked to a recorded skill."}</p>}
          </section>
          <section>
            <h3>{ar ? "القاعدة التي أوقفت التنفيذ" : "Policy rule that fired"}</h3>
            <p>{reasonLabel(record.policy.code, ar)} <code className="decision-code">{record.policy.code}</code></p>
            <p className="decision-muted">{record.policy.provenance}</p>
          </section>
          {record.evidence.length > 0 && <section>
            <h3>{ar ? "الدليل" : "Evidence"}</h3>
            <dl className="decision-evidence">{record.evidence.map((item, index) => <React.Fragment key={index}><dt>{item.label}</dt><dd>{item.value}</dd></React.Fragment>)}</dl>
          </section>}
          {record.preview.length > 0 && <section>
            <h3>{ar ? "ما سيُنفَّذ عند الاعتماد" : "What executes on approval"}</h3>
            <table className="decision-preview">
              <thead><tr><th scope="col">{ar ? "الحقل" : "Field"}</th><th scope="col">{ar ? "قبل" : "Before"}</th><th scope="col">{ar ? "بعد" : "After"}</th></tr></thead>
              <tbody>{record.preview.map((line, index) => <tr key={index}><th scope="row">{line.field}</th><td>{line.before}</td><td><ins>{line.after}</ins></td></tr>)}</tbody>
            </table>
          </section>}
          {record.compliance?.redactedFields?.length ? <p className="decision-compliance">{ar ? `حُجبت بيانات المريض في المعاينة: ${record.compliance.redactedFields.join("، ")}` : `Patient data redacted in preview: ${record.compliance.redactedFields.join(", ")}`}</p> : null}
        </>}
      </div>

      <div className="decision-reason">
        <label htmlFor={reasonId}>
          {ar ? "سبب قرارك" : "Reason for your decision"}{reasonRequired ? <b aria-hidden="true"> *</b> : <small>{ar ? " (اختياري)" : " (optional)"}</small>}
        </label>
        <textarea
          id={reasonId}
          value={reason}
          onChange={event => setReason(event.target.value)}
          rows={2}
          required={reasonRequired}
          aria-required={reasonRequired}
          aria-invalid={reasonMissing && reason.length > 0}
          aria-describedby={reasonHintId}
          placeholder={ar ? "مثال: راجعتُ المستندات وطابقت الرسوم مع اللائحة" : "e.g. Reviewed documents and matched fees to policy"}
        />
        <small id={reasonHintId}>{reasonRequired
          ? (ar ? `مطلوب لأن الطلب «${risk}». يُحفظ مع القرار في سجل التدقيق.` : `Required for ${risk.toLowerCase()} requests. Stored with the decision in the audit trail.`)
          : (ar ? "يُحفظ مع القرار في سجل التدقيق." : "Stored with the decision in the audit trail.")}</small>
      </div>

      <div className="approval-actions">
        <button type="button" disabled={busy} onClick={() => onTakeOver(approval.workItemId)}><Hand aria-hidden="true" />{ar ? "استلم الحالة" : "Take over"}</button>
        <button type="button" disabled={busy || reasonMissing} className="approve" onClick={() => onApprove(approval.id, reason.trim())}><Check aria-hidden="true" />{ar ? "اعتمد ونفّذ" : "Approve & execute"}</button>
      </div>
      <div className="reject-row">
        <button type="button" disabled={busy || reasonMissing} onClick={() => onReject(approval.id, reason.trim())}><X aria-hidden="true" />{ar ? "ارفض الطلب" : "Reject"}</button>
      </div>
    </Dialog>
  );
}
