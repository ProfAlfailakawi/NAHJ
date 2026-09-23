import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/*
 * حراسة على دفتر المسوّقين.
 *
 * أخطر ما هنا ليس صحّة حساب عمولة — بل **العزل**. المسوّق طرفٌ خارجي: يرى شركاته
 * وعمولته، ولا يرى شركات زميله ولا إجمالي إيراد المالك ولا بيانةً تشغيلية واحدة
 * من داخل أي مؤسسة. وخرقُ ذلك يُسرّب بيانات عميلٍ إلى وسيط.
 *
 * ويليه في الخطورة ازدواج الاستحقاق: التوليد يُنادى دورياً وعند كل فتح للوحة،
 * فإن لم يكن مُعاد التنفيذ بلا ضرر تضاعف ما على المالك كلما نُظر إلى الشاشة.
 */

import {
  accrueCommissions, computeCommission, deleteClient, deletePartner, ensurePartnerSchema,
  getPartnerByAccount, listClients, listCommissions, partnerOverview, partnerPortal,
  payCommissions, resetPartnerSchemaCache, upsertClient, upsertPartner, voidCommission,
} from "./partners.ts";
import { addMonths, ensureBillingSchema, resetBillingSchemaCache } from "./billing.ts";
import { closeDatabase } from "./persistence.ts";

function freshDatabase() {
  closeDatabase();
  resetPartnerSchemaCache();
  resetBillingSchemaCache();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nahj-partners-"));
  process.env.NAHJ_DATABASE_PATH = path.join(directory, "p.sqlite");
  ensureBillingSchema();
  ensurePartnerSchema();
}

const monthsAgo = (months: number) => addMonths(new Date().toISOString(), -months);

const percentPartner = (over: Record<string, unknown> = {}) =>
  upsertPartner({ name: "مسوّق النسبة", email: "pct@nahj.test", model: "percent_of_contract", rateBps: 1_500, ...over });

/* ------------------------------------------------------ حساب العمولة */

test("النسبة تُحتسب من قيمة العقد بالنقاط الأساسية", () => {
  freshDatabase();
  const partner = percentPartner();               // 15%
  assert.equal(computeCommission(partner, 1_000_000, 0), 150_000);
  assert.equal(computeCommission(partner, 1_000_000, 5), 150_000, "النسبة تتكرّر كل دورة");
});

test("المبلغ المقطوع مرة واحدة لا يتكرّر", () => {
  freshDatabase();
  const partner = upsertPartner({ name: "مقطوع", email: "once@nahj.test", model: "fixed_once", fixedAmount: 300_000 });
  assert.equal(computeCommission(partner, 9_999_999, 0), 300_000);
  assert.equal(computeCommission(partner, 9_999_999, 1), 0, "تكرّر المبلغ المقطوع");
});

test("المقطوع لكل دورة يتكرّر ولا يتأثر بقيمة العقد", () => {
  freshDatabase();
  const partner = upsertPartner({ name: "دوري", email: "cyc@nahj.test", model: "fixed_per_cycle", fixedAmount: 50_000 });
  assert.equal(computeCommission(partner, 100, 0), 50_000);
  assert.equal(computeCommission(partner, 9_000_000, 3), 50_000);
});

test("اتفاقٌ بلا قيمة يُرفض عند الإنشاء", () => {
  freshDatabase();
  assert.throws(() => upsertPartner({ name: "بلا", email: "z@nahj.test", model: "percent_of_contract", rateBps: 0 }), /النسبة/);
  assert.throws(() => upsertPartner({ name: "بلا", email: "z2@nahj.test", model: "fixed_per_cycle", fixedAmount: 0 }), /المبلغ/);
});

test("بريد المسوّق فريد", () => {
  freshDatabase();
  percentPartner();
  assert.throws(() => upsertPartner({ name: "آخر", email: "pct@nahj.test", model: "fixed_once", fixedAmount: 1 }), /مسجَّل لمسوّق آخر/);
});

/* --------------------------------------------------- توليد الاستحقاق */

test("الاستحقاق يُولَّد عن الدورات المنقضية وحدها", () => {
  freshDatabase();
  const partner = percentPartner();
  upsertClient({
    name: "شركة أ", partnerId: partner.id, cycle: "monthly",
    contractValue: 400_000, startedAt: monthsAgo(3),
    endsAt: addMonths(new Date().toISOString(), 9),
  });

  accrueCommissions();
  const commissions = listCommissions({ partnerId: partner.id });
  /* ثلاثة أشهر مضت ⇒ ثلاث أو أربع دورات حسب اليوم، لا اثنتا عشرة. */
  assert.ok(commissions.length >= 3 && commissions.length <= 4, `وُلّد ${commissions.length} استحقاقاً`);
  assert.ok(commissions.every(commission => commission.amount === 60_000), "قيمة الاستحقاق لا تطابق 15%");
  assert.ok(commissions.every(commission => commission.periodStart <= new Date().toISOString()),
    "وُلّد استحقاق عن دورة لم تبدأ بعد");
});

