import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHmac } from "node:crypto";

/*
 * حراسة انحدار على بوابة الدفع.
 *
 * المال يعبر هنا، فالخطأ لا يُكلّف شاشةً مشوّهة بل فاتورةً سُدِّدت مرتين أو
 * تُعدّ مسدّدة ولم يصل فلس. وما يُختبر هو ما يسقط فعلاً في تكاملات الدفع:
 *
 *   ١. بوابةٌ غير مضبوطة لا تخترع رابطاً.
 *   ٢. إشعارٌ بلا توقيعٍ صحيح لا يُقرأ منه شيء.
 *   ٣. جسم الإشعار ليس مصدر حقيقة عن المال — يُسأل المزوّد.
 *   ٤. الإشعار المكرّر لا يُسجّل دفعتين (وهم يُعيدون الإرسال حتى يستلموا 200).
 *   ٥. مبلغٌ أو عملةٌ مخالفة تُوقف التسجيل ولا تمرّ بصمت.
 *   ٦. المبلغ يُشتق في الخادم لا يُقبل من الطلب.
 *   ٧. الدينار الكويتي ثلاث منازل — وهذا ما يكسر أكثر التكاملات المستوردة.
 */

import {
  createCheckout, findIntentByRef, gatewayStatus, handleWebhook, remainingOn,
  resetPaymentSchemaCache, setPaymentTransport, settleByReference, settleIntent,
  toMajorString, toMinorAmount, type Transport,
} from "./payments.ts";
import {
  ensureBillingSchema, getInvoice, issueInvoice, listPayments, recordPayment,
  resetBillingSchemaCache, seedDefaultPlans, voidInvoice,
} from "./billing.ts";
import { closeDatabase } from "./persistence.ts";

const SECRET = "webhook-secret-for-tests";

function freshDatabase() {
  closeDatabase();
  resetBillingSchemaCache();
  resetPaymentSchemaCache();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nahj-payments-"));
  process.env.NAHJ_DATABASE_PATH = path.join(directory, "payments.sqlite");
  ensureBillingSchema();
  seedDefaultPlans();
}

function configure(provider: "myfatoorah" | "tap" | "manual", options: { secret?: string; key?: string; url?: string } = {}) {
  process.env.NAHJ_PAYMENT_PROVIDER = provider;
  process.env.NAHJ_PAYMENT_API_KEY = options.key ?? "test-api-key";
  process.env.NAHJ_PAYMENT_WEBHOOK_SECRET = options.secret ?? SECRET;
  process.env.NAHJ_PUBLIC_URL = options.url ?? "https://nahj.example.com";
  process.env.NAHJ_PAYMENT_ENV = "test";
}

function unconfigure() {
  delete process.env.NAHJ_PAYMENT_PROVIDER;
  delete process.env.NAHJ_PAYMENT_API_KEY;
  delete process.env.NAHJ_PAYMENT_WEBHOOK_SECRET;
  delete process.env.NAHJ_PUBLIC_URL;
  delete process.env.NAHJ_PAYMENT_ENV;
}

/** فاتورة بـ149.000 د.ك — مبلغٌ بثلاث منازل عمداً. */
const anInvoice = (total = 149_000) => issueInvoice({
  currency: "KWD",
  lines: [{ description: "اشتراك نهج — شهري", quantity: 1, unitAmount: total, amount: total }],
});

/** ناقلٌ يسجّل ما خرج ويردّ ما يُملى عليه — لا إنترنت ولا مفتاح حقيقي. */
function stubTransport(handler: (request: { url: string; method: string; body?: string }) => { status?: number; body: unknown }) {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const transport: Transport = async request => {
    calls.push({ url: request.url, method: request.method, body: request.body });
    const result = handler(request);
    return { status: result.status ?? 200, body: typeof result.body === "string" ? result.body : JSON.stringify(result.body) };
  };
  setPaymentTransport(transport);
  return calls;
}

