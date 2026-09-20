import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/*
 * حراسة على التصدير والنسخ.
 *
 * وما يُختبر هنا ثلاثة، كلٌّ منها يُكتشف متأخراً لو انكسر:
 *
 *   ١. خليةُ CSV تبدأ بـ`=` تُنفَّذ صيغةً في إكسل عند الفتح. فمن يكتب اسماً
 *      يبدأ بها يُنفّذ عند كل من يفتح الملف — وهو حقنٌ عبر ملفٍ نحن أصدرناه.
 *   ٢. التصدير يجب ألّا يحمل سرّاً: كلمة مرور أو رمز جلسة أو مفتاح مزوّد.
 *   ٣. النسخة يجب أن تكون قاعدةً سليمة تُفتح وتُقرأ — لا ملفاً يبدو سليماً
 *      ويُكتشف تلفه يوم يُحتاج.
 */

import {
  backupDirectory, backupStatus, buildFullExport, buildLedgerCsv, csvCell, listBackups, runBackup, toCsv,
} from "./archive.ts";
import { closeDatabase, openDatabase } from "./persistence.ts";
import { ensureBillingSchema, issueInvoice, recordPayment, resetBillingSchemaCache, seedDefaultPlans } from "./billing.ts";
import { resetPaymentSchemaCache } from "./payments.ts";
import { resetPartnerSchemaCache } from "./partners.ts";
import { DatabaseSync } from "node:sqlite";

function freshDatabase() {
  closeDatabase();
  resetBillingSchemaCache();
  resetPaymentSchemaCache();
  resetPartnerSchemaCache();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nahj-archive-"));
  process.env.NAHJ_DATABASE_PATH = path.join(directory, "nahj.sqlite");
  process.env.NAHJ_BACKUP_DIR = path.join(directory, "backups");
  ensureBillingSchema();
  seedDefaultPlans();
  return directory;
}

/* ------------------------------------------------------------- CSV */

test("خليةٌ تبدأ برمز صيغة لا تُنفَّذ عند فتح الملف", () => {
  /*
   * `=cmd|' /c calc'!A1` هو الشكل المعروف لهذا الهجوم. والهروب بفاصلة عليا
   * يجعل إكسل تقرؤه نصاً، ويبقى المحتوى مقروءاً لمن يفتح الملف.
   */
  assert.equal(csvCell("=1+1"), '"\'=1+1"');
  assert.equal(csvCell("+SUM(A1)"), '"\'+SUM(A1)"');
  assert.equal(csvCell("-2"), '"\'-2"');
  assert.equal(csvCell("@import"), '"\'@import"');
  assert.equal(csvCell("=cmd|' /c calc'!A1"), `"'=cmd|' /c calc'!A1"`);

  /* والنصّ العادي يبقى كما هو، والاقتباس يُضاعَف لا يُحذف. */
  assert.equal(csvCell("مؤسسة الغد"), '"مؤسسة الغد"');
  assert.equal(csvCell('قال "نعم"'), '"قال ""نعم"""');
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(1_500), '"1500"');
});

test("الملف يبدأ بعلامة الترتيب فتقرأ إكسل العربية سليمة", () => {
  const csv = toCsv(["الاسم"], [["مؤسسة"]]);
  assert.ok(csv.startsWith("﻿"), "بلا BOM تُعرض العربية مشوّهة في إكسل");
  assert.ok(csv.includes("\r\n"), "CSV يفصل بسطرٍ كاملٍ لا بسطرٍ ناقص");
});

test("دفاتر CSV تُبنى من الحالة الفعلية", () => {
  freshDatabase();
  const invoice = issueInvoice({
    currency: "KWD",
    lines: [{ description: "اشتراك", quantity: 1, unitAmount: 149_000, amount: 149_000 }],
  });
  recordPayment({ invoiceId: invoice.id, amount: 149_000, currency: "KWD", reference: "TRF-9" });

  const invoices = buildLedgerCsv("invoices");
  assert.ok(invoices.includes(invoice.number), "الفاتورة غير موجودة في دفترها");
  assert.ok(invoices.includes("149000"), "المبلغ يُصدَّر بالوحدة الصغرى كما يُخزَّن");

  const payments = buildLedgerCsv("payments");
  assert.ok(payments.includes("TRF-9"), "المرجع مفقود — ولا تُطابَق دفعةٌ بلا مرجع");

  /* ودفاتر التشغيل تُبنى من المخزن الحيّ لا من بذرة. */
  assert.ok(buildLedgerCsv("skills").split("\r\n").length > 1);
});

/* ------------------------------------------------------- التصدير */

