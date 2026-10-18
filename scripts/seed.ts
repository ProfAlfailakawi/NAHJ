/*
 * بذرة بيانات واقعية للتجربة والاختبار — لا وضع «عرض» ولا حسابات تجريبية.
 *
 *   npm run seed                      # يكتب في قاعدة التطوير (var/nahj.sqlite أو NAHJ_DATABASE_PATH)
 *   SEED_ACCOUNTS=1200 npm run seed   # عدد الحسابات (الافتراضي 1100)
 *   SEED_ANCHOR=2026-10-18 npm run seed
 *
 * خصائصها:
 *   - حتمية: مولّد أرقام ثابت البذرة؛ التواريخ نسبةً إلى SEED_ANCHOR (الافتراضي: اليوم).
 *   - مُعادة التنفيذ: معرّفات ثابتة + INSERT OR REPLACE/IGNORE، فتشغيلها مرتين لا يُضاعف شيئاً.
 *   - لا تلمس حسابات لم تُنشئها هي (تُعرف ببريدها @seed.nahj.test).
 *   - كلمة مرور كل حسابات البذرة واحدة معلنة (للتطوير فقط): (تُطبع عند التشغيل)
 *     وللمالك والمشرف رسائلها في آخر الخرج.
 */
import { createHash, randomBytes, scryptSync } from "node:crypto";

process.env.NAHJ_FIREBASE_SYNC = process.env.NAHJ_FIREBASE_SYNC || "off";
if (!process.env.NAHJ_DATABASE_PATH && !process.env.NAHJ_DATA_DIR) process.env.NAHJ_DATA_DIR = "var";

/* كلمة مرور التطوير: من SEED_PASSWORD، وإلا مشتقّة حتمياً (فتتطابق بين تشغيلين) وتُطبع عند الانتهاء. */
export const SEED_PASSWORD = process.env.SEED_PASSWORD || `Sd-${createHash("sha256").update("nahj-dev-seed").digest("hex").slice(0, 10)}-9a`;
export const SEED_DOMAIN = "seed.nahj.test";

/* ------------------------------------------------------------ مولّد حتمي */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_M = ["محمد", "أحمد", "عبدالله", "خالد", "فهد", "يوسف", "سالم", "ناصر", "بدر", "عمر", "علي", "حسن", "إبراهيم", "سلطان", "جاسم", "مشاري", "طلال", "حمد", "راشد", "عبدالعزيز", "ماجد", "سعود", "فيصل", "نواف", "وليد", "تركي", "زياد", "هشام", "مروان", "باسل"];
const FIRST_F = ["نورة", "فاطمة", "مريم", "سارة", "هند", "دانة", "لولوة", "منيرة", "العنود", "شيخة", "ريم", "أمل", "جميلة", "لطيفة", "غدير", "هديل", "رنا", "ليلى", "سلمى", "بشائر", "عائشة", "خلود", "جود", "ديما", "أسماء"];
const FAMILY = ["العتيبي", "المطيري", "الرشيدي", "العنزي", "الشمري", "الكندري", "الصباح", "الفيلكاوي", "الهاجري", "العازمي", "الدوسري", "القحطاني", "الحربي", "الزهراني", "الغامدي", "السبيعي", "البلوشي", "المنصور", "الخالدي", "النصار", "الرومي", "الصالح", "الأنصاري", "الحداد", "التميمي", "الشطي", "البدر", "الغانم", "المزيني", "العوضي"];
const ORG_A = ["الرائد", "الأفق", "المستقبل", "النخبة", "الريادة", "الإتقان", "المنار", "الفجر", "الواحة", "الخليج", "السدرة", "الصفوة", "البيان", "النور", "التميّز", "الإبداع", "الأمل", "الوسام", "المسار", "الجسر"];
const ORG_B: Record<string, string[]> = {
  education: ["أكاديمية", "مدارس", "معهد", "روضة", "مركز تعليمي"],
  clinic: ["عيادات", "مركز", "مجمع"],
  law: ["مكتب", "مجموعة"],
  retail: ["متاجر", "أسواق", "مجموعة"],
  logistics: ["للشحن", "لوجستيات", "للنقل"],
  realestate: ["للعقار", "العقارية", "للتطوير"],
};
const SECTORS = ["education", "clinic", "law", "retail", "logistics", "realestate"];
const SECTOR_NOUN: Record<string, string> = { education: "أكاديمية", clinic: "عيادات", law: "مكتب محاماة", retail: "متاجر", logistics: "لوجستيات", realestate: "عقارات" };
const DEPTS = ["القبول", "المالية", "خدمة العملاء", "العمليات", "الموارد البشرية", "الجودة", "المبيعات", "الشؤون الإدارية"];

