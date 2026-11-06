import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

/*
 * حراسة مقاسات iPhone Duo: القرار بالعرض والارتفاع لا بوضعية الجهاز، والتكبير غير مقفول،
 * وخريطة «اليوم» بارتفاعٍ مرن لا بـ 560px ثابتة.
 */
const read = (file: string) => fs.readFileSync(file, "utf8");
const allCss = () => ["src/index.css", "src/duo.css", "src/beauty-pass.css", "src/elevation.css", "src/polish.css", "src/finish.css", "src/motion.css"].map(read).join("\n");

test("no layout depends on device-posture or viewport-segments (preview-only, null by default)", () => {
  const css = allCss();
  assert.ok(!/device-posture|viewport-segments/.test(css));
});

test("viewport meta covers the notch and never locks zoom", () => {
  const meta = /<meta name="viewport" content="([^"]*)"/.exec(read("index.html"))?.[1] || "";
  assert.match(meta, /viewport-fit=cover/);
  assert.ok(!/user-scalable\s*=\s*(no|0)|maximum-scale/i.test(meta));
});

test("duo.css exists with the mid-width two-pane and short-height rail rules", () => {
  const css = read("src/duo.css");
  assert.match(css, /min-width:\s*640px\) and \(max-width:\s*1180px/);
  assert.match(css, /max-height:\s*560px/);
  assert.match(css, /apphub-stage\s*\{\s*height:\s*clamp\(/);
  assert.match(read("src/main.tsx"), /import '\.\/duo\.css'/);
});

test("the hub stage no longer has a fixed 560px height after the duo layer", () => {
  assert.ok(!/\.apphub-stage\s*\{[^}]*height:\s*560px/.test(read("src/duo.css")));
});
