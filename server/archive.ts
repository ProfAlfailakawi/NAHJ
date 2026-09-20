import fs from "node:fs";
import path from "node:path";
import { db } from "./db.ts";
import { openDatabase, resolveDatabasePath } from "./persistence.ts";
import {
  evaluateSubscription, getPlan, getSubscription, listBillingEvents, listInvoices, listPayments,
  listPlans, formatMoney, outstandingBalance,
} from "./billing.ts";
import { listCommissions, listPartners, listClients } from "./partners.ts";
import { listIntents } from "./payments.ts";

/*
 * التصدير والنسخ الاحتياطي.
 *
 * في `BILLING.md` سطرٌ قيل فيه إن انتهاء الاشتراك يُجمّد الكتابة ولا يحجب
 * القراءة، لأن «البيانات للمؤسسة والخدمة هي المُباعة». وكان ذلك وعداً بلا
 * طريق: لا زرّ يُخرج البيانات، ولا صيغة تُقرأ خارج نهج. ومؤسسةٌ لا تستطيع أن
 * تأخذ بياناتها ليست مالكةً لها مهما كُتب في العقد.
 *
 * وثلاثة أشياء تُحسم هنا:
 *
 *   ١. **التصدير حقٌّ لا ميزة.** كل ما جمعته المؤسسة يخرج بصيغتين: JSON كاملة
 *      تُعيد البناء، وCSV للدفاتر تُفتح في أي جدول.
 *
 *   ٢. **النسخة لقطةٌ متّسقة لا نسخُ ملف.** `VACUUM INTO` يكتب قاعدةً سليمة
 *      حتى والكتابة جارية. ونسخُ ملف SQLite بينما يُكتب إليه يُنتج ملفاً
 *      يبدو سليماً ويُكتشف تلفه يوم يُحتاج — وهو أسوأ من غياب النسخة.
 *
 *   ٣. **من صدّر، ومتى، وماذا** — يُسجَّل. تصديرٌ كامل لبيانات مؤسسة حدثٌ
 *      أمني بقدر ما هو خدمة.
 */

/* ------------------------------------------------------------- CSV */

/**
 * يُهيّئ خلية CSV.
 *
 * والهروب هنا أمني لا تجميلي: خليةٌ تبدأ بـ`=` أو `+` أو `-` أو `@` تُنفَّذ
 * صيغةً في إكسل عند الفتح. فمن يكتب اسم عميلٍ يبدأ بـ`=` يُنفّذ عند من يفتح
 * الملف. تُسبق بفاصلة عليا فتبقى نصاً.
 */
export function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  /* BOM لتقرأ إكسل العربية بترميزها الصحيح — بدونه تُعرض الحروف مشوَّهة. */
  const lines = [headers.map(csvCell).join(","), ...rows.map(row => row.map(csvCell).join(","))];
  return `﻿${lines.join("\r\n")}\r\n`;
}

/* -------------------------------------------------------- التصدير */

export type LedgerName = "invoices" | "payments" | "audit" | "commissions" | "skills" | "workItems";

export const LEDGER_LABELS: Record<LedgerName, string> = {
  invoices: "الفواتير",
  payments: "الدفعات",
  audit: "سجلّ التدقيق",
  commissions: "عمولات المسوّقين",
  skills: "المهارات",
  workItems: "حالات العمل",
};

/** دفاتر المالك وحده — فيها أرقام عقوده مع المسوّقين. */
export const OWNER_ONLY: LedgerName[] = ["commissions"];