async function main() {
  const anchor = new Date(`${process.env.SEED_ANCHOR || new Date().toISOString().slice(0, 10)}T09:00:00.000Z`);
  if (Number.isNaN(anchor.getTime())) throw new Error("SEED_ANCHOR غير صالح");
  const total = Math.max(1000, Number(process.env.SEED_ACCOUNTS || 1100));
  const r = rng(20261018);
  const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)];
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const daysAgo = (d: number, h = 0) => new Date(anchor.getTime() - d * 86_400_000 - h * 3_600_000).toISOString();
  const iso = (d: Date) => d.toISOString();

  const { openDatabase, closeDatabase } = await import("../server/persistence.ts");
  const dbh = openDatabase();

  /*
   * حارس الأمان: البذرة تستبدل الحالة التشغيلية للمؤسسة (configureOrganization) فلا تُشغَّل على
   * قاعدةٍ فيها حسابات حقيقية ولا في بيئة إنتاج. SEED_FORCE=1 يتجاوز الحارس عن علمٍ.
   */
  if (process.env.SEED_FORCE !== "1") {
    const foreign = dbh.prepare("SELECT COUNT(*) AS n FROM accounts WHERE email NOT LIKE ?").get(`%@${SEED_DOMAIN}`) as { n: number };
    if (process.env.NODE_ENV === "production" || Number(foreign.n) > 0) {
      console.error(`[seed] رفض: القاعدة ${process.env.NAHJ_DATABASE_PATH || process.env.NAHJ_DATA_DIR} فيها ${foreign.n} حساب غير مبذور أو بيئتها إنتاج. استعمل قاعدة تطوير جديدة، أو SEED_FORCE=1 عن علم.`);
      process.exit(2);
    }
  }
  const { ensureBillingSchema, seedDefaultPlans, getSubscription, startSubscription, ensureSubscription, listPlans } = await import("../server/billing.ts");
  const { ensurePartnerSchema, accrueCommissions, listCommissions, payCommissions } = await import("../server/partners.ts");

  /* ---------------------------------------------------------- الحسابات */
  const salt = "5eed5a17" + "0".repeat(24); // ملح ثابت: كل حسابات البذرة تتشارك كلمة مرور تطوير واحدة
  const hash = scryptSync(SEED_PASSWORD, salt, 64).toString("hex");
  const insAcc = dbh.prepare(
    `INSERT OR IGNORE INTO accounts(id,email,name,role,password_hash,password_salt,status,failed_login_count,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,0,?,?)`,
  );
  const mkName = (i: number) => {
    const female = r() < 0.4;
    return `${pick(female ? FIRST_F : FIRST_M)} ${pick(FIRST_M)} ${pick(FAMILY)}`;
  };
  const roleFor = (i: number) => (i === 0 ? "owner" : i === 1 ? "admin" : i < 12 ? "admin" : i < 60 ? "manager" : i < 700 ? "operator" : "viewer");
  const emails: string[] = [];
  const accountIds: string[] = [];
  dbh.exec("BEGIN");
  for (let i = 0; i < total; i++) {
    const role = roleFor(i);
    const id = `acc_seed_${String(i).padStart(5, "0")}`;
    const email = i === 0 ? `owner@${SEED_DOMAIN}` : i === 1 ? `admin@${SEED_DOMAIN}` : `user${String(i).padStart(4, "0")}@${SEED_DOMAIN}`;
    const status = r() < 0.03 && i > 12 ? "SUSPENDED" : "ACTIVE";
    const ts = daysAgo(int(1, 400));
    insAcc.run(id, email, mkName(i), role, hash, salt, status, ts, ts);
    emails.push(email); accountIds.push(id);
  }
  dbh.exec("COMMIT");

  /* ------------------------------------------------- الاشتراك والفوترة */
  ensureBillingSchema();
  seedDefaultPlans();
  ensureSubscription();
  const sub = getSubscription();
  if (!sub || sub.planCode === "trial") {
    /* ألف حساب لا تتّسع لها باقةٌ بعشرة مقاعد: نختار أول باقةٍ مدفوعة بلا سقف مقاعد. */
    const plan = listPlans().find(p => p.code !== "trial" && p.limits.seats === null)?.code || listPlans().find(p => p.code !== "trial")?.code || "trial";
    startSubscription({ planCode: plan, cycle: "monthly", startedAt: daysAgo(20), autoRenew: true, taxBps: 0, issueInvoice: false }, "seed");
  }
  const planCode = getSubscription()!.planCode;
  const insInv = dbh.prepare(
    `INSERT OR IGNORE INTO billing_invoices(id,number,kind,plan_code,period_start,period_end,issued_at,due_at,currency,subtotal,discount,tax,total,amount_paid,status,lines,notes)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const insPay = dbh.prepare(
    `INSERT OR IGNORE INTO billing_payments(id,invoice_id,amount,currency,method,reference,paid_at,recorded_by,note) VALUES(?,?,?,?,?,?,?,?,?)`,
  );
  const methods = ["bank_transfer", "knet", "card", "cheque"];
  dbh.exec("BEGIN");
  for (let m = 1; m <= 18; m++) {
    const start = daysAgo(30 * m + 10);
    const end = daysAgo(30 * (m - 1) + 10);
    const amount = 49_000 + (m % 3) * 1000; // وحدات صغرى (KWD: 3 خانات)
    const state = m === 1 ? "issued" : m === 2 && m % 5 === 2 ? "partially_paid" : "paid";
    const paid = state === "paid" ? amount : state === "partially_paid" ? Math.floor(amount / 2) : 0;
    const id = `inv_seed_${String(m).padStart(3, "0")}`;
    insInv.run(id, `SEED-${String(1000 + m)}`, "subscription", planCode, start, end, start, daysAgo(30 * m + 3), "KWD", amount, 0, 0, amount, paid, state,
      JSON.stringify([{ description: `اشتراك شهري — دورة ${m}`, quantity: 1, unitAmount: amount, amount }]), "بذرة");
    if (paid) insPay.run(`pay_seed_${String(m).padStart(3, "0")}`, id, paid, "KWD", methods[m % methods.length], `REF-${20260000 + m * 17}`, daysAgo(30 * m + 6), "seed", "");
  }
  dbh.exec("COMMIT");

  /* ---------------------------------------- المسوّقون والشركات (العملاء) */
  ensurePartnerSchema();
  const insPartner = dbh.prepare(
    `INSERT OR REPLACE INTO partners(id,name,email,phone,account_id,status,model,rate_bps,fixed_amount,currency,duration_months,notes,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const insClient = dbh.prepare(
    `INSERT OR REPLACE INTO partner_clients(id,name,sector,contact_name,contact_email,contact_phone,partner_id,plan_code,cycle,contract_value,currency,started_at,ends_at,status,deployment_url,notes,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const partnerCount = 40, clientCount = 320;
  const partnerIds: string[] = [];
  const setRole = dbh.prepare("UPDATE accounts SET role='partner', email=? WHERE id=? AND email LIKE ?");
  dbh.exec("BEGIN");
  for (let p = 0; p < partnerCount; p++) {
    const id = `ptr_seed_${String(p).padStart(3, "0")}`;
    // حسابات المسوّقين من آخر الحسابات (المُطّلعين) كي لا تتداخل مع طاقم المؤسسة.
    const accId = accountIds[total - 1 - p];
    setRole.run(`partner${String(p).padStart(2, "0")}@${SEED_DOMAIN}`, accId, `%@${SEED_DOMAIN}`);
    const model = p % 5 === 0 ? "fixed_per_cycle" : p % 5 === 1 ? "fixed_once" : "percent_of_contract";
    const isPercent = model === "percent_of_contract";
    insPartner.run(id, `${pick(FIRST_M)} ${pick(FAMILY)}`, `partner${String(p).padStart(2, "0")}@${SEED_DOMAIN}`, `+9655${int(1000000, 9999999)}`, accId,
      p % 17 === 16 ? "suspended" : "active", model, isPercent ? int(5, 20) * 100 : 0, isPercent ? 0 : int(10, 60) * 1000,
      "KWD", p % 4 === 0 ? 12 : 0, "", daysAgo(int(60, 400)), daysAgo(int(1, 50)));
    partnerIds.push(id);
  }
  const clientIds: string[] = [];
  for (let c = 0; c < clientCount; c++) {
    const id = `cli_seed_${String(c).padStart(4, "0")}`;
    const sector = SECTORS[c % SECTORS.length];
    const cycle = pick(["monthly", "monthly", "quarterly", "annual"]);
    const started = daysAgo(int(5, 380));
    const months = cycle === "annual" ? 12 : cycle === "quarterly" ? 3 : 1;
    const ends = new Date(new Date(started).getTime() + months * 30 * 86_400_000).toISOString();
    const status = r() < 0.05 ? "prospect" : r() < 0.1 ? "churned" : r() < 0.15 ? "past_due" : "active";
    const nounB = pick(ORG_B[sector]);
    const name = nounB.startsWith("ل") || nounB.startsWith("ع") && sector === "realestate" ? `${pick(ORG_A)} ${nounB}` : `${nounB} ${pick(ORG_A)} ${pick(FAMILY).replace("ال", "")}`;
    insClient.run(id, `${name} ${c}`.trim(), sector, `${pick(FIRST_M)} ${pick(FAMILY)}`, `contact${c}@${SEED_DOMAIN}`, `+9656${int(1000000, 9999999)}`,
      c % 9 === 0 ? null : partnerIds[c % partnerCount], pick(["starter", "growth", "starter"]), cycle, int(30, 400) * 1000, "KWD",
      started, ends, status, "", "", started, started);
    clientIds.push(id);
  }
  dbh.exec("COMMIT");
  accrueCommissions(iso(anchor), "seed");
  /* نحو 40% من العمولات القديمة مدفوعة (بدفعاتٍ مرجعية) — فيظهر في الدفاتر مدفوعٌ ومستحقٌّ معاً. */
  const accrued = listCommissions().filter(c => c.status === "accrued").sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  const toPay = accrued.slice(0, Math.floor(accrued.length * 0.4));
  for (let i = 0; i < toPay.length; i += 50) payCommissions(toPay.slice(i, i + 50).map(c => c.id), `SEED-PAY-${String(i / 50 + 1).padStart(3, "0")}`, "seed");

  /* ------------------------------------------------------- طلبات العرض */
  dbh.exec("CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY,name TEXT NOT NULL,organization TEXT NOT NULL,sector TEXT NOT NULL,contact TEXT NOT NULL,message TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL)");
  const insLead = dbh.prepare("INSERT OR REPLACE INTO leads(id,name,organization,sector,contact,message,status,created_at) VALUES(?,?,?,?,?,?,?,?)");
    dbh.exec("BEGIN");
  for (let l = 0; l < 180; l++) {
    insLead.run(`lead_seed_${String(l).padStart(4, "0")}`, `${pick(FIRST_M)} ${pick(FAMILY)}`, `${pick(Object.values(SECTOR_NOUN))} ${pick(ORG_A)}`, pick(SECTORS),
      l % 2 ? `lead${l}@${SEED_DOMAIN}` : `+9659${int(1000000, 9999999)}`, pick(["نبي نشوف عرض للنظام", "كم سعر الباقة السنوية؟", "هل يدعم الواتساب؟", "نحتاج تجربة لمدة أسبوعين", ""]),
      pick(["new", "new", "contacted", "won", "lost"]), daysAgo(int(0, 120)));
  }
  dbh.exec("COMMIT");

  /* ---------------------------------------------------------- الإشعارات */
  dbh.exec(`CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY,dedupe_key TEXT NOT NULL,kind TEXT NOT NULL,recipient TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,sent_at TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe ON notifications(dedupe_key);`);
  const insNtf = dbh.prepare("INSERT OR REPLACE INTO notifications(id,dedupe_key,kind,recipient,subject,body,status,attempts,last_error,created_at,sent_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)");
  dbh.exec("BEGIN");
  for (let n = 0; n < 300; n++) {
    const kind = pick(["invoice_issued", "payment_received", "renewal_due", "lead_received"]);
    const status = pick(["skipped", "skipped", "sent", "failed", "pending"]);
    const at = daysAgo(int(0, 90));
    insNtf.run(`ntf_seed_${n}`, `seed:${n}`, kind, `user${String(int(2, total - 1)).padStart(4, "0")}@${SEED_DOMAIN}`, `إشعار ${kind} رقم ${n}`, "نص إشعار تجريبي.", status,
      status === "failed" ? int(1, 5) : 0, status === "failed" ? "رفض المزوّد الطلب" : status === "skipped" ? "لا مزوّد بريد مضبوط — لم يُرسل." : "", at, status === "sent" ? at : null);
  }
  dbh.exec("COMMIT");

  /* ------------------------------------------ الحالة التشغيلية للمؤسسة */
  const { db: store, persistence } = await import("../server/db.ts");
  const sector = process.env.SEED_SECTOR || "education";
  const orgName = process.env.SEED_ORG || "أكاديمية الريادة الدولية";
  const cfg = store.configureOrganization(sector, orgName, "Al Riyada International Academy", "بذرة البيانات");
  if (!cfg.ok) throw new Error(`تعذّرت تهيئة المؤسسة: ${cfg.reason}`);

  store.users = Array.from({ length: 160 }, (_, i) => {
    const female = r() < 0.5;
    const role = i < 3 ? "admin" : i < 20 ? "manager" : i < 150 ? "employee" : "auditor";
    return {
      id: `usr_seed_${String(i).padStart(3, "0")}`,
      name: `${pick(female ? FIRST_F : FIRST_M)} ${pick(FAMILY)}`,
      email: `staff${i}@${SEED_DOMAIN}`,
      role: role as any,
      department: pick(DEPTS),
      avatar: "",
    };
  });
  store.currentUserId = store.users[0].id;

  // مكتبة مهارات أوسع: اشتقاقات من قوالب القطاع بأسماء وأقسام مختلفة، ليُختبر العدّ والتصفية.
  const SKILL_TOPICS = ["متابعة المتأخرات", "استقبال الشكاوى", "جدولة المواعيد", "إصدار الشهادات", "مطابقة المستندات", "تحديث بيانات العملاء", "الرد على الاستفسارات", "تصعيد الحالات الحرجة", "مراجعة العقود", "إشعارات السداد", "تدقيق الجودة", "إغلاق الحالات"];
  const baseSkills = [...store.skills];
  SKILL_TOPICS.forEach((topic, i) => {
    const base = JSON.parse(JSON.stringify(baseSkills[i % baseSkills.length]));
    base.id = `sk_seed_${String(i).padStart(2, "0")}`;
    base.slug = `seed-skill-${i}`;
    base.name = topic;
    base.nameEn = `Seed skill ${i + 1}`;
    base.department = DEPTS[i % DEPTS.length];
    base.status = "draft";
    base.autonomyLevel = 0;
    base.isSinglePointOfFailure = i % 5 === 0;
    store.skills.push(base);
  });

  // ترقية نسبة من القوالب إلى مهارات حيّة بأرقام معقولة (بعضها يبقى مسوّدة).
  const skillIds = store.skills.map(s => s.id);
  store.skills.forEach((s, i) => {
    const stage = i % 5 === 4 ? 3 : i % 4;
    if (stage === 0) return;
    s.status = stage === 1 ? "practicing" : stage === 2 ? "shadow" : "active";
    s.autonomyLevel = (stage === 1 ? 1 : stage === 2 ? 2 : 4) as any;
    s.usageCount = int(40, 900);
    s.successRate = int(82, 98);
    s.humanTakeoverRate = int(2, 18);
    s.avgDurationMinutes = int(3, 25);
    s.hoursSavedTotal = int(20, 400);
    s.reliabilityScore = int(70, 96);
    s.reliabilityTier = s.reliabilityScore >= 90 ? "high" : "medium";
    s.ownerName = store.users[int(3, 19)].name;
  });

  const states = ["queued", "collecting_data", "waiting_documents", "waiting_approval", "executing", "completed", "completed", "completed", "escalated"] as const;
  const risks = ["low", "low", "medium", "high", "critical"] as const;
  const nowMs = anchor.getTime();
  const disp = (ms: number) => {
    const d = new Date(ms);
    const hh = d.getUTCHours() % 12 || 12;
    const mm = String(d.getUTCMinutes()).padStart(2, "0");
    const ap = d.getUTCHours() >= 12 ? "م" : "ص";
    const age = Math.floor((nowMs - ms) / 86_400_000);
    return `${age <= 0 ? "اليوم" : age === 1 ? "أمس" : d.toISOString().slice(0, 10)}، ${hh}:${mm} ${ap}`;
  };
  const workCount = 1500;
  store.workItems = Array.from({ length: workCount }, (_, i) => {
    const sk = store.skills[i % store.skills.length];
    const state = pick([...states]);
    const created = nowMs - int(0, 90 * 24) * 3_600_000;
    return {
      id: `wi_seed_${String(i).padStart(5, "0")}`,
      code: `W-${String(10000 + i)}`,
      title: `${sk.name}: ${pick(FIRST_M)} ${pick(FAMILY)}`,
      skillId: sk.id,
      skillName: sk.name,
      contactName: `${pick(FIRST_M)} ${pick(FAMILY)}`,
      contactPhone: `+965 ${int(5, 9)}${int(100, 999)} ${int(1000, 9999)}`,
      state,
      riskLevel: pick([...risks]),
      assignedMode: r() < 0.12 ? "human_takeover" : "ai",
      createdAt: disp(created),
      updatedAt: disp(created + int(1, 600) * 60_000),
      progressPercent: state === "completed" ? 100 : state === "queued" ? 0 : int(10, 90),
      currentStepTitle: sk.steps[Math.min(sk.steps.length - 1, i % Math.max(1, sk.steps.length))]?.title || "قيد المعالجة",
      details: { amountKwd: int(10, 1500), note: pick(["", "طلب عاجل", "يحتاج مراجعة", "نص بحروف خاصة <b>& \" ' ؟"]) },
      timeline: [
        { time: disp(created), actor: "system", title: "فُتحت الحالة", details: "استُلم الطلب من القناة." },
        { time: disp(created + 60_000), actor: "ai", title: "بدأت المعالجة", details: "طُبّقت خطوات المهارة." },
      ],
    } as any;
  });

  const pendingApprovals = store.workItems.filter(w => w.state === "waiting_approval").slice(0, 120);
  store.approvalRequests = [
    ...pendingApprovals.map((w, i) => ({
      id: `appr_seed_${String(i).padStart(4, "0")}`, workItemId: w.id, workTitle: w.title, actionName: "issuePaymentInvoice",
      payload: { amountKwd: int(50, 2000) }, reasonCode: "POL-FIN-02_HIGH_VALUE", reasonDescription: "عملية مالية تتطلب اعتماداً بشرياً.",
      riskLevel: w.riskLevel, requiredRole: "manager", requestedAt: w.updatedAt, status: "pending",
    })),
    ...store.workItems.filter(w => w.state === "completed").slice(0, 200).map((w, i) => ({
      id: `appr_seed_done_${String(i).padStart(4, "0")}`, workItemId: w.id, workTitle: w.title, actionName: "createRecord",
      payload: {}, reasonCode: "POL-GEN-01", reasonDescription: "اعتماد روتيني.", riskLevel: "low", requiredRole: "manager",
      requestedAt: w.createdAt, status: i % 7 === 0 ? "rejected" : "approved", decidedBy: store.users[3 + (i % 15)].name,
      decidedAt: w.updatedAt, decisionReason: "تمت المراجعة.",
    })),
  ] as any;

  store.testCases = Array.from({ length: 80 }, (_, i) => ({
    id: `tc_seed_${i}`, name: `حالة اختبار ${i + 1}`, skillId: skillIds[i % skillIds.length], scenario: "سيناريو اختبار مولَّد للبذرة.",
    expectedAction: "REQUEST_APPROVAL", expectedStatus: "pass", resultStatus: r() < 0.92 ? "pass" : "fail", executionTimeMs: int(100, 900),
  })) as any;
  store.shadowComparisons = Array.from({ length: 120 }, (_, i) => {
    const matched = r() < 0.85;
    return {
      id: `sh_seed_${i}`, caseTitle: `مقارنة ظل ${i + 1}`, timestamp: disp(nowMs - i * 3_600_000 * 5),
      humanAction: "أرسل الموظف إشعاراً لولي الأمر.", humanReason: "السياسة المعتمدة.", aiAction: matched ? "أرسل الموظف إشعاراً لولي الأمر." : "أوقف الطلب وصعّد للمدير.",
      aiReason: "مطابقة المصدر.", matched, driftDetected: !matched, workItemId: store.workItems[i].code, title: `حالة ${i + 1}`, confidence: int(70, 99),
    };
  }) as any;
  store.learningProposals = Array.from({ length: 45 }, (_, i) => ({
    id: `lp_seed_${i}`, type: pick(["new_skill", "conflict", "process_drift", "improvement", "single_person_risk", "outdated_source"]),
    title: `اقتراح تعلّم ${i + 1}`, titleEn: `Learning proposal ${i + 1}`, detectedAt: disp(nowMs - i * 7_200_000), observedCasesCount: int(3, 60),
    confidence: int(55, 97), summary: "رُصد نمط متكرر في العمل الفعلي.", status: i % 5 === 0 ? "resolved" : "pending", evidence: { details: "من سجلّ العمل." },
  })) as any;

  store.auditEvents = [];
  const actions = ["SKILL_PROMOTED", "APPROVAL_DECIDED", "WORK_COMPLETED", "POLICY_CHECK", "LOGIN", "EXPORT_DATA", "TAKEOVER"];
  for (let a = 0; a < 3000; a++) {
    const at = new Date(nowMs - a * 17 * 60_000);
    const ai = r() < 0.5;
    store.auditEvents.push({
      id: `aud_seed_${String(a).padStart(5, "0")}`, timestamp: disp(at.getTime()), at: at.toISOString(),
      actorType: ai ? "ai" : "human", actorName: ai ? "نهج" : store.users[int(0, 40)].name, action: pick(actions),
      provenance: "بذرة", risk: pick([...risks]), latencyMs: int(20, 900), details: `حدث تدقيق رقم ${a}`, status: pick(["success", "success", "warning", "intercepted"]),
    } as any);
  }
  persistence.flush();

  /* ------------------------------------------------------------- الخلاصة */
  const count = (t: string) => Number((dbh.prepare(`SELECT COUNT(*) c FROM ${t}`).get() as any).c);
  console.log("[seed] اكتمل.");
  console.log(`  accounts=${count("accounts")} partners=${count("partners")} clients=${count("partner_clients")} commissions=${count("partner_commissions")}`);
  console.log(`  invoices=${count("billing_invoices")} payments=${count("billing_payments")} leads=${count("leads")} notifications=${count("notifications")}`);
  console.log(`  workItems=${store.workItems.length} approvals=${store.approvalRequests.length} audit=${store.auditEvents.length} skills=${store.skills.length} staff=${store.users.length}`);
  console.log(`  دخول: owner@${SEED_DOMAIN} / admin@${SEED_DOMAIN} / user0020@${SEED_DOMAIN} (manager) / user0100@${SEED_DOMAIN} (operator) / user0900@${SEED_DOMAIN} (viewer) / partner00@${SEED_DOMAIN}`);
  console.log(`  كلمة المرور لكل حسابات البذرة: ${SEED_PASSWORD}`);
  closeDatabase();
  process.exit(0);
}

void randomBytes;
main().catch(e => { console.error(e); process.exit(1); });
