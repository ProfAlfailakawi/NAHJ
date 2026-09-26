/*
 * تسمياتٌ عربية لرموز النظام.
 *
 * «POL-FIN-02_HIGH_VALUE_THRESHOLD» و«high» تُكتب للمهندس لا للمعتمِد. الرمز
 * يبقى في السجل وفي تلميحٍ لمن يحتاجه، والمعروض جملةٌ تُقرأ.
 */

export const RISK_LABEL_AR: Record<string, string> = {
  low: "خطورة منخفضة",
  medium: "خطورة متوسطة",
  high: "خطورة عالية",
  critical: "خطورة حرجة",
};

export const RISK_LABEL_EN: Record<string, string> = {
  low: "Low risk", medium: "Medium risk", high: "High risk", critical: "Critical risk",
};

export const riskLabel = (risk: string, ar: boolean) =>
  (ar ? RISK_LABEL_AR : RISK_LABEL_EN)[risk] || risk;

/* من الأخصّ إلى الأعمّ: أول بادئة تطابق تُعتمد. */
const REASON_PREFIXES: [RegExp, string, string][] = [
  [/^CMP-MED-REDACT/, "حجب بيانات المريض", "Patient-data redaction"],
  [/^CMP-LAW-CONFLICT-UNCHECKED/, "تعارض مصالح لم يُفحص", "Conflict check not possible"],
  [/^CMP-LAW-CONFLICT/, "تعارض مصالح", "Conflict of interest"],
  [/^CMP-RET-CASH/, "تجاوز حدّ النقد", "Cash limit exceeded"],
  [/REFUND/, "استرداد مبلغ يحتاج اعتماداً", "Refund needs approval"],
  [/HIGH_VALUE/, "مبلغ يتجاوز حدّ الصلاحية المالية", "Amount above financial authority"],
  [/^POL-FIN/, "لائحة الصلاحيات المالية", "Financial authority policy"],
  [/UNVERIFIED_CIVIL_ID|^POL-DOC/, "مستند غير متحقَّق منه", "Unverified document"],
  [/^POL-MED/, "سياسة طبية", "Medical policy"],
  [/^POL-LAW|^POL-LEG/, "سياسة قانونية", "Legal policy"],
  [/^POL-RET|^POL-POS/, "سياسة البيع", "Retail policy"],
  [/APPROVED_POLICY_STANDARD/, "إجراء قياسي ضمن الصلاحيات", "Standard in-policy action"],
  [/^POL-/, "قاعدة سياسة", "Policy rule"],
];

export function reasonLabel(code: string, ar: boolean): string {
  const value = String(code || "");
  for (const [pattern, arLabel, enLabel] of REASON_PREFIXES) if (pattern.test(value)) return ar ? arLabel : enLabel;
  return ar ? "قاعدة اعتماد" : "Approval rule";
}

export const ROLE_LABEL_AR: Record<string, string> = {
  owner: "المالك", admin: "المشرف", manager: "المدير", employee: "الموظف", operator: "الموظف", auditor: "المدقّق", viewer: "المشاهد",
};
