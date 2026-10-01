/*
 * لغة صندوق العرض.
 *
 * بيانات التاريخ التي يولّدها الخادم في العرض (حالات مكتملة، موافقات محسومة، سجلّ تدقيق، إشارات
 * تعلّم مغلقة) كانت تُكتب بالعربية دائماً، فتظهر عربيةً بين واجهةٍ إنجليزية. الصندوق الآن يعرف
 * لغة زائره ويولّد هذه النصوص بها. ولا شأن لهذا بالإنتاج: `Store` الحقيقي يبقى `ar` ولا يمرّ
 * من هنا إلا ما يمرّ عبر مخزنٍ تجريبي.
 */

export type DemoLang = "ar" | "en";

export const normalizeLang = (value: unknown): DemoLang =>
  String(value || "").toLowerCase().startsWith("en") ? "en" : "ar";

/** تبديل نصٍّ بحسب اللغة. */
export const pick = (lang: DemoLang, ar: string, en: string): string => (lang === "en" ? en : ar);

const pad2 = (value: number) => String(value).padStart(2, "0");

/**
 * عرض الوقت النسبي بلغة الصندوق: «قبل يومين، 09:15 ص» أو «2 days ago, 09:15 AM».
 * بعد أسبوعٍ يُكتب التاريخ نفسه في اللغتين.
 */
export function displayStampLang(date: Date, dayOffset: number, lang: DemoLang): string {
  if (dayOffset > 10) return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}${lang === "en" ? ", " : "، "}${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  const hours = date.getHours();
  const clock = `${pad2(hours)}:${pad2(date.getMinutes())}`;
  if (lang === "en") {
    const day = dayOffset === 0 ? "Today" : dayOffset === 1 ? "Yesterday" : `${dayOffset} days ago`;
    return `${day}, ${clock} ${hours >= 12 ? "PM" : "AM"}`;
  }
  const day = dayOffset === 0 ? "اليوم" : dayOffset === 1 ? "أمس" : dayOffset === 2 ? "قبل يومين" : `قبل ${dayOffset} أيام`;
  return `${day}، ${clock} ${hours >= 12 ? "م" : "ص"}`;
}

/*
 * ما تكتبه المحرّكات في سجلّ التدقيق (جُمل عربية بقوالب ثابتة) يُترجَم عند الكتابة في صندوق
 * إنجليزي. الأنماط تطابق القوالب نفسها؛ وما لا يطابق يبقى كما جاء — لا يُخترع.
 */
const AUDIT_PATTERNS: Array<[RegExp, (m: RegExpExecArray) => string]> = [
  [/^تقييم (\d+) حالة: اجتازت (\d+)، ورسبت (\d+)\. النسبة (\d+)%\.?$/, m => `Evaluated ${m[1]} cases: ${m[2]} passed, ${m[3]} failed. Pass rate ${m[4]}%.`],
  [/^قورن (\d+) قراراً: تطابق (\d+)، وانحرف (\d+)\. نسبة التطابق (\d+)%\.?$/, m => `Compared ${m[1]} decisions: ${m[2]} matched, ${m[3]} drifted. Match rate ${m[4]}%.`],
  [/^استُبدل العقل التشغيلي بحزمة «(.+)» — (\d+) مهارة و(\d+) سياسة\. سجلّ التدقيق محفوظ\.$/, m => `Operating brain replaced with the “${m[1]}” pack: ${m[2]} skills and ${m[3]} policies. The audit trail is kept.`],
  [/^ترقية استقلالية مهارة "(.+)" من المستوى (\d+) إلى المستوى (\d+) بواسطة (.+)\.$/, m => `Skill “${m[1]}” autonomy promoted from level ${m[2]} to level ${m[3]} by ${m[4]}.`],
  [/^استرجاع مهارة "(.+)" من الإصدار v(\d+) إلى الإصدار v(\d+) مع الحفاظ على سجل التدقيق كاملاً\.$/, m => `Skill “${m[1]}” rolled back from v${m[2]} to v${m[3]}; the audit trail is preserved.`],
  [/^تفعيل قاطع الطوارئ \(إيقاف فوري\) لمهارة "(.+)"\.$/, m => `Kill switch engaged (immediate stop) for skill “${m[1]}”.`],
  [/^إلغاء قاطع الطوارئ \(استئناف العمل\) لمهارة "(.+)"\.$/, m => `Kill switch released (work resumed) for skill “${m[1]}”.`],
  [/^(اعتماد|رفض) إجراء (\S+) للمعاملة (.+) بواسطة (.+?)\.(?: السبب: (.+))?$/, m => `${m[1] === "اعتماد" ? "Approved" : "Rejected"} action ${m[2]} for case ${m[3]} by ${m[4]}.${m[5] ? ` Reason: ${m[5]}` : ""}`],
  [/^الموظف (.+) استلم المعاملة (\S+) يدويًا وأوقف تحكم الذكاء الاصطناعي\.$/, m => `${m[1]} took over case ${m[2]} manually and paused AI control.`],
  [/^استئناف تشغيل الذكاء الاصطناعي على المعاملة (\S+)\.$/, m => `AI processing resumed on case ${m[1]}.`],
  [/^تصدير دفتر «(.+)» بصيغة CSV\.$/, m => `Exported the “${m[1]}” ledger as CSV.`],
  [/^بدء جلسة تعليم حية: "(.+)" بواسطة (.+)\.$/, m => `Live teaching session started: “${m[1]}” by ${m[2]}.`],
  [/^اعتماد المهارة المتعلّمة "(.+)" كإصدار v1 وإضافتها إلى Company Brain\.$/, m => `Learned skill “${m[1]}” approved as v1 and added to the Company Brain.`],
  [/^تحديث النص الإنجليزي لمهارة «(.+)»\.$/, m => `English text of skill “${m[1]}” updated.`],
];

export function localizeAuditDetails(details: string, lang: DemoLang): string {
  if (lang !== "en") return details;
  const text = String(details || "");
  for (const [pattern, build] of AUDIT_PATTERNS) {
    const match = pattern.exec(text);
    if (match) return build(match);
  }
  return text;
}

const ACTOR_EN: Record<string, string> = {
  "نهج": "NAHJ", "محرك السياسات": "Policy engine", "محرّك السياسات": "Policy engine",
  "النظام": "System", "زائر العرض": "Demo visitor", "محرّك التقييم": "Evaluation engine",
};
export const localizeActor = (name: string, lang: DemoLang): string => (lang === "en" ? ACTOR_EN[name] || name : name);