const myfatoorahPaid = (amount: string) => ({
  IsSuccess: true,
  Data: {
    InvoiceStatus: "Paid",
    InvoiceValue: Number(amount),
    InvoiceCurrency: "KWD",
    InvoiceTransactions: [{ TransactionStatus: "Succss", PaidCurrencyValue: amount, PaidCurrency: "KWD" }],
  },
});

const signMyfatoorah = (body: string, secret = SECRET) =>
  createHmac("sha256", secret).update(body, "utf8").digest("base64");

/* ------------------------------------------------------------- المبالغ */

test("التحويل بين الوحدة الصغرى والعشرية يحفظ منازل العملة", () => {
  assert.equal(toMajorString(149_000, "KWD"), "149.000");
  assert.equal(toMajorString(1_500, "KWD"), "1.500");
  assert.equal(toMajorString(1_500, "USD"), "15.00");
  assert.equal(toMajorString(0, "KWD"), "0.000");

  /* والعودة لا تفقد فلساً — وهنا بالضبط يخطئ من يفترض منزلتين. */
  assert.equal(toMinorAmount("149.000", "KWD"), 149_000);
  assert.equal(toMinorAmount(149.001, "KWD"), 149_001);
  assert.equal(toMinorAmount("15.00", "USD"), 1_500);
  assert.equal(toMinorAmount("0.1", "KWD"), 100);
});

/* --------------------------------------------------- بوابة غير مضبوطة */

test("بلا بوابة مضبوطة لا يُخترع رابط دفع", async () => {
  freshDatabase();
  unconfigure();

  const status = gatewayStatus();
  assert.equal(status.configured, false);
  assert.equal(status.provider, "manual");
  assert.match(status.note, /يُسجّل المالك الدفعة/, "لا يُقال للمستعمل ماذا يفعل بدل الزرّ");

  const invoice = anInvoice();
  await assert.rejects(
    () => createCheckout({ invoiceId: invoice.id }),
    (error: any) => error.code === "GATEWAY_NOT_CONFIGURED" && error.status === 409,
    "بوابة غير مضبوطة يجب أن ترفض صراحةً لا أن تُعيد رابطاً لا يعمل",
  );
});

test("مزوّد مُعلن بإعدادٍ ناقص يقول ما ينقصه ولا ينشئ عملية", async () => {
  freshDatabase();
  configure("myfatoorah", { key: "" });

  const status = gatewayStatus();
  assert.equal(status.configured, false);
  assert.ok(status.missing.some(item => /NAHJ_PAYMENT_API_KEY/.test(item)), "لم يُسمَّ الناقص");

  const invoice = anInvoice();
  await assert.rejects(() => createCheckout({ invoiceId: invoice.id }), /ناقص/);
});

/* ------------------------------------------------------ إنشاء العملية */

test("المبلغ يُشتق من المتبقّي على الفاتورة لا من الطلب", async () => {
  freshDatabase();
  configure("myfatoorah");
  const invoice = anInvoice(149_000);
  /* دفعةٌ جزئية سابقة: المتبقّي 49.000 لا 149.000. */
  recordPayment({ invoiceId: invoice.id, amount: 100_000, currency: "KWD" });

  const calls = stubTransport(() => ({ body: { IsSuccess: true, Data: { InvoiceId: "MF-1", InvoiceURL: "https://pay.example/MF-1" } } }));
  const intent = await createCheckout({ invoiceId: invoice.id, payerName: "مؤسسة" } as any);

  assert.equal(intent.amount, 49_000, "أُنشئت العملية بغير المتبقّي");
  assert.equal(intent.currency, "KWD");
  assert.equal(intent.status, "pending");
  assert.equal(intent.checkoutUrl, "https://pay.example/MF-1");

  const sent = JSON.parse(calls[0].body || "{}");
  assert.equal(sent.InvoiceValue, 49, "المبلغ المرسل للمزوّد يخالف المتبقّي");
  assert.equal(sent.DisplayCurrencyIso, "KWD");
});

