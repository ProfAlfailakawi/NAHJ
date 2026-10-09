import React, { useEffect, useState } from "react";
import { FlaskConical, LogIn, TriangleAlert } from "lucide-react";
import { NahjMark } from "./Brand";
import { ApiError, authApi } from "../lib/api";

interface Props {
  lang: "ar" | "en";
  /** true عند أول تشغيل: لا يوجد أي حساب بعد، فنُنشئ حساب المشغّل بدل طلب الدخول. */
  needsSetup: boolean;
  onAuthenticated: () => void;
  demoEnabled: boolean;
  demoBusy: boolean;
  onEnterDemo: () => void;
}

/**
 * بوابة الدخول. لا يُعرض أي سطح تشغيلي قبلها — المنصة تدير مفاتيح إيقاف وموافقات
 * ومستويات استقلالية، ولا معنى لأي منها على سطح مفتوح.
 */
export function LoginScreen({ lang, needsSetup, onAuthenticated, demoEnabled, demoBusy, onEnterDemo }: Props) {
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
          <span className="login-mark" aria-hidden="true"><NahjMark size={40} /></span>
          <div>
            <strong>{ar ? "نهج" : "NAHJ"}</strong>
            <small>{ar ? "نظام التعلّم التشغيلي" : "Operational Learning OS"}</small>
          </div>
          {demoEnabled && (
            <button
              type="button"
              className="demo-enter demo-enter--icon login-demo-icon"
              onClick={onEnterDemo}
              disabled={demoBusy}
              title={demoBusy ? (ar ? "جارٍ تجهيز التجربة..." : "Preparing demo...") : (ar ? "جرّب نهج بدون تسجيل — بيئة تجريبية معزولة" : "Try NAHJ without signing in — isolated sandbox")}
              aria-label={ar ? "جرّب نهج بدون تسجيل" : "Try NAHJ without signing in"}
            >
              <FlaskConical aria-hidden="true" />
            </button>
          )}
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

        {!needsSetup && marketing && (
          <div className="login-links-row">
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
