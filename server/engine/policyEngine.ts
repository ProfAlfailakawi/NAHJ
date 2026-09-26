import { db } from "../db.ts";
import { RiskLevel, UserRole } from "../../src/types/index.ts";

export interface PolicyCheckResult {
  allowed: boolean;
  requiresApproval: boolean;
  requiredRole?: UserRole;
  reasonCode: string;
  reasonDescription: string;
  riskLevel: RiskLevel;
  provenance: string;
  /** ما طبّقته حزمة امتثال القطاع — يُعرض في سجل القرار ويُحفظ في التدقيق. */
  compliance?: ComplianceOutcome;
}

/*
 * حزم امتثالٍ لكل قطاع.
 *
 * السياسات العامة أعلاه لا تعرف أن العيادة تحمل بيانات مرضى، ولا أن مكتب
 * المحاماة لا يقبل موكّلاً خصمُه موكّلٌ عنده، ولا أن المتجر يحدّ النقد في
 * الصندوق. هذه قواعد تُطبَّق قبل السياسات العامة حين يكون القطاع قطاعها.
 */
export interface CompliancePreset {
  sector: string;
  code: string;
  title: string;
  titleEn: string;
  description: string;
}

export interface ComplianceOutcome {
  preset: string;
  redactedFields?: string[];
  redactedPayload?: Record<string, any>;
  conflictMatches?: string[];
  cashAmount?: number;
  cashLimit?: number;
}

export const RETAIL_CASH_LIMIT_KWD = 100;

export const SECTOR_COMPLIANCE_PRESETS: Record<string, CompliancePreset[]> = {
  clinic: [{
    sector: "clinic", code: "CMP-MED-REDACT", title: "حجب بيانات المريض", titleEn: "Patient-data redaction",
    description: "الرقم المدني والهاتف والتشخيص ورقم الملف تُحجب من كل ما يخرج من العيادة؛ وإرسالها خارجاً يحتاج اعتماداً.",
  }],
  law: [{
    sector: "law", code: "CMP-LAW-CONFLICT", title: "فحص تعارض المصالح", titleEn: "Conflict-of-interest check",
    description: "لا يُفتح ملف موكّلٍ جديد قبل مطابقة الخصم بموكّلي المكتب؛ التطابق يمنع، وغياب بيانات الأطراف يحتاج اعتماداً.",
  }],
  retail: [{
    sector: "retail", code: "CMP-RET-CASH", title: "حدّ النقد", titleEn: "Cash limit",
    description: `أي عملية نقدية تتجاوز ${RETAIL_CASH_LIMIT_KWD} د.ك تحتاج اعتماد مدير الفرع.`,
  }],
};

const PATIENT_FIELDS = ["civilId", "civilIdNumber", "patientName", "phone", "mobile", "diagnosis", "medicalRecordNumber", "mrn", "birthDate", "dob", "labResult"];

/** يحجب حقول المريض من الحمولة — نسخةٌ جديدة، والأصل لا يُمسّ. */
export function redactPatientData(payload: Record<string, any>): { payload: Record<string, any>; redactedFields: string[] } {
  const out: Record<string, any> = {};
  const redactedFields: string[] = [];
  const keys = new Set(PATIENT_FIELDS.map(key => key.toLowerCase()));
  for (const [key, value] of Object.entries(payload || {})) {
    if (keys.has(key.toLowerCase()) && value !== undefined && value !== null && String(value) !== "") {
      redactedFields.push(key);
      out[key] = "•••";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = redactPatientData(value);
      out[key] = nested.payload;
      redactedFields.push(...nested.redactedFields.map(field => `${key}.${field}`));
    } else {
      out[key] = value;
    }
  }
  return { payload: out, redactedFields };
}

const normalizeParty = (value: unknown) => String(value || "").replace(/[\sـ]+/g, " ").trim().toLowerCase();

/** يطابق أطراف الملف الجديد بموكّلي المكتب القائمين. */
export function checkConflict(payload: Record<string, any>, knownClients: string[]): { checked: boolean; matches: string[] } {
  const parties = [payload?.opposingParty, ...(Array.isArray(payload?.opposingParties) ? payload.opposingParties : [])]
    .map(normalizeParty).filter(Boolean);
  if (!parties.length) return { checked: false, matches: [] };
  const clients = new Set(knownClients.map(normalizeParty).filter(Boolean));
  return { checked: true, matches: parties.filter(party => clients.has(party)) };
}

const EXTERNAL_ACTION = /send|share|export|notify|release|message|email|sms/i;
const INTAKE_ACTION = /intake|openMatter|createMatter|acceptClient|newClient|conflict/i;

function currentSector(): string {
  try { return String(db.sectorCode || ""); } catch { return ""; }
}

function knownClients(): string[] {
  try {
    return db.workItems.map((item: any) => item.contact || item.details?.clientName).filter(Boolean);
  } catch { return []; }
}