test("فاتورة مسدّدة أو ملغاة لا يُنشأ لها رابط", async () => {
  freshDatabase();
  configure("myfatoorah");
  stubTransport(() => ({ body: { IsSuccess: true, Data: { InvoiceId: "MF-2", InvoiceURL: "https://pay.example/MF-2" } } }));

  const invoice = anInvoice(50_000);
  recordPayment({ invoiceId: invoice.id, amount: 50_000, currency: "KWD" });
  await assert.rejects(() => createCheckout({ invoiceId: invoice.id }), /مسدّدة بالكامل/);

  await assert.rejects(() => createCheckout({ invoiceId: "inv_does_not_exist" }), /غير موجودة/);
});

test("الضغط مرّتين لا يُخلّف عمليتين معلّقتين عند المزوّد", async () => {
  freshDatabase();
  configure("myfatoorah");
  let created = 0;
  stubTransport(() => {
    created += 1;
    return { body: { IsSuccess: true, Data: { InvoiceId: `MF-${created}`, InvoiceURL: `https://pay.example/MF-${created}` } } };
  });

  const invoice = anInvoice();
  const first = await createCheckout({ invoiceId: invoice.id });
  const second = await createCheckout({ invoiceId: invoice.id });

  assert.equal(created, 1, "أُنشئت عمليةٌ ثانية عند المزوّد بلا داعٍ");
  assert.equal(second.id, first.id);
});


test("مرجعٌ مكرّر من المزوّد لا يُسرّب خطأ قاعدة بيانات إلى الشاشة", async () => {
  /*
   * سقط هذا في تشغيلٍ حقيقي لا في فحص: مزوّدٌ أعاد المرجع نفسه، فانكسر القيد
   * الفريد ووصل نصّ خطأ SQLite إلى شاشة المشتري بدل رسالةٍ مفهومة.
   */
  freshDatabase();
  configure("myfatoorah");
  stubTransport(() => ({ body: { IsSuccess: true, Data: { InvoiceId: "SAME-REF", InvoiceURL: "https://pay.example/same" } } }));

  const first = anInvoice(30_000);
  const firstIntent = await createCheckout({ invoiceId: first.id });

  /* المرجع نفسه لنفس الفاتورة: تُعاد النيّة القائمة لا نيّةٌ ثانية. */
  const again = await createCheckout({ invoiceId: first.id });
  assert.equal(again.id, firstIntent.id);

  /* والمرجع نفسه لفاتورةٍ أخرى: رفضٌ مفهوم، لا نصّ SQLite. */
  const second = anInvoice(40_000);
  await assert.rejects(
    () => createCheckout({ invoiceId: second.id }),
    (error: any) => error.code === "PROVIDER_REF_CONFLICT" && error.status === 409 && !/SQLITE|UNIQUE constraint/i.test(error.message),
    "تسرّب خطأ القاعدة كما هو",
  );
});

/* -------------------------------------------------------- الويب-هوك */

test("إشعارٌ بلا توقيع أو بتوقيعٍ خاطئ يُرفض ولا يُسجَّل شيء", async () => {
  freshDatabase();
  configure("myfatoorah");
  stubTransport(() => ({ body: { IsSuccess: true, Data: { InvoiceId: "MF-9", InvoiceURL: "https://pay.example/MF-9" } } }));
  const invoice = anInvoice();
  await createCheckout({ invoiceId: invoice.id });

  const body = JSON.stringify({ Data: { InvoiceId: "MF-9" } });

  await assert.rejects(() => handleWebhook("myfatoorah", body, {}), (error: any) => error.status === 401);
  await assert.rejects(
    () => handleWebhook("myfatoorah", body, { "myfatoorah-signature": signMyfatoorah(body, "another-secret") }),
    (error: any) => error.code === "BAD_SIGNATURE",
    "توقيعٌ بسرٍّ آخر يجب أن يُرفض",
  );
  /* ولا حتى بتوقيعٍ صحيح على جسمٍ آخر. */
  await assert.rejects(
    () => handleWebhook("myfatoorah", body, { "myfatoorah-signature": signMyfatoorah(JSON.stringify({ Data: { InvoiceId: "MF-8" } })) }),
    (error: any) => error.code === "BAD_SIGNATURE",
  );

  assert.equal(listPayments().length, 0, "سُجِّلت دفعة من إشعارٍ مرفوض");
  assert.equal(getInvoice(invoice.id)!.amountPaid, 0);
});

