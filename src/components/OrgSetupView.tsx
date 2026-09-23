import React, { useEffect, useState } from "react";
import { Building2, CheckCircle2, LogOut, ShieldCheck, TriangleAlert } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { BrandLockup } from "./Brand";

/*
 * إعداد المؤسسة — أول ما يراه مشرفها في نشرٍ جديد.
 *
 * بدل أن يدخل على «أكاديمية المستقبل» وموظفين وحالاتٍ لم تقع، يكتب اسم مؤسسته
 * ويختار قطاعها، فيبدأ نهج نظيفاً: قوالب مهارات القطاع وسياساته بانتظار
 * مراجعته، ولا شيء غير ذلك. ومن ليس مشرفاً يُقال له إن المؤسسة قيد الإعداد.
 */

type Sector = { code: string; nameAr: string; logo: string; descriptionAr?: string };

const GENERAL: Sector = {
  code: "general",
  nameAr: "نشاط آخر",
  logo: "🏢",
  descriptionAr: "ابدأ بلا قوالب، وعلّم نهج عملكم من موظفيكم مباشرة.",
};

interface Props {
  lang: "ar" | "en";
  canSetup: boolean;
  onDone: () => void;
  onSignOut: () => void;
}

export function OrgSetupView({ lang, canSetup, onDone, onSignOut }: Props) {
  const ar = lang === "ar";
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [sector, setSector] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/public/sectors", { credentials: "same-origin" })
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (alive && Array.isArray(data?.sectors)) setSectors([...data.sectors, GENERAL]); })
      .catch(() => { if (alive) setSectors([GENERAL]); });
    return () => { alive = false; };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api("/setup/organization", { method: "POST", body: JSON.stringify({ name: name.trim(), nameEn: nameEn.trim(), sector }) });
      onDone();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : ar ? "تعذّر الحفظ. حاول مجدداً." : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="org-setup" dir={ar ? "rtl" : "ltr"}>
      <header className="org-setup-top">
        <BrandLockup compact />
        <button type="button" className="top-icon" onClick={onSignOut} title={ar ? "تسجيل الخروج" : "Sign out"} aria-label={ar ? "تسجيل الخروج" : "Sign out"}><LogOut /></button>
      </header>

      {!canSetup ? (
        <section className="org-setup-card surface-strong">
          <Building2 />
          <h1>{ar ? "مؤسستك قيد الإعداد" : "Your organization is being set up"}</h1>
          <p>{ar ? "يُكمل مشرف المؤسسة إعدادها الآن. ستظهر لك شاشات العمل فور انتهائه." : "An administrator is completing setup."}</p>
          <button type="button" className="btn-primary" onClick={onDone}>{ar ? "تحقّق مجدداً" : "Check again"}</button>
        </section>
      ) : (
        <form className="org-setup-card surface-strong" onSubmit={submit}>
          <span className="org-setup-step">{ar ? "خطوة واحدة قبل البدء" : "One step before you start"}</span>
          <h1>{ar ? "أعِدّ مؤسستك" : "Set up your organization"}</h1>
          <p>{ar
            ? "اكتب اسم مؤسستك واختر قطاعها. يبدأ نهج نظيفاً: قوالب مهارات القطاع وسياساته تصلك مسوّداتٍ تراجعها وتعدّلها — ولا حالات ولا بيانات نموذجية."
            : "Name your organization and choose its sector. NAHJ starts clean with draft templates for your review."}</p>

          <label>
            <span>{ar ? "اسم المؤسسة" : "Organization name"}</span>
            <input value={name} onChange={e => setName(e.target.value)} required minLength={2} maxLength={120} autoFocus disabled={busy}
              placeholder={ar ? "مثال: عيادات النخبة" : "e.g. Elite Clinics"} />
          </label>
          <label>
            <span>{ar ? "الاسم بالإنجليزية" : "English name"} <small>{ar ? "(اختياري)" : "(optional)"}</small></span>
            <input value={nameEn} onChange={e => setNameEn(e.target.value)} maxLength={120} dir="ltr" disabled={busy} />
          </label>

          <fieldset>
            <legend>{ar ? "قطاع المؤسسة" : "Sector"}</legend>
            <div className="org-setup-sectors">
              {sectors.map(item => (
                <label key={item.code} className={sector === item.code ? "selected" : ""}>
                  <input type="radio" name="sector" value={item.code} checked={sector === item.code} onChange={() => setSector(item.code)} disabled={busy} />
                  <span className="logo" aria-hidden="true">{item.logo}</span>
                  <span><strong>{item.nameAr}</strong>{item.descriptionAr && <small>{item.descriptionAr}</small>}</span>
                  {sector === item.code && <CheckCircle2 className="tick" aria-hidden="true" />}
                </label>
              ))}
            </div>
          </fieldset>

          <p className="org-setup-note"><ShieldCheck />{ar
            ? "ما يظهر الآن من بيانات نموذجية سيُستبدل ببدايةٍ نظيفة. ولن تعمل أي مهارة وحدها قبل أن تراجعها وتدرّبها وترفع صلاحيتها بنفسك."
            : "Any sample data will be replaced with a clean start. No skill runs on its own until you review, practice and promote it."}</p>

          {error && <div className="login-error" role="alert"><TriangleAlert /><span>{error}</span></div>}

          <button type="submit" className="btn-primary" disabled={busy || name.trim().length < 2 || !sector}>
            {busy ? (ar ? "جارٍ الإعداد..." : "Setting up...") : (ar ? "ابدأ التشغيل" : "Start")}
          </button>
        </form>
      )}
    </div>
  );
}
