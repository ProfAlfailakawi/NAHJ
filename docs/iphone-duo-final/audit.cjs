/*
 * iPhone Duo — تدقيق الجولة الأخيرة (وضع الكتاب + مصفوفة الوضعيات A–J).
 *
 * يعمل على خادم تطوير محلي ببيانات العرض التجريبي المعزولة (لا إنتاج ولا كتابة حقيقية):
 *   PORT=5201 NAHJ_FIREBASE_SYNC=off NAHJ_DATABASE_PATH=:memory: npx tsx server.ts
 *   NODE_PATH=/opt/node22/lib/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
 *     node docs/iphone-duo-final/audit.cjs [outDir]          (NAHJ_URL يغيّر العنوان، الافتراضي http://localhost:5201)
 *
 * يقيس لكل (مقاس × شاشة): التمرير الأفقي، وأهداف اللمس الأصغر من 44px، والعناصر المقصوصة أفقياً،
 * وفي مقاسات الكتاب: كل نصّ أو عنصر تفاعلي يقطع منطقة الكعب (المنتصف ± 16px).
 * ثم: الانتقال الحي بلا إعادة تحميل، وحجب الستار للّمس، والتبويبات، وضغط الوصول (J).
 * الناتج: <outDir>/report.json وصور JPEG في <outDir>/shots.
 */
const { webkit } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.env.NAHJ_URL || "http://localhost:5201";
const OUT = path.resolve(process.argv[2] || "duo-final-audit-out");
const SHOTS = path.join(OUT, "shots");
fs.mkdirSync(SHOTS, { recursive: true });

const SPINE = 32;
const POSES = {
  A: [[382, 580], [385, 571], [320, 568]],
  B: [[594, 368]],
  C: [[669, 867]],
  D: [[951, 585]],
  E: [[951, 350], [600, 350]],
  F: [[669, 520], [600, 480]],
  G: [[768, 1024], [1024, 768], [1280, 800], [1440, 900]],
  H: [[360, 640], [390, 844], [844, 390]],
  X: [[320, 350], [320, 600], [320, 900], [470, 350], [470, 600], [470, 900], [620, 350], [620, 600], [620, 900]],
};
const SECTIONS = ["اليوم", "يتعلّم", "علّم", "المهارات", "التدرّب", "العمل", "المحادثة", "الربط", "الأثر", "الحوكمة",
  "الأشخاص", "السجل", "الحسابات", "الاشتراك", "النشاط", "لوحة المالك", "المسوّقون"];
const BOOK_MQ = "screen and (min-width: 640px) and (max-width: 720px) and (min-height: 760px), screen and (min-width: 860px) and (max-width: 1000px) and (min-height: 520px) and (max-height: 760px)";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
/* Safari على iOS يرسم أشرطة تمرير طافية لا تأخذ عرضاً؛ WebKit على Linux يرسمها بعرض. نخفيها كي يطابق المنتصفُ الشاشة. */
const OVERLAY_SCROLLBARS = "::-webkit-scrollbar{width:0!important;height:0!important;background:transparent}";

const report = { base: BASE, startedAt: new Date().toISOString(), engine: "Playwright WebKit", matrix: [], live: [], tabs: [], modals: [], stress: [], errors: [] };

