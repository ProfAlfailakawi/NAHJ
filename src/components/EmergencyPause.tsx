import React, { useEffect, useId, useRef, useState } from "react";
import { ShieldCheck, Siren } from "lucide-react";
import { Dialog } from "./Dialog";

/*
 * الإيقاف الطارئ للطيار الآلي.
 *
 * على الهاتف زرٌّ عائم واحد يُرى من كل شاشة، يفتح لوحةً بأسبابٍ جاهزة: ضغطة
 * لفتحها، وضغطة على سبب، وضغطة للتأكيد. السبب إلزامي — يُحفظ في السجل ويصل
 * إلى المالك في الإشعار — لكنه لا يحتاج كتابة في لحظة ذعر.
 */

export interface AutopilotPause {
  active: boolean;
  reason: string;
  by: string;
  at: string;
  skillIds: string[];
}

const PRESETS_AR = ["خطأ في مخرجات المهارة", "شكوى عميل", "تغيّر في السياسة أو الأسعار", "عطل في نظام مربوط", "مراجعة أمنية"];
const PRESETS_EN = ["Wrong skill output", "Customer complaint", "Policy or price change", "Connected system outage", "Security review"];

type DialogProps = {
  lang: "ar" | "en";
  open: boolean;
  paused: boolean;
  busy: boolean;
  autopilotCount: number;
  onClose: () => void;
  onConfirm: (reason: string) => void;
};

export function EmergencyPauseDialog({ lang, open, paused, busy, autopilotCount, onClose, onConfirm }: DialogProps) {
  const ar = lang === "ar";
  const [reason, setReason] = useState("");
  const inputId = useId();
  const presetsRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open) setReason(""); }, [open]);
  const presets = ar ? PRESETS_AR : PRESETS_EN;
  const valid = reason.trim().length >= 3;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      initialFocusRef={presetsRef}
      className="approval-sheet emergency-sheet"
      closeLabel={ar ? "إغلاق" : "Close"}
      icon={paused ? <ShieldCheck /> : <Siren />}
      eyebrow={paused ? (ar ? "استئناف التنفيذ" : "Resume execution") : (ar ? "إيقاف طارئ" : "Emergency pause")}
      title={paused
        ? (ar ? "استئناف مهارات التنفيذ" : "Resume executing skills")
        : (ar ? `إيقاف كل مهارات التنفيذ (${autopilotCount})` : `Pause all executing skills (${autopilotCount})`)}
    >
      <p className="decision-muted">{paused
        ? (ar ? "تعود المهارات التي أوقفها الإيقاف الطارئ وحدها. ما أوقفه أحدٌ يدوياً يبقى موقوفاً." : "Only skills stopped by the emergency pause resume. Manually paused skills stay paused.")
        : (ar ? "يتوقف التنفيذ الآلي فوراً. التعلّم والمراجعة والاعتماد اليدوي تستمر، ويُبلَّغ المالك والإدارة." : "Autonomous execution stops now. Learning, review and manual approvals continue; the owner and admins are notified.")}</p>
      <fieldset className="emergency-presets">
        <legend>{ar ? "السبب" : "Reason"}</legend>
        {presets.map((preset, index) => (
          <button key={preset} ref={index === 0 ? presetsRef : undefined} type="button" aria-pressed={reason === preset}
            className={reason === preset ? "active" : ""} onClick={() => setReason(preset)}>{preset}</button>
        ))}
      </fieldset>
      <div className="decision-reason">
        <label htmlFor={inputId}>{ar ? "أو اكتب السبب" : "Or type the reason"} <b aria-hidden="true">*</b></label>
        <textarea id={inputId} rows={2} value={reason} required aria-required onChange={event => setReason(event.target.value)} />
      </div>
      <div className="approval-actions single">
        <button type="button" className={paused ? "approve" : "danger"} disabled={busy || !valid} onClick={() => onConfirm(reason.trim())}>
          {paused ? <ShieldCheck aria-hidden="true" /> : <Siren aria-hidden="true" />}
          {busy ? (ar ? "جارٍ…" : "Working…") : paused ? (ar ? "استأنف الآن" : "Resume now") : (ar ? "أوقف الآن" : "Pause now")}
        </button>
      </div>
    </Dialog>
  );
}

/** زرٌّ عائم على الهاتف — يُرى فوق شريط التنقّل السفلي من كل شاشة. */
export function EmergencyFab({ lang, paused, onOpen }: { lang: "ar" | "en"; paused: boolean; onOpen: () => void }) {
  const ar = lang === "ar";
  const label = paused ? (ar ? "التنفيذ الآلي متوقف — استئناف" : "Execution paused — resume") : (ar ? "إيقاف طارئ للتنفيذ الآلي" : "Emergency pause autopilot");
  return (
    <button type="button" className={`emergency-fab ${paused ? "paused" : ""}`} onClick={onOpen} aria-label={label} title={label}>
      {paused ? <ShieldCheck aria-hidden="true" /> : <Siren aria-hidden="true" />}
      <span>{paused ? (ar ? "متوقف" : "Paused") : (ar ? "إيقاف" : "Stop")}</span>
    </button>
  );
}
