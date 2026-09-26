import React, { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

/*
 * حوار يمكن الوصول إليه.
 *
 * كانت نوافذ الاعتماد طبقةً فوق الصفحة لا يعرفها قارئ الشاشة حواراً، ولا يحبس
 * التركيز فيها (Tab يخرج إلى ما خلفها)، ولا يُغلقها Esc، ولا يعود التركيز بعد
 * إغلاقها إلى الزرّ الذي فتحها. هنا كل ذلك في مكان واحد تستعمله كل النوافذ.
 */

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

type DialogProps = {
  open: boolean;
  onClose: () => void;
  /** يُربط بـaria-labelledby — عنوان الحوار الظاهر. */
  title: React.ReactNode;
  /** نصّ زرّ الإغلاق لقارئ الشاشة. */
  closeLabel: string;
  className?: string;
  /** يُمنع الإغلاق (Esc والخلفية) أثناء عملية جارية. */
  busy?: boolean;
  /** العنصر الذي يأخذ التركيز أولاً؛ وإلا فأول عنصر قابل للتركيز. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  eyebrow?: React.ReactNode;
  icon?: React.ReactNode;
  describedBy?: string;
  children: React.ReactNode;
};

export function Dialog({ open, onClose, title, closeLabel, className = "approval-sheet", busy = false, initialFocusRef, eyebrow, icon, describedBy, children }: DialogProps) {
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const sheet = sheetRef.current;
    const first = initialFocusRef?.current || sheet?.querySelector<HTMLElement>(FOCUSABLE);
    (first || sheet)?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!busyRef.current) { event.stopPropagation(); onCloseRef.current(); }
        return;
      }
      if (event.key !== "Tab" || !sheet) return;
      const items = [...sheet.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) { event.preventDefault(); return; }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === firstItem || !sheet.contains(document.activeElement))) {
        event.preventDefault(); lastItem.focus();
      } else if (!event.shiftKey && (document.activeElement === lastItem || !sheet.contains(document.activeElement))) {
        event.preventDefault(); firstItem.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      /* يعود التركيز إلى ما فتح الحوار — لا إلى أعلى الصفحة. */
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [open, initialFocusRef]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={event => { if (event.currentTarget === event.target && !busy) onClose(); }}>
      <div ref={sheetRef} className={className} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={describedBy} tabIndex={-1}>
        {icon && <div className="approval-mark" aria-hidden="true">{icon}</div>}
        <button type="button" className="modal-close" onClick={onClose} disabled={busy} aria-label={closeLabel} title={closeLabel}><X aria-hidden="true" /></button>
        {eyebrow && <div className="approval-eyebrow">{eyebrow}</div>}
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
