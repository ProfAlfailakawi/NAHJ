/*
 * أيقونات القطاعات للصفحات العامة (lucide، ISC) — بدل الرموز التعبيرية.
 * الحقل `logo` في الحزم يبقى كما هو؛ الواجهة ترسم الأيقونة بحسب رمز القطاع.
 */
const ICONS: Record<string, string> = {
  education: "<path d=\"M14 21v-3a2 2 0 0 0-4 0v3\"/><path d=\"M18 5v16\"/><path d=\"m4 6 7.106-3.79a2 2 0 0 1 1.788 0L20 6\"/><path d=\"m6 11-3.52 2.147a1 1 0 0 0-.48.854V19a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a1 1 0 0 0-.48-.853L18 11\"/><path d=\"M6 5v16\"/><circle cx=\"12\" cy=\"9\" r=\"2\"/>",
  clinic: "<path d=\"M11 2v2\"/><path d=\"M5 2v2\"/><path d=\"M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1\"/><path d=\"M8 15a6 6 0 0 0 12 0v-3\"/><circle cx=\"20\" cy=\"10\" r=\"2\"/>",
  law: "<path d=\"m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z\"/><path d=\"m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z\"/><path d=\"M7 21h10\"/><path d=\"M12 3v18\"/><path d=\"M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2\"/>",
  retail: "<path d=\"M16 10a4 4 0 0 1-8 0\"/><path d=\"M3.103 6.034h17.794\"/><path d=\"M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z\"/>",
  logistics: "<path d=\"M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2\"/><path d=\"M15 18H9\"/><path d=\"M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14\"/><circle cx=\"17\" cy=\"18\" r=\"2\"/><circle cx=\"7\" cy=\"18\" r=\"2\"/>",
  realestate: "<path d=\"M10 12h4\"/><path d=\"M10 8h4\"/><path d=\"M14 21v-3a2 2 0 0 0-4 0v3\"/><path d=\"M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2\"/><path d=\"M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16\"/>",
  general: "<path d=\"M12 10h.01\"/><path d=\"M12 14h.01\"/><path d=\"M12 6h.01\"/><path d=\"M16 10h.01\"/><path d=\"M16 14h.01\"/><path d=\"M16 6h.01\"/><path d=\"M8 10h.01\"/><path d=\"M8 14h.01\"/><path d=\"M8 6h.01\"/><path d=\"M9 22v-3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3\"/><rect x=\"4\" y=\"2\" width=\"16\" height=\"20\" rx=\"2\"/>",
};

const TONES: Record<string, string> = { education: "#e8ecfb", clinic: "#dfeee7", law: "#eee9fb", retail: "#f9e4df", logistics: "#f7ead5", realestate: "#e8ecfb", general: "#ebe6d8" };

export function sectorIconSvg(code: string): string {
  const inner = ICONS[code] || ICONS.general;
  return `<span class="sector-icon" style="background:${TONES[code] || TONES.general}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg></span>`;
}
