import React, { useCallback, useEffect, useState } from "react";
import { KeyRound, LogOut, ShieldCheck, TriangleAlert, UserPlus, Users } from "lucide-react";
import { PageHeader } from "../Primitives";
import { accountsApi, ApiError, authApi, type AccountSummary } from "../../lib/api";

interface Props {
  lang: "ar" | "en";
  currentAccountId: string;
  isAdmin: boolean;
  notify: (text: string, error?: boolean) => void;
}

const ROLES = ["admin", "manager", "operator", "viewer"] as const;

const roleLabel = (role: string, ar: boolean) =>
  ar
    ? ({ admin: "مشرف", manager: "مدير", operator: "مشغّل", viewer: "مُطّلع" } as Record<string, string>)[role] || role
    : role;

/**
 * إدارة الحسابات.
 *
 * نهج بلا مزوّد بريد، فلا يوجد "نسيت كلمة المرور" يُرسل رابطاً. البديل المعروض هنا هو
 * ما تفعله الأنظمة المغلقة: المشرف يُصدر كلمة مرور مؤقتة تظهر مرة واحدة على شاشته،
 * ويسلّمها بقناة يثق بها. الشاشة تقول ذلك صراحةً بدل أن توهم بإرسال لا يحدث.
 */
export function AccountsView({ lang, currentAccountId, isAdmin, notify }: Props) {
  const ar = lang === "ar";
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "viewer" });
  const [ownPassword, setOwnPassword] = useState({ current: "", next: "" });

  const load = useCallback(async () => {
    if (!isAdmin) { setLoading(false); return; }
    try {
      setAccounts((await accountsApi.list()).accounts);
    } catch (error) {
      notify(error instanceof ApiError ? error.message : ar ? "تعذّر جلب الحسابات." : "Could not load accounts.", true);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, ar, notify]);

  useEffect(() => { void load(); }, [load]);

  /* كلمة مرور مقترحة تُحقق الشروط، حتى لا يخترع المشرف واحدة ضعيفة. */
  const suggestPassword = () => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const bytes = new Uint32Array(18);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, value => alphabet[value % alphabet.length]).join("");
  };

  const guard = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    try { await action(); await load(); }
    catch (error) { notify(error instanceof ApiError ? error.message : ar ? "تعذّرت العملية." : "Action failed.", true); }
    finally { setBusyId(null); }
  };

  const createAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    try {
      await accountsApi.create(form);
      setIssued({ email: form.email, password: form.password });
      setForm({ name: "", email: "", password: "", role: "viewer" });
      await load();
      notify(ar ? "أُنشئ الحساب" : "Account created");
    } catch (error) {
      notify(error instanceof ApiError ? error.message : ar ? "تعذّر إنشاء الحساب." : "Could not create account.", true);
    } finally {
      setCreating(false);
    }
  };

  const changeOwn = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await authApi.changePassword(ownPassword.current, ownPassword.next);
      setOwnPassword({ current: "", next: "" });
      notify(ar ? "تم تغيير كلمة المرور" : "Password changed");
    } catch (error) {
      notify(error instanceof ApiError ? error.message : ar ? "تعذّر التغيير." : "Could not change it.", true);
    }
  };

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="ACCOUNTS / الحسابات"
        title={ar ? "من يدخل، وبأي صلاحية." : "Who gets in, and with what authority."}
        hint={ar
          ? "لا يوجد تسجيل ذاتي ولا استعادة بالبريد — الحسابات يُنشئها المشرف، وكلمة المرور المؤقتة تُسلَّم بقناة تثق بها."
          : "No self-registration and no email recovery — the admin creates accounts and hands over the temporary password through a channel they trust."}
      />

      {/* تغيير كلمة المرور متاح لكل حساب، لا للمشرف وحده. */}
      <section className="surface-strong accounts-self">
        <h3><KeyRound /> {ar ? "كلمة مروري" : "My password"}</h3>
        <form onSubmit={changeOwn}>
          <input type="password" autoComplete="current-password" required
            placeholder={ar ? "الحالية" : "Current"}
            value={ownPassword.current} onChange={e => setOwnPassword(v => ({ ...v, current: e.target.value }))} />
          <input type="password" autoComplete="new-password" required
            placeholder={ar ? "الجديدة (12 محرفاً فأكثر)" : "New (12+ characters)"}
            value={ownPassword.next} onChange={e => setOwnPassword(v => ({ ...v, next: e.target.value }))} />
          <button type="submit" disabled={!ownPassword.current || !ownPassword.next}>
            {ar ? "تغيير" : "Change"}
          </button>
        </form>
      </section>

      {!isAdmin ? (
        <section className="surface-strong accounts-locked">
          <ShieldCheck />
          <p>{ar ? "إدارة الحسابات متاحة للمشرف فقط." : "Account management is available to admins only."}</p>
        </section>
      ) : (
        <>
          <section className="surface-strong accounts-create">
            <h3><UserPlus /> {ar ? "حساب جديد" : "New account"}</h3>
            <form onSubmit={createAccount}>
              <input required placeholder={ar ? "الاسم" : "Name"} value={form.name}
                onChange={e => setForm(v => ({ ...v, name: e.target.value }))} />
              <input required type="email" placeholder={ar ? "البريد" : "Email"} value={form.email}
                onChange={e => setForm(v => ({ ...v, email: e.target.value }))} />
              <div className="accounts-password-row">
                <input required type="text" placeholder={ar ? "كلمة مرور مؤقتة" : "Temporary password"} value={form.password}
                  onChange={e => setForm(v => ({ ...v, password: e.target.value }))} />
                <button type="button" onClick={() => setForm(v => ({ ...v, password: suggestPassword() }))}>
                  {ar ? "توليد" : "Generate"}
                </button>
              </div>
              <select value={form.role} onChange={e => setForm(v => ({ ...v, role: e.target.value }))}>
                {ROLES.map(role => <option key={role} value={role}>{roleLabel(role, ar)}</option>)}
              </select>
              <button type="submit" disabled={creating}>
                {creating ? (ar ? "جارٍ..." : "Working...") : ar ? "إنشاء" : "Create"}
              </button>
            </form>
            {issued && (
              <div className="accounts-issued" role="status">
                <TriangleAlert />
                <div>
                  <strong>{ar ? "سلّم هذه البيانات بنفسك" : "Hand these over yourself"}</strong>
                  <p>{ar
                    ? "لن تُعرض مرة أخرى، ولا يوجد بريد يرسلها."
                    : "They will not be shown again, and no email will send them."}</p>
                  <code>{issued.email}</code>
                  <code>{issued.password}</code>
                </div>
                <button type="button" onClick={() => setIssued(null)}>{ar ? "أخفِ" : "Hide"}</button>
              </div>
            )}
          </section>

          <section className="surface-strong accounts-list">
            <h3><Users /> {ar ? "الحسابات" : "Accounts"} <small>{accounts.length}</small></h3>
            {loading ? <p className="accounts-empty">{ar ? "جارٍ التحميل..." : "Loading..."}</p> : null}
            {!loading && !accounts.length ? <p className="accounts-empty">{ar ? "لا حسابات." : "No accounts."}</p> : null}
            <div className="accounts-rows">
              {accounts.map(account => {
                const isSelf = account.id === currentAccountId;
                const busy = busyId === account.id;
                return (
                  <article key={account.id} className={account.status === "ACTIVE" ? "" : "is-suspended"}>
                    <div className="accounts-identity">
                      <strong>{account.name}{isSelf && <em> — {ar ? "أنت" : "you"}</em>}</strong>
                      <small>{account.email}</small>
                      <small className="accounts-meta">
                        {ar ? "جلسات نشطة" : "active sessions"}: {account.activeSessions}
                        {account.lockedUntil ? ` · ${ar ? "مقفل مؤقتاً" : "locked"}` : ""}
                      </small>
                    </div>

                    <div className="accounts-controls">
                      <select
                        value={account.role}
                        disabled={isSelf || busy}
                        title={isSelf ? (ar ? "لا يمكنك تغيير دورك" : "You cannot change your own role") : undefined}
                        onChange={e => void guard(account.id, async () => { await accountsApi.update(account.id, { role: e.target.value }); })}
                      >
                        {ROLES.map(role => <option key={role} value={role}>{roleLabel(role, ar)}</option>)}
                      </select>

                      <button type="button" disabled={isSelf || busy}
                        onClick={() => void guard(account.id, async () => {
                          await accountsApi.update(account.id, { status: account.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" });
                        })}>
                        {account.status === "ACTIVE" ? (ar ? "تعليق" : "Suspend") : (ar ? "تفعيل" : "Activate")}
                      </button>

                      <button type="button" disabled={busy} title={ar ? "إصدار كلمة مرور مؤقتة" : "Issue a temporary password"}
                        onClick={() => {
                          const next = suggestPassword();
                          void guard(account.id, async () => {
                            await accountsApi.setPassword(account.id, next);
                            setIssued({ email: account.email, password: next });
                          });
                        }}>
                        <KeyRound /> {ar ? "كلمة مؤقتة" : "Temp password"}
                      </button>

                      <button type="button" disabled={busy || !account.activeSessions}
                        title={ar ? "إنهاء كل جلساته" : "End all its sessions"}
                        onClick={() => void guard(account.id, async () => { await accountsApi.revokeSessions(account.id); })}>
                        <LogOut />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
