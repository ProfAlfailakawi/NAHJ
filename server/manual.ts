import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { openDatabase } from "./persistence.ts";
import type { Skill, SkillStep, SkillException } from "../src/types/index.ts";

/*
 * دليل الإجراء المطبوع — لكل إصدارٍ من المهارة، موقَّعاً.
 *
 * المهارة إجراءُ عملٍ معتمد، ومؤسساتٌ كثيرة تحتاجه ورقاً: ملفّ جودة، أو
 * مراجعة جهة رقابية، أو موظفٌ جديد. والورقة بلا توقيعٍ لا تُثبت أنها الإصدار
 * المعتمد. فالدليل يحمل بصمة محتواه وتوقيع HMAC عليها، ومسار التحقق يقول هل
 * ما زال يطابق الإصدار المحفوظ.
 */

export type ManualLang = "ar" | "en" | "both";
export type ManualCalendar = "gregorian" | "hijri";
export type ManualDigits = "arab" | "latn";

export interface ManualOptions { lang: ManualLang; calendar: ManualCalendar; digits: ManualDigits }

export function normalizeManualOptions(query: Record<string, unknown>): ManualOptions {
  const lang = query.lang === "en" || query.lang === "both" ? query.lang : "ar";
  const calendar = query.calendar === "hijri" ? "hijri" : "gregorian";
  const digits = query.digits === "latn" ? "latn" : "arab";
  return { lang, calendar, digits } as ManualOptions;
}

let cachedSecret: string | null = null;
/** المفتاح من البيئة إن ضُبط، وإلا يُولَّد مرة ويُحفظ في القاعدة فيبقى بعد إعادة التشغيل. */
export function manualSecret(): string {
  if (process.env.NAHJ_MANUAL_SECRET) return process.env.NAHJ_MANUAL_SECRET;
  if (cachedSecret) return cachedSecret;
  const db = openDatabase();
  db.exec("CREATE TABLE IF NOT EXISTS manual_keys (id INTEGER PRIMARY KEY CHECK (id = 1), secret TEXT NOT NULL, created_at TEXT NOT NULL)");
  const row = db.prepare("SELECT secret FROM manual_keys WHERE id = 1").get() as { secret: string } | undefined;
  if (row) return (cachedSecret = row.secret);
  const secret = randomBytes(32).toString("hex");
  db.prepare("INSERT OR IGNORE INTO manual_keys(id, secret, created_at) VALUES(1, ?, ?)").run(secret, new Date().toISOString());
  const stored = db.prepare("SELECT secret FROM manual_keys WHERE id = 1").get() as { secret: string };
  return (cachedSecret = stored.secret);
}
export function resetManualSecretCache(): void { cachedSecret = null; }

interface VersionContent {
  version: number;
  approvedBy: string;
  createdAt: string;
  changeSummary: string;
  steps: SkillStep[];
  rules: string[];
  exceptions: SkillException[];
}

export function versionContent(skill: Skill, version: number): VersionContent | null {
  const stored = skill.versions?.find(entry => entry.version === version);
  if (stored) {
    return {
      version, approvedBy: stored.approvedBy, createdAt: stored.createdAt, changeSummary: stored.changeSummary,
      steps: stored.steps?.length ? stored.steps : (version === skill.activeVersion ? skill.steps : []),
      rules: stored.rules || [], exceptions: stored.exceptions || [],
    };
  }
  if (version !== skill.activeVersion) return null;
  return {
    version, approvedBy: skill.ownerName, createdAt: "", changeSummary: "",
    steps: skill.steps || [], rules: (skill.decisions || []).map(decision => `${decision.condition} ← ${decision.outcome}`),
    exceptions: skill.exceptions || [],
  };
}

function canonical(skill: Skill, content: VersionContent): string {
  return JSON.stringify({
    skillId: skill.id,
    version: content.version,
    name: skill.name,
    nameEn: skill.nameEn || "",
    steps: [...content.steps].sort((a, b) => a.order - b.order).map(step => ({
      order: step.order, title: step.title, titleEn: step.titleEn || "", description: step.description,
      descriptionEn: step.descriptionEn || "", system: step.system, decisionRule: step.decisionRule || "",
    })),
    rules: content.rules,
    exceptions: content.exceptions.map(exception => ({ scenario: exception.scenario, protocol: exception.protocol })),
  });
}

export interface ManualSignature { skillId: string; version: number; digest: string; signature: string }

export function signManual(skill: Skill, version: number): ManualSignature | null {
  const content = versionContent(skill, version);
  if (!content) return null;
  const digest = createHash("sha256").update(canonical(skill, content)).digest("hex");
  const signature = createHmac("sha256", manualSecret()).update(`${skill.id}:${version}:${digest}`).digest("hex");
  return { skillId: skill.id, version, digest, signature };
}

export function verifyManual(skill: Skill, version: number, signature: unknown): { valid: boolean; reason: string } {
  const expected = signManual(skill, version);
  if (!expected) return { valid: false, reason: "الإصدار غير موجود في سجل المهارة." };
  const given = String(signature || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(given)) return { valid: false, reason: "صيغة التوقيع غير صحيحة." };
  const ok = timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected.signature, "hex"));
  return ok
    ? { valid: true, reason: "التوقيع صحيح — الدليل يطابق الإصدار المعتمد المحفوظ." }
    : { valid: false, reason: "التوقيع لا يطابق — الدليل عُدّل أو لا يخصّ هذا الإصدار." };
}

