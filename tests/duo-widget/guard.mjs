/*
 * حارس تقاطع ركن الودجت (iPhone Duo) — Playwright WebKit.
 *   npm run test:duo-widget            (يشغّل الخادم بنفسه)
 *   BASE_URL=http://127.0.0.1:3000 npm run test:duo-widget
 * يفشل (exit 1) إن تقاطع أي عنصر «مهم» مع المنطقة [x ≥ vw − w] × [y ≤ h]، أو إن لم تُفعَّل المنطقة على مقاس Duo،
 * أو إن تفعّلت على جهاز غير Duo. الاستثناءات (data-duo-bleed) تُسجَّل في التقرير.
 * متغيرات: GUARD_QUICK=1 (مصفوفة أصغر)، GUARD_CONCURRENCY (افتراضي 3)، GUARD_ENGINE=chromium (غير مفضّل).
 */
import { webkit, chromium, STATES, SIZES, startServer, measureInPage } from "./lib.mjs";

const engine = process.env.GUARD_ENGINE === "chromium" ? chromium : webkit;
const quick = process.env.GUARD_QUICK === "1";
const concurrency = Number(process.env.GUARD_CONCURRENCY || 3);
const stateNames = Object.keys(STATES);

const orients = SIZES.flatMap(([w, h]) => [[w, h, "portrait"], [h, w, "landscape"]]);
/* GUARD_ONLY="382x580,951x585": يحصر المقاسات (للتشغيل على دفعات). */
const skipControls = process.env.GUARD_NO_CONTROLS === "1";
/* ارتفاعات أطول: منفذ التطبيق (WKWebView) بكامل الشاشة بلا أشرطة Safari، فالعرض وحده يحدّد Duo. */
const TALL = [[669, 1000], [951, 700], [951, 669], [951, 800], [951, 940]];
const all = [...orients, ...TALL.map(([w, h]) => [w, h, w > h ? "landscape" : "portrait"])];
if (process.env.GUARD_ONLY) { const keep = process.env.GUARD_ONLY.split(","); all.splice(0, all.length, ...all.filter(([w, h]) => keep.includes(`${w}x${h}`))); }
/* سياقان: Safari، والتطبيق المُحاكى (UA لـ WKWebView + window.Capacitor + navigator.standalone غير معرَّف). */
const WK_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const contexts = (process.env.GUARD_CTX || "safari,app").split(",");
const combos = quick ? [["light", 100]] : [["light", 100], ["dark", 100], ["light", 200]];
const configs = [];
for (const [w, h, o] of all) for (const ctxName of contexts) for (const [scheme, scale] of combos) configs.push({ w, h, o, scheme, scale, ctxName });

/* أجهزة أخرى: يجب ألا تتفعّل المنطقة عليها (صفر خارج Duo). */
const CONTROLS = [[402, 874], [956, 440], [390, 844], [430, 932], [844, 390], [932, 430], [744, 1024], [820, 1180], [1024, 768], [1280, 800], [375, 667]];

const server = await startServer();
const browser = await engine.launch();
const failures = [], bleeds = new Map(), notes = [];
let retried = 0; const recovered = []; let cases = 0, checkedEls = 0, skipped = 0;

async function runState(ctx, cfg, st) {
  const out = [];
  const failures = out;
  const app = cfg.ctxName === "app"; void app;
  const page = await ctx.newPage();
  const tag = `[${cfg.ctxName}] ${cfg.w}x${cfg.h} ${cfg.o} ${cfg.scheme} ${cfg.scale}% [${st}]`;
  try {
    if (cfg.scale === 200) await page.addInitScript(() => { const s = document.createElement("style"); s.textContent = "html{font-size:200%}"; document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s)); });
    const ok = await STATES[st](page, server.url);
    if (!ok) { skipped++; return out; }
    if (cfg.scale === 200) await page.addStyleTag({ content: "html{font-size:200%}" });
    for (const pass of ["top", "scrolled"]) {
      if (pass === "scrolled") await page.evaluate(() => { for (const el of [document.scrollingElement, ...document.querySelectorAll("main,.content-stage,.mobile-sheet,.modal-backdrop,.palette-results,.help-panel")]) if (el) el.scrollTop = 1e6; });
      const r = await page.evaluate(measureInPage, { onlyFixed: pass === "scrolled" });
      cases++; checkedEls += r.checked;
      if (!r.active) { failures.push(`${tag}: المنطقة غير مفعّلة (--duo-widget-w/h = 0)`); break; }
      for (const b of r.bleeds) bleeds.set(`${st}: ${b.el}`, b.why);
      for (const h of r.hits) failures.push(`${tag} (${pass}): ${h.el} rect=${h.rect} zone=x≥${Math.round(r.zone.x)},y≤${Math.round(r.zone.h)}`);
    }
  } catch (e) { failures.push(`${tag}: خطأ تشغيل: ${String(e.message).split("\n")[0]}`); }
  finally { await page.close(); }
  return out;
}