test("توقيع تاب يُحسب على حقولها المرتّبة لا على الجسم كاملاً", async () => {
  freshDatabase();
  configure("tap");
  stubTransport(() => ({ body: { id: "chg_1", transaction: { url: "https://pay.tap/chg_1", created: "1700000000000" } } }));
  const invoice = anInvoice(25_000);
  await createCheckout({ invoiceId: invoice.id });

  const payload = {
    id: "chg_1", amount: 25, currency: "KWD", status: "CAPTURED",
    reference: { gateway: "gw-1", payment: "pay-1" },
    transaction: { created: "1700000000000" },
  };
  const body = JSON.stringify(payload);
  const hash = createHmac("sha256", SECRET).update(
    `x_id${payload.id}x_amount${payload.amount}x_currency${payload.currency}x_gateway_reference${payload.reference.gateway}x_payment_reference${payload.reference.payment}x_status${payload.status}x_created${payload.transaction.created}`,
    "utf8",
  ).digest("hex");

  /* توقيعٌ محسوبٌ على الجسم كاملاً — وهو الخطأ الشائع — يُرفض. */
  await assert.rejects(
    () => handleWebhook("tap", body, { hashstring: createHmac("sha256", SECRET).update(body, "utf8").digest("hex") }),
    (error: any) => error.code === "BAD_SIGNATURE",
  );

  stubTransport(() => ({ body: { id: "chg_1", status: "CAPTURED", amount: 25, currency: "KWD" } }));
  const result = await handleWebhook("tap", body, { hashstring: hash });
  assert.equal(result.recorded, true, "رُفض إشعارٌ صحيح التوقيع");
  assert.equal(getInvoice(invoice.id)!.status, "paid");
});

test("جسم الإشعار ليس مصدر الحقيقة — تُسأل البوابة عن الحالة والمبلغ", async () => {
  freshDatabase();
  configure("myfatoorah");
  stubTransport(() => ({ body: { IsSuccess: true, Data: { InvoiceId: "MF-10", InvoiceURL: "https://pay.example/MF-10" } } }));
  const invoice = anInvoice(30_000);
  await createCheckout({ invoiceId: invoice.id });

  /* إشعارٌ يزعم السداد، والمزوّد يقول إنها ما زالت معلّقة. */
  const body = JSON.stringify({ Data: { InvoiceId: "MF-10", InvoiceStatus: "Paid", InvoiceValue: 30 } });
  const calls = stubTransport(() => ({ body: { IsSuccess: true, Data: { InvoiceStatus: "Pending", InvoiceValue: 30, InvoiceCurrency: "KWD", InvoiceTransactions: [] } } }));

  const result = await handleWebhook("myfatoorah", body, { "myfatoorah-signature": signMyfatoorah(body) });

  assert.ok(calls.some(call => /GetPaymentStatus/.test(call.url)), "لم تُسأل البوابة أصلاً");
  assert.equal(result.recorded, false, "سُجِّل السداد من كلام الإشعار وحده");
  assert.equal(getInvoice(invoice.id)!.amountPaid, 0);
});

