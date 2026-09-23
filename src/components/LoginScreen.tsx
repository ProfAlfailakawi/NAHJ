import React, { useEffect, useState } from "react";
import { LogIn, ShieldCheck, TriangleAlert } from "lucide-react";
import { ApiError, authApi } from "../lib/api";

interface Props {
  lang: "ar" | "en";
  /** true عند أول تشغيل: لا يوجد أي حساب بعد، فنُنشئ حساب المشغّل بدل طلب الدخول. */
  needsSetup: boolean;
  onAuthenticated: () => void;
}

/**
 * بوابة الدخول. لا يُعرض أي سطح تشغيلي قبلها — المنصة تدير مفاتيح إيقاف وموافقات
 * ومستويات استقلالية، ولا معنى لأي منها على سطح مفتوح.
 */
export function LoginScreen({ lang, needsSetup, onAuthenticated }: Props) {
  const ar = lang === "ar";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* في نشر عميلٍ (NAHJ_MARKETING=off) الجذر هو التطبيق نفسه: لا «عن نهج» ولا «اطلب عرضاً». */
  const [marketing, setMarketing] = useState(true);
  useEffect(() => {
    fetch("/api/public/site").then(res => (res.ok ? res.json() : null))
      .then(data => { if (data && data.marketing === false) setMarketing(false); }).catch(() => undefined);
  }, []);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (needsSetup) await authApi.setup(name.trim(), email.trim(), password);
      else await authApi.login(email.trim(), password);
      onAuthenticated();
    } catch (cause) {
      // رسالة الخادم موحّدة عمداً فلا تكشف إن كان البريد مسجَّلاً.
      setError(cause instanceof ApiError ? cause.message : ar ? "تعذّر الاتصال بالخادم." : "Could not reach the server.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-shell" dir={ar ? "rtl" : "ltr"}>
      <form className="login-card surface-strong" onSubmit={submit}>
        <div className="login-brand">
          <ShieldCheck />
          <div>
            <strong>{ar ? "نهج" : "NAHJ"}</strong>
            <small>{ar ? "نظام التعلّم التشغيلي" : "Operational Learning OS"}</small>
          </div>
        </div>

        <p className="login-hint">
          {needsSetup
            ? ar
              ? "لا يوجد أي حساب بعد. أنشئ حساب المشغّل الأول — هذه الشاشة تُعرض مرة واحدة فقط، وتُقفل بمجرد إنشاء الحساب."
              : "No account exists yet. Create the first operator account — this screen appears once and closes the moment the account is created."
            : ar
              ? "سجّل الدخول بحساب المشغّل للوصول إلى المهارات والموافقات وسجل الأثر."
              : "Sign in with your operator account to reach skills, approvals and the evidence log."}
        </p>

        {needsSetup && (
          <label>
            <span>{ar ? "الاسم" : "Name"}</span>
            <input
              type="text"
              value={name}
              onChange={event => setName(event.target.value)}
              autoComplete="name"
              required
              disabled={busy}
            />
          </label>
        )}

        <label>
          <span>{ar ? "البريد الإلكتروني" : "Email"}</span>
          <input
            type="email"
            value={email}
            onChange={event => setEmail(event.target.value)}
            autoComplete="username"
            required
            disabled={busy}
          />
        </label>

        <label>
          <span>{ar ? "كلمة المرور" : "Password"}</span>
          <input
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            autoComplete={needsSetup ? "new-password" : "current-password"}
            required
            disabled={busy}
          />
          {needsSetup && (
            <small className="login-rule">
              {ar ? "12 محرفاً على الأقل، حروف وأرقام." : "At least 12 characters, letters and digits."}
            </small>
          )}
        </label>

        {error && (
          <div className="login-error" role="alert">
            <TriangleAlert />
            <span>{error}</span>
          </div>
        )}

        <button type="submit" disabled={busy || !email.trim() || !password || (needsSetup && !name.trim())}>
          <LogIn />
          {busy
            ? ar ? "جارٍ التنفيذ..." : "Working..."
            : needsSetup
              ? ar ? "إنشاء الحساب والدخول" : "Create account and sign in"
              : ar ? "تسجيل الدخول" : "Sign in"}
        </button>

        {/*
          * مدخل البيئة التجريبية. بدونه لا يستطيع زائر بلا حساب أن يراها إطلاقاً —
          * وزائر بلا حساب هو بالضبط من بُنيت له.
          */}
        {/*
          * لا مدخل للعرض التجريبي هنا: شاشة الدخول لأصحاب الحسابات. العرض أداةٌ
          * يعرضها مالك المنصة بروابط /try من لوحته، والزائر يطلبه من الصفحة الرئيسية.
          */}
        {!needsSetup && marketing && (
          <div className="login-demo-row">
            <div className="login-links">
              <a href="/">{ar ? "عن نهج" : "About NAHJ"}</a>
              <a href="/pricing">{ar ? "الباقات والأسعار" : "Plans & pricing"}</a>
              <a href="/#contact">{ar ? "اطلب عرضاً" : "Request a demo"}</a>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
