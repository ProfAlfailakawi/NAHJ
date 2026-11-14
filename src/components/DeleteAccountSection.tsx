import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import { ApiError, deletionApi } from "../lib/api";

/*
 * حذف الحساب (App Store Guideline 5.1.1(v)).
 *
 * يظهر لكل مستخدم مسجَّل، وداخل تطبيق iOS كذلك: لا يستورد هذا الملف كشف الغلاف
 * عمداً، فالحذف ليس سطح شراء ولا يُخفى في أي منصة. والاختبار يحرس ذلك.
 */

export type DeletionGate = { visible: true; blocked: null | "demo" | "owner" };

/** القرار الوحيد للواجهة: الزرّ ظاهر دائماً؛ والمالك والتجريبي يرون سبب المنع بدل إخفائه. */
export function deletionGate(input: { role?: string; isDemo?: boolean }): DeletionGate {
  if (input.isDemo) return { visible: true, blocked: "demo" };
  if (input.role === "owner") return { visible: true, blocked: "owner" };
  return { visible: true, blocked: null };
}

interface Props {
  lang: "ar" | "en";
  role?: string;
  isDemo: boolean;
  notify: (text: string, error?: boolean) => void;
}

export function DeleteAccountSection({ lang, role, isDemo, notify }: Props) {
  const ar = lang === "ar";
  const gate = deletionGate({ role, isDemo });
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await deletionApi.request(password, reason);
      setDone(true);
      notify(ar ? "سُجّل طلب حذف حسابك وتم تسجيل خروجك" : "Your deletion request was recorded and you were signed out");
      window.setTimeout(() => window.location.reload(), 2500);
    } catch (error) {
      notify(error instanceof ApiError ? error.message : ar ? "تعذّر تسجيل الطلب." : "Could not record the request.", true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="surface-strong accounts-self" data-testid="delete-account" aria-labelledby="delete-account-title">
      <h3 id="delete-account-title"><Trash2 /> {ar ? "حذف الحساب" : "Delete account"}</h3>
      {done ? (
        <p role="status">{ar
          ? "سُجّل طلبك. عُلّق حسابك وأُنهيت جلساتك، وتُنفَّذ الإزالة خلال 30 يوماً."
          : "Your request is recorded. Your account is suspended and your sessions ended; removal is carried out within 30 days."}</p>
      ) : (
        <>
          <p>{ar
            ? "يطلب هذا حذف حسابك أنت فقط: بريدك واسمك وكلمة مرورك. بيانات مؤسستك (حالات العمل والمهارات والموافقات) تخصّ المؤسسة ولا تُحذف. يُعلَّق حسابك فوراً ويُنهى دخولك، ثم يُنفّذ مشرف المؤسسة الحذف خلال 30 يوماً."
            : "This requests deletion of your own account only: your email, name and password. Your organisation's data (work items, skills, approvals) belongs to the organisation and is not deleted. Your account is suspended and signed out immediately; your organisation's admin then carries out the deletion within 30 days."}</p>
          {gate.blocked === "demo" && <p role="note">{ar ? "غير متاح في البيئة التجريبية." : "Not available in the demo environment."}</p>}
          {gate.blocked === "owner" && <p role="note">{ar
            ? "حساب مالك المنصة يملك ترخيص المؤسسة، فلا يُحذف من هنا. انقل الملكية أو راسل المشغّل أولاً."
            : "The platform owner account holds the organisation's licence, so it cannot be deleted here. Transfer ownership or contact the operator first."}</p>}
          {!open ? (
            <button type="button" className="danger" disabled={gate.blocked === "demo"} onClick={() => setOpen(true)}>
              {ar ? "حذف الحساب" : "Delete account"}
            </button>
          ) : (
            <form onSubmit={submit}>
              <div className="field">
                <label htmlFor="del-password">{ar ? "أعد إدخال كلمة المرور للتأكيد" : "Re-enter your password to confirm"}</label>
                <input id="del-password" type="password" autoComplete="current-password" required
                  value={password} onChange={e => setPassword(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="del-reason">{ar ? "السبب (اختياري)" : "Reason (optional)"}</label>
                <input id="del-reason" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} />
              </div>
              <label>
                <input type="checkbox" checked={sure} onChange={e => setSure(e.target.checked)} />{" "}
                {ar ? "أفهم أن الحذف نهائي وأن حسابي سيُعلَّق الآن." : "I understand deletion is permanent and my account will be suspended now."}
              </label>
              <button type="submit" className="danger" disabled={busy || !password || !sure}>
                {busy ? (ar ? "جارٍ..." : "Working...") : ar ? "حذف الحساب نهائياً" : "Permanently delete account"}
              </button>
              <button type="button" onClick={() => { setOpen(false); setPassword(""); setSure(false); }}>{ar ? "إلغاء" : "Cancel"}</button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