test("الإشعار المكرّر لا يُسجّل دفعتين على فاتورة واحدة", async () => {
  freshDatabase();
  configure("myfatoorah");
  stubTransport(() => ({ body: { IsSuccess: true, Data: { InvoiceId: "MF-11", InvoiceURL: "https://pay.example/MF-11" } } }));
  const invoice = anInvoice(149_000);
  await createCheckout({ invoiceId: invoice.id });

  const body = JSON.stringify({ Data: { InvoiceId: "MF-11" } });
  const headers = { "myfatoorah-signature": signMyfatoorah(body) };
  stubTransport(() => ({ body: myfatoorahPaid("149.000") }));

  const first = await handleWebhook("myfatoorah", body, headers);
  const second = await handleWebhook("myfatoorah", body, headers);
  /* وحتى المتزامنان معاً. */
  const [third, fourth] = await Promise.all([
    handleWebhook("myfatoorah", body, headers),
    handleWebhook("myfatoorah", body, headers),
  ]);

  assert.equal(first.recorded, true);
  assert.equal(second.recorded, false);
  assert.equal(third.recorded, false);
  assert.equal(fourth.recorded, false);

  const payments = listPayments();
  assert.equal(payments.length, 1, `سُجِّلت ${payments.length} دفعات من إشعارٍ واحد مكرّر`);
  assert.equal(payments[0].amount, 149_000);
  assert.equal(payments[0].method, "knet");
  assert.equal(payments[0].reference, "MF-11", "الدفعة بلا مرجع المزوّد لا تُطابَق في التسوية البنكية");

  const settled = getInvoice(invoice.id)!;
  assert.equal(settled.amountPaid, 149_000);
  assert.equal(settled.status, "paid");
});

test("مبلغٌ محصَّلٌ مخالف يُوقف التسجيل ويُرفع للمراجعة", async () => {
  freshDatabase();
  configure("myfatoorah");
  stubTransport(() => ({ body: { IsSuccess: true, Data: { InvoiceId: "MF-12", InvoiceURL: "https://pay.example/MF-12" } } }));
  const invoice = anInvoice(149_000);
  await createCheckout({ invoiceId: invoice.id });

  /* حُصِّل 14.900 بدل 149.000 — خطأ منزلةٍ عشرية، وهو الخطأ الحقيقي المتوقع. */
  stubTransport(() => ({ body: myfatoorahPaid("14.900") }));
  const body = JSON.stringify({ Data: { InvoiceId: "MF-12" } });
  const result = await handleWebhook("myfatoorah", body, { "myfatoorah-signature": signMyfatoorah(body) });

  assert.equal(result.recorded, false);
  assert.equal(getInvoice(invoice.id)!.amountPaid, 0, "سُجِّل مبلغٌ مخالف كأنه سداد");
  const intent = findIntentByRef("myfatoorah", "MF-12")!;
  assert.equal(intent.status, "mismatch");
  assert.match(intent.failureReason, /يخالف المطلوب/);
});

test("عملةٌ مخالفة تُوقف التسجيل ولو تطابق الرقم", async () => {
  freshDatabase();
  configure("myfatoorah");
  stubTransport(() => ({ body: { IsSuccess: true, Data: { InvoiceId: "MF-13", InvoiceURL: "https://pay.example/MF-13" } } }));
  const invoice = anInvoice(100_000);
  await createCheckout({ invoiceId: invoice.id });

  stubTransport(() => ({
    body: {
      IsSuccess: true,
      Data: {
        InvoiceStatus: "Paid", InvoiceValue: 100, InvoiceCurrency: "USD",
        InvoiceTransactions: [{ TransactionStatus: "Succss", PaidCurrencyValue: "100.000", PaidCurrency: "USD" }],
      },
    },
  }));
  const body = JSON.stringify({ Data: { InvoiceId: "MF-13" } });
  const result = await handleWebhook("myfatoorah", body, { "myfatoorah-signature": signMyfatoorah(body) });

  assert.equal(result.recorded, false);
  assert.equal(getInvoice(invoice.id)!.amountPaid, 0);
  assert.match(findIntentByRef("myfatoorah", "MF-13")!.failureReason, /العملة/);
});

