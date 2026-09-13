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
}

export class PolicyEngine {
  public static evaluateAction(
    actionName: string,
    payload: Record<string, any>,
    userRole: UserRole
  ): PolicyCheckResult {
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
