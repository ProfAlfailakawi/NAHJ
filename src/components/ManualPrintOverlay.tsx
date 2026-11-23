import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";

/*
 * طباعة دليل الإجراء داخل التطبيق: نافذة window.open لا تُفتح في غلاف iOS، فيُعرض الدليل
 * في طبقةٍ داخل الصفحة نفسها (ظلٌّ معزول فلا يتسرّب تنسيقه)، ويُخفي @media print كل ما عداها.
 * الموقع لا يستعملها: يبقى فيه window.open كما كان.
 */
export function ManualPrintOverlay({ url, ar, onClose }: { url: string; ar: boolean; onClose: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    document.body.classList.add("manual-print-open");
    return () => document.body.classList.remove("manual-print-open");
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(url, { credentials: "same-origin" })
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.text(); })
      .then(html => {
        if (cancelled || !host.current) return;
        const doc = new DOMParser().parseFromString(html, "text/html");
        doc.querySelectorAll("script").forEach(s => s.remove());
        const root = host.current.shadowRoot || host.current.attachShadow({ mode: "open" });
        root.replaceChildren(...Array.from(doc.head.querySelectorAll("style")).map(s => s.cloneNode(true)), ...Array.from(doc.body.childNodes).map(n => n.cloneNode(true)));
        setState("ready");
      })
      .catch(() => { if (!cancelled) setState("failed"); });
    return () => { cancelled = true; };
  }, [url]);

  return createPortal(
    <div className="manual-print-overlay" role="dialog" aria-modal="true" aria-label={ar ? "دليل الإجراء للطباعة" : "Procedure manual for printing"}>
      <div className="manual-print-bar">
        <button type="button" className="btn-primary" disabled={state !== "ready"} onClick={() => window.print()}><Printer aria-hidden="true" />{ar ? "اطبع" : "Print"}</button>
        <button type="button" className="btn-secondary" onClick={onClose}><X aria-hidden="true" />{ar ? "إغلاق" : "Close"}</button>
        {state === "loading" && <span role="status">{ar ? "جارٍ تحميل الدليل…" : "Loading the manual…"}</span>}
        {state === "failed" && <span role="alert">{ar ? "تعذّر تحميل الدليل." : "Could not load the manual."}</span>}
      </div>
      <div className="manual-print-page" ref={host} />
    </div>,
    document.body,
  );
}