test("عمليةٌ فاشلة عند المزوّد تُعلَّم فاشلة ولا تمسّ الفاتورة", async () => {
  freshDatabase();
  configure("myfatoorah");
  stubTransport(() => ({ body: { IsSuccess: true, Data: { InvoiceId: "MF-14", InvoiceURL: "https://pay.example/MF-14" } } }));
  const invoice = anInvoice(40_000);
  const intent = await createCheckout({ invoiceId: invoice.id });

  stubTransport(() => ({ body: { IsSuccess: true, Data: { InvoiceStatus: "Failed", InvoiceValue: 40, InvoiceCurrency: "KWD", InvoiceTransactions: [] } } }));
  const result = await settleIntent(intent.id);

  assert.equal(result.recorded, false);
  assert.equal(result.intent.status, "failed");
  assert.equal(getInvoice(invoice.id)!.amountPaid, 0);
});

test("إشعارٌ عن عملية لا تخصّ هذا النشر يُقبل بلا كتابة", async () => {
  freshDatabase();
  configure("myfatoorah");
  const body = JSON.stringify({ Data: { InvoiceId: "MF-from-another-deployment" } });
  const result = await handleWebhook("myfatoorah", body, { "myfatoorah-signature": signMyfatoorah(body) });

  assert.equal(result.handled, false, "ردٌّ بخطأ يجعل المزوّد يُعيد الإرسال إلى الأبد");
  assert.equal(listPayments().length, 0);
});

test("إشعار مزوّدٍ غير مُفعَّل في هذا النشر يُردّ", async () => {
  freshDatabase();
  configure("myfatoorah");
  const body = JSON.stringify({ id: "chg_x" });
  await assert.rejects(() => handleWebhook("tap", body, { hashstring: "whatever" }), (error: any) => error.status === 404);
});

/* --------------------------------------------------------- رابط العودة */

test("فتح رابط العودة باليد لا يُسدِّد فاتورة", async () => {
  freshDatabase();
  configure("myfatoorah");
  stubTransport(() => ({ body: { IsSuccess: true, Data: { InvoiceId: "MF-15", InvoiceURL: "https://pay.example/MF-15" } } }));
  const invoice = anInvoice(60_000);
  const intent = await createCheckout({ invoiceId: invoice.id });

  /* المزوّد يقول: معلّقة. فالعودة لا تُغيّر شيئاً مهما كان في العنوان. */
  stubTransport(() => ({ body: { IsSuccess: true, Data: { InvoiceStatus: "Pending", InvoiceValue: 60, InvoiceCurrency: "KWD", InvoiceTransactions: [] } } }));
  const result = await settleByReference(`${invoice.number}:${intent.id}`);

  assert.equal(result?.recorded, false);
  assert.equal(getInvoice(invoice.id)!.amountPaid, 0);
  assert.equal(await settleByReference("مرجع-ملفَّق"), null);
});

test("العودة بعد سدادٍ حقيقي تُسوّي العملية مرة واحدة", async () => {
  freshDatabase();
  configure("myfatoorah");
  stubTransport(() => ({ body: { IsSuccess: true, Data: { InvoiceId: "MF-16", InvoiceURL: "https://pay.example/MF-16" } } }));
  const invoice = anInvoice(75_000);
  const intent = await createCheckout({ invoiceId: invoice.id });

  stubTransport(() => ({ body: myfatoorahPaid("75.000") }));
  const first = await settleByReference(`${invoice.number}:${intent.id}`);
  const second = await settleByReference(`${invoice.number}:${intent.id}`);

  assert.equal(first?.recorded, true);
  assert.equal(second?.recorded, false, "العودة مرتين سدّدت مرتين");
  assert.equal(listPayments().length, 1);
  assert.equal(getInvoice(invoice.id)!.status, "paid");
  assert.equal(remainingOn(getInvoice(invoice.id)!), 0);
});