test("إعادة التوليد لا تُضاعف الاستحقاق", () => {
  freshDatabase();
  const partner = percentPartner();
  upsertClient({ name: "شركة ب", partnerId: partner.id, cycle: "monthly", contractValue: 100_000, startedAt: monthsAgo(4) });

  accrueCommissions();
  const first = listCommissions({ partnerId: partner.id }).length;
  accrueCommissions(); accrueCommissions(); accrueCommissions();
  const after = listCommissions({ partnerId: partner.id }).length;

  assert.equal(after, first, "تضاعف الدفتر بإعادة التوليد — كل فتح للوحة يزيد ما على المالك");
});

test("مدّة الاستحقاق تُوقف العمولة بعد انقضائها", () => {
  freshDatabase();
  const partner = upsertPartner({
    name: "محدود", email: "lim@nahj.test", model: "percent_of_contract", rateBps: 1_000, durationMonths: 6,
  });
  upsertClient({ name: "شركة ج", partnerId: partner.id, cycle: "monthly", contractValue: 100_000, startedAt: monthsAgo(24) });

  accrueCommissions();
  const commissions = listCommissions({ partnerId: partner.id });
  assert.ok(commissions.length <= 6, `استُحقّ ${commissions.length} رغم حدّ ستة أشهر`);
  assert.ok(commissions.length >= 5, "لم يُستحقّ شيء رغم انقضاء المدّة داخل الحدّ");
});

test("شركة بلا مسوّق أو مسوّق موقوف لا تُنتج عمولة", () => {
  freshDatabase();
  const partner = percentPartner();
  upsertClient({ name: "مباشرة", partnerId: null, cycle: "monthly", contractValue: 500_000, startedAt: monthsAgo(3) });
  upsertClient({ name: "موقوفة", partnerId: partner.id, cycle: "monthly", contractValue: 500_000, startedAt: monthsAgo(3) });
  upsertPartner({ name: "مسوّق النسبة", email: "pct@nahj.test", model: "percent_of_contract", rateBps: 1_500, status: "suspended" }, partner.id);

  accrueCommissions();
  assert.equal(listCommissions().length, 0, "وُلّدت عمولة لمسوّق موقوف أو لبيع مباشر");
});

test("شركةٌ محتملة أو منتهية لا تُنتج عمولة", () => {
  freshDatabase();
  const partner = percentPartner();
  upsertClient({ name: "محتملة", partnerId: partner.id, contractValue: 500_000, startedAt: monthsAgo(3), status: "prospect" });
  upsertClient({ name: "منتهية", partnerId: partner.id, contractValue: 500_000, startedAt: monthsAgo(3), status: "churned" });
  accrueCommissions();
  assert.equal(listCommissions().length, 0);
});

/* ---------------------------------------------------------- الدفع */

test("الدفع يُعلّم ولا يُكرَّر", () => {
  freshDatabase();
  const partner = percentPartner();
  upsertClient({ name: "شركة د", partnerId: partner.id, cycle: "monthly", contractValue: 200_000, startedAt: monthsAgo(2) });
  accrueCommissions();

  const ids = listCommissions({ partnerId: partner.id }).map(commission => commission.id);
  const first = payCommissions(ids, "TRF-1001");
  assert.equal(first.paid, ids.length);

  /* الدفع ثانيةً لا يدفع شيئاً — وإلا صُرف المبلغ مرتين. */
  const second = payCommissions(ids, "TRF-1002");
  assert.equal(second.paid, 0, "دُفعت العمولة مرتين");
  assert.equal(second.amount, 0);
});

test("المستحقّ = المُستحَقّ ناقص المدفوع", () => {
  freshDatabase();
  const partner = percentPartner();
  upsertClient({ name: "شركة هـ", partnerId: partner.id, cycle: "monthly", contractValue: 100_000, startedAt: monthsAgo(3) });
  accrueCommissions();

  const before = partnerPortal(partner.id)!.totals;
  assert.equal(before.paid, 0);
  assert.equal(before.due, before.accrued);

  const ids = listCommissions({ partnerId: partner.id }).slice(0, 1).map(commission => commission.id);
  payCommissions(ids, "TRF-2002");

  const after = partnerPortal(partner.id)!.totals;
  assert.equal(after.paid, 15_000);
  assert.equal(after.due, after.accrued - after.paid);
});

