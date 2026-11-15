/*
 * لقطات قبل/بعد لركن الودجت. الاستعمال:
 *   node tests/duo-widget/shots.mjs <before|after> <baseUrl> <outDir>
 * يرسم إطار المنطقة (الأحمر) بالصيغة الثابتة 96px × clamp(64px,31vh,270px) كي تظهر الحدود على كود «قبل» أيضاً.
 */
import fs from "node:fs";
import { webkit, STATES } from "./lib.mjs";

const [tag, base, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const SHOTS = [
  [382, 580, "home"], [382, 580, "login"], [382, 580, "sheet"],
  [669, 867, "home"], [669, 867, "login"],
  [951, 585, "home"], [951, 585, "login"],
];
const browser = await webkit.launch();
for (const [w, h, st] of SHOTS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await STATES[st](page, base);
  await page.waitForSelector("#nahj-splash", { state: "detached", timeout: 8000 }).catch(() => {});
  await page.evaluate(() => {
    const d = document.createElement("div"); d.setAttribute("data-duo-debug", "");
    d.style.cssText = "position:fixed;top:0;right:0;width:96px;height:clamp(64px,31vh,270px);box-sizing:border-box;border:2px solid rgba(220,30,30,.9);background:rgba(220,30,30,.12);pointer-events:none;z-index:2147483647";
    document.body.appendChild(d);
  });
  const name = st === "home" ? "" : `${st}-`;
  await page.screenshot({ path: `${out}/${tag}-${name}${w}x${h}.png` });
  await ctx.close();
}
await browser.close();