/* ------------------------------------------------------ ترتيب التركيب */

test("الويب-هوك يُركَّب خارج المصادقة وقارئ JSON، والدفع قبل حارس الاشتراك", () => {
  /*
   * ثلاثة أخطاء تركيبٍ لا يكشفها فحص أنواع ولا بناء، وكلها تُسقط التحصيل:
   *   - قارئ JSON قبل الويب-هوك ⇒ يضيع الجسم الخام فيبطل التحقق من التوقيع.
   *   - المصادقة قبله ⇒ لا يصل إشعار المزوّد أصلاً (لا جلسة له).
   *   - حارس الاشتراك قبل مسار الدفع ⇒ المؤسسة المجمّدة تُمنع من السداد الذي
   *     يرفع عنها التجميد. قفلٌ لا مخرج منه.
   */
  const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
  const webhookMount = server.indexOf('app.use("/api/payments", paymentPublicRouter)');
  const jsonMount = server.indexOf("express.json(");
  const authMount = server.indexOf('app.use("/api/auth"');

  assert.ok(webhookMount > 0, "الويب-هوك غير مركَّب في الخادم");
  assert.ok(webhookMount < jsonMount, "قارئ JSON يسبق الويب-هوك فيضيع الجسم الخام");
  assert.ok(webhookMount < authMount, "المصادقة تسبق الويب-هوك فلا يصل إشعار المزوّد");

  const routes = fs.readFileSync(path.join(process.cwd(), "server", "routes.ts"), "utf8");
  const paymentsMount = routes.indexOf('apiRouter.use("/payments", paymentRouter)');
  const guardMount = routes.indexOf("apiRouter.use(enforceSubscription)");
  assert.ok(paymentsMount > 0 && paymentsMount < guardMount, "حارس الاشتراك يمنع المؤسسة المجمّدة من السداد");
});

test("لا يُعاد مفتاح ولا سرّ في حالة البوابة", () => {
  freshDatabase();
  configure("myfatoorah", { key: "SECRET-KEY-VALUE", secret: "SECRET-HOOK-VALUE" });
  const serialized = JSON.stringify(gatewayStatus());
  assert.ok(!serialized.includes("SECRET-KEY-VALUE"), "المفتاح يخرج في الحالة المعروضة");
  assert.ok(!serialized.includes("SECRET-HOOK-VALUE"), "سرّ التوقيع يخرج في الحالة المعروضة");
  assert.match(gatewayStatus().webhookUrl, /\/api\/payments\/webhook\/myfatoorah$/);
});

/* ------------------------------------------------- ذرّية التسوية */

test("فشل القيد يُعيد النيّة معلّقةً — لا «مدفوعة» بلا دفعة", async () => {
  /*
   * سقط هذا في مراجعة: المطالبة كانت تُثبَّت وحدها ثم يُسجَّل القيد بعدها. فلو
   * توقّفت العملية بينهما بقيت النيّة «مدفوعة» أبداً بلا قيد، وكل إشعارٍ لاحق
   * يخرج من الفحص المبكر — فالمال محصَّل والفاتورة مفتوحة.
   *
   * ولا يمكن إيقاف العملية داخل فحص، فيُستعمل ما يُنتج الأثر نفسه: قيدٌ يفشل
   * داخل الكتلة. والمطلوب إثباتُه واحد — ألّا يبقى أثرٌ نصفيّ.
   */
  freshDatabase();
  configure("myfatoorah");
  stubTransport(() => ({ body: { IsSuccess: true, Data: { InvoiceId: "MF-TX", InvoiceURL: "https://pay.example/MF-TX" } } }));
  const invoice = anInvoice(80_000);
  const intent = await createCheckout({ invoiceId: invoice.id });

  /* تُلغى الفاتورة بعد إنشاء العملية: `recordPayment` سيرفض السداد عليها. */
  voidInvoice(invoice.id);

  stubTransport(() => ({ body: myfatoorahPaid("80.000") }));
  await assert.rejects(() => settleIntent(intent.id), /ملغاة/);

  const after = findIntentByRef("myfatoorah", "MF-TX")!;
  assert.notEqual(after.status, "paid", "بقيت النيّة «مدفوعة» بلا قيد");
  assert.equal(after.paymentId, null, "قيدٌ نصفيّ");
  assert.equal(listPayments().length, 0, "سُجِّلت دفعة داخل معاملةٍ تراجعت");
  assert.match(after.failureReason, /ملغاة/, "لا سبب مكتوب لمن يراجع");
});