export function buildLedgerCsv(ledger: LedgerName): string {
  switch (ledger) {
    case "invoices":
      return toCsv(
        ["رقم الفاتورة", "النوع", "من", "إلى", "أُصدرت", "الاستحقاق", "العملة", "المجموع الفرعي", "الخصم", "الضريبة", "الإجمالي", "المسدَّد", "الحالة"],
        listInvoices(5_000).map(invoice => [
          invoice.number, invoice.kind, invoice.periodStart ?? "", invoice.periodEnd ?? "", invoice.issuedAt, invoice.dueAt,
          invoice.currency, invoice.subtotal, invoice.discount, invoice.tax, invoice.total, invoice.amountPaid, invoice.status,
        ]),
      );

    case "payments":
      return toCsv(
        ["المعرّف", "الفاتورة", "المبلغ", "العملة", "الوسيلة", "المرجع", "التاريخ", "سجّلها"],
        listPayments(5_000).map(payment => [
          payment.id, payment.invoiceId ?? "", payment.amount, payment.currency,
          payment.method, payment.reference, payment.paidAt, payment.recordedBy,
        ]),
      );

    case "audit":
      return toCsv(
        ["الوقت", "الفاعل", "النوع", "الإجراء", "السياسة", "المصدر", "المخاطرة", "الحالة", "التفصيل"],
        db.auditEvents.map(event => [
          event.at || event.timestamp || "", event.actorName, event.actorType, event.action,
          event.policyCode ?? "", event.provenance ?? "", event.risk, event.status, event.details,
        ]),
      );

    case "commissions":
      return toCsv(
        ["المسوّق", "العميل", "من", "إلى", "المبلغ", "العملة", "الحالة", "دُفعت في", "المرجع"],
        (() => {
          const partners = new Map(listPartners().map(partner => [partner.id, partner.name]));
          const clients = new Map(listClients().map(client => [client.id, client.name]));
          return listCommissions({}).map(commission => [
            partners.get(commission.partnerId) ?? commission.partnerId,
            clients.get(commission.clientId) ?? commission.clientId,
            commission.periodStart, commission.periodEnd, commission.amount, commission.currency,
            commission.status, commission.paidAt ?? "", commission.paymentReference ?? "",
          ]);
        })(),
      );

    case "skills":
      return toCsv(
        ["المهارة", "الحالة", "مستوى الاستقلالية", "الموثوقية", "الفئة", "عدد الخطوات", "القسم"],
        db.skills.map(skill => [
          skill.name, skill.status, skill.autonomyLevel, skill.reliabilityScore,
          skill.reliabilityTier, (skill.steps || []).length, skill.department ?? "",
        ]),
      );

    case "workItems":
      return toCsv(
        ["الرقم", "العنوان", "المهارة", "الحالة", "المخاطرة", "المسؤول", "أُنشئت", "آخر تحديث", "التقدّم"],
        db.workItems.map(item => [
          item.code, item.title, item.skillName, item.state, item.riskLevel,
          item.assignedMode, item.createdAt, item.updatedAt, item.progressPercent,
        ]),
      );
  }
}

export interface ExportOptions {
  /** دفاتر المالك تُضمَّن له وحده. */
  includeOwnerLedgers: boolean;
}

/**
 * الحالة التشغيلية كاملة في كائنٍ واحد.
 *
 * ولا يُصدَّر سرّ: لا كلمات مرور ولا رموز جلسات ولا مفاتيح مزوّدين. التصدير
 * للبيانات لا للمفاتيح — ومن يأخذ نسخةً من بياناته لا يأخذ معها القدرة على
 * انتحال حساباتها.
 */
export function buildFullExport(options: ExportOptions) {
  const subscription = getSubscription() ?? null;
  const base = {
    meta: {
      product: "NAHJ / نهج",
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
      organization: db.organization,
      sectorCode: db.sectorCode,
      note: "تصديرٌ كامل للحالة التشغيلية. لا يحوي كلمات مرور ولا رموز جلسات ولا مفاتيح مزوّدين.",
    },
    operations: {
      knowledgeSources: db.knowledgeSources,
      policies: db.policies,
      skills: db.skills,
      learningProposals: db.learningProposals,
      learningSessions: db.learningSessions,
      workItems: db.workItems,
      approvalRequests: db.approvalRequests,
      auditEvents: db.auditEvents,
      testCases: db.testCases,
      shadowComparisons: db.shadowComparisons,
      connectors: db.connectors.map(connector => ({ ...connector, mode: "simulated" as const })),
      channel: db.channel,
      users: db.users,
    },
    billing: {
      subscription,
      plan: subscription ? getPlan(subscription.planCode) ?? null : null,
      state: evaluateSubscription(),
      invoices: listInvoices(5_000),
      payments: listPayments(5_000),
      events: listBillingEvents(2_000),
      plans: listPlans(true),
    },
  };

  if (!options.includeOwnerLedgers) return base;

  return {
    ...base,
    owner: {
      partners: listPartners(),
      clients: listClients(),
      commissions: listCommissions({}),
      paymentIntents: listIntents(500).map(intent => ({
        ...intent,
        /* الرابط ينتهي عند المزوّد ولا معنى له بعد التصدير. */
        checkoutUrl: undefined,
      })),
    },
  };
}

/* --------------------------------------------------- النسخ الاحتياطي */

export interface BackupFile {
  name: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
}

export function backupDirectory(): string {
  const explicit = process.env.NAHJ_BACKUP_DIR;
  if (explicit) return path.resolve(explicit);
  const databasePath = resolveDatabasePath();
  if (databasePath === ":memory:") return path.resolve(process.cwd(), "var", "backups");
  return path.join(path.dirname(databasePath), "backups");
}

/** كم نسخة تُستبقى. الأقدم يُحذف أولاً. */
export const backupRetention = () => {
  const value = Number(process.env.NAHJ_BACKUP_KEEP || 14);
  return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), 365) : 14;
};

