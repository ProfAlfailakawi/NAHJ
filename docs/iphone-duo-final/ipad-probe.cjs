/*
 * Duo ≠ iPad — مسبار: لا يجوز لأي قاعدة كتابٍ/حاسوبٍ أن تعمل على iPad.
 *   PORT=5205 NAHJ_FIREBASE_SYNC=off NAHJ_DATABASE_PATH=:memory: npx tsx server.ts
 *   NODE_PATH=/opt/node22/lib/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node docs/iphone-duo-final/ipad-probe.cjs
 * لكل مقاس: مطابقة استعلامات Duo، وعلامات الأسلوب المحسوب (شبكة القسم، الشريط الجانبي، شريط الأسفل، ستار النافذة)،
 * وعلى مقاسات iPad: تُحذف كتل Duo الأربع من الـ CSSOM وتُقارن مستطيلات الحاويات الرئيسة (يجب أن تتطابق تماماً).
 */
const { webkit } = require("playwright");
const BASE = process.env.NAHJ_URL || "http://localhost:5205";
const IPAD = [[744,1133],[768,1024],[810,1080],[820,1180],[834,1112],[834,1194],[1024,1366],[1133,744],[1024,768],[1080,810],[1180,820],[1112,834],[1194,834],[1366,1024],
  [744,1040],[768,920],[768,950],[810,990],[820,1090],[834,1020],[1024,690],[1133,660],[1180,735]];
/* 669×520 وضع «نصف مفتوح» (F): الشريط الجانبي لا الكتاب، بالتصميم (انظر الاعتماد). */
const DUO_NO_BOOK = new Set(["669x520"]);
const DUO = [[669,867],[669,520],[660,800],[700,900],[720,900],[951,585],[880,585],[1000,600]];
const SCREENS = ["اليوم", "العمل", "الحوكمة"];
const UA_IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const isDuoMQ = t => /min-width: 640px\) and \(max-width: 720px|min-width: 560px\) and \(max-height: 430px|min-width: 901px\) and \(max-width: 1000px|min-width: 860px\) and \(max-width: 1000px/.test(t);

async function enter(p) {
  await p.goto(BASE + "/app", { waitUntil: "domcontentloaded" });
  await p.evaluate(() => fetch("/api/demo/enter", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
  await p.goto(BASE + "/app", { waitUntil: "domcontentloaded" });
  await p.waitForSelector(".app-shell", { timeout: 30000 });
  await p.waitForTimeout(700);
}
async function go(p, name) {
  await p.evaluate(n => {
    const vis = b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const lab = b => (b.getAttribute("aria-label") || b.textContent || "").trim();
    const d = [...document.querySelectorAll(".desktop-rail .nav-icon, .mobile-dock button")].find(b => vis(b) && lab(b) === n);
    if (d) d.click(); else { const m = [...document.querySelectorAll(".mobile-dock button[aria-expanded]")].find(vis); m && m.click(); }
  }, name);
  await p.waitForTimeout(250);
  await p.evaluate(n => { const b = [...document.querySelectorAll(".mobile-sheet-grid button")].find(x => x.textContent.trim() === n); b && b.click(); }, name);
  await p.waitForTimeout(500);
}
const snap = p => p.evaluate(() => {
  const cs = (s, k) => { const e = document.querySelector(s); return e ? getComputedStyle(e)[k] : null; };
  const rect = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round).join(","); };
  return {
    spreadDisplay: cs(".page-enter", "display"), spreadGap: cs(".page-enter", "columnGap"),
    bookVar: getComputedStyle(document.documentElement).getPropertyValue("--book-m").trim() || null,
    rail: cs(".desktop-rail", "display"), dock: cs(".mobile-dock", "position"),
    rects: ["#root .app-shell", ".desktop-rail", ".topbar", ".content-stage", ".page-enter", ".mobile-dock"].map(rect).join("|"),
  };
});
const stable = async p => { let prev = ""; for (let i = 0; i < 12; i++) { const c = JSON.stringify(await snap(p)); if (c === prev) return JSON.parse(c); prev = c; await p.waitForTimeout(350); } return JSON.parse(prev); };
const stripDuo = p => p.evaluate(() => { let n = 0;
  for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules; } catch { continue; }
    for (let i = rules.length - 1; i >= 0; i--) { const r = rules[i];
      if (r.type === CSSRule.MEDIA_RULE && /min-height: 760px\)|max-height: 430px\)|min-width: 901px\) and \(max-width: 1000px|min-width: 860px\) and \(max-width: 1000px/.test(r.conditionText) && /screen/.test(r.conditionText)) { sh.deleteRule(i); n++; } } }
  return n; });