const escapeHtml = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
export const toDigits = (value: string, digits: ManualDigits) =>
  digits === "arab" ? value.replace(/[0-9]/g, digit => ARABIC_DIGITS[Number(digit)]) : value;

export function formatManualDate(date: Date, options: ManualOptions): string {
  const locale = options.lang === "en" ? "en-GB" : "ar-KW";
  const calendar = options.calendar === "hijri" ? "islamic-umalqura" : "gregory";
  try {
    return new Intl.DateTimeFormat(`${locale}-u-ca-${calendar}-nu-${options.digits}`, { dateStyle: "long" }).format(date);
  } catch {
    return toDigits(date.toISOString().slice(0, 10), options.digits);
  }
}

export function renderManualHtml(
  skill: Skill, version: number, options: ManualOptions, context: { organization: string; issuedBy: string; now?: Date },
): string | null {
  const content = versionContent(skill, version);
  const signed = signManual(skill, version);
  if (!content || !signed) return null;
  const now = context.now || new Date();
  const ar = options.lang !== "en";
  const both = options.lang === "both";
  const d = (value: unknown) => escapeHtml(toDigits(String(value ?? ""), options.digits));
  const pair = (arText: string, enText?: string) => both && enText
    ? `${d(arText)}<br><span class="en" lang="en" dir="ltr">${escapeHtml(enText)}</span>`
    : options.lang === "en" ? escapeHtml(enText || arText) : d(arText);

  const steps = [...content.steps].sort((a, b) => a.order - b.order).map(step => `
    <li><strong>${pair(step.title, step.titleEn)}</strong>
      <p>${pair(step.description, step.descriptionEn)}</p>
      <small>${ar ? "النظام" : "System"}: ${escapeHtml(step.system)}${step.decisionRule ? ` · ${ar ? "قاعدة" : "Rule"}: ${d(step.decisionRule)}` : ""}</small></li>`).join("");
  const rules = content.rules.map(rule => `<li>${d(rule)}</li>`).join("");
  const exceptions = content.exceptions.map(item => `<li><strong>${d(item.scenario)}</strong> — ${d(item.protocol)}</li>`).join("");
  const title = options.lang === "en" ? (skill.nameEn || skill.name) : skill.name;

  return `<!doctype html>
<html lang="${ar ? "ar" : "en"}" dir="${ar ? "rtl" : "ltr"}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} — v${version}</title>
<style>
body{font-family:"IBM Plex Sans Arabic","Noto Sans Arabic","Segoe UI",Tahoma,sans-serif;color:#10251f;background:#fff;margin:0;padding:32px;line-height:1.75;font-size:14px}
header{border-bottom:2px solid #10251f;padding-bottom:12px;margin-bottom:20px}
h1{margin:0;font-size:22px}h2{font-size:16px;margin:24px 0 8px;color:#205d4b}
.meta{color:#5e6862;font-size:13px}.en{color:#5e6862;font-size:13px}
ol li{margin-bottom:12px}ol small{color:#5e6862}
footer{margin-top:32px;border-top:1px solid #ccc;padding-top:12px;font-size:12px;color:#5e6862;word-break:break-all}
code{font-family:ui-monospace,monospace;direction:ltr;unicode-bidi:embed}
@media print{body{padding:0}}
</style></head><body>
<header>
  <div class="meta">${escapeHtml(context.organization)} · ${ar ? "دليل إجراء معتمد" : "Approved procedure manual"}</div>
  <h1>${pair(skill.name, skill.nameEn)}</h1>
  <div class="meta">${ar ? "الإصدار" : "Version"} ${d(`v${version}`)} · ${ar ? "اعتمده" : "Approved by"}: ${escapeHtml(content.approvedBy || skill.ownerName)} · ${ar ? "تاريخ الإصدار" : "Issued"}: ${escapeHtml(formatManualDate(now, options))}</div>
  ${skill.purpose ? `<p>${pair(skill.purpose, skill.purposeEn)}</p>` : ""}
</header>
<h2>${ar ? "الخطوات" : "Steps"}</h2><ol>${steps || `<li>${ar ? "لا خطوات مسجّلة" : "No steps recorded"}</li>`}</ol>
${rules ? `<h2>${ar ? "القواعد" : "Rules"}</h2><ul>${rules}</ul>` : ""}
${exceptions ? `<h2>${ar ? "الاستثناءات" : "Exceptions"}</h2><ul>${exceptions}</ul>` : ""}
<footer>
  <div>${ar ? "صدر بواسطة" : "Issued by"}: ${escapeHtml(context.issuedBy)}</div>
  <div>${ar ? "بصمة المحتوى" : "Content digest"} (SHA-256): <code>${signed.digest}</code></div>
  <div>${ar ? "التوقيع" : "Signature"} (HMAC-SHA256): <code>${signed.signature}</code></div>
  <div>${ar ? "للتحقق: شاشة المهارات ← دليل الإجراء ← تحقّق من توقيع، أو" : "Verify via Skills → Procedure manual → Verify, or"} <code>POST /api/manuals/verify</code></div>
</footer>
</body></html>`;
}
