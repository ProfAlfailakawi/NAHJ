/*
 * أدوات مشتركة لحارس ركن الودجت (iPhone Duo): تشغيل الخادم، بلوغ الحالات، قياس التقاطع.
 * الحارس يقرأ المنطقة من المتغيرات التي تنشرها الصفحة نفسها (--duo-widget-*) فيستعمل آلية الكشف الحقيقية.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const { webkit, chromium } = require("playwright");

/* مقاسات Duo المعروفة (طولي) ومقلوبها (عرضي). */
export const SIZES = [[382, 580], [470, 780], [594, 368], [669, 867], [951, 585], [457, 678], [457, 760]];

export async function startServer(port = 3199) {
  if (process.env.BASE_URL) return { url: process.env.BASE_URL, stop: async () => {} };
  const env = { ...process.env, PORT: String(port), NAHJ_FIREBASE_SYNC: "off", NAHJ_DATABASE_PATH: ":memory:", NODE_ENV: "development" };
  /* 3>&- : لا يرث الخادم قفل flock (وإلا ظلّ القفل محجوزاً بعد انتهاء الاختبار). */
  const child = spawn("sh", ["-c", `exec ${process.execPath} --import tsx server.ts 3>&- 4>&- 9>&-`], { cwd: ROOT, env, stdio: "ignore" });
  const url = `http://127.0.0.1:${port}`;
  let up = false;
  for (let i = 0; i < 240 && !up; i++) {
    if (child.exitCode !== null) throw new Error(`الخادم توقّف مبكراً (exit ${child.exitCode})`);
    try { up = (await fetch(`${url}/api/health`)).ok; } catch { /* لم يبدأ بعد */ }
    if (!up) await new Promise((r) => setTimeout(r, 500));
  }
  if (!up) { child.kill("SIGTERM"); throw new Error("الخادم لم يجهز خلال دقيتين"); }
  return { url, stop: async () => { child.kill("SIGTERM"); } };
}

/* الحالات: كل واحدة تُجهّز الصفحة ثم تعيد true إن كانت متاحة في هذا المقاس. */
export const STATES = {
  async marketing(page, base) { await page.goto(`${base}/`); await page.waitForTimeout(500); return true; },
  async login(page, base) { await page.goto(`${base}/app`); await page.waitForSelector(".login-shell", { timeout: 15000 }); await page.waitForTimeout(700); return true; },
  async home(page, base) {
    await page.goto(`${base}/try`); await page.waitForSelector(".app-shell", { timeout: 20000 });
    await page.waitForTimeout(1800); return true;
  },
  async sheet(page, base) {
    await STATES.home(page, base);
    const dock = page.locator(".mobile-dock button[aria-label='كل الأقسام']");
    if (!(await dock.isVisible().catch(() => false))) return false; // الشريط الجانبي هو القائمة في هذا المقاس
    await dock.click(); await page.waitForSelector(".mobile-sheet", { timeout: 5000 }); await page.waitForTimeout(400); return true;
  },
  async modal(page, base) {
    await STATES.home(page, base);
    await page.locator(".top-icon.notification").click();
    await page.waitForSelector(".modal-backdrop", { timeout: 8000 }); await page.waitForTimeout(500); return true;
  },
  async palette(page, base) { await STATES.home(page, base); await page.keyboard.press("Control+k"); await page.waitForSelector(".palette-backdrop", { timeout: 5000 }); await page.waitForTimeout(400); return true; },
  async help(page, base) {
    await STATES.home(page, base);
    const b = page.locator(".rail-help");
    if (!(await b.isVisible().catch(() => false))) return false;
    await b.click(); await page.waitForSelector(".help-backdrop", { timeout: 5000 }); await page.waitForTimeout(400); return true;
  },
};

/* يعمل داخل الصفحة: يقيس المنطقة ويعيد العناصر المهمة المتقاطعة معها. */
export function measureInPage(opts) {
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;width:var(--duo-widget-w,0px);height:var(--duo-widget-h,0px);left:0;top:0";
  document.documentElement.appendChild(probe);
  const wW = probe.getBoundingClientRect().width, wH = probe.getBoundingClientRect().height;
  probe.remove();
  const vw = document.documentElement.clientWidth;
  const zone = { x: vw - wW, y: 0, w: wW, h: wH };
  const hits = [], bleeds = [];
  if (!wW || !wH) return { zone, vw, active: false, hits, bleeds, checked: 0 };

  const IMPORTANT = "a,button,input,select,textarea,[role=tab],[role=button],img,svg,[class*=logo],[class*=badge],[class*=brand]";
  const visible = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
    }
    return true;
  };
  const fixedOrSticky = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const p = getComputedStyle(n).position;
      if (p === "fixed" || p === "sticky") return true;
    }
    return false;
  };
  /* الجزء المرئي فعلاً: يُقصّ المستطيل بحدود كل سلف يقصّ المحتوى (overflow)، فعنصر مُمرَّر خارج ورقته لا يُحسب. */
  const clipRect = (el, r) => {
    let l = r.left, t = r.top, rt = r.right, b = r.bottom;
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (/(hidden|clip|auto|scroll)/.test(s.overflow + s.overflowX + s.overflowY)) {
        const c = n.getBoundingClientRect();
        l = Math.max(l, c.left); t = Math.max(t, c.top); rt = Math.min(rt, c.right); b = Math.min(b, c.bottom);
        if (rt <= l || b <= t) return null;
      }
    }
    return { left: l, top: t, right: rt, bottom: b, width: rt - l, height: b - t };
  };
  const describe = (el) => {
    const t = (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 28);
    const cls = (typeof el.className === "string" ? el.className : el.className?.baseVal || "").trim().split(/\s+/).slice(0, 2).join(".");
    return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}${t ? ` «${t}»` : ""}`;
  };
  const touches = (r) => r.width >= 2 && r.height >= 2 && r.right > zone.x + 0.5 && r.left < vw && r.top < zone.h - 0.5 && r.bottom > 0.5;

  const seen = new Set();
  let checked = 0;
  const consider = (el, r, kind) => {
    if (seen.has(el) && kind !== "text") return;
    if (opts.onlyFixed && !fixedOrSticky(el)) return;
    if (!visible(el)) return;
    r = clipRect(el, r);
    if (!r) return;
    checked++;
    if (!touches(r)) return;
    if (el.closest("[data-duo-bleed]")) { bleeds.push({ el: describe(el), why: "data-duo-bleed" }); return; }
    if (el.closest("[data-duo-debug]")) return;
    seen.add(el);
    hits.push({ el: describe(el), kind, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] });
  };
  for (const el of document.querySelectorAll(IMPORTANT)) {
    if (el.closest("[data-duo-debug]")) continue;
    if (el.tagName.toLowerCase() === "svg" && el.parentElement?.closest("svg")) continue;
    consider(el, el.getBoundingClientRect(), el.tagName.toLowerCase());
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement;
    if (!el || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName) || el.closest("[data-duo-debug]")) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    for (const r of range.getClientRects()) { if (r.width >= 2 && r.height >= 2) consider(el, r, "text"); }
  }
  /* الاستثناء المسجَّل: عنصر بلا نص ولا تفاعل يمتد إلى الحافة (خلفية/زجاج) لا يُعدّ مهماً أصلاً. */
  return { zone, vw, active: true, hits, bleeds, checked };
}
