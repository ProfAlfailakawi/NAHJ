import { randomUUID } from "node:crypto";
import { openDatabase } from "./persistence.ts";
import { enqueue } from "./notify.ts";

/*
 * طلبات العرض — من يريد أن يرى نهج.
 *
 * لم يعد العرض التجريبي مفتوحاً لكل زائر: صار أداةً يعرضها المالك بنفسه. فالزائر
 * المهتمّ يحتاج طريقاً إليه، وإلا انتهت زيارته عند «جميل» ولم يعرف أحدٌ أنه جاء.
 * وكل طلبٍ يُحفظ في القاعدة (لا يضيع إن لم يُربط بريد)، ويُرسل إلى المالك إن رُبط.
 */

export type LeadStatus = "new" | "contacted" | "won" | "lost";
export const LEAD_STATUSES: LeadStatus[] = ["new", "contacted", "won", "lost"];

export interface Lead {
  id: string;
  name: string;
  organization: string;
  sector: string;
  contact: string;
  message: string;
  status: LeadStatus;
  createdAt: string;
}

let schemaReady = false;
function ensureSchema(): void {
  if (schemaReady) return;
  openDatabase().exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      organization TEXT NOT NULL,
      sector TEXT NOT NULL,
      contact TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS leads_created ON leads(created_at);
  `);
  schemaReady = true;
}

/** لإعادة الضبط في الاختبارات حين تتبدّل القاعدة تحت الوحدة. */
export function resetLeadsSchemaCache(): void { schemaReady = false; }

const clean = (value: unknown, max: number) =>
  String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export interface LeadInput {
  name?: unknown;
  organization?: unknown;
  sector?: unknown;
  contact?: unknown;
  message?: unknown;
  /** حقلٌ مخفي: الإنسان لا يراه فلا يملؤه، والبرامج الآلية تملأ كل حقل. */
  website?: unknown;
}

export class LeadError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}

/** بريدٌ أو رقم هاتف — ما يكفي ليُتواصل معه. */
function validContact(contact: string): boolean {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return true;
  const digits = contact.replace(/[^\d]/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

export function createLead(input: LeadInput): Lead | null {
  /* البرنامج الآلي يُجاب بنجاحٍ صامت: لا يتعلّم أنه كُشف، ولا يُحفظ شيء. */
  if (clean(input.website, 200)) return null;

  const lead: Lead = {
    id: `lead_${randomUUID()}`,
    name: clean(input.name, 120),
    organization: clean(input.organization, 160),
    sector: clean(input.sector, 40),
    contact: clean(input.contact, 160),
    message: clean(input.message, 1000),
    status: "new",
    createdAt: new Date().toISOString(),
  };
  if (lead.name.length < 2) throw new LeadError("اكتب اسمك.");
  if (lead.organization.length < 2) throw new LeadError("اكتب اسم المؤسسة.");
  if (!validContact(lead.contact)) throw new LeadError("اكتب بريداً إلكترونياً أو رقم هاتف صحيحاً.");

  ensureSchema();
  openDatabase().prepare(
    "INSERT INTO leads(id, name, organization, sector, contact, message, status, created_at) VALUES(?,?,?,?,?,?,?,?)",
  ).run(lead.id, lead.name, lead.organization, lead.sector, lead.contact, lead.message, lead.status, lead.createdAt);

  notifyOwner(lead);
  return lead;
}

function notifyOwner(lead: Lead): void {
  const contactEmail = (process.env.NAHJ_CONTACT_EMAIL || "").trim();
  const owner = openDatabase().prepare("SELECT email FROM accounts WHERE role = 'owner' LIMIT 1").get() as { email?: string } | undefined;
  const recipient = contactEmail || owner?.email || "";
  if (!recipient) return;
  enqueue({
    kind: "lead_received",
    dedupeKey: `lead:${lead.id}`,
    recipient,
    subject: `طلب عرض جديد — ${lead.organization}`,
    body: [
      `طلب عرضٍ جديد على نهج:`,
      ``,
      `الاسم: ${lead.name}`,
      `المؤسسة: ${lead.organization}`,
      `القطاع: ${lead.sector || "—"}`,
      `للتواصل: ${lead.contact}`,
      lead.message ? `الرسالة: ${lead.message}` : "",
      ``,
      `يظهر الطلب في لوحة المالك ← طلبات العرض.`,
    ].filter(line => line !== undefined).join("\n"),
  });
}

export function listLeads(limit = 200): Lead[] {
  ensureSchema();
  const rows = openDatabase().prepare(
    "SELECT id, name, organization, sector, contact, message, status, created_at FROM leads ORDER BY created_at DESC LIMIT ?",
  ).all(Math.max(1, Math.min(1000, limit))) as Array<Record<string, string>>;
  return rows.map(row => ({
    id: row.id, name: row.name, organization: row.organization, sector: row.sector, contact: row.contact,
    message: row.message, status: (LEAD_STATUSES as string[]).includes(row.status) ? row.status as LeadStatus : "new",
    createdAt: row.created_at,
  }));
}

export function setLeadStatus(id: string, status: unknown): Lead {
  if (!(LEAD_STATUSES as unknown[]).includes(status)) throw new LeadError("حالة غير معروفة.");
  ensureSchema();
  const result = openDatabase().prepare("UPDATE leads SET status = ? WHERE id = ?").run(String(status), String(id));
  if (!result.changes) throw new LeadError("الطلب غير موجود.", 404);
  return listLeads(1000).find(lead => lead.id === id)!;
}
