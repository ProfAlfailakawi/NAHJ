import React, { useEffect, useState } from "react";
import { FlaskConical, LogIn, ShieldCheck, TriangleAlert } from "lucide-react";
import { ApiError, authApi } from "../lib/api";

interface Props {
  lang: "ar" | "en";
  /** true عند أول تشغيل: لا يوجد أي حساب بعد، فنُنشئ حساب المشغّل بدل طلب الدخول. */
  needsSetup: boolean;
  /** البيئة التجريبية مفعّلة في هذا النشر. */
  demoEnabled?: boolean;
  demoBusy?: boolean;
  /** يفتح العرض على القطاع المختار — أو التعليم إن لم يُختر. */
  onEnterDemo?: (sector?: string) => void;
  onAuthenticated: () => void;
}

/**
 * بوابة الدخول. لا يُعرض أي سطح تشغيلي قبلها — المنصة تدير مفاتيح إيقاف وموافقات
 * ومستويات استقلالية، ولا معنى لأي منها على سطح مفتوح.
 */
export function LoginScreen({ lang, needsSetup, demoEnabled = false, demoBusy = false, onEnterDemo, onAuthenticated }: Props) {
  const ar = lang === "ar";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickSector, setPickSector] = useState(false);
  const [sectors, setSectors] = useState<Array<{ code: string; nameAr: string; nameEn: string; logo: string }>>([]);

  /* القطاعات من الخادم: القائمة نفسها التي يُبنى منها العرض، فلا يُعرض قطاعٌ لا حزمة له. */
  useEffect(() => {
    if (!demoEnabled || needsSetup) return;
    let alive = true;
    fetch("/api/public/sectors", { credentials: "same-origin" })
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (alive && Array.isArray(data?.sectors)) setSectors(data.sectors); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [demoEnabled, needsSetup]);

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
          * مدخل البيئة التجريبية ورابط الأسعار.
          *
          * كان المدخل أيقونةَ قارورةٍ بلا نص: الزائر الذي بُنيت له التجربة — بلا
          * حساب — لا يعرف أنها موجودة. صار زرّاً ثانوياً بنصٍّ صريح تحت خط فاصل،
          * فيبقى تسجيل الدخول هو الطريق الأول ويُرى الطريق الثاني.
          */}
        {!needsSetup && (
          <div className="login-demo-row">
            {demoEnabled && onEnterDemo && !pickSector && (
              <button
                type="button"
                className="demo-enter"
                onClick={() => (sectors.length ? setPickSector(true) : onEnterDemo())}
                disabled={busy || demoBusy}
                title={ar
                  ? "بيئة تجريبية معزولة ببيانات اصطناعية، لا تُقرأ ولا تُكتب أي بيانات مؤسسة"
                  : "Isolated sandbox with synthetic data; no institution record is read or written"}
              >
                <FlaskConical aria-hidden="true" />
                <strong>{ar ? "جرّب نهج الآن — بلا حساب" : "Try NAHJ now — no account"}</strong>
              </button>
            )}
            {/*
              * اختيار القطاع قبل الدخول: كان العرض يفتح دائماً على مدرسة، فمن جاء
              * من عيادة يرى منتجاً لقطاعٍ آخر ويُطالَب بأن يتخيّل.
              */}
            {demoEnabled && onEnterDemo && pickSector && (
              <div className="login-sectors" role="group" aria-label={ar ? "اختر قطاعك" : "Choose your sector"}>
                <p>{demoBusy ? (ar ? "جارٍ تجهيز مؤسستك التجريبية..." : "Preparing your demo...") : ar ? "اختر قطاعك — ندخلك مؤسسةً نموذجية منه:" : "Choose your sector:"}</p>
                <div>
                  {sectors.map(sector => (
                    <button key={sector.code} type="button" disabled={demoBusy} onClick={() => onEnterDemo(sector.code)}>
                      <span aria-hidden="true">{sector.logo}</span>{ar ? sector.nameAr : sector.nameEn}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="login-links">
              <a href="/">{ar ? "عن نهج" : "About NAHJ"}</a>
              <a href="/pricing">{ar ? "الباقات والأسعار" : "Plans & pricing"}</a>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