async function newCtx(browser, w, h, extra = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, userAgent: UA, reducedMotion: "reduce", ...extra });
  await ctx.addInitScript(css => { const add = () => { const s = document.createElement("style"); s.textContent = css; document.documentElement.appendChild(s); }; if (document.documentElement) add(); else document.addEventListener("DOMContentLoaded", add); }, OVERLAY_SCROLLBARS);
  return ctx;
}
async function demoPage(ctx) {
  const p = await ctx.newPage();
  p.on("pageerror", e => { if (!/access control checks/.test(e.message)) report.errors.push(String(e.message).slice(0, 200)); });
  await p.goto(BASE + "/app");
  await p.evaluate(() => fetch("/api/demo/enter", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
  await p.goto(BASE + "/app");
  await p.waitForSelector(".app-shell", { timeout: 30000 });
  await p.waitForTimeout(900);
  return p;
}
async function go(p, name, retry = 1) {
  try { return await goOnce(p, name); }
  catch (e) { if (!retry) throw e; await p.waitForSelector(".app-shell", { timeout: 30000 }); return go(p, name, retry - 1); }
}
async function goOnce(p, name) {
  const ok = await p.evaluate(n => {
    const vis = b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== "hidden"; };
    const label = b => (b.getAttribute("aria-label") || b.textContent || "").trim();
    const direct = [...document.querySelectorAll(".desktop-rail .nav-icon, .mobile-dock button")].find(b => vis(b) && label(b) === n);
    if (direct) { direct.click(); return "direct"; }
    const more = [...document.querySelectorAll(".mobile-dock button[aria-expanded]")].find(vis);
    if (more) { more.click(); return "more"; }
    return "";
  }, name);
  if (ok === "more") {
    await p.waitForSelector(".mobile-sheet-grid button");
    await p.evaluate(n => { const b = [...document.querySelectorAll(".mobile-sheet-grid button")].find(x => x.textContent.trim() === n); b && b.click(); }, name);
  }
  await p.waitForTimeout(450);
  await p.evaluate(() => window.scrollTo(0, 0));
  return ok;
}

/* القياس داخل الصفحة. */
async function measure(p) {
  return p.evaluate(({ SPINE, BOOK_MQ }) => {
    const W = innerWidth, H = innerHeight, doc = document.documentElement;
    const book = matchMedia(BOOK_MQ).matches;
    const cx = W / 2, z0 = cx - SPINE / 2, z1 = cx + SPINE / 2;
    const shown = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return false; } return true; };
    const clipRect = (el, r) => {
      let { left, right, top, bottom } = r;
      for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
        const s = getComputedStyle(e);
        if (s.position === "fixed") break;
        if (s.overflowX !== "visible" || s.overflowY !== "visible" || s.clipPath !== "none") {
          const c = e.getBoundingClientRect();
          if (s.overflowX !== "visible") { left = Math.max(left, c.left); right = Math.min(right, c.right); }
          if (s.overflowY !== "visible") { top = Math.max(top, c.top); bottom = Math.min(bottom, c.bottom); }
        }
      }
      return { left, right, top, bottom, w: right - left, h: bottom - top };
    };
    const name = el => (el.getAttribute && (el.getAttribute("aria-label") || "")) || (el.className && String(el.className).split(" ")[0]) || el.tagName;
    const out = { W, H, book, scrollW: doc.scrollWidth, clientW: doc.clientWidth, overflowX: doc.scrollWidth - doc.clientWidth, spineHits: [], small: [], clipped: [] };
    const sel = "button, a[href], input:not([type=hidden]), select, textarea, summary, [role=tab], [role=button]";
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || !shown(el)) continue;
      const c = clipRect(el, r);
      if (c.w < 2 || c.h < 2) continue;
      const tiny = (r.width < 44 || r.height < 44) && !el.closest(".term,.sr-only") && !["checkbox", "radio"].includes(el.type);
      if (tiny) out.small.push(`${el.tagName.toLowerCase()}:${name(el).slice(0, 40)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      if (c.left < -1 || c.right > W + 1) out.clipped.push(`${name(el).slice(0, 40)} [${Math.round(c.left)},${Math.round(c.right)}]`);
      if (book && c.left < z1 && c.right > z0) out.spineHits.push(`ctl:${name(el).slice(0, 40)} [${Math.round(c.left)}-${Math.round(c.right)}]`);
    }
    if (book) {
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: n => n.nodeValue.trim() ? 1 : 2 });
      const rg = document.createRange();
      for (let n; (n = tw.nextNode());) {
        const el = n.parentElement;
        if (!el || el.closest("script,style,.sr-only,[hidden]") || !shown(el)) continue;
        rg.selectNodeContents(n);
        for (const r of rg.getClientRects()) {
          if (r.width < 1 || r.height < 1) continue;
          const c = clipRect(el, r);
          if (c.w < 1 || c.h < 1) continue;
          if (c.left < z1 && c.right > z0) { out.spineHits.push(`text:"${n.nodeValue.trim().slice(0, 24)}" [${Math.round(c.left)}-${Math.round(c.right)}]`); break; }
        }
      }
      for (const h of document.querySelectorAll("h1")) { const r = h.getBoundingClientRect(); if (r.width && (r.left < -1 || r.right > W + 1)) out.clipped.push("h1"); }
    }
    out.small = [...new Set(out.small)]; out.spineHits = [...new Set(out.spineHits)];
    return out;
  }, { SPINE, BOOK_MQ });
}
const slim = m => ({ overflowX: m.overflowX, spineHits: m.spineHits.length, spineSample: m.spineHits.slice(0, 6), small: m.small.length, smallSample: m.small.slice(0, 6), clipped: m.clipped.length, clippedSample: m.clipped.slice(0, 4), book: m.book });
const shot = (p, file) => p.screenshot({ path: path.join(SHOTS, file + ".jpg"), quality: 55 });

async function openSub(p, kind) {
  const click = sel => p.evaluate(s => { const b = [...document.querySelectorAll(s)].find(x => x.getBoundingClientRect().width > 0); if (b) { b.click(); return true; } return false; }, sel);
  if (kind === "approval") { await click(".top-icon.notification"); return p.waitForSelector(".approval-sheet", { timeout: 4000 }).then(() => true, () => false); }
  if (kind === "pause") {
    /* فوق 900px لا زرّ عائم: الإيقاف من «الحوكمة». */
    if (!(await click(".emergency-fab"))) { await go(p, "الحوكمة"); await p.evaluate(() => { const b = [...document.querySelectorAll(".content-stage button")].find(x => /إيقاف/.test(x.textContent)); b && b.click(); }); }
    return p.waitForSelector(".emergency-sheet", { timeout: 4000 }).then(() => true, () => false); }
  if (kind === "palette") { if (!(await click(".topbar .command-search"))) { await click(".mobile-dock button[aria-expanded]"); await p.waitForTimeout(150); await click(".mobile-sheet-search"); } return p.waitForSelector(".palette", { timeout: 4000 }).then(() => true, () => false); }
  if (kind === "help") { if (!(await click(".rail-help"))) { await click(".mobile-dock button[aria-expanded]"); await p.waitForTimeout(150); await p.evaluate(() => { const b = [...document.querySelectorAll(".mobile-sheet-grid button")].pop(); b && b.click(); }); } return p.waitForSelector(".help-panel", { timeout: 4000 }).then(() => true, () => false); }
  if (kind === "more") { if (!(await click(".mobile-dock button[aria-expanded]"))) return false; return p.waitForSelector(".mobile-sheet", { timeout: 3000 }).then(() => true, () => false); }
  if (kind === "promotion") {
    await go(p, "المهارات");
    await p.evaluate(() => { const bs = [...document.querySelectorAll(".autonomy-chooser button")]; const i = bs.findIndex(b => b.classList.contains("active")); const t = bs[i + 1]; t && t.click(); });
    return p.waitForSelector(".modal-backdrop [role=dialog]", { timeout: 4000 }).then(() => true, () => false);
  }
  return false;
}
async function closeSub(p) {
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  await p.evaluate(() => { document.querySelector(".mobile-sheet-backdrop")?.click(); const c = document.querySelector(".modal-close"); c && c.click(); const h = document.querySelector(".help-backdrop"); if (h) h.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); });
  await p.waitForTimeout(200);
}

(async () => {
  const browser = await webkit.launch();
  /* DUO_POSES=C,D يحصر المصفوفة في وضعيات بعينها؛ DUO_QUICK=1 يتخطّى المراحل الأخرى (للمقارنة بخط الأساس). */
  const only = (process.env.DUO_POSES || "").split(",").filter(Boolean);
  const quick = process.env.DUO_QUICK === "1";
  const all = Object.entries(POSES).filter(([pose]) => !only.length || only.includes(pose)).flatMap(([pose, list]) => list.map(([w, h]) => ({ pose, w, h })));

  /* ---- الدخول (مجهول) ---- */
  {
    const ctx = await newCtx(browser, 951, 585); const p = await ctx.newPage();
    await p.goto(BASE + "/app"); await p.waitForSelector(".login-shell", { timeout: 30000 }); await p.waitForTimeout(1600); /* شاشة البدء تختفي بعد ~900ms */
    for (const v of all) { await p.setViewportSize({ width: v.w, height: v.h }); await p.waitForTimeout(150); const m = await measure(p); report.matrix.push({ pose: v.pose, size: `${v.w}x${v.h}`, screen: "الدخول", ...slim(m) }); if ("ACDEB".includes(v.pose)) await shot(p, `${v.pose}-${v.w}x${v.h}-login`); }
    /* إنشاء حساب محلي في قاعدة الذاكرة → شاشة إعداد المؤسسة. */
    try {
      await p.setViewportSize({ width: 951, height: 585 });
      const inputs = await p.$$(".login-shell input");
      const vals = ["مالك تجريبي", "owner@duo.test", "duo-audit-Passw0rd!"];
      for (let i = 0; i < inputs.length && i < 3; i++) await inputs[i].fill(vals[i + (inputs.length === 2 ? 1 : 0)]);
      await p.click(".login-shell button[type=submit]");
      await p.waitForSelector(".org-setup", { timeout: 15000 });
      for (const v of all) { await p.setViewportSize({ width: v.w, height: v.h }); await p.waitForTimeout(150); const m = await measure(p); report.matrix.push({ pose: v.pose, size: `${v.w}x${v.h}`, screen: "إعداد المؤسسة", ...slim(m) }); if ("ACDE".includes(v.pose)) await shot(p, `${v.pose}-${v.w}x${v.h}-org-setup`); }
    } catch (e) { report.errors.push("org-setup: " + e.message.slice(0, 160)); }
    await ctx.close();
  }

  /* ---- كل الأقسام والشاشات الفرعية في كل مقاس ---- */
  const ctx = await newCtx(browser, 951, 585);
  const p = await demoPage(ctx);
  for (const v of all) {
    await p.setViewportSize({ width: v.w, height: v.h }); await p.waitForTimeout(200);
    for (const s of SECTIONS) {
      await go(p, s);
      const m = await measure(p);
      report.matrix.push({ pose: v.pose, size: `${v.w}x${v.h}`, screen: s, ...slim(m) });
      if (v.pose !== "X" && (v.pose !== "G" || v.w === 1024)) await shot(p, `${v.pose}-${v.w}x${v.h}-${s}`);
    }
    for (const sub of ["approval", "pause", "palette", "help", "more", "promotion"]) {
      if (sub !== "promotion") await go(p, "العمل");
      const opened = await openSub(p, sub);
      const m = await measure(p);
      report.matrix.push({ pose: v.pose, size: `${v.w}x${v.h}`, screen: "sub:" + sub, opened, ...slim(m) });
      if (opened && "ABCDE".includes(v.pose)) await shot(p, `${v.pose}-${v.w}x${v.h}-sub-${sub}`);
      await closeSub(p);
    }
  }

  if (quick) { await ctx.close(); await browser.close(); return finish(); }
  /* ---- التبويبات: بعد كل نقرة، لا تمرير أفقي ---- */
  for (const [w, h] of [[669, 867], [951, 585], [382, 580]]) {
    await p.setViewportSize({ width: w, height: h });
    for (const s of ["العمل", "السجل"]) {
      await go(p, s);
      const n = await p.evaluate(() => document.querySelectorAll(".work-filters button, [role=tab]").length);
      for (let i = 0; i < n; i++) {
        await p.evaluate(i => { const b = document.querySelectorAll(".work-filters button, [role=tab]")[i]; b && b.click(); }, i);
        await p.waitForTimeout(200);
        const o = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        report.tabs.push({ size: `${w}x${h}`, screen: s, tab: i, overflowX: o });
      }
    }
  }

  /* ---- الستار يحجب اللمس: نافذة على صفحة، والنقر على الصفحة الأخرى لا يصل لما تحتها ---- */
  for (const [w, h] of [[669, 867], [951, 585]]) {
    await p.setViewportSize({ width: w, height: h });
    for (const sub of ["approval", "pause", "promotion", "palette", "help"]) {
      if (sub !== "promotion") await go(p, "العمل");
      const opened = await openSub(p, sub);
      const res = await p.evaluate(({ w, h }) => {
        const pts = [[w * 0.25, h * 0.5], [w * 0.75, h * 0.5]];
        return pts.map(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? (e.closest(".modal-backdrop,.palette-backdrop,.help-backdrop,[role=dialog]") ? "overlay" : "UNDERLYING:" + (e.className || e.tagName)) : "none"; });
      }, { w, h });
      const box = await p.evaluate(() => { const d = document.querySelector(".modal-backdrop [role=dialog], .palette, .help-panel"); if (!d) return null; const r = d.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; });
      report.modals.push({ size: `${w}x${h}`, modal: sub, opened, hitTest: res, panelX: box, blocked: res.every(r => r === "overlay") });
      await closeSub(p);
    }
  }

  /* ---- I: الانتقال الحي بلا إعادة تحميل، والحالة باقية ---- */
  {
    await p.setViewportSize({ width: 951, height: 585 });
    await go(p, "السجل");
    const q = "تدقيق-دو";
    await p.fill(".audit-search input", q).catch(() => {});
    await p.evaluate(() => window.scrollTo(0, 300));
    await openSub(p, "approval");
    const reason = "سبب مكتوب قبل الطيّ";
    await p.fill(".approval-sheet textarea", reason).catch(() => {});
    const seq = [[951, 585], [669, 867], [470, 700], [382, 580], [594, 368], [951, 350], [951, 585]];
    for (const [w, h] of seq) {
      await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(250);
      const st = await p.evaluate(() => ({
        modalOpen: !!document.querySelector(".approval-sheet"),
        reason: document.querySelector(".approval-sheet textarea")?.value || "",
        auditQuery: document.querySelector(".audit-search input")?.value || "",
        heading: document.querySelector(".page-heading h1")?.textContent?.trim() || "",
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        actionsVisible: (() => { const a = document.querySelector(".approval-actions"); if (!a) return false; const r = a.getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.top >= 0; })(),
      }));
      report.live.push({ size: `${w}x${h}`, ...st, ok: st.modalOpen && st.reason === reason && st.auditQuery === q && st.overflowX === 0 });
      await shot(p, `I-${w}x${h}`);
    }
    await closeSub(p);
  }
  await ctx.close();

  /* ---- J: ضغط الوصول ---- */
  const stressSizes = [[382, 580], [669, 867], [951, 585], [951, 350]];
  const stressScreens = ["اليوم", "العمل", "السجل", "الحسابات"];
  const variants = [
    { id: "text200", css: "html{font-size:200%!important;-webkit-text-size-adjust:200%!important}" },
    { id: "dark", opts: { colorScheme: "dark" } },
    { id: "motion", opts: { reducedMotion: "no-preference" } },
    { id: "safe-asym-r", css: ":root{--safe-r:47px!important;--safe-l:0px!important;--safe-b:21px!important}" },
    { id: "safe-asym-l", css: ":root{--safe-l:47px!important;--safe-r:0px!important;--safe-t:20px!important}" },
  ];
  for (const vr of variants) {
    const c = await newCtx(browser, 951, 585, vr.opts || {});
    if (vr.css) await c.addInitScript(css => document.addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s); }), vr.css);
    const pg = await demoPage(c);
    for (const [w, h] of stressSizes) {
      await pg.setViewportSize({ width: w, height: h }); await pg.waitForTimeout(150);
      for (const s of stressScreens) {
        await go(pg, s);
        const m = await measure(pg);
        const extra = await pg.evaluate(() => { const d = document.querySelector(".mobile-dock"); const r = d && d.getBoundingClientRect(); return r && r.width ? [Math.round(r.left), Math.round(r.right)] : null; });
        report.stress.push({ variant: vr.id, size: `${w}x${h}`, screen: s, dockX: extra, ...slim(m) });
        if (s === "العمل") await shot(pg, `J-${vr.id}-${w}x${h}`);
      }
    }
    await c.close();
  }
  /* لوحة المفاتيح: حقلٌ مركَّز ثم يقصر الارتفاع إلى ~350 (المحاكي لا يُظهر لوحة حقيقية). */
  {
    const c = await newCtx(browser, 669, 867); const pg = await demoPage(c);
    for (const [w, h, sh] of [[669, 867, 360], [951, 585, 300], [382, 580, 330]]) {
      await pg.setViewportSize({ width: w, height: h }); await go(pg, "السجل");
      await pg.focus(".audit-search input").catch(() => {});
      await pg.evaluate(() => document.activeElement?.scrollIntoView({ block: "center" }));
      await pg.setViewportSize({ width: w, height: sh }); await pg.waitForTimeout(200);
      await pg.evaluate(() => document.activeElement?.scrollIntoView({ block: "nearest" }));
      const r = await pg.evaluate(() => { const e = document.activeElement; const b = e.getBoundingClientRect(); const dock = document.querySelector(".mobile-dock"); const d = dock && dock.getBoundingClientRect(); return { tag: e.tagName, top: Math.round(b.top), bottom: Math.round(b.bottom), H: innerHeight, coveredByDock: !!(d && d.width && b.bottom > d.top && b.top < d.bottom && b.right > d.left && b.left < d.right), overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
      report.stress.push({ variant: "keyboard", size: `${w}x${sh}`, screen: "السجل", focus: r, ok: r.tag === "INPUT" && r.top >= 0 && r.bottom <= r.H && !r.coveredByDock && r.overflowX === 0 });
      await shot(pg, `J-keyboard-${w}x${sh}`);
    }
    await c.close();
  }
  /* الطباعة: قواعد الكتاب مقيّدة بـ screen، فعرض A4 (≈658px) لا يصير كتاباً. */
  {
    const c = await newCtx(browser, 669, 867); const pg = await demoPage(c);
    await pg.emulateMedia({ media: "print" });
    const r = await pg.evaluate(() => ({ pageEnter: getComputedStyle(document.querySelector(".page-enter")).display, rail: getComputedStyle(document.querySelector(".desktop-rail")).display }));
    report.stress.push({ variant: "print", size: "669x867", screen: "اليوم", ...r, ok: r.pageEnter !== "grid" });
    await c.close();
  }

  await browser.close();
  finish();
})().catch(e => { console.error(e); process.exit(1); });

function finish() {
  /* ملخص. */
  const sum = {};
  for (const r of report.matrix) {
    const k = r.pose; sum[k] = sum[k] || { states: 0, overflow: 0, spineHits: 0, small: 0, clipped: 0 };
    sum[k].states++; if (r.overflowX > 0) sum[k].overflow++; sum[k].spineHits += r.spineHits; sum[k].small += r.small; sum[k].clipped += r.clipped;
  }
  report.summary = { byPose: sum, liveOk: report.live.every(x => x.ok), modalsBlocked: report.modals.every(x => !x.opened || x.blocked), tabsOverflow: report.tabs.filter(t => t.overflowX > 0).length, errors: report.errors.length };
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report.summary, null, 1));
}