(async () => {
  const browser = await webkit.launch();
  const out = []; let bad = 0;
  for (const [kind, sizes] of [["ipad", IPAD], ["duo", DUO]]) for (const [w, h] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true, userAgent: kind === "ipad" ? UA_IPAD : undefined, reducedMotion: "reduce" });
    await ctx.addInitScript(() => { const a = () => { const s = document.createElement("style"); s.textContent = "::-webkit-scrollbar{width:0!important;height:0!important}"; document.documentElement.appendChild(s); }; document.documentElement ? a() : document.addEventListener("DOMContentLoaded", a); });
    const p = await ctx.newPage();
    await enter(p);
    const mq = await p.evaluate(() => ({
      portraitBook: matchMedia("screen and (min-width: 640px) and (max-width: 720px) and (min-height: 760px)").matches,
      landBook: matchMedia("screen and (min-width: 860px) and (max-width: 1000px) and (min-height: 520px) and (max-height: 760px)").matches,
      laptop: matchMedia("screen and (min-width: 560px) and (max-height: 430px)").matches }));
    const row = { size: `${w}x${h}`, kind, mq, screens: {} };
    for (const s of SCREENS) { await go(p, s); row.screens[s] = await stable(p); }
    if (kind === "ipad") {
      /* لا شيء من كتل Duo يعمل هنا؛ حذفها من الـ CSSOM يجب ألا يغيّر مستطيلاً واحداً. */
      row.stripped = await stripDuo(p);
      for (const s of SCREENS) {
        await go(p, s);
        const b = await stable(p), a = row.screens[s];
        if (a.rects !== b.rects || a.spreadDisplay !== b.spreadDisplay) { row.diff = row.diff || []; row.diff.push(s); }
      }
    }
    // dialog: approval sheet backdrop padding
    await go(p, "اليوم");
    await p.evaluate(() => { const b = [...document.querySelectorAll(".top-icon.notification")].find(x => x.getBoundingClientRect().width > 0); b && b.click(); });
    await p.waitForTimeout(500);
    row.dialog = await p.evaluate(() => { const b = document.querySelector(".modal-backdrop"); return b ? { padEnd: getComputedStyle(b).paddingInlineEnd, w: Math.round(b.getBoundingClientRect().width) } : null; });
    const duoActive = mq.portraitBook || mq.landBook || mq.laptop;
    row.verdict = kind === "ipad" ? (!duoActive && !row.diff && !Object.values(row.screens).some(s => s.spreadDisplay === "grid" || s.bookVar) ? "NO_DUO" : "DUO_LEAK") : (mq.portraitBook || mq.landBook || mq.laptop ? "DUO_ON" : "DUO_OFF");
    if ((kind === "ipad" && row.verdict !== "NO_DUO") || (kind === "duo" && row.verdict !== (DUO_NO_BOOK.has(row.size) ? "DUO_OFF" : "DUO_ON"))) bad++;
    out.push(row); console.log(row.size, kind, row.verdict, JSON.stringify(mq), row.diff || "");
    await ctx.close();
  }
  await browser.close();
  require("fs").writeFileSync(process.argv[2] || "ipad-probe.json", JSON.stringify(out, null, 1));
  console.log("bad:", bad); process.exit(bad ? 1 : 0);
})();
