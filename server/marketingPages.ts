import { listSectors, getSectorPack, EDUCATION_CODE } from "./packs/index.ts";
import { escapeHtml, publicPlans, CUSTOM_PRICE } from "./publicPages.ts";
import { sectorGlyph } from "./sectorIcons.ts";
import { FONT_FACE_CSS, FONT_PRELOAD_LINK } from "./fontFace.ts";

/*
 * الصفحات التسويقية: الهبوط، والشروط، والخصوصية.
 *
 * كان الرابط الرئيسي يفتح نموذج دخولٍ مباشرة. فمن يصله رابط نهج في رسالة يرى
 * «البريد الإلكتروني / كلمة المرور» ولا يعرف ما المنتج، ولا لأي قطاع هو،
 * ولا أن بوسعه تجربته بلا حساب. والصفحة هنا تقول ذلك في الشاشة الأولى، وتُدخل
 * كل زائرٍ إلى طلب عرضٍ على قطاعه هو. والعرض التجريبي نفسه أداةٌ يعرضها المالك
 * (روابط /try في لوحته)، لا بابٌ مفتوح لكل زائر.
 *
 * صفحاتٌ مكتفية بذاتها: لا إطار عمل، لا طلب شبكة بعد التحميل، وكل نصٍّ متغيّر
 * يُهرَّب.
 */

/* ------------------------------------------------- سُلّم الصلاحية المصغّر */

/**
 * سُلّم L0..L6 مصغّر يُضاء حتى سقفٍ حقيقي (`<ol class="jr" data-cap="N">`).
 *
 * الحالة الافتراضية مكتملة (بلا سكربت أو مع «تقليل الحركة»)؛ والسكربت يُطفئ
 * الدرجات ثم يُضيئها واحدةً واحدة عند ظهور كل سُلّم في الشاشة، مرة واحدة،
 * ولا يتجاوز السقف أبداً. نصٌّ خالص بلا إطار عمل، فيصلح للصفحات المرسومة من الخادم.
 */
export const JOURNEY_CSS = `
  .jr { display:flex; margin:14px 0 2px; padding:0; list-style:none; }
  .jr li { position:relative; flex:1; min-width:0; display:flex; flex-direction:column; align-items:center; gap:3px; font-size:13px; font-weight:800; line-height:1.3; color:var(--muted); transition:color .3s .2s; }
  .jr li.lit { color:var(--ink); }
  .jr .n { position:relative; display:block; width:16px; height:16px; border-radius:50%; background:var(--card); box-shadow:inset 0 0 0 2px var(--line); transition:background-color .3s .2s, box-shadow .3s .2s; }
  .jr .n::after { content:""; position:absolute; inset-inline-start:5px; top:2px; width:4px; height:8px; border:solid var(--bg); border-width:0 2px 2px 0; transform:rotate(45deg); opacity:0; transition:opacity .3s .2s; }
  .jr li.lit .n { background:var(--moss); box-shadow:none; }
  .jr li.lit .n::after { opacity:1; }
  .jr li.lit.cap .n { box-shadow:0 0 0 3px color-mix(in srgb, var(--moss) 22%, transparent); }
  .jr li + li::before, .jr li + li::after { content:""; position:absolute; top:7px; inset-inline-start:calc(-50% + 11px); width:calc(100% - 22px); height:2px; border-radius:2px; background:var(--line); }
  .jr li + li::after { background:var(--moss); transform:scaleX(0); transform-origin:left center; transition:transform .45s cubic-bezier(.5,.1,.2,1); }
  .jr li + li:dir(rtl)::after { transform-origin:right center; }
  .jr li + li.lit::after { transform:scaleX(1); }
  .jr li.just .n { animation:jrHalo 1.5s ease-out .2s 1; }
  @keyframes jrHalo { 0% { box-shadow:0 0 0 0 color-mix(in srgb, var(--moss) 40%, transparent); } 100% { box-shadow:0 0 0 9px color-mix(in srgb, var(--moss) 0%, transparent); } }
  @media (prefers-reduced-motion:reduce) { .jr *, .jr li, .jr li::before, .jr li::after { transition:none !important; animation:none !important; } }
`;

export const JOURNEY_SCRIPT = `
  (function () {
    var lists = document.querySelectorAll(".jr[data-cap]");
    if (!lists.length || !window.IntersectionObserver) return;
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    Array.prototype.forEach.call(lists, function (el) {
      var cells = el.children, cap = Math.min(+el.getAttribute("data-cap") || 0, cells.length - 1);
      var h = el.getBoundingClientRect().height;
      if (!h) return;
      Array.prototype.forEach.call(cells, function (c) { c.classList.remove("lit", "just"); });
      var step = Math.min(750, Math.max(350, 4000 / (cap + 1)));
      var need = Math.max(.05, Math.min(.6, .9 * window.innerHeight / h));
      var io = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting || entries[0].intersectionRatio < need - .01) return;
        io.disconnect();
        var k = 0;
        (function next() {
          if (k > cap) return;
          if (k) cells[k - 1].classList.remove("just");
          cells[k].classList.add("lit", "just");
          k++;
          setTimeout(next, step);
        })();
      }, { threshold: need });
      io.observe(el);
    });
  })();
`;

/** بريد التواصل التجاري إن ضُبط. */
export function contactEmail(): string {
  const value = (process.env.NAHJ_CONTACT_EMAIL || "").trim();
  return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(value) ? value : "";
}