/* ------------------------------------------- بنود ماي فاتورة */

test("مجموع البنود المرسلة يساوي المبلغ المُحصَّل بالضبط", async () => {
  /*
   * ماي فاتورة تتحقق من أن مجموع البنود يساوي `InvoiceValue` وترفض إن اختلفا.
   * وفاتورةٌ سُدِّد بعضها كانت تُرسل المتبقّي مع بنود الفاتورة كاملة — فيُرفض
   * إنشاء الرابط ولا يملك المشتري إكمال السداد إطلاقاً.
   */
  freshDatabase();
  configure("myfatoorah");
  const invoice = anInvoice(149_000);
  recordPayment({ invoiceId: invoice.id, amount: 100_000, currency: "KWD" });

  const calls = stubTransport(() => ({ body: { IsSuccess: true, Data: { InvoiceId: "MF-ITEMS", InvoiceURL: "https://pay.example/items" } } }));
  await createCheckout({ invoiceId: invoice.id });

  const sent = JSON.parse(calls[0].body || "{}");
  const itemsTotal = (sent.InvoiceItems || []).reduce((sum: number, item: any) => sum + item.Quantity * item.UnitPrice, 0);
  assert.equal(sent.InvoiceValue, 49);
  assert.equal(Math.round(itemsTotal * 1000), Math.round(sent.InvoiceValue * 1000), "مجموع البنود يخالف المبلغ المُحصَّل");
});

/* ------------------------------------------- تبديل المزوّد */

test("عمليةٌ معلّقة من مزوّدٍ سابق لا تُسأل بمفتاح مزوّدٍ آخر", async () => {
  /*
   * سقط هذا في مراجعة: التسوية كانت تختار المنطق من مزوّد العملية وتقرأ
   * الإعداد من المزوّد المضبوط الآن. فبعد تبديل `NAHJ_PAYMENT_PROVIDER` تُسأل
   * «تاب» بمنطق «ماي فاتورة» وبمفتاحها — أو يُقرأ معرّفٌ يخصّ عمليةً أخرى.
   */
  freshDatabase();
  configure("myfatoorah");
  stubTransport(() => ({ body: { IsSuccess: true, Data: { InvoiceId: "MF-OLD", InvoiceURL: "https://pay.example/old" } } }));
  const invoice = anInvoice(30_000);
  const intent = await createCheckout({ invoiceId: invoice.id });

  /* بُدِّل المزوّد والعملية ما زالت معلّقة. */
  configure("tap");
  const calls = stubTransport(() => ({ body: { id: "chg_x", status: "CAPTURED", amount: 30, currency: "KWD" } }));
  const result = await settleIntent(intent.id);

  assert.equal(calls.length, 0, "طُرق باب مزوّدٍ بمفتاح غيره");
  assert.equal(result.recorded, false);
  assert.equal(listPayments().length, 0);
  const after = findIntentByRef("myfatoorah", "MF-OLD")!;
  assert.equal(after.status, "mismatch", "لم تُرفع للمراجعة البشرية");
  assert.match(after.failureReason, /تُسوّى يدوياً/);
});