test("العمولة الملغاة تخرج من الحساب، والمدفوعة لا تُلغى", () => {
  freshDatabase();
  const partner = percentPartner();
  upsertClient({ name: "شركة و", partnerId: partner.id, cycle: "monthly", contractValue: 100_000, startedAt: monthsAgo(3) });
  accrueCommissions();

  const commissions = listCommissions({ partnerId: partner.id });
  const accruedBefore = partnerPortal(partner.id)!.totals.accrued;

  voidCommission(commissions[0].id, "اتفاق تسوية");
  assert.ok(partnerPortal(partner.id)!.totals.accrued < accruedBefore, "الملغاة ما زالت تُحتسب");

  payCommissions([commissions[1].id], "TRF-3003");
  assert.throws(() => voidCommission(commissions[1].id, "تراجع"), /مدفوعة/);
});

/* ------------------------------------------- العزل: أخطر ما يُحرَس */

test("لوحة المسوّق لا تحمل شركات غيره ولا عمولاته", () => {
  freshDatabase();
  const first = upsertPartner({ name: "الأول", email: "a@nahj.test", model: "percent_of_contract", rateBps: 1_000 });
  const second = upsertPartner({ name: "الثاني", email: "b@nahj.test", model: "percent_of_contract", rateBps: 2_000 });

  upsertClient({ name: "شركة الأول", partnerId: first.id, contractValue: 100_000, startedAt: monthsAgo(2) });
  upsertClient({ name: "شركة الثاني", partnerId: second.id, contractValue: 900_000, startedAt: monthsAgo(2) });
  accrueCommissions();

  const portal = partnerPortal(first.id)!;
  assert.equal(portal.clients.length, 1);
  assert.equal(portal.clients[0].name, "شركة الأول");
  assert.ok(portal.commissions.every(commission => commission.partnerId === first.id), "تسرّبت عمولة زميل");

  const serialized = JSON.stringify(portal);
  assert.ok(!serialized.includes("شركة الثاني"), "تسرّب اسم شركة زميل إلى لوحة المسوّق");
  assert.ok(!serialized.includes("الثاني"), "تسرّب اسم مسوّق زميل");
});

test("لوحة المسوّق لا تحمل إجمالي إيراد المالك ولا ملاحظاته", () => {
  freshDatabase();
  const partner = upsertPartner({
    name: "وسيط", email: "w@nahj.test", model: "percent_of_contract", rateBps: 1_000,
    notes: "ملاحظة المالك: يتأخر في المتابعة",
  });
  upsertClient({ name: "شركة", partnerId: partner.id, contractValue: 100_000, startedAt: monthsAgo(2) });
  accrueCommissions();

  const portal = partnerPortal(partner.id)!;
  const serialized = JSON.stringify(portal);

  assert.ok(!("notes" in portal.partner), "ملاحظات المالك على المسوّق وصلت إلى المسوّق");
  assert.ok(!serialized.includes("يتأخر في المتابعة"));
  assert.ok(!serialized.includes("contractedValue"), "إجمالي العقود — رقم المالك — تسرّب إلى اللوحة");
});

test("ربط الحساب هو أساس العزل، ولا يُشارَك بين مسوّقَين", () => {
  freshDatabase();
  const first = upsertPartner({ name: "الأول", email: "a@nahj.test", model: "fixed_once", fixedAmount: 1, accountId: "acc_1" });
  upsertPartner({ name: "الثاني", email: "b@nahj.test", model: "fixed_once", fixedAmount: 1, accountId: "acc_2" });

  assert.equal(getPartnerByAccount("acc_1")?.id, first.id);
  assert.equal(getPartnerByAccount("acc_unknown"), undefined, "حسابٌ غير مرتبط وجد لوحةً");
});

test("الحارس يمنع المسوّق من كل سطح تشغيلي", async () => {
  const { confinePartners } = await import("./partnerRoutes.ts");
  const attempts = ["/skills", "/work", "/audit", "/analytics", "/governance", "/billing/subscription", "/sectors"];
  for (const path of attempts) {
    let passed = false;
    let status = 0;
    confinePartners(
      { account: { role: "partner" }, path } as never,
      { status: (code: number) => { status = code; return { json: () => undefined }; } } as never,
      () => { passed = true; },
    );
    assert.equal(passed, false, `المسوّق بلغ ${path}`);
    assert.equal(status, 403);
  }

  /* ولوحته تمرّ. */
  let reached = false;
  confinePartners({ account: { role: "partner" }, path: "/partners/me" } as never, {} as never, () => { reached = true; });
  assert.equal(reached, true, "المسوّق لا يبلغ لوحته");

  /* ومن ليس مسوّقاً لا يمسّه الحارس. */
  let ownerReached = false;
  confinePartners({ account: { role: "owner" }, path: "/skills" } as never, {} as never, () => { ownerReached = true; });
  assert.equal(ownerReached, true);
});