/** رقم واتساب للتواصل التجاري (أرقام فقط بالصيغة الدولية) إن ضُبط. */
export function contactWhatsapp(): string {
  const digits = (process.env.NAHJ_CONTACT_WHATSAPP || "").replace(/[^\d]/g, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : "";
}

/** الاسم القانوني لمشغّل المنصة كما يُكتب في الشروط والخصوصية. */
function legalName(): string {
  return (process.env.NAHJ_LEGAL_NAME || "").trim() || "مشغّل منصة نهج";
}

/* ------------------------------------------------------------ الإطار */

export const BASE_STYLE = `${FONT_FACE_CSS}
  :root { --ink:#10251f; --muted:#5d716b; --line:#e2e8e4; --moss:#2f7d65; --moss-soft:#e7f1ec; --amber:#b9852f; --amber-soft:#f6ecd6; --sky:#4a63cf; --sky-soft:#e8ecfb; --coral:#c2553f; --violet:#7357c4; --err:#b3392b; --bg:#f4f1e8; --card:#fffdf7; --r:20px; --shadow:0 18px 40px -26px rgba(16,37,31,.45); }
  @media (prefers-color-scheme: dark) {
    :root { --ink:#eef3f0; --muted:#a4b3ad; --line:#2a3833; --moss:#6fc3a3; --moss-soft:#17302a; --amber:#e0b36a; --amber-soft:#2e2815; --sky:#8ea2f0; --sky-soft:#1b2342; --coral:#ef8f78; --violet:#b3a0ee; --err:#ff9b8c; --bg:#0f1714; --card:#16211d; --shadow:0 18px 40px -26px rgba(0,0,0,.8); }
  }
  * { box-sizing:border-box; }
  html { scroll-behavior:smooth; }
  body { margin:0; background:var(--bg); color:var(--ink); font-family:"Cairo",system-ui,"Segoe UI",Tahoma,sans-serif; line-height:1.85; font-size:17px; }
  a { color:inherit; }
  .wrap { max-width:1120px; margin:0 auto; padding:0 20px; }
  .top { position:sticky; top:0; z-index:5; background:color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter:blur(14px); border-bottom:1px solid var(--line); }
  .top .wrap { display:flex; align-items:center; gap:18px; height:66px; }
  .brand { display:flex; align-items:center; gap:10px; font-weight:900; font-size:21px; text-decoration:none; }
  .brand svg { width:34px; height:34px; }
  .top nav { margin-inline-start:auto; display:flex; align-items:center; gap:6px; }
  .top nav a { text-decoration:none; padding:8px 12px; border-radius:10px; font-weight:700; font-size:15px; color:var(--muted); }
  .top nav a:hover { color:var(--ink); background:var(--card); }
  .top nav a.cta { background:var(--ink); color:var(--bg); }
  .top nav a { white-space:nowrap; }
  /* الترويسة لاصقة: القفز إلى قسمٍ لا يُخفي عنوانه تحتها. */
  [id] { scroll-margin-top:84px; }
  .btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; padding:14px 22px; border-radius:14px; font-weight:800; text-decoration:none; border:1px solid var(--line); background:var(--card); color:var(--ink); font-size:16px; font-family:inherit; cursor:pointer; transition:transform .2s, box-shadow .2s, border-color .2s, background .2s; }
  .btn:hover { transform:translateY(-2px); box-shadow:var(--shadow); border-color:var(--moss); }
  .btn.primary { background:var(--ink); color:var(--bg); border-color:var(--ink); }
  .btn.primary:hover { border-color:var(--ink); }
  .btn:disabled { opacity:.6; cursor:progress; transform:none; box-shadow:none; }
  .chip { display:inline-flex; align-items:center; gap:6px; font-weight:800; font-size:13.5px; line-height:1.4; padding:3px 12px; border-radius:999px; background:var(--moss-soft); color:var(--moss); white-space:nowrap; }
  .chip::before { content:""; width:7px; height:7px; border-radius:50%; background:currentColor; }
  .chip.sim { background:var(--amber-soft); color:var(--amber); }
  .chip.soon { background:var(--sky-soft); color:var(--sky); }
  .honest { background:var(--card); border:1px solid var(--line); border-radius:var(--r); padding:24px; }
  .honest ul { margin:12px 0 0; padding:0; list-style:none; display:grid; gap:12px; }
  .honest li { display:grid; grid-template-columns:auto 1fr; gap:4px 14px; align-items:start; }
  .honest li > strong { grid-column:1; }
  @media (max-width:560px) { .honest li { grid-template-columns:1fr; } }
  .btn:focus-visible, .top nav a:focus-visible, .sector a:focus-visible { outline:3px solid var(--moss); outline-offset:2px; }
  footer { border-top:1px solid var(--line); margin-top:72px; padding:32px 0 48px; color:var(--muted); font-size:15px; }
  footer .wrap { display:flex; flex-wrap:wrap; gap:14px 26px; align-items:center; }
  footer nav { display:flex; flex-wrap:wrap; gap:18px; }
  footer a { text-decoration:none; font-weight:700; }
  footer a:hover { color:var(--ink); }
  @media (max-width:720px) {
    body { font-size:16px; }
    .top nav a:not(.cta):not(.keep) { display:none; }
    .top .wrap { gap:10px; }
    .top nav { gap:2px; }
    .top nav a { padding:7px 9px; font-size:14px; min-height:44px; display:inline-flex; align-items:center; }
  }
  @media (max-width:900px) { footer nav { gap:4px 8px; } footer nav a { display:inline-flex; align-items:center; min-height:44px; padding:0 6px; } }
  @media (max-width:380px) { .top nav a.keep[href="/pricing"] { display:none; } }
  @media (prefers-reduced-motion:reduce) { html { scroll-behavior:auto; } *, *::before, *::after { transition-duration:.01ms !important; animation-duration:.01ms !important; animation-iteration-count:1 !important; } }
`;

export const MARK = `<svg viewBox="0 0 72 72" fill="none" aria-hidden="true"><rect x="2" y="2" width="68" height="68" rx="23" fill="var(--card)" stroke="var(--line)"/><path d="M18 18v12c0 7.2 5.8 13 13 13h9c7.8 0 14 6.2 14 14v3" stroke="var(--ink)" stroke-width="4.6" stroke-linecap="round"/><path d="M18 18h10M44 16h10v10" stroke="var(--moss)" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="18" cy="18" r="5" fill="#e0a04b"/><circle cx="54" cy="60" r="5" fill="#5e79e6"/><circle cx="38" cy="43" r="4.8" fill="var(--moss)"/></svg>`;

export function page(options: { title: string; description: string; path: string; body: string; style?: string; index?: boolean }): string {
  const base = (process.env.NAHJ_PUBLIC_URL || "").replace(/\/+$/, "");
  const contact = contactEmail();
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(options.title)}</title>
<meta name="description" content="${escapeHtml(options.description)}">
<meta name="theme-color" content="#f4f1e8">
<meta property="og:type" content="website">
<meta property="og:locale" content="ar_KW">
<meta property="og:title" content="${escapeHtml(options.title)}">
<meta property="og:description" content="${escapeHtml(options.description)}">
<meta property="og:image" content="${escapeHtml(base)}/og.png">
<meta name="twitter:card" content="summary_large_image">
${base ? `<link rel="canonical" href="${escapeHtml(base + options.path)}">` : ""}
${options.index === false ? `<meta name="robots" content="noindex">` : ""}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
${FONT_PRELOAD_LINK}
<style>${BASE_STYLE}${options.style || ""}</style>
</head>
<body>
<header class="top"><div class="wrap">
  <a class="brand" href="/" aria-label="نهج — الصفحة الرئيسية">${MARK}<span>نهج</span></a>
  <nav aria-label="التنقّل الرئيسي">
    <a href="/#sectors">القطاعات</a>
    <a href="/#how">كيف يعمل</a>
    <a class="keep" href="/pricing">الأسعار</a>
    <a class="keep" href="/app">دخول</a>
    <a class="cta" href="/#contact">اطلب عرضاً</a>
  </nav>
</div></header>
<main>${options.body}</main>
<footer><div class="wrap">
  <span>© ${new Date().getFullYear()} ${escapeHtml(legalName())}</span>
  <nav aria-label="روابط الموقع">
    <a href="/pricing">الأسعار</a>
    <a href="/terms">شروط الاستخدام</a>
    <a href="/privacy">سياسة الخصوصية</a>
    ${contact ? `<a href="mailto:${escapeHtml(contact)}">${escapeHtml(contact)}</a>` : ""}
  </nav>
</div></footer>
</body>
</html>`;
}

/* ------------------------------------------------------------ الهبوط */

/* أمثلة حزمة التعليم — مبذورةٌ في seedData لا في حزمة، فتُكتب هنا بالاسم. */
const EDUCATION_EXAMPLES = ["التسجيل والقبول", "الرسوم والاستثناءات", "حجز المقابلات"];

/* لون كل قطاع من رموز الصفحة نفسها (يتبدّل في الوضع الداكن تلقائياً). */
const SECTOR_ACCENT: Record<string, string> = {
  education: "var(--sky)", clinic: "var(--moss)", law: "var(--violet)", retail: "var(--coral)",
  logistics: "var(--amber)", realestate: "var(--sky)", general: "var(--muted)",
};
const accentOf = (code: string) => SECTOR_ACCENT[code] || "var(--moss)";

const ARROW = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>`;
const icon = (paths: string) => `<span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths}</svg></span>`;
const TRUST_ICONS = {
  approve: icon('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>'),
  ledger: icon('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h6"/><path d="M8 13h8"/><path d="M8 17h5"/>'),
  arabic: icon('<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>'),
  data: icon('<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>'),
};
const LOCK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

const LANDING_STYLE = `
  .hero { padding:64px 0 32px; display:grid; grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr); gap:24px 40px; align-items:center; }
  .hero-visual { display:flex; justify-content:center; }
  .orbit { --s:clamp(250px, 32vw, 410px); position:relative; width:var(--s); aspect-ratio:1; flex:none; }
  .orbit-glow { position:absolute; inset:-14%; border-radius:50%; background:radial-gradient(closest-side, color-mix(in srgb, var(--moss) 24%, transparent), color-mix(in srgb, var(--amber) 8%, transparent) 62%, transparent 76%); }
  .orbit-ring { position:absolute; inset:7%; border-radius:50%; border:1.5px dashed color-mix(in srgb, var(--moss) 38%, var(--line)); }
  .orbit-ring.inner { inset:27%; border-style:solid; border-color:var(--line); }
  .orbit-spin { position:absolute; inset:0; animation:orbitSpin 90s linear infinite; }
  .orb { position:absolute; top:50%; inset-inline-start:50%; width:0; height:0; transform:rotate(var(--a)) translateY(calc(var(--s) * -.43)) rotate(calc(var(--a) * -1)); }
  .orb > span { position:absolute; left:-24px; top:-24px; width:48px; height:48px; display:grid; place-items:center; border-radius:16px; background:var(--card); border:1px solid var(--line); color:var(--accent, var(--moss)); box-shadow:var(--shadow); animation:orbitSpin 90s linear infinite reverse; }
  .orb svg { width:24px; height:24px; }
  .orbit-core { position:absolute; inset:34%; display:grid; place-items:center; border-radius:50%; background:var(--card); border:1px solid var(--line); box-shadow:0 0 0 10px color-mix(in srgb, var(--moss) 10%, transparent), var(--shadow); }
  .orbit-core svg { width:62%; height:62%; }
  @keyframes orbitSpin { to { transform:rotate(360deg); } }
  @media (max-width:560px) { .hero .actions .btn { flex:1 1 100%; } }
  @media (max-width:900px) { .hero { grid-template-columns:1fr; padding-top:40px; } .hero-visual { order:2; } .orbit { --s:min(300px, 78vw); } }
  .hero .eyebrow { display:inline-block; font-size:14px; font-weight:800; color:var(--moss); background:var(--moss-soft); padding:6px 12px; border-radius:999px; }
  .hero h1 { font-size:clamp(34px, 6vw, 58px); line-height:1.25; margin:18px 0 16px; font-weight:900; letter-spacing:-.5px; max-width:900px; }
  .hero p.lead { font-size:clamp(18px, 2.4vw, 21px); color:var(--muted); max-width:720px; margin:0 0 28px; }
  .hero .actions { display:flex; flex-wrap:wrap; gap:12px; }
  .hero .note { margin-top:14px; font-size:14px; color:var(--muted); }
  section { padding:44px 0; }
  h2 { font-size:clamp(26px, 4vw, 36px); margin:0 0 10px; font-weight:900; }
  .sub { color:var(--muted); margin:0 0 28px; max-width:720px; }
  .sectors { display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:16px; }
  .sector { --accent:var(--moss); position:relative; display:flex; flex-direction:column; gap:10px; background:linear-gradient(to bottom, color-mix(in srgb, var(--accent) 9%, var(--card)), var(--card) 62%); border:1px solid var(--line); border-radius:var(--r); padding:22px; transition:transform .25s, box-shadow .25s, border-color .25s; }
  .sector:hover, .sector:focus-within { transform:translateY(-4px); box-shadow:var(--shadow); border-color:color-mix(in srgb, var(--accent) 55%, var(--line)); }
  .sector .head { display:flex; align-items:center; gap:12px; }
  .sector .logo { line-height:0; }
  .sector .sector-icon { display:grid; place-items:center; width:52px; height:52px; border-radius:16px; color:var(--accent); background:color-mix(in srgb, var(--accent) 14%, var(--card)); border:1px solid color-mix(in srgb, var(--accent) 22%, var(--line)); }
  .sector h3 { margin:0; font-size:20px; font-weight:900; }
  .sector .org { font-size:14px; color:var(--muted); }
  .sector p { margin:0; color:var(--muted); font-size:15.5px; }
  .sector ul { margin:0; padding:0; list-style:none; display:flex; flex-wrap:wrap; gap:6px; }
  .sector li { font-size:13.5px; font-weight:700; background:color-mix(in srgb, var(--accent) 12%, var(--card)); color:var(--accent); padding:4px 10px; border-radius:999px; }
  .sector a.more { margin-top:auto; padding-top:6px; display:inline-flex; align-items:center; gap:8px; font-weight:800; font-size:15.5px; color:var(--accent); text-decoration:none; }
  .sector a.more::after { content:""; position:absolute; inset:0; border-radius:inherit; }
  .sector a.more svg { width:18px; height:18px; transition:transform .2s; }
  .sector:hover a.more svg { transform:translateX(-5px); }
  .sector a.more:focus-visible { outline:none; }
  .sector a.more:focus-visible::after { outline:3px solid var(--moss); outline-offset:2px; }
  .steps { display:grid; grid-template-columns:repeat(auto-fit, minmax(230px, 1fr)); gap:16px; counter-reset:step; }
  .step { background:var(--card); border:1px solid var(--line); border-radius:20px; padding:22px; }
  .step b { display:grid; place-items:center; width:40px; height:40px; border-radius:12px; background:var(--ink); color:var(--bg); font-size:18px; margin-bottom:12px; }
  .step h3 { margin:0 0 6px; font-size:19px; }
  .step p { margin:0; color:var(--muted); font-size:15.5px; }
  /* مسار الثقة: رمزٌ يصعد درجات الصلاحية ويقف عند بوابة موافقتك. الحالة الافتراضية مكتملة؛ السكربت وحده يبدأ الحركة. */
  .trail { position:relative; margin:6px 0 30px; padding:30px 8px 8px; }
  .trail-line { position:relative; height:44px; margin:0 22px; }
  .trail-line::before { content:""; position:absolute; inset-inline:0; top:20px; height:4px; border-radius:2px; background:var(--line); }
  .trail-fill { position:absolute; inset-inline-start:0; top:20px; height:4px; border-radius:2px; background:linear-gradient(to left, var(--moss), var(--amber)); width:100%; transition:width .9s cubic-bezier(.5,.1,.2,1); }
  .trail-node { position:absolute; top:10px; width:24px; height:24px; margin-inline-start:-12px; border-radius:50%; background:var(--card); border:3px solid var(--line); transition:border-color .5s, background .5s, transform .5s; }
  .trail-node.lit { border-color:var(--moss); background:var(--moss-soft); }
  .trail-node.now { transform:scale(1.25); background:var(--moss); border-color:var(--moss); }
  .trail-node span { position:absolute; top:34px; inset-inline-start:50%; transform:translateX(-50%); font-size:13px; font-weight:800; color:var(--muted); direction:ltr; }
  .trail-node.lit span { color:var(--ink); }
  .trail-node:nth-child(3) { inset-inline-start:0%; } .trail-node:nth-child(4) { inset-inline-start:16.666%; } .trail-node:nth-child(5) { inset-inline-start:33.333%; }
  .trail-node:nth-child(6) { inset-inline-start:50%; } .trail-node:nth-child(7) { inset-inline-start:66.666%; } .trail-node:nth-child(8) { inset-inline-start:83.333%; } .trail-node:nth-child(9) { inset-inline-start:100%; }
  .trail-gate { position:absolute; top:-26px; inset-inline-start:58.333%; margin-inline-start:-14px; width:28px; height:70px; opacity:1; transition:opacity .4s; }
  .trail-gate::before { content:""; position:absolute; inset-inline-start:12px; top:0; width:4px; height:100%; border-radius:2px; background:var(--amber); }
  .trail-gate::after { content:""; position:absolute; top:-6px; inset-inline-start:4px; width:20px; height:10px; border-radius:6px; background:var(--amber); }
  .trail.live .trail-gate { opacity:.28; }
  .trail.live .trail-gate.hold { opacity:1; animation:gatePulse 1.1s ease-in-out 1; }
  @keyframes gatePulse { 50% { transform:scale(1.12); } }
  .trail-say { margin:34px 0 0; min-height:3.4em; text-align:center; font-weight:800; font-size:clamp(18px, 2.6vw, 22px); transition:opacity .35s; }
  .trail-say.out { opacity:0; }
  .trail.reset .trail-fill, .trail.reset .trail-node { transition:none; }
  .step { transition:border-color .5s, transform .5s, box-shadow .5s; }
  .trail.live ~ .steps .step { opacity:.55; }
  .trail.live ~ .steps .step.on { opacity:1; border-color:var(--moss); transform:translateY(-4px); box-shadow:0 10px 24px -14px var(--moss); }
  .trail.live ~ .steps .step.on b { background:var(--moss); }
  @media (max-width:560px) { .trail-node span { font-size:11px; } .trail-line { margin:0 16px; } }
  @media (prefers-reduced-motion:reduce) { .trail *, .step { transition:none !important; animation:none !important; } }
  .levels { display:flex; flex-wrap:wrap; gap:8px; margin-top:18px; }
  .levels span { font-size:14px; padding:6px 12px; border-radius:10px; border:1px solid var(--line); background:var(--card); }
  .levels span b { color:var(--moss); margin-inline-end:6px; }
  .trust { display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:14px; }
  .trust > div { background:var(--card); border:1px solid var(--line); border-radius:var(--r); padding:20px; transition:transform .25s, box-shadow .25s; }
  .trust > div:hover { transform:translateY(-3px); box-shadow:var(--shadow); }
  .trust .ico { display:grid; place-items:center; width:46px; height:46px; border-radius:14px; background:var(--moss-soft); color:var(--moss); margin-bottom:12px; }
  .trust .ico svg { width:24px; height:24px; }
  .trust h3 { margin:0 0 4px; font-size:18px; }
  .trust p { margin:0; color:var(--muted); font-size:15.5px; }
  .honest h2 { font-size:clamp(22px, 3vw, 28px); }
  .faq details { background:var(--card); border:1px solid var(--line); border-radius:16px; margin-bottom:10px; transition:border-color .2s, box-shadow .2s; }
  .faq details[open] { border-color:color-mix(in srgb, var(--moss) 45%, var(--line)); box-shadow:var(--shadow); }
  .faq summary { position:relative; list-style:none; font-weight:800; cursor:pointer; font-size:17px; padding:16px 20px; padding-inline-end:58px; border-radius:16px; }
  .faq summary::-webkit-details-marker { display:none; }
  .faq summary::before, .faq summary::after { content:""; position:absolute; inset-inline-end:22px; top:50%; width:16px; height:2.5px; margin-top:-1.25px; border-radius:2px; background:var(--moss); transition:transform .3s; }
  .faq summary::after { transform:rotate(90deg); }
  .faq details[open] summary::after { transform:rotate(180deg); }
  .faq details[open] summary::before { transform:rotate(180deg); }
  .faq summary:focus-visible { outline:3px solid var(--moss); outline-offset:2px; }
  .faq p { margin:0; padding:0 20px 18px; color:var(--muted); animation:faqIn .3s ease; }
  @keyframes faqIn { from { opacity:0; transform:translateY(-6px); } }
  .contact { display:grid; grid-template-columns:1fr 1.2fr; gap:28px; align-items:start; background:var(--card); border:1px solid var(--line); border-radius:24px; padding:32px; margin-top:24px; box-shadow:var(--shadow); }
  .contact .direct { font-weight:700; }
  .contact .direct a { color:var(--moss); }
  .contact form { display:grid; gap:12px; }
  .contact label { display:grid; gap:6px; font-weight:700; font-size:15px; }
  .contact label small { color:var(--muted); font-weight:600; }
  .contact input, .contact select, .contact textarea { font:inherit; font-weight:500; padding:12px 14px; border-radius:12px; border:1.5px solid var(--line); background:color-mix(in srgb, var(--bg) 70%, var(--card)); color:var(--ink); width:100%; transition:border-color .2s, box-shadow .2s, background .2s; }
  .contact input:hover, .contact select:hover, .contact textarea:hover { border-color:color-mix(in srgb, var(--moss) 45%, var(--line)); }
  .contact input:focus, .contact select:focus, .contact textarea:focus { outline:none; border-color:var(--moss); background:var(--card); box-shadow:0 0 0 4px color-mix(in srgb, var(--moss) 22%, transparent); }
  .contact input:focus-visible, .contact select:focus-visible, .contact textarea:focus-visible { outline:2px solid transparent; }
  .contact .trust-cue { display:flex; align-items:center; gap:8px; margin:0; font-size:14px; color:var(--muted); }
  .contact .trust-cue a { font-weight:700; color:var(--muted); }
  .contact .trust-cue svg { width:18px; height:18px; flex:none; color:var(--moss); }
  .contact .hp { position:absolute; inset-inline-start:-9999px; width:1px; height:1px; overflow:hidden; }
  .form-status { margin:0; min-height:1.6em; font-weight:700; }
  .form-status.ok { color:var(--moss); }
  .form-status.err { color:var(--err); }
  @media (max-width:820px) { .contact { grid-template-columns:1fr; padding:20px; } }
  .final { position:relative; overflow:hidden; text-align:center; background:var(--ink); color:var(--bg); border-radius:28px; padding:64px 24px; margin-top:24px; }
  .final::before { content:""; position:absolute; inset:-40% 20% auto; height:90%; border-radius:50%; background:radial-gradient(closest-side, color-mix(in srgb, var(--moss) 42%, transparent), transparent); pointer-events:none; }
  .final > * { position:relative; }
  .final h2 { color:var(--bg); font-size:clamp(28px, 4.4vw, 42px); }
  .final p { opacity:.82; margin:0 auto 28px; max-width:620px; }
  .final .btn { background:var(--bg); color:var(--ink); border-color:var(--bg); padding:18px 40px; font-size:19px; border-radius:16px; }
  .final .btn:hover { border-color:var(--bg); }
  /* ظهور الأقسام عند التمرير: يبدأ السكربت وحده؛ بلا سكربت أو مع تقليل الحركة تبقى كلها ظاهرة. */
  html.rv .rv-hide { opacity:0; transform:translateY(22px); }
  @media print { html.rv .rv-hide, html.rv .rv-in { opacity:1 !important; transform:none !important; transition:none !important; } }
  html.rv .rv-hide, html.rv .rv-in { transition:opacity .7s ease, transform .7s cubic-bezier(.2,.7,.2,1); }
`;

export function renderLandingPage(): string {
  const sectors = listSectors();
  const plans = publicPlans();
  const priced = plans.filter(plan => plan.monthly !== CUSTOM_PRICE);
  const from = priced[0]?.monthly;

  const contact = contactEmail();
  const whatsapp = contactWhatsapp();
  const contactLinks = contact || whatsapp
    ? `<p class="direct">أو تواصل مباشرة: ${[
        whatsapp ? `<a href="https://wa.me/${whatsapp}" rel="noopener">واتساب</a>` : "",
        contact ? `<a href="mailto:${escapeHtml(contact)}">${escapeHtml(contact)}</a>` : "",
      ].filter(Boolean).join(" · ")}</p>`
    : "";
  const sectorOptions = sectors.map(sector => `<option value="${escapeHtml(sector.code)}">${escapeHtml(sector.nameAr)}</option>`).join("");

  const sectorCards = sectors.map(sector => {
    const examples = sector.code === EDUCATION_CODE
      ? EDUCATION_EXAMPLES
      : (getSectorPack(sector.code)?.skills || []).slice(0, 3).map(skill => skill.name);
    return `
    <article class="sector" style="--accent:${accentOf(sector.code)}">
      <div class="head"><span class="logo" aria-hidden="true"><span class="sector-icon">${sectorGlyph(sector.code)}</span></span>
        <div><h3>${escapeHtml(sector.nameAr)}</h3><div class="org">مثال: ${escapeHtml(sector.organizationName)}</div></div></div>
      <p>${escapeHtml(sector.descriptionAr)}</p>
      <ul aria-label="أمثلة على ما يتولّاه">${examples.map(example => `<li>${escapeHtml(example)}</li>`).join("")}</ul>
      <a class="more" href="?sector=${encodeURIComponent(sector.code)}#contact" data-sector="${escapeHtml(sector.code)}" aria-label="اطلب عرضاً لقطاع ${escapeHtml(sector.nameAr)}">اطلب عرضاً لقطاعك ${ARROW}</a>
    </article>`;
  }).join("");

  const orbitItems = sectors.slice(0, 6).map((sector, index, list) =>
    `<i class="orb" style="--a:${Math.round(index * 360 / list.length)}deg;--accent:${accentOf(sector.code)}"><span>${sectorGlyph(sector.code)}</span></i>`).join("");

  const body = `
<div class="wrap">
  <section class="hero">
    <div class="hero-copy">
    <span class="eyebrow">لكل مؤسسة — عيادة، مكتب، متجر، شركة، مدرسة</span>
    <h1>موظفوك يعرفون كيف يُنجَز العمل.<br>نهج يتعلّمه منهم، ثم يُنجزه معهم.</h1>
    <p class="lead">نهج نظامٌ عربيّ يراقب كيف يعمل فريقك، ويحوّل خبرته إلى إجراءاتٍ مكتوبة، ثم يتدرّب عليها حتى يُثبت أنه يُتقنها — ولا ينفّذ إلا ما أذنتَ له به، ويطلب موافقتك في كل قرارٍ حسّاس.</p>
    <div class="actions">
      <a class="btn primary" href="#contact">اطلب عرضاً توضيحياً</a>
      <a class="btn" href="/pricing">الباقات والأسعار</a>
    </div>
    <div class="note">نعرضه عليك على مثالٍ من قطاعك، ثم نُعِدّ مؤسستك ونبدأ${from ? ` · الباقات تبدأ من ${escapeHtml(from)} شهرياً` : ""}</div>
    </div>
    <div class="hero-visual" aria-hidden="true">
      <div class="orbit">
        <div class="orbit-glow"></div>
        <div class="orbit-ring"></div><div class="orbit-ring inner"></div>
        <div class="orbit-spin">${orbitItems}</div>
        <div class="orbit-core">${MARK}</div>
      </div>
    </div>
  </section>

  <section id="sectors" aria-labelledby="sectors-title">
    <h2 id="sectors-title">مبنيّ لقطاعك — لا لقطاعٍ واحد</h2>
    <p class="sub">كل قطاع يبدأ بقوالب مهاراته وسياساته ومن يعتمد قراراته، تُراجعها مؤسستك وتعدّلها وتعلّم نهج ما ينقصها. وإن لم يكن قطاعك هنا فنهج يتعلّم عملك من موظفيك مباشرة.</p>
    <div class="sectors">${sectorCards}</div>
  </section>

  <section id="how" aria-labelledby="how-title">
    <h2 id="how-title">كيف يعمل — في أربع خطوات</h2>
    <p class="sub">لا يُمنح نهج الثقة؛ يكسبها خطوةً بخطوة، وتبقى أنت صاحب القرار في كل مرحلة.</p>
    <figure class="trail" id="trail" aria-label="نهج يصعد درجات الصلاحية من L0 إلى L6، ويقف عند بوابة موافقتك قبل القرارات الحسّاسة">
      <div class="trail-line" aria-hidden="true">
        <div class="trail-fill"></div>
        <i class="trail-gate"></i>
        <i class="trail-node lit"><span>L0</span></i><i class="trail-node lit"><span>L1</span></i><i class="trail-node lit"><span>L2</span></i><i class="trail-node lit"><span>L3</span></i><i class="trail-node lit"><span>L4</span></i><i class="trail-node lit"><span>L5</span></i><i class="trail-node lit"><span>L6</span></i>
      </div>
      <figcaption class="trail-say" aria-live="off">يكسب الثقة درجةً درجة، وتبقى البوابة بيدك.</figcaption>
    </figure>
    <div class="steps">
      <div class="step"><b>1</b><h3>يتعلّم</h3><p>موظفك يُريه كيف يُنجز مهمةً مرة واحدة، ونهج يكتبها إجراءً واضحاً ويسأل عمّا لم يفهمه.</p></div>
      <div class="step"><b>2</b><h3>يتدرّب</h3><p>يُختبر على حالاتٍ مكتوبة، ثم يعمل «في الظل» بجوار الموظف: يقترح ولا ينفّذ، ويُقارَن قراره بقرار الإنسان.</p></div>
      <div class="step"><b>3</b><h3>يُؤذَن له</h3><p>حين تثبت دقّته ترفع صلاحيته درجة. والقرارات الحسّاسة — المبالغ، والاستثناءات — تبقى بموافقتك دائماً.</p></div>
      <div class="step"><b>4</b><h3>يعمل ويُسجِّل</h3><p>كل ما يفعله يُكتب في سجلٍّ لا يُعدَّل: من فعل، ولماذا، وبأي سياسة. وزرّ إيقافٍ واحد يوقفه فوراً.</p></div>
    </div>
    <div class="levels" aria-label="درجات الصلاحية">
      <span><b>L0–L1</b>يراقب ويقترح</span>
      <span><b>L2–L3</b>يُنجز بموافقتك</span>
      <span><b>L4–L5</b>يُنجز وحده ضمن حدود</span>
      <span><b>L6</b>تشغيل كامل لما أثبت إتقانه</span>
    </div>
  </section>

  <section aria-labelledby="trust-title">
    <h2 id="trust-title">لماذا تثق به</h2>
    <div class="trust">
      <div>${TRUST_ICONS.approve}<h3>أنت من يعتمد</h3><p>كل قرارٍ حسّاس يصل إلى الشخص الذي تحدّده لائحتك، ولا يُنفَّذ قبل موافقته.</p></div>
      <div>${TRUST_ICONS.ledger}<h3>سجلٌّ لا يُعدَّل</h3><p>كل إجراء له أثرٌ مكتوب يُراجَع في أي وقت — للتدقيق والالتزام.</p></div>
      <div>${TRUST_ICONS.arabic}<h3>عربيّ أولاً</h3><p>مبنيّ للعربية ولهجات المنطقة من أول يوم، لا مترجماً عن منتجٍ أجنبي.</p></div>
      <div>${TRUST_ICONS.data}<h3>بياناتك لك</h3><p>تصدّر كل بياناتك متى شئت، ونسخٌ احتياطية دورية.</p></div>
    </div>
  </section>

  <section aria-labelledby="honest-title">
    <div class="honest">
      <h2 id="honest-title">ما هو جاهز اليوم، وما ليس بعد</h2>
      <ul>
        <li><strong class="chip">جاهز:</strong><span> التعلّم من العمل، والتدرّب والظل، والموافقات ودرجات الصلاحية، وسجلّ التدقيق، ولوحة الأثر، والاشتراك والفوترة، والتصدير.</span></li>
        <li><strong class="chip sim">محاكاة معلنة:</strong><span>الربط بأنظمتكم القائمة (أنظمة المواعيد، والطلبات، والملفات) يظهر في المنتج بوسم «محاكاة». أول ربطٍ حقيقي يُبنى مع أول عميلٍ في قطاعه وبقراره.</span></li>
        <li><strong class="chip soon">قريباً:</strong><span> قناة واتساب الحقيقية، والدخول الموحّد، والواجهة البرمجية.</span></li>
      </ul>
    </div>
  </section>

  <section class="faq" aria-labelledby="faq-title">
    <h2 id="faq-title">أسئلة شائعة</h2>
    <details><summary>هل يناسب مؤسستي إن لم تكن مدرسة؟</summary><p>نعم. نهج عامّ في قلبه: يتعلّم أيّ عملٍ متكرّر له خطوات وقرارات. والقطاعات أعلاه نقاط بداية جاهزة، ويمكن أن يتعلّم نهج عمل أي قطاعٍ آخر من موظفيه مباشرة.</p></details>
    <details><summary>هل يحتاج فريقي إلى خبرة تقنية؟</summary><p>لا. من يعرف كيف يُنجز عمله يستطيع أن يعلّمه لنهج بكلامه، والشاشات بالعربية وواضحة.</p></details>
    <details><summary>هل سيستبدل موظفيّ؟</summary><p>لا. يتولّى المتكرّر ويترك للموظف ما يحتاج حكماً بشرياً، ولا يتّخذ قراراً حسّاساً بلا موافقة إنسان.</p></details>
    <details><summary>ماذا لو أخطأ؟</summary><p>لا يعمل وحده إلا فيما أثبت دقّته فيه بالاختبار والظل، ويمكن إيقافه فوراً بزرّ واحد، وكل ما فعله مسجَّل.</p></details>
    <details><summary>كيف نبدأ؟</summary><p>اطلب عرضاً من النموذج أدناه، فنعرض عليك نهج على مثالٍ من قطاعك. ثم نُنشئ حساب مؤسستك، وتكتب اسمها وتختار قطاعها، فتبدأ بقوالب القطاع وتعلّم نهج عملكم خطوةً بخطوة.</p></details>
    <details><summary>هل تبقى بياناتنا لنا؟</summary><p>نعم. تصدّر كل بيانات مؤسستك متى شئت، ولا تُستعمل لغير تشغيل خدمتكم.</p></details>
  </section>

  <section id="contact" class="contact" aria-labelledby="contact-title">
    <div>
      <h2 id="contact-title">اطلب عرضاً توضيحياً</h2>
      <p class="sub">اترك بياناتك ونتواصل معك لنعرض نهج على مثالٍ من قطاعك.</p>
      ${contactLinks}
    </div>
    <form id="lead-form" novalidate>
      <label>الاسم<input name="name" autocomplete="name" required maxlength="120"></label>
      <label>اسم المؤسسة<input name="organization" autocomplete="organization" required maxlength="160"></label>
      <label>القطاع<select name="sector">${sectorOptions}<option value="other">قطاع آخر</option></select></label>
      <label>البريد أو رقم الهاتف<input name="contact" required maxlength="160" inputmode="email" dir="ltr"></label>
      <label>ما الذي تريد أن يتولّاه نهج؟ <small>(اختياري)</small><textarea name="message" rows="3" maxlength="1000"></textarea></label>
      <label class="hp" aria-hidden="true">الموقع<input name="website" tabindex="-1" autocomplete="off"></label>
      <button class="btn primary" type="submit">أرسل الطلب</button>
      <p class="trust-cue">${LOCK}<a href="/privacy">سياسة الخصوصية</a></p>
      <p class="form-status" role="status" aria-live="polite"></p>
    </form>
  </section>

  <section class="final">
    <h2>شاهده يعمل على قطاعك</h2>
    <p>عرضٌ قصير على مثالٍ من قطاعك: كيف يتعلّم، وكيف يطلب موافقتك، وكيف يسجّل كل شيء.</p>
    <a class="btn" href="#contact">اطلب عرضاً</a>
  </section>
</div>
<script>
  (function () {
    var trail = document.getElementById("trail");
    if (!trail || !window.IntersectionObserver) return;
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var nodes = trail.querySelectorAll(".trail-node"), fill = trail.querySelector(".trail-fill"), gate = trail.querySelector(".trail-gate");
    var say = trail.querySelector(".trail-say"), cards = document.querySelectorAll("#how .step");
    /* كل مرحلة: أعلى درجة وصل إليها، وهل البوابة مغلقة، وما يُقال بكلامٍ بسيط. */
    var stages = [
      { at: 1, hold: false, text: "يبدأ بالمراقبة فقط. لا ينفّذ شيئاً." },
      { at: 2, hold: false, text: "يتدرّب بجانب موظفك، ويقارن قراره بقراره." },
      { at: 3, hold: true,  text: "قبل أي قرارٍ حسّاس، ينتظر موافقتك." },
      { at: 6, hold: false, text: "يعمل ضمن حدوده، ويسجّل كل شيء. وزرّ واحد يوقفه." }
    ];
    var rest = say.textContent;
    /* يُعرض مرة واحدة ثم يستقر على الحالة الكاملة (كل الدرجات مضاءة والبوابة قائمة): لا حلقة لا نهائية. */
    function show(k) {
      var st = stages[k];
      /* أول مرحلة تبدأ من الصفر فوراً: لا تراجعٌ متحرك من L6 إلى L1. */
      if (k === 0) { trail.classList.add("reset"); fill.style.width = "0%"; nodes.forEach(function (n) { n.classList.remove("lit", "now"); }); void trail.offsetWidth; trail.classList.remove("reset"); }
      trail.classList.add("live");
      nodes.forEach(function (n, j) { n.classList.toggle("lit", j <= st.at); n.classList.toggle("now", j === st.at); });
      fill.style.width = (st.at / 6 * 100) + "%";
      gate.classList.toggle("hold", st.hold);
      cards.forEach(function (c, j) { c.classList.toggle("on", j === k); });
      say.classList.add("out");
      setTimeout(function () { say.textContent = st.text; say.classList.remove("out"); }, 250);
    }
    function settle() {
      nodes.forEach(function (n) { n.classList.add("lit"); n.classList.remove("now"); });
      fill.style.width = "100%";
      gate.classList.remove("hold");
      cards.forEach(function (c) { c.classList.remove("on"); });
      trail.classList.remove("live");
      say.classList.add("out");
      setTimeout(function () { say.textContent = rest; say.classList.remove("out"); }, 250);
    }
    function play(k) { if (k >= stages.length) { settle(); return; } show(k); setTimeout(function () { play(k + 1); }, k === stages.length - 1 ? 1200 : 1100); }
    var need = Math.max(.05, Math.min(.4, .9 * window.innerHeight / (trail.getBoundingClientRect().height || 1)));
    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting || entries[0].intersectionRatio < need - .01) return;
      io.disconnect();
      play(0);
    }, { threshold: need });
    io.observe(trail);
  })();
</script>
<script>
  (function () {
    /* ظهور الأقسام عند التمرير. الإخفاء لا يُطبَّق إلا بعد التأكد من وجود المراقب؛ وبلا سكربت أو مع «تقليل الحركة» أو الطباعة تبقى الأقسام ظاهرة. */
    if (!("IntersectionObserver" in window)) return;
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var list = Array.prototype.slice.call(document.querySelectorAll("main section:not(.hero)"));
    var below = list.filter(function (el) { return el.getBoundingClientRect().top > window.innerHeight * 0.9; });
    if (!below.length) return;
    var fired = false;
    function revealAll() { below.forEach(function (el) { el.classList.remove("rv-hide"); el.classList.add("rv-in"); }); }
    var io;
    try {
      io = new IntersectionObserver(function (entries) {
        fired = true;
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.remove("rv-hide"); entry.target.classList.add("rv-in"); io.unobserve(entry.target);
        });
      }, { threshold: .08 });
    } catch (e) { return; }
    document.documentElement.classList.add("rv");
    below.forEach(function (el) { el.classList.add("rv-hide"); io.observe(el); });
    /* احتياط: إن لم يُطلق المراقب ردّه قط فلا قسمَ يبقى مخفياً. */
    setTimeout(function () { if (!fired) revealAll(); }, 2000);
    window.addEventListener("beforeprint", revealAll);
  })();
</script>
<script>
  (function () {
    var form = document.getElementById("lead-form");
    if (!form) return;
    /* القطاع من البطاقة التي ضُغطت — يوفّر على الزائر اختياره مرة ثانية. */
    var preset = new URLSearchParams(location.search).get("sector");
    if (preset && form.sector.querySelector('option[value="' + preset.replace(/[^a-z]/g, "") + '"]')) form.sector.value = preset;
    document.querySelectorAll("[data-sector]").forEach(function (link) {
      link.addEventListener("click", function () { form.sector.value = link.getAttribute("data-sector"); });
    });
    var status = form.querySelector(".form-status");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var button = form.querySelector("button");
      var data = {};
      new FormData(form).forEach(function (value, key) { data[key] = value; });
      button.disabled = true;
      status.textContent = "جارٍ الإرسال...";
      fetch("/api/public/leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) })
        .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
        .then(function (result) {
          if (result.ok) { form.reset(); status.textContent = "وصلنا طلبك، وسنتواصل معك قريباً. شكراً لك."; status.className = "form-status ok"; }
          else { status.textContent = (result.body && result.body.error) || "تعذّر الإرسال. حاول مجدداً."; status.className = "form-status err"; }
        })
        .catch(function () { status.textContent = "تعذّر الاتصال. حاول مجدداً."; status.className = "form-status err"; })
        .then(function () { button.disabled = false; });
    });
  })();
</script>`;

  return page({
    title: "نهج — عقلٌ تشغيليّ يتعلّم من فريقك، لكل قطاع",
    description: "نهج يتعلّم كيف يعمل فريقك، ويتدرّب حتى يُثبت إتقانه، ولا ينفّذ إلا بإذنك — للعيادات والمكاتب والمتاجر وشركات الشحن والعقار والمدارس.",
    path: "/",
    body,
    style: LANDING_STYLE,
  });
}

/* ------------------------------------------------- الشروط والخصوصية */

const DOC_STYLE = `
  .doc-layout { max-width:1040px; margin:0 auto; padding:48px 20px 0; display:grid; grid-template-columns:230px minmax(0,1fr); gap:44px; align-items:start; }
  .toc { position:sticky; top:90px; background:var(--card); border:1px solid var(--line); border-radius:var(--r); padding:16px 12px; }
  .toc b { display:block; font-size:14px; color:var(--muted); padding:0 10px 8px; }
  .toc ol { list-style:none; margin:0; padding:0; display:grid; gap:2px; }
  .toc a { display:block; text-decoration:none; font-weight:700; font-size:15px; line-height:1.5; padding:7px 10px; border-radius:10px; color:var(--ink); }
  .toc a:hover { background:var(--moss-soft); color:var(--moss); }
  .toc a:focus-visible { outline:3px solid var(--moss); outline-offset:1px; }
  article.doc { max-width:780px; min-width:0; }
  article.doc h1 { font-size:clamp(28px, 4vw, 38px); margin:0 0 6px; line-height:1.3; }
  article.doc .updated { color:var(--muted); font-size:14px; margin:0 0 28px; }
  article.doc h2 { font-size:22px; margin:34px 0 8px; padding-top:6px; }
  article.doc p, article.doc li { color:var(--ink); }
  article.doc a { color:var(--moss); font-weight:700; }
  article.doc ul { padding-inline-start:22px; }
  article.doc .box { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:16px 20px; margin:18px 0; }
  @media (max-width:900px) { .doc-layout { grid-template-columns:1fr; gap:20px; padding-top:32px; } .toc { position:static; } .toc ol { grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); } }
`;

/** يعطي كل عنوانٍ فرعيّ معرّفاً ويبني فهرساً يقفز إليه — النصّ نفسه لا يتغيّر. */
function withToc(articleHtml: string): string {
  const items: string[] = [];
  const html = articleHtml.replace(/<h2>([^<]+)<\/h2>/g, (_m, title: string) => {
    const id = `s${items.length + 1}`;
    items.push(`<li><a href="#${id}">${title}</a></li>`);
    return `<h2 id="${id}">${title}</h2>`;
  });
  return `<div class="doc-layout"><nav class="toc" aria-label="محتويات الصفحة"><b>محتويات الصفحة</b><ol>${items.join("")}</ol></nav>${html}</div>`;
}

const UPDATED = "23 سبتمبر 2026";

export function renderTermsPage(): string {
  const name = escapeHtml(legalName());
  const contact = contactEmail();
  const body = `<article class="doc">
  <h1>شروط الاستخدام</h1>
  <p class="updated">آخر تحديث: ${UPDATED}</p>
  <p>تنظّم هذه الشروط استخدامك منصة «نهج» التي يشغّلها ${name} («نحن»). باستخدامك المنصة أو اشتراكك فيها فأنت توافق عليها نيابةً عن نفسك وعن المؤسسة التي تمثّلها.</p>

  <h2>1. الخدمة</h2>
  <p>نهج منصةٌ برمجية تساعد المؤسسات على توثيق إجراءات عملها، وتدريب مساعدٍ آلي عليها، وتشغيله ضمن صلاحياتٍ وموافقاتٍ تحدّدها المؤسسة. ما يُعرض في المنتج بوسم «محاكاة» لا يتصل بأنظمةٍ خارجية حقيقية.</p>

  <h2>2. الحساب والمسؤولية عنه</h2>
  <ul>
    <li>أنت مسؤول عن سرّية كلمات المرور وعن كل ما يجري من حسابات مؤسستك.</li>
    <li>تحدّد مؤسستك الأدوار والصلاحيات ومستويات الاستقلالية ومن يعتمد القرارات؛ والقرارات المعتمدة من مستخدميها مسؤوليتها.</li>
  </ul>

  <h2>3. الاستخدام المقبول</h2>
  <p>لا يجوز استخدام المنصة في ما يخالف القانون، أو لمعالجة بياناتٍ لا تملك المؤسسة حقّ معالجتها، أو لمحاولة الوصول إلى بيانات مؤسسةٍ أخرى أو تعطيل الخدمة.</p>

  <h2>4. الاشتراك والفوترة</h2>
  <ul>
    <li>تُحسب الرسوم وفق الباقة ودورة الفوترة المختارة والمنشورة في صفحة <a href="/pricing">الأسعار</a> أو في عرضٍ مكتوب.</li>
    <li>يتجدّد الاشتراك تلقائياً في نهاية كل دورة ما لم يُلغَ قبلها.</li>
    <li>عند عدم السداد بعد مهلة السماح تُجمَّد الكتابة، وتبقى القراءة والتصدير متاحين لبياناتك.</li>
  </ul>

  <h2>5. بياناتك</h2>
  <p>تبقى بيانات مؤسستك ملكاً لها. نعالجها لتقديم الخدمة فقط وفق <a href="/privacy">سياسة الخصوصية</a>، ويمكنك تصديرها في أي وقت.</p>

  <h2>6. حدود المسؤولية</h2>
  <p>المساعد الآلي أداةٌ تعمل ضمن ما تأذن به مؤسستك؛ وتبقى المؤسسة مسؤولة عن مراجعة القرارات الحسّاسة واعتمادها. ولا نتحمّل الأضرار غير المباشرة أو فوات الأرباح، وتقتصر مسؤوليتنا في جميع الأحوال على ما دفعته المؤسسة خلال الأشهر الاثني عشر السابقة للمطالبة، في حدود ما يسمح به القانون.</p>

  <h2>7. الإنهاء</h2>
  <p>يمكنك إنهاء الاشتراك في أي وقت ويسري الإنهاء بنهاية الدورة المدفوعة. ويمكننا تعليق حسابٍ يخالف هذه الشروط بعد إشعاره متى أمكن.</p>

  <h2>8. التعديل والقانون الحاكم</h2>
  <p>قد نعدّل هذه الشروط ونُشعرك بالتعديل الجوهري قبل سريانه. وتخضع هذه الشروط لقوانين دولة الكويت، وتختص محاكمها بأي نزاع ينشأ عنها ما لم يُتفق كتابةً على غير ذلك.</p>

  <h2>9. التواصل</h2>
  <p>${contact ? `لأي استفسار: <a href="mailto:${escapeHtml(contact)}">${escapeHtml(contact)}</a>.` : "لأي استفسار تواصل معنا عبر القناة المذكورة في عقد اشتراكك."}</p>
</article>`;
  return page({ title: "شروط الاستخدام — نهج", description: "شروط استخدام منصة نهج.", path: "/terms", body: withToc(body), style: DOC_STYLE });
}

export function renderPrivacyPage(): string {
  const name = escapeHtml(legalName());
  const contact = contactEmail();
  const body = `<article class="doc">
  <h1>سياسة الخصوصية</h1>
  <p class="updated">آخر تحديث: ${UPDATED}</p>
  <p>توضّح هذه السياسة ما يجمعه ${name} عند استخدام منصة «نهج»، ولماذا، وأين يُحفظ، وما حقوقك.</p>

  <h2>1. ما نجمعه</h2>
  <ul>
    <li><strong>بيانات الحساب:</strong> الاسم والبريد الإلكتروني والدور. وتُحفظ كلمات المرور مشفّرةً بتجزئةٍ مملّحة ولا تُحفظ نصّاً أبداً.</li>
    <li><strong>بيانات التشغيل:</strong> ما تُدخله مؤسستك من إجراءات وسياسات وحالات عمل ومحادثات وموافقات، وسجلّ التدقيق.</li>
    <li><strong>طلبات العرض:</strong> ما تكتبه في نموذج «اطلب عرضاً» (الاسم، والمؤسسة، ووسيلة التواصل، ورسالتك) — نستعمله للتواصل معك بشأن طلبك فقط.</li>
    <li><strong>بيانات الفوترة:</strong> الفواتير وحالة السداد. أما بيانات البطاقة فتُدخل في صفحة مزوّد الدفع مباشرة ولا تمرّ بخوادمنا.</li>
  </ul>

  <h2>2. لماذا نستخدمها</h2>
  <p>لتقديم الخدمة وتشغيلها وتأمينها، وإصدار الفواتير، وإرسال الإشعارات الضرورية (فاتورة، تذكير تجديد). لا نبيع البيانات ولا نستخدمها للإعلان.</p>

  <h2>3. أين تُحفظ ومن يعالجها</h2>
  <ul>
    <li>تُحفظ البيانات في قاعدة بيانات الخادم الذي تُشغَّل عليه المنصة، مع نسخٍ احتياطية دورية.</li>
    <li><strong>النموذج اللغوي (اختياري):</strong> إن فُعّل، تُرسل نصوص محدّدة (مثل رسالةٍ في المحادثة) إلى مزوّد النموذج (Google Gemini) لتوليد الردّ فقط.</li>
    <li><strong>المزامنة السحابية (اختيارية):</strong> إن فُعّلت، تُنسخ بيانات التشغيل إلى مشروع Google Firebase خاص بالمنصة.</li>
    <li><strong>مزوّد الدفع والبريد:</strong> ما يلزم لإتمام السداد أو إيصال رسالة فقط.</li>
  </ul>

  <h2>4. ملفات تعريف الارتباط (الكوكيز)</h2>
  <p>نستخدم كوكيز ضرورية فقط: كوكي الجلسة لإبقائك مسجّلاً، وكوكي الحماية من تزوير الطلبات، وكوكي بيئة العرض حين نعرض عليك نهج. لا نستخدم كوكيز تتبّعٍ أو إعلان.</p>

  <h2>5. بيئة العرض التجريبية</h2>
  <p>العرض يعمل ببيانات تجريبية داخل الذاكرة، ولا يُحفظ في قاعدة البيانات، ويُمحى خلال ساعة من آخر استخدام. لا تُدخل فيه بيانات حقيقية.</p>

  <h2>6. مدة الاحتفاظ</h2>
  <p>نحتفظ بالبيانات طوال مدة الاشتراك. وبعد انتهائه تُحذف أو تُسلَّم للمؤسسة عند طلبها، إلا ما يلزم الاحتفاظ به قانوناً كسجلات الفوترة.</p>

  <h2>7. حقوقك</h2>
  <p>لك طلب الاطلاع على بياناتك أو تصحيحها أو تصديرها أو حذفها. ويستطيع مشرف مؤسستك تصدير بياناتها كاملة من داخل المنصة.</p>

  <h2>8. التواصل</h2>
  <p>${contact ? `لأي طلب يتعلّق بالخصوصية: <a href="mailto:${escapeHtml(contact)}">${escapeHtml(contact)}</a>.` : "لأي طلب يتعلّق بالخصوصية تواصل معنا عبر القناة المذكورة في عقد اشتراكك."}</p>
</article>`;
  return page({ title: "سياسة الخصوصية — نهج", description: "كيف تجمع منصة نهج البيانات وتستخدمها وتحميها.", path: "/privacy", body: withToc(body), style: DOC_STYLE });
}