export function listBackups(): BackupFile[] {
  const directory = backupDirectory();
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter(name => name.startsWith("nahj-") && name.endsWith(".sqlite"))
    .map(name => {
      const full = path.join(directory, name);
      const stat = fs.statSync(full);
      return { name, path: full, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
    })
    /*
     * الترتيب بالاسم لا بزمن التعديل: الاسم يحمل طابع الإنشاء، وزمنُ التعديل
     * يتغيّر بنسخٍ أو استعادةٍ أو مزامنة قرص — فيُحذف الأحدث ظنّاً أنه الأقدم.
     */
    .sort((a, b) => b.name.localeCompare(a.name));
}

export interface BackupResult {
  ok: boolean;
  file?: BackupFile;
  reason?: string;
  pruned: string[];
}

/**
 * يكتب لقطةً متّسقة من القاعدة.
 *
 * `VACUUM INTO` يُخرج قاعدةً سليمة ومضغوطة وهي قيد الاستعمال. ونسخُ الملف
 * بينما يُكتب إليه يُنتج ملفاً يبدو سليماً حتى يُحتاج فعلاً — وذلك يوم لا
 * يُقبل فيه اكتشاف أن النسخة تالفة.
 */
export function runBackup(): BackupResult {
  const databasePath = resolveDatabasePath();
  if (databasePath === ":memory:") {
    return { ok: false, reason: "القاعدة في الذاكرة — لا شيء يُنسخ.", pruned: [] };
  }

  const directory = backupDirectory();
  fs.mkdirSync(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(directory, `nahj-${stamp}.sqlite`);

  try {
    /* الوجهة يجب ألّا تكون موجودة — وهذا شرط `VACUUM INTO` نفسه. */
    if (fs.existsSync(target)) fs.unlinkSync(target);
    openDatabase().exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error), pruned: [] };
  }

  /* التقليم بعد النجاح لا قبله: لا تُحذف نسخةٌ قديمة اعتماداً على جديدةٍ لم تُكتب. */
  const pruned: string[] = [];
  const keep = backupRetention();
  for (const file of listBackups().slice(keep)) {
    try { fs.unlinkSync(file.path); pruned.push(file.name); } catch { /* تُترك للمحاولة التالية */ }
  }

  const stat = fs.statSync(target);
  return {
    ok: true,
    file: { name: path.basename(target), path: target, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() },
    pruned,
  };
}

/* ------------------------------------------------------ المُجدوِل */

let timer: NodeJS.Timeout | null = null;

/** فترة النسخ بالساعات. صفر أو أقل يُعطّل الجدولة ولا يُعطّل النسخ اليدوي. */
export const backupIntervalHours = () => {
  const value = Number(process.env.NAHJ_BACKUP_HOURS ?? 24);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 24 * 30) : 0;
};

/**
 * يبدأ النسخ الدوري.
 *
 * ولا نسخة عند الإقلاع مباشرة: النشر المتكرر يُنتج عشر نسخ متطابقة في دقيقة
 * فيُزيح الاحتفاظُ نسخةَ الأمس التي تهمّ فعلاً.
 */
export function startBackupWorker(): void {
  const hours = backupIntervalHours();
  if (timer || !hours) return;
  timer = setInterval(() => {
    const result = runBackup();
    if (!result.ok) console.warn("[NAHJ] تعذّرت النسخة الاحتياطية:", result.reason);
    else console.log(`[NAHJ] نسخة احتياطية: ${result.file!.name} (${(result.file!.sizeBytes / 1024).toFixed(0)} KB)`);
  }, hours * 3_600_000);
  timer.unref();
}

export function stopBackupWorker(): void {
  if (timer) { clearInterval(timer); timer = null; }
}

/** ملخّصٌ يُعرض للمالك: هل النسخ مفعّل، وأين، وكم بقي. */
export function backupStatus() {
  const files = listBackups();
  const hours = backupIntervalHours();
  return {
    enabled: hours > 0,
    intervalHours: hours,
    directory: backupDirectory(),
    retention: backupRetention(),
    count: files.length,
    /*
     * المسار الكامل لا يخرج إلى المتصفح: كشفُ بنية ملفات الخادم يُعين من يبحث
     * عن ثغرة، ولا يُفيد من يقرأ الشاشة في شيء. الاسم والحجم والتاريخ تكفي،
     * والمجلد يُعرض للمالك وحده لأنه من يضبطه.
     */
    latest: files[0] ? { name: files[0].name, sizeBytes: files[0].sizeBytes, createdAt: files[0].createdAt } : null,
    totalBytes: files.reduce((sum, file) => sum + file.sizeBytes, 0),
    note: hours > 0
      ? `تُكتب نسخة كل ${hours} ساعة، ويُستبقى آخر ${backupRetention()} نسخة.`
      : "النسخ الدوري معطّل (NAHJ_BACKUP_HOURS=0) — النسخ اليدوي يعمل.",
  };
}

/** صيغةٌ مقروءة لحجم الملف. */
export const humanBytes = (bytes: number) =>
  bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** يُستعمل في وصف التصدير للمستعمل. */
export const describeExport = () => {
  const outstanding = outstandingBalance();
  return {
    skills: db.skills.length,
    workItems: db.workItems.length,
    auditEvents: db.auditEvents.length,
    invoices: listInvoices(5_000).length,
    payments: listPayments(5_000).length,
    outstanding: formatMoney(outstanding.amount, outstanding.currency),
  };
};