/* --------------------------------------------------- دفتر المالك */

test("دفتر المالك يجمع الكل ويفصل مجاميع كل مسوّق", () => {
  freshDatabase();
  const first = upsertPartner({ name: "الأول", email: "a@nahj.test", model: "percent_of_contract", rateBps: 1_000 });
  const second = upsertPartner({ name: "الثاني", email: "b@nahj.test", model: "percent_of_contract", rateBps: 2_000 });
  upsertClient({ name: "شركة ١", partnerId: first.id, contractValue: 100_000, startedAt: monthsAgo(2) });
  upsertClient({ name: "شركة ٢", partnerId: second.id, contractValue: 100_000, startedAt: monthsAgo(2) });

  const overview = partnerOverview();
  assert.equal(overview.partners.length, 2);
  assert.equal(overview.clients.length, 2);
  assert.equal(overview.partners.find(p => p.id === first.id)!.clientCount, 1);
  /* والثاني نسبته ضعف الأول على نفس القيمة. */
  const firstTotals = overview.partners.find(p => p.id === first.id)!.totals;
  const secondTotals = overview.partners.find(p => p.id === second.id)!.totals;
  assert.equal(secondTotals.accrued, firstTotals.accrued * 2);
  assert.equal(overview.contractedValue, 200_000);
});

test("لا يُحذف مسوّق تحته شركات ولا شركة عليها عمولات مدفوعة", () => {
  freshDatabase();
  const partner = percentPartner();
  const client = upsertClient({ name: "شركة", partnerId: partner.id, contractValue: 100_000, startedAt: monthsAgo(2) });
  accrueCommissions();

  assert.throws(() => deletePartner(partner.id), /شركة/);

  payCommissions(listCommissions({ clientId: client.id }).map(c => c.id), "TRF-9");
  assert.throws(() => deleteClient(client.id), /مدفوعة/);
});

test("نقل شركة إلى مسوّق آخر لا يمحو استحقاق الأول", () => {
  freshDatabase();
  const first = upsertPartner({ name: "الأول", email: "a@nahj.test", model: "percent_of_contract", rateBps: 1_000 });
  const second = upsertPartner({ name: "الثاني", email: "b@nahj.test", model: "percent_of_contract", rateBps: 1_000 });
  const client = upsertClient({ name: "شركة", partnerId: first.id, cycle: "monthly", contractValue: 100_000, startedAt: monthsAgo(3) });
  accrueCommissions();
  const earned = listCommissions({ partnerId: first.id }).length;
  assert.ok(earned > 0);

  upsertClient({ name: "شركة", partnerId: second.id }, client.id);
  accrueCommissions();

  /* ما استُحقّ للأول يبقى — عملٌ أُنجز لا يُمحى بنقل لاحق. */
  assert.equal(listCommissions({ partnerId: first.id }).length, earned, "مُحي استحقاق المسوّق الأول بنقل الشركة");
  assert.ok(listClients({ partnerId: second.id }).length === 1);
});

test("تعليق مسوّق بإرسال الحالة وحدها يعمل — ولا يمحو اتفاقه", () => {
  /*
   * سقط هذا في مراجعة: زرّ التعليق في الشاشة يُرسل `{ status }` وحده، وكان
   * الفحص يقرأ الاسم فارغاً فيردّ «اسم المسوّق غير صالح». أي أن الزرّ المعروض
   * لا يعمل، ولا يملك المالك تعليق مسوّقٍ من مكانه الطبيعي.
   */
  freshDatabase();
  const partner = upsertPartner({
    name: "بدر عادل", email: "badr@example.com",
    model: "percent_of_contract", rateBps: 1_500, durationMonths: 12, notes: "اتفاق 2026",
  });

  const suspended = upsertPartner({ status: "suspended" } as any, partner.id);
  assert.equal(suspended.status, "suspended");
  assert.equal(suspended.name, "بدر عادل", "مُحي الاسم في تعديلٍ جزئي");
  assert.equal(suspended.email, "badr@example.com");
  assert.equal(suspended.rateBps, 1_500, "ضاعت النسبة المتّفق عليها");
  assert.equal(suspended.durationMonths, 12);
  assert.equal(suspended.notes, "اتفاق 2026");

  const reactivated = upsertPartner({ status: "active" } as any, partner.id);
  assert.equal(reactivated.status, "active");
  assert.equal(reactivated.rateBps, 1_500);
});
