import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Building2, HandCoins, Plus, RefreshCw, Save, Trash2, UserPlus, Wallet, X,
} from "lucide-react";
import { PageHeader, SectionTitle, Stat } from "../Primitives";
import {
  CLIENT_STATUS_AR, COMMISSION_MODEL_AR, COMMISSION_STATUS_AR, fromMinor, money, partnersApi, toMinor,
  type BillingCycle, type ClientStatus, type CommissionModel, type PartnerOverview,
} from "../../lib/api";

/*
 * دفتر المالك للمسوّقين.
 *
 * كل شيء هنا مقروءٌ من موضع واحد: من جلب أي شركة، وبأي اتفاق، وما استُحقّ له،
 * وما دُفع. فلا يبقى الاتفاق في رسالة ولا الحساب في ذاكرة أحد.
 */

interface Props {
  lang: "ar" | "en";
  notify: (text: string, error?: boolean) => void;
}

const CYCLES: BillingCycle[] = ["monthly", "quarterly", "annual"];
const CYCLE_AR: Record<BillingCycle, string> = { monthly: "شهري", quarterly: "ربع سنوي", annual: "سنوي" };
const MODELS: CommissionModel[] = ["percent_of_contract", "fixed_per_cycle", "fixed_once"];
const STATUSES: ClientStatus[] = ["prospect", "active", "past_due", "churned"];

const shortDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("ar-KW", { year: "numeric", month: "short", day: "numeric" }) : "—";
const forInput = (value: string | null | undefined) => (value ? new Date(value).toISOString().slice(0, 10) : "");

