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
test("duo-adaptive.css loads before the device layer and maps safe areas to the element's direction", () => {
  const main = read("src/main.tsx");
  const imports = [...main.matchAll(/import '\.\/([\w-]+\.css)'/g)].map(m => m[1]);
  assert.deepEqual(imports.slice(-2), ["duo-adaptive.css", "duo-device.css"]);
  const css = read("src/duo-adaptive.css");
  assert.match(css, /\[dir="rtl"\]\s*\{\s*--safe-start:\s*var\(--safe-r\);\s*--safe-end:\s*var\(--safe-l\)/);
  assert.match(css, /\[dir="ltr"\]\s*\{\s*--safe-start:\s*var\(--safe-l\);\s*--safe-end:\s*var\(--safe-r\)/);
  // لا قيمة env() جانبية خام داخل خاصية منطقية في هذه الطبقة: الترجمة وحدها تعرف الاتجاه.
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/(padding|inset)-inline[\w-]*:[^;]*env\(safe-area-inset-(left|right)/.test(rules));
  assert.ok(!/device-posture/.test(rules));
  assert.ok((rules.match(/viewport-segments/g) || []).length <= 1, "viewport-segments only as the optional widget-detection query");
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
    /* كتاب: أفقي حصراً بسقف عرض 1000؛ الطولي 640-720 لمنطقة الودجت وحدها (بلا شرط display-mode). */
    assert.ok(maxW, `upper width cap: ${q}`);
    assert.ok(Number(maxW![1]) <= 1000, `cap ${maxW![1]}px would reach an iPad: ${q}`);
    if (/orientation: portrait/.test(q)) {
      assert.ok(Number(maxW![1]) <= 720, `portrait cap stays <= 720: ${q}`);
      assert.ok(!/display-mode/.test(q), `keep-out must not depend on display-mode: ${q}`);
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

/* مقيِّم استعلامات وسائط مصغّر (screen + min/max width/height + orientation) على القواعد الحقيقية. */
function matches(query: string, w: number, h: number): boolean {
  const orient = w > h ? "landscape" : "portrait";
  return query.split(/\s+and\s+/).every((part) => {
    const t = part.trim().replace(/^\(|\)$/g, "");
    if (t === "screen") return true;
    const f = /^(min|max)-(width|height):\s*(\d+)px$/.exec(t);
    if (f) { const v = f[2] === "width" ? w : h; return f[1] === "min" ? v >= Number(f[3]) : v <= Number(f[3]); }
    const o = /^orientation:\s*(\w+)$/.exec(t);
    if (o) return o[1] === orient;
    throw new Error(`unsupported media feature: ${t}`);
  });
}

/* مقيِّم استعلامات الوسائط يدعم أيضاً نسبة العرض/الارتفاع؛ horizontal-viewport-segments غير مدعوم في Safari فيُعدّ خاطئاً. */
function matchesWidget(query: string, w: number, h: number): boolean {
  const orient = w > h ? "landscape" : "portrait";
  return query.split(/\s+and\s+/).every((part) => {
    const t = part.trim().replace(/^\(|\)$/g, "");
    if (t === "screen") return true;
    if (t.startsWith("horizontal-viewport-segments")) return false;
    const ar = /^(min|max)-aspect-ratio:\s*(\d+)\/(\d+)$/.exec(t);
    if (ar) { const r = w / h, v = Number(ar[2]) / Number(ar[3]); return ar[1] === "min" ? r >= v : r <= v; }
    return matches(part, w, h);
  });
}

function widgetBlock(css: string) {
  const m = /@media (screen and \(orientation: portrait\)[^{]*)\{\s*:root \{([^}]*)\}/.exec(css);
  assert.ok(m, "widget detection block");
  return { queries: m![1].split(/,\s*(?=screen)/).map((q) => q.trim()), body: m![2] };
}

test("widget corner: ONE reserved zone as tokens, zero outside Duo, physical right, no stale cutout rules", () => {
  const css = read("src/duo-adaptive.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/display-mode/.test(css), "no display-mode condition in duo-adaptive.css");
  assert.ok(!/--duo-cutout/.test(css), "the old 116x116 cutout tokens are gone");
  /* القيم الافتراضية صفر: لا أثر خارج Duo. */
  assert.match(css, /:root \{\s*--duo-widget-w: 0px;\s*--duo-widget-gap: 0px;\s*--duo-widget-h: 0px;/);
  const { queries, body } = widgetBlock(css);
  assert.match(body, /--duo-widget-w:\s*96px/);
  assert.match(body, /--duo-widget-gap:\s*8px/);
  assert.match(body, /--duo-widget-h:\s*clamp\(64px, 31vh, 270px\)/);
  assert.equal([...css.matchAll(/--duo-widget-w:\s*96px/g)].length, 1, "values are defined once");
  /* المنطقة فيزيائية: لا inline-end في قاعدة الشريط العلوي؛ الهامش margin-right مع [dir]. */
  assert.match(css, /\[dir="rtl"\] \.topbar-org, \[dir="ltr"\] \.top-actions \{ margin-right: var\(--duo-topbar-reserve\)/);
  /* لا !important جديد في القسم. */
  assert.ok(!/!important/.test(css.slice(css.indexOf("--duo-widget-clear"))), "no !important in the widget section");
  const hit = (w: number, h: number) => queries.some((q) => matchesWidget(q, w, h));
  /* مقاسات Duo المعروفة وعكسها. */
  for (const [w, h] of [[382, 580], [470, 780], [594, 368], [669, 867], [951, 585], [580, 382], [780, 470], [368, 594], [867, 669], [585, 951], [951, 669], [457, 678], [457, 760], [720, 900], [951, 800], [951, 940], [951, 669], [457, 700], [440, 660], [480, 720], [669, 1000], [951, 700]]) assert.ok(hit(w, h), `zone must be active at ${w}x${h}`);
  /* أجهزة أخرى: صفر. */
  for (const [w, h] of [[390, 844], [382, 844], [430, 932], [393, 852], [402, 874], [440, 956], [956, 440], [844, 390], [932, 430], [667, 375], [852, 393], [744, 1024], [820, 1180], [1024, 768], [1180, 820], [1280, 800], [1440, 900], [320, 568], [375, 667]]) assert.ok(!hit(w, h), `zone must NOT be active at ${w}x${h}`);
});

test("widget corner: every surface that touches the top-right uses the shared tokens (no private guesses)", () => {
  const css = read("src/duo-adaptive.css").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const re of [
    /\.topbar \{ min-height: calc\(var\(--duo-topbar-band\) \+ var\(--safe-t\)\); \}/,
    /\.desktop-rail::before \{[^}]*height: var\(--duo-rail-top\)/,
    /\.login-shell \{ padding-top: max\(24px, var\(--duo-widget-h\)\); \}/,
    /\.org-setup \{ padding-top: var\(--duo-widget-h\); \}/,
    /\.partner-topbar \{[^}]*var\(--duo-widget-clear\)/,
    /\.modal-backdrop \{ padding-top: max\([^;]*var\(--duo-widget-h\)\); \}/,
    /\.help-backdrop \{ padding-top: var\(--duo-widget-h\); \}/,
    /\.palette-backdrop \{ padding-top: max\(11vh, var\(--duo-widget-h\)\); \}/,
    /\.skip-link \{ inset-inline-start: calc\(10px \+ var\(--duo-reserve-start\)\); \}/,
  ]) assert.match(css, re);
});

test("widget corner: server-rendered pages and static shells carry the same detection queries", () => {
  const want = widgetBlock(read("src/duo-adaptive.css").replace(/\/\*[\s\S]*?\*\//g, "")).queries;
  const norm = (t: string) => t.replace(/\s+/g, "");
  for (const [file, start] of [["server/marketingPages.ts", "DUO_WIDGET_CSS"], ["apple/www/index.html", ":root { --duo-widget-w"], ["apple/www/offline.html", ":root { --duo-widget-w"], ["public/updating.html", ":root{--duo-widget-w"]] as const) {
    const src = norm(read(file));
    for (const q of want) assert.ok(src.includes(norm(q)), `${file} must contain the query: ${q}`);
    assert.ok(src.includes(norm("96px")) && src.includes(norm("clamp(64px, 31vh, 270px)")), `${file} values`);
    void start;
  }
  assert.match(read("server/marketingPages.ts"), /\.top \.wrap \{ padding-right:max\(20px, calc\(env\(safe-area-inset-right, 0px\) \+ 8px\), var\(--duo-widget-clear\)\)/);
});

test("duo-debug panel loads only with ?duo-debug=1", () => {
  assert.match(read("src/main.tsx"), /get\('duo-debug'\) === '1'[\s\S]*\/duo-debug\.js/);
  assert.match(read("server/marketingPages.ts"), /duo-debug=1[\s\S]*\/duo-debug\.js/);
  assert.ok(!/duo-debug/.test(read("index.html")), "index.html never loads it unconditionally");
});

test("the real-hinge differentiator is not required (no device-posture/viewport-segments dependency)", () => {
  const css = read("src/duo-adaptive.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/device-posture/.test(css));
  /* horizontal-viewport-segments مسموح في سطرٍ واحد: احتياطٌ إضافي لكشف Duo، لا شرطٌ لأي تخطيط. */
  assert.equal([...css.matchAll(/viewport-segments/g)].length, 1);
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

/*
 * نمط الدوو المعتمد (19 نوفمبر 2026): طبقةٌ أخيرة كل قواعدها تحت علامة الجهاز، فلا يتغيّر iPhone ولا iPad،
 * والحجز الثابت للودجت يتبع حدود النظام على الدوو.
 */
test("duo-device.css scopes every rule to html[data-device=\"duo\"]", () => {
  const css = read("src/duo-device.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors = [...css.matchAll(/([^{}@]+)\{[^{}]*\}/g)].map(m => m[1].trim()).filter(Boolean);
  assert.ok(selectors.length > 20);
  for (const sel of selectors) {
    for (const part of sel.split(",")) assert.match(part.trim(), /^(html|:root)\[data-device="duo"\]/, part);
  }
  assert.match(css, /:root\[data-device="duo"\]\s*\{[^}]*--duo-widget-h:\s*0px/);
  assert.match(css, /--duo-sa-t:\s*env\(safe-area-inset-top/);
});

test("the Duo markers are installed from the entry script", () => {
  assert.match(read("src/main.tsx"), /installDuoMarkers\(\)/);
  const markers = read("src/lib/duo-markers.ts");
  assert.match(markers, /box: 'border-box'/);
  assert.match(markers, /dataset\.widgetSide/);
});
