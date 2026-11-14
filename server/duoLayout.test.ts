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

/*
 * جولة الامتداد الكامل (13 نوفمبر 2026): الحواف الآمنة بجهاتها الفعلية، وشريط القرار في نافذة
 * الاعتماد لاصق في كل المقاسات، وصفحات التسويق ممتدة حتى الحافة.
 */
test("duo-adaptive.css loads last and maps safe areas to the element's direction", () => {
  const main = read("src/main.tsx");
  const imports = [...main.matchAll(/import '\.\/([\w-]+\.css)'/g)].map(m => m[1]);
  assert.equal(imports.at(-1), "duo-adaptive.css");
  const css = read("src/duo-adaptive.css");
  assert.match(css, /\[dir="rtl"\]\s*\{\s*--safe-start:\s*var\(--safe-r\);\s*--safe-end:\s*var\(--safe-l\)/);
  assert.match(css, /\[dir="ltr"\]\s*\{\s*--safe-start:\s*var\(--safe-l\);\s*--safe-end:\s*var\(--safe-r\)/);
  // لا قيمة env() جانبية خام داخل خاصية منطقية في هذه الطبقة: الترجمة وحدها تعرف الاتجاه.
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/(padding|inset)-inline[\w-]*:[^;]*env\(safe-area-inset-(left|right)/.test(rules));
  assert.ok(!/device-posture|viewport-segments/.test(css));
});

test("the approval decision bar stays sticky on wide windows too (951x600, 951x350)", () => {
  const css = read("src/duo-adaptive.css");
  const wide = /@media \(min-width: 901px\) \{\s*\.approval-sheet \{[\s\S]*?\.approval-actions \{([\s\S]*?)\}/.exec(css)?.[1] || "";
  assert.match(wide, /position:\s*sticky/);
});

test("marketing pages extend edge to edge and keep content out of the safe areas", () => {
  const src = read("server/marketingPages.ts");
  assert.match(src, /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">/);
  assert.match(src, /body \.wrap, body \.doc-layout \{ padding-left:max\(20px, calc\(env\(safe-area-inset-left/);
});

/*
 * الجولة الأخيرة (14 نوفمبر 2026): وضع الكتاب على الشاشة الداخلية ووضع الحاسوب.
 * القواعد كلها مقيّدة بـ screen (عرض A4 المطبوع ≈ 658px يقع في مدى الكتاب)، والكعب متغيّرٌ واحد،
 * والقسم يصير صفحتين بشبكة لا بأعمدة متعددة (WebKit لا يرسم العنصر الموضَّع في العمود الثاني).
 */
test("book spread on the inner screen is screen-only, centred on one spine token, and grid-based", () => {
  const css = read("src/duo-adaptive.css");
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(rules, /--spine:\s*32px/);
  const book = /@media screen and \(min-width: 640px\) and \(max-width: 720px\) and \(min-height: 760px\),\s*screen and \(min-width: 860px\) and \(max-width: 1000px\) and \(min-height: 520px\) and \(max-height: 760px\) \{([\s\S]*?)\n\}/.exec(rules)?.[1] || "";
  assert.ok(book.length > 0, "book media block exists");
  assert.match(book, /\.page-enter \{[^}]*display:\s*grid;[^}]*column-gap:\s*var\(--spine\)/);
  assert.ok(!/(^|[\s;{])columns:\s*\d/.test(book), "no multi-column fragmentation in the book spread");
  /* الستار يبقى بعرض الشاشة كلها؛ النافذة وحدها تجلس على صفحة. */
  assert.match(book, /\.modal-backdrop \{[^}]*padding-inline-end:\s*calc\(50% \+ var\(--spine\) \/ 2\)/);
  /* لا قاعدة كتابٍ أو حاسوبٍ بلا screen. */
  for (const m of rules.matchAll(/@media ([^{]*?(?:min-height: 760px|max-height: 430px)[^{]*)\{/g)) {
    for (const q of m[1].split(",")) assert.match(q.trim(), /^screen and /, q);
  }
});

test("laptop posture keeps controls in a bottom bar and reserves room for it", () => {
  const css = read("src/duo-adaptive.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const lap = /@media screen and \(min-width: 560px\) and \(max-height: 430px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] || "";
  assert.match(lap, /\.desktop-rail \{ display: none; \}/);
  assert.match(lap, /\.mobile-dock \{[^}]*position:\s*fixed/);
  assert.match(lap, /\.content-stage \{[^}]*padding:[^;]*var\(--lap-dock\)/);
});