/** يطبّق حزمة امتثال القطاع؛ يُعيد null حين لا تنطبق قاعدة. */
export function applySectorCompliance(
  sector: string, actionName: string, payload: Record<string, any>, clients: string[] = knownClients(),
): PolicyCheckResult | null {
  if (sector === "clinic") {
    const { payload: redactedPayload, redactedFields } = redactPatientData(payload);
    if (redactedFields.length && EXTERNAL_ACTION.test(actionName)) {
      return {
        allowed: true, requiresApproval: true, requiredRole: "manager",
        reasonCode: "CMP-MED-REDACT",
        reasonDescription: `الإجراء يُخرج بيانات مريض (${redactedFields.join("، ")}) — حُجبت في المعاينة ويحتاج الإرسال اعتماداً.`,
        riskLevel: "high", provenance: "حزمة امتثال العيادات — حجب بيانات المريض",
        compliance: { preset: "CMP-MED-REDACT", redactedFields, redactedPayload },
      };
    }
    return null;
  }
  if (sector === "law" && INTAKE_ACTION.test(actionName)) {
    const result = checkConflict(payload, clients);
    if (result.matches.length) {
      return {
        allowed: false, requiresApproval: false,
        reasonCode: "CMP-LAW-CONFLICT",
        reasonDescription: `تعارض مصالح: الخصم (${result.matches.join("، ")}) موكّلٌ لدى المكتب. لا يُفتح الملف.`,
        riskLevel: "critical", provenance: "حزمة امتثال المحاماة — فحص التعارض",
        compliance: { preset: "CMP-LAW-CONFLICT", conflictMatches: result.matches },
      };
    }
    if (!result.checked) {
      return {
        allowed: true, requiresApproval: true, requiredRole: "manager",
        reasonCode: "CMP-LAW-CONFLICT-UNCHECKED",
        reasonDescription: "لم تُذكر أطراف الخصومة فتعذّر فحص التعارض — يحتاج فتح الملف اعتماد شريك.",
        riskLevel: "high", provenance: "حزمة امتثال المحاماة — فحص التعارض",
        compliance: { preset: "CMP-LAW-CONFLICT", conflictMatches: [] },
      };
    }
    return null;
  }
  if (sector === "retail") {
    const method = String(payload?.paymentMethod || payload?.method || "").toLowerCase();
    const cash = Number(payload?.cashAmount ?? (method === "cash" ? payload?.amount ?? payload?.amountKwd : 0) ?? 0);
    if (Number.isFinite(cash) && cash > RETAIL_CASH_LIMIT_KWD) {
      return {
        allowed: true, requiresApproval: true, requiredRole: "manager",
        reasonCode: "CMP-RET-CASH",
        reasonDescription: `عملية نقدية بـ${cash} د.ك تتجاوز حدّ النقد (${RETAIL_CASH_LIMIT_KWD} د.ك) — تحتاج اعتماد مدير الفرع.`,
        riskLevel: "high", provenance: "حزمة امتثال التجزئة — حدّ النقد",
        compliance: { preset: "CMP-RET-CASH", cashAmount: cash, cashLimit: RETAIL_CASH_LIMIT_KWD },
      };
    }
    return null;
  }
  return null;
}

export class PolicyEngine {
  public static evaluateAction(
    actionName: string,
    payload: Record<string, any>,
    userRole: UserRole,
    sector: string = currentSector(),
  ): PolicyCheckResult {
    const sectorResult = applySectorCompliance(sector, actionName, payload || {});
    if (sectorResult) return sectorResult;

    // 1. High value financial or official application creation
    if (actionName === "createApplicationRecord" || actionName === "issuePaymentInvoice") {
      const amount = Number(payload.tuitionFee || payload.totalTuitionKwd || 0);
      if (amount > 50) {
        return {
          allowed: true,
          requiresApproval: true,
          requiredRole: "manager",
          reasonCode: "POL-FIN-02_HIGH_VALUE_THRESHOLD",
          reasonDescription:
            "لائحة الصلاحيات المالية POL-FIN-02: أي عملية تتجاوز 50 د.ك تتطلب موافقة يدوية مسبقة من مدير القبول.",
          riskLevel: "high",
          provenance: "SIS Central Billing Table + Policy POL-FIN-02 v3",
        };
      }
    }

    // 2. Refund action
    if (actionName === "issueRefund" || actionName === "processTuitionRefund") {
      return {
        allowed: true,
        requiresApproval: true,
        requiredRole: "owner",
        reasonCode: "POL-FIN-02_REFUND_ESCALATION",
        reasonDescription: "استرداد الرسوم يتطلب اعتماد المدير العام أو المدير المالي بعد تدقيق إيصال K-Net.",
        riskLevel: "high",
        provenance: "Refund Policy v4.1",
      };
    }

    // 3. Document gate for visit booking
    if (actionName === "bookCampusTour") {
      if (payload.civilIdVerified === false) {
        return {
          allowed: false,
          requiresApproval: false,
          reasonCode: "POL-DOC-01_UNVERIFIED_CIVIL_ID",
          reasonDescription:
            "سياسة POL-DOC-01: حجز الموعد النهائي محظور دون بطاقة مدنية سارية ومطابقة للسن القانوني.",
          riskLevel: "medium",
          provenance: "Ministry Age Cutoff Directive 2026",
        };
      }
    }

    // 4. Low risk default actions (checking availability, fee lookups)
    return {
      allowed: true,
      requiresApproval: false,
      reasonCode: "APPROVED_POLICY_STANDARD",
      reasonDescription: "إجراء تشغيلي قياسي منخفض المخاطر يقع ضمن صلاحيات التشغيل التلقائي.",
      riskLevel: "low",
      provenance: "Live System Authoritative Sources",
    };
  }
}