async function runConfig(cfg) {
  const app = cfg.ctxName === "app";
  const ctx = await browser.newContext({ viewport: { width: cfg.w, height: cfg.h }, colorScheme: cfg.scheme, isMobile: true, hasTouch: true, deviceScaleFactor: app ? 2 : 1, ...(app ? { userAgent: WK_UA } : {}) });
  if (app) await ctx.addInitScript(() => {
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios", platform: "ios" };
    try { Object.defineProperty(navigator, "standalone", { get: () => undefined, configurable: true }); } catch { /* */ }
  });
  try {
    for (const st of stateNames) {
      /* إعادة محاولة واحدة لحالة فيها مخالفات: التمرير في حالات الصفحة الحيّة قد يتأثر بتوقيت تحميل البيانات (يُسجَّل العدد). */
      let found = await runState(ctx, cfg, st);
      if (found.length) { retried++; const again = await runState(ctx, cfg, st); found = again.length ? again : []; if (!again.length) recovered.push(found); }
      failures.push(...found);
    }
  } finally { await ctx.close(); }
}

const queue = [...configs]; 
await Promise.all(Array.from({ length: concurrency }, async () => { for (let c; (c = queue.shift());) await runConfig(c); }));

/* ضابط سلبي: الحارس يجب أن «يرى» عنصراً مزروعاً داخل المنطقة، وأن تُقاس المنطقة بأبعادٍ موجبة (لا نجاح فارغ). */
{
  const ctx = await browser.newContext({ viewport: { width: 457, height: 678 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await STATES.login(page, server.url);
  await page.evaluate(() => {
    const b = document.createElement("button"); b.textContent = "negative-control";
    b.style.cssText = "position:fixed;top:12px;right:12px;z-index:99999;width:44px;height:44px"; document.body.appendChild(b);
  });
  const r = await page.evaluate(measureInPage, {});
  if (!(r.zone.w > 0 && r.zone.h > 0)) failures.push(`ضابط سلبي: أبعاد المنطقة غير موجبة (${r.zone.w}×${r.zone.h})`);
  else if (!r.hits.some((h) => h.el.includes("negative-control"))) failures.push("ضابط سلبي: الحارس لم يلتقط عنصراً مزروعاً داخل المنطقة");
  else notes.push(`ضابط سلبي ناجح: المنطقة ${r.zone.w}×${Math.round(r.zone.h)} والحارس التقط العنصر المزروع`);
  await ctx.close();
}
/* الضوابط: صفر خارج Duo. */
for (const [w, h] of skipControls ? [] : CONTROLS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await STATES.login(page, server.url);
  const r = await page.evaluate(measureInPage, {});
  if (r.active) failures.push(`${w}x${h}: المنطقة مفعّلة على جهاز غير Duo (يجب أن تكون صفراً)`);
  await ctx.close();
}

await browser.close(); await server.stop();
console.log(`المحرّك: ${process.env.GUARD_ENGINE === "chromium" ? "Chromium (قيد: ليس WebKit)" : "WebKit"}`);
console.log(`مقاسات Duo: ${all.length} (المعروفة طولي/عرضي + ${TALL.length} أطول) × سياقات [${contexts.join(", ")}] × ${combos.length} (ألوان/حجم نص) × ${stateNames.length} حالات (${stateNames.join(", ")})`);
console.log(`حالات فُحصت: ${cases} (تمريرتان: أعلى الصفحة + بعد التمرير للعناصر الثابتة/اللاصقة) — عناصر مفحوصة: ${checkedEls}، حالات غير متاحة بالمقاس: ${skipped}، ضوابط غير Duo: ${CONTROLS.length}`);
for (const n of notes) console.log(n);
console.log(`حالات أُعيدت مرة واحدة: ${retried} (نجحت عند الإعادة: ${recovered.length})`);
console.log(`الاستثناءات المسجَّلة (data-duo-bleed): ${bleeds.size}`); for (const [k, v] of bleeds) console.log(`  - ${k} (${v})`);
const uniq = [...new Set(failures)];
console.log(`المخالفات: ${uniq.length}`);
const groups = new Map();
for (const f of uniq) { const k = f.replace(/ (light|dark) \d+%/, "").replace(/ \((top|scrolled)\).*/, "").replace(/^(.*?\[[a-z]+\]).*/, "$1"); groups.set(k, (groups.get(k) || 0) + 1); }
for (const [k, n] of groups) console.log(`  ✗ ${k}: ${n}`);
for (const f of uniq.slice(0, 40)) console.log("    · " + f);
process.exit(uniq.length ? 1 : 0);
