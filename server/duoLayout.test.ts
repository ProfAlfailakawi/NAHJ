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
  const book = /@media screen and \(min-width: 721px\) and \(max-width: 1000px\) and \(min-height: 520px\) and \(max-height: 960px\) and \(orientation: landscape\) \{([\s\S]*?)\n\}/.exec(rules)?.[1] || "";
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

/*
 * Duo ≠ iPad (14 نوفمبر 2026): وضع الكتاب للشاشة الداخلية في iPhone Duo وحدها.
 * الشاشة الداخلية ≈ 669×867 طولياً و951×585 أفقياً؛ أصغر iPad عرضه 744 طولياً و1024 أفقياً.
 * فكل استعلام كتابٍ طولي سقفه 720px، وكل أفقي سقفه 1000px، وكلها مقيّدة بـ screen،
 * وأي استعلام عام يضمّ حدّاً أعلى للارتفاع فقط (حاسوب) لا يملك حدّاً أدنى للعرض يلتقط iPad قصير.
 */
test("Duo book/laptop queries can never match an iPad (landscape only, 721-1000 wide, screen-scoped)", () => {
  const css = read("src/duo-adaptive.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const queries: string[] = [];
  for (const m of css.matchAll(/@media ([^{]*?(?:min-height: 520px|max-height: 430px)[^{]*)\{/g)) {
    for (const q of m[1].split(",")) queries.push(q.trim());
  }
  assert.ok(queries.length >= 6, "book and laptop queries are present");
  for (const q of queries) {
    assert.match(q, /^screen and /, `screen-scoped: ${q}`);
    const maxW = /max-width:\s*(\d+)px/.exec(q);
    const minH = /min-height:\s*(\d+)px/.exec(q);
    const maxH = /max-height:\s*(\d+)px/.exec(q);
    if (maxH && Number(maxH[1]) <= 430) {
      assert.ok(!minH, `laptop query has no min-height: ${q}`);
      continue;
    }
    /* كتاب: أفقي حصراً بسقف عرض 1000؛ الطولي 640-720 لمنطقة الودجت وحدها (standalone). */
    assert.ok(maxW, `upper width cap: ${q}`);
    assert.ok(Number(maxW![1]) <= 1000, `cap ${maxW![1]}px would reach an iPad: ${q}`);
    if (/orientation: portrait/.test(q)) {
      assert.ok(Number(maxW![1]) <= 720, `portrait cap stays <= 720: ${q}`);
      assert.match(q, /display-mode: standalone/, `portrait query is only the widget keep-out: ${q}`);
    } else {
      assert.match(q, /orientation: landscape/, `book is landscape-only: ${q}`);
      assert.match(q, /min-width:\s*(721|901)px/, `landscape floor 721 (or 901 for the sheet layer): ${q}`);
    }
  }
});

test("no book layout on portrait: the old 640-720 portrait branch is gone", () => {
  const css = ["src/duo-adaptive.css", "src/duo.css"].map(read).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/min-width: 640px\) and \(max-width: 720px\) and \(min-height: 760px\)/.test(css));
  /* لوحتا «قائمة|تفاصيل» لا تنطبقان على الطولي ≤720. */
  assert.match(read("src/duo.css"), /\(min-width: 640px\) and \(max-width: 1180px\) and \(orientation: landscape\),\s*\(min-width: 721px\) and \(max-width: 1180px\)/);
});

test("book tiles follow the page not the viewport: 2-column pulse tiles, container cells, spine below the top bar", () => {
  const css = read("src/duo-adaptive.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /container-type:\s*inline-size/);
  assert.match(css, /\.page-enter \.pulse-stats \{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@container \(max-width: 520px\) \{[^}]*\.pulse-stats/);
  assert.match(css, /\.app-shell::after \{ inset-block-start: calc\(var\(--book-top\) \+ var\(--safe-t\)\); \}/);
  assert.match(css, /\.page-enter table \{[^}]*overflow-x:\s*auto/);
});

test("widget keep-out exists only for the Duo inner screen in standalone and reserves a 116px corner", () => {
  const css = read("src/duo-adaptive.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const m = /@media (screen and \(min-width: 721px\)[^{]*display-mode: standalone\),\s*screen and \(min-width: 640px\)[^{]*display-mode: standalone\)) \{([\s\S]*?)\n\}/.exec(css);
  assert.ok(m, "keep-out media block");
  assert.match(m![1], /orientation: landscape/);
  assert.match(m![1], /orientation: portrait/);
  assert.match(m![2], /--duo-cutout-w:\s*116px;\s*--duo-cutout-h:\s*116px/);
  assert.match(m![2], /\[dir="rtl"\] \.topbar-org, \[dir="ltr"\] \.top-actions \{ margin-right:/);
  assert.match(m![2], /\.modal-backdrop[^{]*\{ padding-top: var\(--duo-cutout-h\)/);
  assert.equal([...css.matchAll(/--duo-cutout-w:\s*116px/g)].length, 1);
});

test("the real-hinge differentiator is not required (no device-posture/viewport-segments dependency)", () => {
  assert.ok(!/device-posture|viewport-segments/.test(read("src/duo-adaptive.css")));
});

/*
 * حراسة الطيّ الخارجي الضيّق (٣٢٠–٣٨٢px): أعطالٌ وُجدت بالفحص بالمتصفّح وأُصلحت في responsive-2026-11.css.
 * اختبار نصّي لا بصري — يمنع حذف القاعدة أو تعديلها بلا قصد؛ والتحقّق البصري يبقى بالمتصفّح.
 */
test("narrow-phone fixes stay in responsive-2026-11.css", () => {
  const css = read("src/responsive-2026-11.css");
  /* أوسمة «الأثر» تلتفّ ولا تُسحق في صفٍّ واحد. */
  assert.match(css, /\.impact-badges\s*\{[^}]*flex-wrap:\s*wrap/);
  /* مستويات الاستقلالية السبعة بأعمدةٍ بلا حدٍّ أدنى للعرض (لا يسقط المستوى ٦ في صفٍّ ثانٍ). */
  assert.match(css, /\.autonomy-chooser\s*\{[^}]*repeat\(7,\s*minmax\(0,\s*1fr\)\)/);
  /* زرّ الإيقاف الطارئ لا يعلو قائمة «كل الأقسام». */
  assert.match(css, /:has\(\.mobile-sheet-backdrop\)\s*\.emergency-fab\s*\{[^}]*visibility:\s*hidden/);
  /* لا transform باقٍ على جذر القسم بعد الحركة: وإلا انفلت position:fixed لنوافذ الحوار عن الشاشة. */
  assert.match(css, /\.page-enter\s*\{\s*animation-fill-mode:\s*backwards/);
});