test("التصدير لا يحمل كلمة مرور ولا رمز جلسة ولا مفتاح مزوّد", () => {
  freshDatabase();
  process.env.NAHJ_PAYMENT_API_KEY = "SECRET-PROVIDER-KEY";

  const serialized = JSON.stringify(buildFullExport({ includeOwnerLedgers: true }));

  assert.ok(!serialized.includes("SECRET-PROVIDER-KEY"), "خرج مفتاح المزوّد في التصدير");
  for (const marker of ["passwordHash", "password_hash", "csrf_hash", "token_hash", "sessionToken"]) {
    assert.ok(!serialized.includes(marker), `خرج سرٌّ في التصدير: ${marker}`);
  }
  delete process.env.NAHJ_PAYMENT_API_KEY;
});

test("دفاتر المالك لا تخرج في تصدير المؤسسة", () => {
  freshDatabase();
  const institution = buildFullExport({ includeOwnerLedgers: false }) as Record<string, unknown>;
  const owner = buildFullExport({ includeOwnerLedgers: true }) as Record<string, unknown>;

  assert.equal(institution.owner, undefined, "خرجت عقود المسوّقين في تصدير المؤسسة");
  assert.ok(owner.owner, "لم تخرج دفاتر المالك في تصديره هو");
  /* والمشترك بينهما هو بيانات المؤسسة نفسها. */
  assert.ok((institution as any).operations.skills);
  assert.ok((institution as any).billing.invoices);
});

/* -------------------------------------------------- النسخ الاحتياطي */

test("النسخة قاعدةٌ سليمة تُفتح وتُقرأ — لا ملفٌّ يبدو سليماً", () => {
  /*
   * نسخُ ملف SQLite بينما يُكتب إليه يُنتج ملفاً حجمه صحيح وبنيته تالفة،
   * ولا يُكتشف ذلك إلا يوم يُحتاج. `VACUUM INTO` يكتب قاعدةً متّسقة، وهذا
   * الفحص يُثبت الأمر بفتح النسخة والقراءة منها.
   */
  freshDatabase();
  const invoice = issueInvoice({
    currency: "KWD",
    lines: [{ description: "اشتراك", quantity: 1, unitAmount: 95_000, amount: 95_000 }],
  });

  const result = runBackup();
  assert.equal(result.ok, true, `تعذّرت النسخة: ${result.reason}`);
  assert.ok(result.file && fs.existsSync(result.file.path), "لا ملف على القرص");
  assert.ok(result.file!.sizeBytes > 0);

  /* تُفتح النسخة كقاعدةٍ مستقلة ويُقرأ منها الصفّ نفسه. */
  const copy = new DatabaseSync(result.file!.path, { readOnly: true });
  const row = copy.prepare("SELECT number FROM billing_invoices WHERE id = ?").get(invoice.id) as { number?: string } | undefined;
  copy.close();
  assert.equal(row?.number, invoice.number, "النسخة لا تحمل ما كان في القاعدة");
});

test("الاحتفاظ يحذف الأقدم ولا يمسّ الأحدث", () => {
  const directory = freshDatabase();
  process.env.NAHJ_BACKUP_KEEP = "2";

  /* نسخٌ قديمة مفتعلة، ثم نسخةٌ حقيقية تُشغّل التقليم. */
  fs.mkdirSync(backupDirectory(), { recursive: true });
  for (const stamp of ["2020-01-01", "2020-01-02", "2020-01-03"]) {
    fs.writeFileSync(path.join(backupDirectory(), `nahj-${stamp}T00-00-00-000Z.sqlite`), "x");
  }
  const result = runBackup();

  assert.equal(result.ok, true);
  const remaining = listBackups();
  assert.equal(remaining.length, 2, `بقي ${remaining.length} نسخة والاحتفاظ 2`);
  assert.equal(remaining[0].name, result.file!.name, "حُذفت النسخة الجديدة بدل القديمة");
  assert.ok(!remaining.some(file => file.name.includes("2020-01-01")), "لم يُحذف الأقدم");

  delete process.env.NAHJ_BACKUP_KEEP;
  fs.rmSync(directory, { recursive: true, force: true });
});

test("قاعدةٌ في الذاكرة تُقال إنها لا تُنسخ بدل أن يُزعم نجاح", () => {
  closeDatabase();
  resetBillingSchemaCache();
  process.env.NAHJ_DATABASE_PATH = ":memory:";
  openDatabase();

  const result = runBackup();
  assert.equal(result.ok, false);
  assert.match(String(result.reason), /الذاكرة/);
});

test("حالة النسخ لا تكشف مسارات الخادم الكاملة للملفات", () => {
  freshDatabase();
  runBackup();
  const status = backupStatus();
  assert.ok(status.latest, "لا نسخة لتُفحص");
  assert.equal((status.latest as Record<string, unknown>).path, undefined, "خرج مسار الملف الكامل إلى الواجهة");
  assert.ok(status.latest!.name.startsWith("nahj-"));
});