export function PartnersAdminView({ lang, notify }: Props) {
  const ar = lang === "ar";
  const [data, setData] = useState<PartnerOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [reference, setReference] = useState("");

  const [partnerForm, setPartnerForm] = useState({
    id: "", name: "", email: "", phone: "", accountId: "",
    model: "percent_of_contract" as CommissionModel, rate: "15", fixed: "0",
    durationMonths: "0", notes: "",
  });
  const [clientForm, setClientForm] = useState({
    id: "", name: "", sector: "", contactName: "", contactEmail: "", contactPhone: "",
    partnerId: "", cycle: "monthly" as BillingCycle, contractValue: "", startedAt: "", endsAt: "",
    status: "active" as ClientStatus, deploymentUrl: "", notes: "",
  });

  const load = useCallback(async () => {
    try { setData(await partnersApi.overview()); }
    catch (error) { notify(error instanceof Error ? error.message : "تعذّر تحميل الدفتر.", true); }
    finally { setLoading(false); }
  }, [notify]);

  useEffect(() => { void load(); }, [load]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try { await action(); await load(); notify(success); }
    catch (error) { notify(error instanceof Error ? error.message : "تعذّرت العملية.", true); }
    finally { setBusy(false); }
  };

  const currency = data?.totals.currency || "KWD";
  const partners = useMemo(() => data?.partners || [], [data]);
  const clients = useMemo(() => data?.clients || [], [data]);
  const unpaid = useMemo(
    () => (data?.commissions || []).filter(commission => commission.status !== "paid" && commission.status !== "void"),
    [data],
  );

  if (loading) {
    return <div className="page-enter"><PageHeader eyebrow="PARTNERS / المسوّقون" title="جارٍ التحميل..." /></div>;
  }

  const savePartner = () => {
    const payload: Record<string, unknown> = {
      name: partnerForm.name, email: partnerForm.email, phone: partnerForm.phone,
      accountId: partnerForm.accountId || null, model: partnerForm.model,
      rateBps: Math.round(Number(partnerForm.rate) * 100) || 0,
      fixedAmount: toMinor(partnerForm.fixed, currency),
      currency, durationMonths: Number(partnerForm.durationMonths) || 0, notes: partnerForm.notes,
    };
    return run(async () => {
      if (partnerForm.id) await partnersApi.updatePartner(partnerForm.id, payload);
      else await partnersApi.savePartner(payload);
      setPartnerForm({ id: "", name: "", email: "", phone: "", accountId: "", model: "percent_of_contract", rate: "15", fixed: "0", durationMonths: "0", notes: "" });
    }, ar ? "حُفظ المسوّق" : "Saved");
  };

  const saveClient = () => {
    const payload: Record<string, unknown> = {
      name: clientForm.name, sector: clientForm.sector, contactName: clientForm.contactName,
      contactEmail: clientForm.contactEmail, contactPhone: clientForm.contactPhone,
      partnerId: clientForm.partnerId || null, cycle: clientForm.cycle,
      contractValue: toMinor(clientForm.contractValue, currency), currency,
      startedAt: clientForm.startedAt ? new Date(`${clientForm.startedAt}T00:00:00Z`).toISOString() : undefined,
      endsAt: clientForm.endsAt ? new Date(`${clientForm.endsAt}T23:59:59Z`).toISOString() : undefined,
      status: clientForm.status, deploymentUrl: clientForm.deploymentUrl, notes: clientForm.notes,
    };
    return run(async () => {
      if (clientForm.id) await partnersApi.updateClient(clientForm.id, payload);
      else await partnersApi.saveClient(payload);
      setClientForm({ id: "", name: "", sector: "", contactName: "", contactEmail: "", contactPhone: "", partnerId: "", cycle: "monthly", contractValue: "", startedAt: "", endsAt: "", status: "active", deploymentUrl: "", notes: "" });
    }, ar ? "حُفظت الشركة" : "Saved");
  };

  return (
    <div className="page-enter owner-view">
      <PageHeader
        eyebrow="PARTNERS / دفتر المسوّقين"
        title="من جلب ماذا، وبكم."
        hint="كل شركة وعقدها والمسوّق الذي جلبها واتفاقه معك. العمولة تُستحقّ عن كل دورة يبدأها العميل، وتُعلَّم مدفوعة بمرجع يُثبت الدفع."
        action={<button className="btn-secondary" onClick={() => void load()}><RefreshCw /> تحديث</button>}
      />

      <div className="stat-grid">
        <Stat label="المسوّقون" value={partners.length} tone="sky" icon={<UserPlus />} />
        <Stat label="الشركات" value={clients.length} tone="violet" icon={<Building2 />} />
        <Stat label="قيمة العقود الجارية" value={data?.contractedValueFormatted || "—"} tone="moss" icon={<Wallet />} />
        <Stat label="عمولات مستحقّة غير مدفوعة" value={data?.totals.formatted.due || "—"}
          tone={(data?.totals.due ?? 0) > 0 ? "amber" : "moss"} icon={<HandCoins />} />
      </div>

      {/* ------------------------------------------------ المسوّقون */}
      <section className="surface-strong owner-block">
        <SectionTitle title="المسوّقون" icon={<UserPlus />} meta={`${partners.length}`} />

        <div className="owner-form">
          <label>الاسم<input value={partnerForm.name} onChange={e => setPartnerForm(v => ({ ...v, name: e.target.value }))} /></label>
          <label>البريد<input type="email" value={partnerForm.email} onChange={e => setPartnerForm(v => ({ ...v, email: e.target.value }))} /></label>
          <label>الهاتف<input value={partnerForm.phone} onChange={e => setPartnerForm(v => ({ ...v, phone: e.target.value }))} /></label>
          <label>صيغة العمولة
            <select value={partnerForm.model} onChange={e => setPartnerForm(v => ({ ...v, model: e.target.value as CommissionModel }))}>
              {MODELS.map(model => <option key={model} value={model}>{COMMISSION_MODEL_AR[model]}</option>)}
            </select>
          </label>
          {partnerForm.model === "percent_of_contract" ? (
            <label>النسبة %<input inputMode="decimal" value={partnerForm.rate} onChange={e => setPartnerForm(v => ({ ...v, rate: e.target.value }))} /></label>
          ) : (
            <label>المبلغ ({currency})<input inputMode="decimal" value={partnerForm.fixed} onChange={e => setPartnerForm(v => ({ ...v, fixed: e.target.value }))} /></label>
          )}
          <label>مدّة الاستحقاق (شهر)<input type="number" min={0} value={partnerForm.durationMonths}
            onChange={e => setPartnerForm(v => ({ ...v, durationMonths: e.target.value }))} placeholder="0 = بلا حدّ" /></label>
          <label>معرّف حساب الدخول<input value={partnerForm.accountId} onChange={e => setPartnerForm(v => ({ ...v, accountId: e.target.value }))} placeholder="acc_..." /></label>
          <label className="owner-wide">ملاحظاتك (لا يراها المسوّق)<input value={partnerForm.notes} onChange={e => setPartnerForm(v => ({ ...v, notes: e.target.value }))} /></label>
        </div>
        <div className="owner-actions">
          <button className="btn-primary" disabled={busy || !partnerForm.name || !partnerForm.email} onClick={() => void savePartner()}>
            <Save /> {partnerForm.id ? "احفظ التعديل" : "أضف مسوّقاً"}
          </button>
          {partnerForm.id && (
            <button className="btn-secondary" onClick={() => setPartnerForm(v => ({ ...v, id: "", name: "", email: "" }))}>إلغاء التحرير</button>
          )}
        </div>
        <p className="owner-hint">
          ربط «معرّف حساب الدخول» هو ما يفتح للمسوّق لوحته. أنشئ له حساباً بدور «مسوّق» من شاشة الحسابات، ثم ضع معرّفه هنا.
        </p>

        <div className="partner-rows">
          {partners.map(partner => (
            <article key={partner.id} className={partner.status === "active" ? "" : "is-suspended"}>
              <div className="partner-identity">
                <strong>{partner.name}</strong>
                <small>{partner.email}{partner.phone ? ` · ${partner.phone}` : ""}</small>
                <small className="partner-terms">
                  {COMMISSION_MODEL_AR[partner.model]}
                  {partner.model === "percent_of_contract" ? ` — ${(partner.rateBps / 100).toFixed(2)}%` : ` — ${money(partner.fixedAmount, partner.currency)}`}
                  {partner.durationMonths > 0 ? ` · ${partner.durationMonths} شهراً` : " · بلا حدّ"}
                  {!partner.accountId ? " · بلا حساب دخول" : ""}
                </small>
              </div>
              <div className="partner-figures">
                <span>{partner.clientCount} شركة</span>
                <span className="mono">مستحقّ {partner.totals.formatted.due}</span>
                <span className="mono">مدفوع {partner.totals.formatted.paid}</span>
              </div>
              <div className="partner-actions">
                <button className="btn-secondary" onClick={() => setPartnerForm({
                  id: partner.id, name: partner.name, email: partner.email, phone: partner.phone,
                  accountId: partner.accountId || "", model: partner.model,
                  rate: (partner.rateBps / 100).toString(), fixed: fromMinor(partner.fixedAmount, partner.currency),
                  durationMonths: String(partner.durationMonths), notes: partner.notes || "",
                })}>تحرير</button>
                <button className="btn-secondary" disabled={busy}
                  onClick={() => void run(() => partnersApi.updatePartner(partner.id, { status: partner.status === "active" ? "suspended" : "active" }),
                    partner.status === "active" ? "عُلّق المسوّق" : "أُعيد تفعيله")}>
                  {partner.status === "active" ? "تعليق" : "تفعيل"}
                </button>
                <button className="icon-button" disabled={busy} aria-label="حذف"
                  onClick={() => void run(() => partnersApi.deletePartner(partner.id), "حُذف المسوّق")}><Trash2 /></button>
              </div>
            </article>
          ))}
          {!partners.length && <p className="owner-hint">لا مسوّقين بعد.</p>}
        </div>
      </section>

      {/* ------------------------------------------------ الشركات */}
      <section className="surface-strong owner-block">
        <SectionTitle title="الشركات" icon={<Building2 />} meta={`${clients.length}`} />
        <div className="owner-form">
          <label>اسم الشركة<input value={clientForm.name} onChange={e => setClientForm(v => ({ ...v, name: e.target.value }))} /></label>
          <label>النشاط<input value={clientForm.sector} onChange={e => setClientForm(v => ({ ...v, sector: e.target.value }))} /></label>
          <label>المسوّق
            <select value={clientForm.partnerId} onChange={e => setClientForm(v => ({ ...v, partnerId: e.target.value }))}>
              <option value="">— بيع مباشر —</option>
              {partners.map(partner => <option key={partner.id} value={partner.id}>{partner.name}</option>)}
            </select>
          </label>
          <label>الدورة
            <select value={clientForm.cycle} onChange={e => setClientForm(v => ({ ...v, cycle: e.target.value as BillingCycle }))}>
              {CYCLES.map(cycle => <option key={cycle} value={cycle}>{CYCLE_AR[cycle]}</option>)}
            </select>
          </label>
          <label>قيمة الدورة ({currency})<input inputMode="decimal" value={clientForm.contractValue}
            onChange={e => setClientForm(v => ({ ...v, contractValue: e.target.value }))} /></label>
          <label>الحالة
            <select value={clientForm.status} onChange={e => setClientForm(v => ({ ...v, status: e.target.value as ClientStatus }))}>
              {STATUSES.map(status => <option key={status} value={status}>{CLIENT_STATUS_AR[status]}</option>)}
            </select>
          </label>
          <label>بداية العقد<input type="date" value={clientForm.startedAt} onChange={e => setClientForm(v => ({ ...v, startedAt: e.target.value }))} /></label>
          <label>نهاية العقد<input type="date" value={clientForm.endsAt} onChange={e => setClientForm(v => ({ ...v, endsAt: e.target.value }))} /></label>
          <label>مسؤول التواصل<input value={clientForm.contactName} onChange={e => setClientForm(v => ({ ...v, contactName: e.target.value }))} /></label>
          <label>هاتفه<input value={clientForm.contactPhone} onChange={e => setClientForm(v => ({ ...v, contactPhone: e.target.value }))} /></label>
          <label className="owner-wide">عنوان النشر<input value={clientForm.deploymentUrl}
            onChange={e => setClientForm(v => ({ ...v, deploymentUrl: e.target.value }))} placeholder="https://..." /></label>
        </div>
        <div className="owner-actions">
          <button className="btn-primary" disabled={busy || !clientForm.name} onClick={() => void saveClient()}>
            <Plus /> {clientForm.id ? "احفظ التعديل" : "أضف شركة"}
          </button>
          {clientForm.id && <button className="btn-secondary" onClick={() => setClientForm(v => ({ ...v, id: "", name: "" }))}>إلغاء التحرير</button>}
        </div>

        <div className="partner-rows">
          {clients.map(client => (
            <article key={client.id}>
              <div className="partner-identity">
                <strong>{client.name}</strong>
                <small>{client.sector || "—"} · {partners.find(p => p.id === client.partnerId)?.name || "بيع مباشر"}</small>
                <small className="partner-terms">
                  {CYCLE_AR[client.cycle]} · {money(client.contractValue, client.currency)} · {shortDate(client.startedAt)} → {shortDate(client.endsAt)}
                </small>
              </div>
              <div className="partner-figures">
                <span className={`client-badge status-${client.status}`}>{CLIENT_STATUS_AR[client.status]}</span>
              </div>
              <div className="partner-actions">
                <button className="btn-secondary" onClick={() => setClientForm({
                  id: client.id, name: client.name, sector: client.sector, contactName: client.contactName,
                  contactEmail: client.contactEmail, contactPhone: client.contactPhone,
                  partnerId: client.partnerId || "", cycle: client.cycle,
                  contractValue: fromMinor(client.contractValue, client.currency),
                  startedAt: forInput(client.startedAt), endsAt: forInput(client.endsAt),
                  status: client.status, deploymentUrl: client.deploymentUrl, notes: client.notes,
                })}>تحرير</button>
                <button className="icon-button" disabled={busy} aria-label="حذف"
                  onClick={() => void run(() => partnersApi.deleteClient(client.id), "حُذفت الشركة")}><Trash2 /></button>
              </div>
            </article>
          ))}
          {!clients.length && <p className="owner-hint">لا شركات بعد.</p>}
        </div>
      </section>

      {/* ------------------------------------------------ الدفع */}
      <section className="surface-strong owner-block">
        <SectionTitle title="عمولات مستحقّة" icon={<HandCoins />} meta={`${unpaid.length}`} />
        {!unpaid.length ? (
          <p className="owner-hint">لا عمولات مستحقّة غير مدفوعة.</p>
        ) : (
          <>
            <div className="commission-rows">
              {unpaid.map(commission => {
                const checked = selected.includes(commission.id);
                return (
                  <label key={commission.id} className={`commission-row ${checked ? "is-selected" : ""}`}>
                    <input type="checkbox" checked={checked}
                      onChange={e => setSelected(list => e.target.checked ? [...list, commission.id] : list.filter(id => id !== commission.id))} />
                    <span>{partners.find(p => p.id === commission.partnerId)?.name || "—"}</span>
                    <span>{clients.find(c => c.id === commission.clientId)?.name || "—"}</span>
                    <span>{shortDate(commission.periodStart)}</span>
                    <span className="mono">{money(commission.amount, commission.currency)}</span>
                    <span><i className="ledger-badge tone-amber">{COMMISSION_STATUS_AR[commission.status]}</i></span>
                    <button type="button" className="icon-button" aria-label="إلغاء"
                      onClick={event => { event.preventDefault(); void run(() => partnersApi.voidCommission(commission.id, "إلغاء بقرار المالك"), "أُلغيت العمولة"); }}><X /></button>
                  </label>
                );
              })}
            </div>
            <div className="owner-form">
              <label>مرجع الدفع<input value={reference} onChange={e => setReference(e.target.value)} placeholder="رقم الحوالة" /></label>
            </div>
            <div className="owner-actions">
              <button className="btn-primary" disabled={busy || !selected.length}
                onClick={() => void run(async () => { await partnersApi.payCommissions(selected, reference); setSelected([]); setReference(""); },
                  "سُجّل دفع العمولات")}>
                <Wallet /> سجّل دفع {selected.length ? `(${selected.length})` : ""}
              </button>
              <button className="btn-secondary" disabled={busy}
                onClick={() => setSelected(unpaid.map(commission => commission.id))}>حدّد الكل</button>
            </div>
            <p className="owner-hint">
              <AlertTriangle /> الدفع لا يُلغى بعد تسجيله — العمولة المدفوعة لا تُلغى، وتُسوّى باتفاق مكتوب إن لزم.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
