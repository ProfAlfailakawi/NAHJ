import { listSectors, getSectorPack, EDUCATION_CODE } from "./packs/index.ts";
import { escapeHtml, publicPlans, CUSTOM_PRICE } from "./publicPages.ts";

/*
 * الصفحات التسويقية: الهبوط، والشروط، والخصوصية.
 *
 * كان الرابط الرئيسي يفتح نموذج دخولٍ مباشرة. فمن يصله رابط نهج في رسالة يرى
 * «البريد الإلكتروني / كلمة المرور» ولا يعرف ما المنتج، ولا لأي قطاع هو،
 * ولا أن بوسعه تجربته بلا حساب. والصفحة هنا تقول ذلك في الشاشة الأولى، وتُدخل
 * كل زائرٍ إلى العرض على قطاعه هو — لا على مدرسةٍ ليست قطاعه.
 *
 * صفحاتٌ مكتفية بذاتها: لا إطار عمل، لا طلب شبكة بعد التحميل، وكل نصٍّ متغيّر
 * يُهرَّب.
 */

/** بريد التواصل التجاري إن ضُبط. */
export function contactEmail(): string {
  const value = (process.env.NAHJ_CONTACT_EMAIL || "").trim();
  return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(value) ? value : "";
}

/** الاسم القانوني لمشغّل المنصة كما يُكتب في الشروط والخصوصية. */
function legalName(): string {
  return (process.env.NAHJ_LEGAL_NAME || "").trim() || "مشغّل منصة نهج";
}

/* ------------------------------------------------------------ الإطار */

const BASE_STYLE = `
  :root { --ink:#10251f; --muted:#5d716b; --line:#e2e8e4; --moss:#2f7d65; --moss-soft:#e7f1ec; --amber:#b9852f; --bg:#f4f1e8; --card:#fffdf7; }
  @media (prefers-color-scheme: dark) {
    :root { --ink:#eef3f0; --muted:#a4b3ad; --line:#2a3833; --moss:#6fc3a3; --moss-soft:#17302a; --amber:#e0b36a; --bg:#0f1714; --card:#16211d; }
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
  .btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; padding:14px 22px; border-radius:14px; font-weight:800; text-decoration:none; border:1px solid var(--line); background:var(--card); color:var(--ink); font-size:16px; }
  .btn.primary { background:var(--ink); color:var(--bg); border-color:var(--ink); }
  .btn:focus-visible, .top nav a:focus-visible, .sector a:focus-visible { outline:3px solid var(--moss); outline-offset:2px; }
  footer { border-top:1px solid var(--line); margin-top:72px; padding:32px 0 48px; color:var(--muted); font-size:15px; }
  footer .wrap { display:flex; flex-wrap:wrap; gap:14px 26px; align-items:center; }
  footer nav { display:flex; flex-wrap:wrap; gap:18px; }
  footer a { text-decoration:none; font-weight:700; }
  footer a:hover { color:var(--ink); }
  @media (max-width:720px) {
    body { font-size:16px; }
    .top nav a:not(.cta):not(.keep) { display:none; }
  }
`;

const MARK = `<svg viewBox="0 0 72 72" fill="none" aria-hidden="true"><rect x="2" y="2" width="68" height="68" rx="23" fill="var(--card)" stroke="var(--line)"/><path d="M18 18v12c0 7.2 5.8 13 13 13h9c7.8 0 14 6.2 14 14v3" stroke="var(--ink)" stroke-width="4.6" stroke-linecap="round"/><path d="M18 18h10M44 16h10v10" stroke="var(--moss)" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="18" cy="18" r="5" fill="#e0a04b"/><circle cx="54" cy="60" r="5" fill="#5e79e6"/><circle cx="38" cy="43" r="4.8" fill="var(--moss)"/></svg>`;

function page(options: { title: string; description: string; path: string; body: string; style?: string; index?: boolean }): string {
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
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
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
    <a class="cta" href="/#sectors">جرّب مجاناً</a>
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

const LANDING_STYLE = `
  .hero { padding:72px 0 40px; }
  .hero .eyebrow { display:inline-block; font-size:14px; font-weight:800; color:var(--moss); background:var(--moss-soft); padding:6px 12px; border-radius:999px; }
  .hero h1 { font-size:clamp(34px, 6vw, 58px); line-height:1.25; margin:18px 0 16px; font-weight:900; letter-spacing:-.5px; max-width:900px; }
  .hero p.lead { font-size:clamp(18px, 2.4vw, 21px); color:var(--muted); max-width:720px; margin:0 0 28px; }
  .hero .actions { display:flex; flex-wrap:wrap; gap:12px; }
  .hero .note { margin-top:14px; font-size:14px; color:var(--muted); }
  section { padding:44px 0; }
  h2 { font-size:clamp(26px, 4vw, 36px); margin:0 0 10px; font-weight:900; }
  .sub { color:var(--muted); margin:0 0 28px; max-width:720px; }
  .sectors { display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:16px; }
  .sector { display:flex; flex-direction:column; gap:10px; background:var(--card); border:1px solid var(--line); border-radius:20px; padding:22px; }
  .sector .head { display:flex; align-items:center; gap:12px; }
  .sector .logo { font-size:34px; line-height:1; }
  .sector h3 { margin:0; font-size:20px; font-weight:900; }
  .sector .org { font-size:14px; color:var(--muted); }
  .sector p { margin:0; color:var(--muted); font-size:15.5px; }
  .sector ul { margin:0; padding:0; list-style:none; display:flex; flex-wrap:wrap; gap:6px; }
  .sector li { font-size:13.5px; font-weight:700; background:var(--moss-soft); color:var(--moss); padding:4px 10px; border-radius:999px; }
  .sector a { margin-top:auto; }
  .steps { display:grid; grid-template-columns:repeat(auto-fit, minmax(230px, 1fr)); gap:16px; counter-reset:step; }
  .step { background:var(--card); border:1px solid var(--line); border-radius:20px; padding:22px; }
  .step b { display:grid; place-items:center; width:40px; height:40px; border-radius:12px; background:var(--ink); color:var(--bg); font-size:18px; margin-bottom:12px; }
  .step h3 { margin:0 0 6px; font-size:19px; }
  .step p { margin:0; color:var(--muted); font-size:15.5px; }
  .levels { display:flex; flex-wrap:wrap; gap:8px; margin-top:18px; }
  .levels span { font-size:14px; padding:6px 12px; border-radius:10px; border:1px solid var(--line); background:var(--card); }
  .levels span b { color:var(--moss); margin-inline-end:6px; }
  .trust { display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:14px; }
  .trust div { border-inline-start:3px solid var(--moss); padding:4px 14px; }
  .trust h3 { margin:0 0 4px; font-size:18px; }
  .trust p { margin:0; color:var(--muted); font-size:15.5px; }
  .honest { background:var(--card); border:1px solid var(--line); border-radius:20px; padding:24px; }
  .honest ul { margin:10px 0 0; padding-inline-start:20px; }
  .honest li { margin-bottom:8px; }
  .faq details { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:16px 20px; margin-bottom:10px; }
  .faq summary { font-weight:800; cursor:pointer; font-size:17px; }
  .faq p { margin:10px 0 0; color:var(--muted); }
  .final { text-align:center; background:var(--ink); color:var(--bg); border-radius:28px; padding:48px 24px; margin-top:24px; }
  .final h2 { color:var(--bg); }
  .final p { opacity:.8; margin:0 auto 24px; max-width:620px; }
  .final .btn { background:var(--bg); color:var(--ink); border-color:var(--bg); }
`;

export function renderLandingPage(): string {
  const sectors = listSectors();
  const plans = publicPlans();
  const priced = plans.filter(plan => plan.monthly !== CUSTOM_PRICE);
  const from = priced[0]?.monthly;

  const sectorCards = sectors.map(sector => {
    const examples = sector.code === EDUCATION_CODE
      ? EDUCATION_EXAMPLES
      : (getSectorPack(sector.code)?.skills || []).slice(0, 3).map(skill => skill.name);
    return `
    <article class="sector">
      <div class="head"><span class="logo" aria-hidden="true">${escapeHtml(sector.logo)}</span>
        <div><h3>${escapeHtml(sector.nameAr)}</h3><div class="org">مثال: ${escapeHtml(sector.organizationName)}</div></div></div>
      <p>${escapeHtml(sector.descriptionAr)}</p>
      <ul aria-label="أمثلة على ما يتولّاه">${examples.map(example => `<li>${escapeHtml(example)}</li>`).join("")}</ul>
      <a class="btn primary" href="/try/${encodeURIComponent(sector.code)}" aria-label="ادخل عرض ${escapeHtml(sector.nameAr)}">ادخل العرض ←</a>
    </article>`;
  }).join("");

  const body = `
<div class="wrap">
  <section class="hero">
    <span class="eyebrow">لكل مؤسسة — عيادة، مكتب، متجر، شركة، مدرسة</span>
    <h1>موظفوك يعرفون كيف يُنجَز العمل.<br>نهج يتعلّمه منهم، ثم يُنجزه معهم.</h1>
    <p class="lead">نهج نظامٌ عربيّ يراقب كيف يعمل فريقك، ويحوّل خبرته إلى إجراءاتٍ مكتوبة، ثم يتدرّب عليها حتى يُثبت أنه يُتقنها — ولا ينفّذ إلا ما أذنتَ له به، ويطلب موافقتك في كل قرارٍ حسّاس.</p>
    <div class="actions">
      <a class="btn primary" href="#sectors">اختر قطاعك وجرّب الآن</a>
      <a class="btn" href="/pricing">الباقات والأسعار</a>
    </div>
    <div class="note">التجربة مجانية وبلا حساب، في بيئةٍ معزولة ببيانات تجريبية${from ? ` · الباقات تبدأ من ${escapeHtml(from)} شهرياً` : ""}</div>
  </section>

  <section id="sectors" aria-labelledby="sectors-title">
    <h2 id="sectors-title">اختر قطاعك — وجرّبه كما لو كان مؤسستك</h2>
    <p class="sub">كل قطاع له مهاراته وسياساته ومن يعتمد قراراته. اضغط على قطاعك فتدخل مؤسسةً نموذجية منه تعمل أمامك: حالات جارية، وموافقات تنتظرك، ومحادثة مع عميلها.</p>
    <div class="sectors">${sectorCards}</div>
  </section>

  <section id="how" aria-labelledby="how-title">
    <h2 id="how-title">كيف يعمل — في أربع خطوات</h2>
    <p class="sub">لا يُمنح نهج الثقة؛ يكسبها خطوةً بخطوة، وتبقى أنت صاحب القرار في كل مرحلة.</p>
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
      <div><h3>أنت من يعتمد</h3><p>كل قرارٍ حسّاس يصل إلى الشخص الذي تحدّده لائحتك، ولا يُنفَّذ قبل موافقته.</p></div>
      <div><h3>سجلٌّ لا يُعدَّل</h3><p>كل إجراء له أثرٌ مكتوب يُراجَع في أي وقت — للتدقيق والالتزام.</p></div>
      <div><h3>عربيّ أولاً</h3><p>مبنيّ للعربية ولهجات المنطقة من أول يوم، لا مترجماً عن منتجٍ أجنبي.</p></div>
      <div><h3>بياناتك لك</h3><p>تصدّر كل بياناتك متى شئت، ونسخٌ احتياطية دورية.</p></div>
    </div>
  </section>

  <section aria-labelledby="honest-title">
    <div class="honest">
      <h2 id="honest-title">ما هو جاهز اليوم، وما ليس بعد</h2>
      <ul>
        <li><strong>جاهز:</strong> التعلّم من العمل، والتدرّب والظل، والموافقات ودرجات الصلاحية، وسجلّ التدقيق، ولوحة الأثر، والاشتراك والفوترة، والتصدير.</li>
        <li><strong>محاكاة معلنة:</strong> الربط بأنظمتكم القائمة (أنظمة المواعيد، والطلبات، والملفات) يظهر في المنتج بوسم «محاكاة». أول ربطٍ حقيقي يُبنى مع أول عميلٍ في قطاعه وبقراره.</li>
        <li><strong>قريباً:</strong> قناة واتساب الحقيقية، والدخول الموحّد، والواجهة البرمجية.</li>
      </ul>
    </div>
  </section>

  <section class="faq" aria-labelledby="faq-title">
    <h2 id="faq-title">أسئلة شائعة</h2>
    <details><summary>هل يناسب مؤسستي إن لم تكن مدرسة؟</summary><p>نعم. نهج عامّ في قلبه: يتعلّم أيّ عملٍ متكرّر له خطوات وقرارات. والقطاعات أعلاه نقاط بداية جاهزة، ويمكن أن يتعلّم نهج عمل أي قطاعٍ آخر من موظفيه مباشرة.</p></details>
    <details><summary>هل يحتاج فريقي إلى خبرة تقنية؟</summary><p>لا. من يعرف كيف يُنجز عمله يستطيع أن يعلّمه لنهج بكلامه، والشاشات بالعربية وواضحة.</p></details>
    <details><summary>هل سيستبدل موظفيّ؟</summary><p>لا. يتولّى المتكرّر ويترك للموظف ما يحتاج حكماً بشرياً، ولا يتّخذ قراراً حسّاساً بلا موافقة إنسان.</p></details>
    <details><summary>ماذا لو أخطأ؟</summary><p>لا يعمل وحده إلا فيما أثبت دقّته فيه بالاختبار والظل، ويمكن إيقافه فوراً بزرّ واحد، وكل ما فعله مسجَّل.</p></details>
    <details><summary>هل تجربة العرض تمسّ بيانات حقيقية؟</summary><p>لا. العرض بيئةٌ معزولة ببيانات تجريبية تُمحى خلال ساعة من آخر استخدام، ولا تُكتب في أي قاعدة بيانات.</p></details>
  </section>

  <section class="final">
    <h2>شاهده يعمل على قطاعك — في دقيقة</h2>
    <p>بلا حساب ولا بطاقة. اختر قطاعك، واعتمد أول طلب، وحادث عميلاً نموذجياً.</p>
    <a class="btn" href="#sectors">اختر قطاعك</a>
  </section>
</div>`;

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
  article.doc { max-width:780px; margin:0 auto; padding:48px 20px 0; }
  article.doc h1 { font-size:34px; margin:0 0 6px; }
  article.doc .updated { color:var(--muted); font-size:14px; margin:0 0 28px; }
  article.doc h2 { font-size:21px; margin:30px 0 8px; }
  article.doc p, article.doc li { color:var(--ink); }
  article.doc ul { padding-inline-start:22px; }
  article.doc .box { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:16px 20px; margin:18px 0; }
`;

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
  return page({ title: "شروط الاستخدام — نهج", description: "شروط استخدام منصة نهج.", path: "/terms", body, style: DOC_STYLE });
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
  <p>نستخدم كوكيز ضرورية فقط: كوكي الجلسة لإبقائك مسجّلاً، وكوكي الحماية من تزوير الطلبات، وكوكي بيئة العرض التجريبية. لا نستخدم كوكيز تتبّعٍ أو إعلان.</p>

  <h2>5. بيئة العرض التجريبية</h2>
  <p>العرض يعمل ببيانات تجريبية داخل الذاكرة، ولا يُحفظ في قاعدة البيانات، ويُمحى خلال ساعة من آخر استخدام. لا تُدخل فيه بيانات حقيقية.</p>

  <h2>6. مدة الاحتفاظ</h2>
  <p>نحتفظ بالبيانات طوال مدة الاشتراك. وبعد انتهائه تُحذف أو تُسلَّم للمؤسسة عند طلبها، إلا ما يلزم الاحتفاظ به قانوناً كسجلات الفوترة.</p>

  <h2>7. حقوقك</h2>
  <p>لك طلب الاطلاع على بياناتك أو تصحيحها أو تصديرها أو حذفها. ويستطيع مشرف مؤسستك تصدير بياناتها كاملة من داخل المنصة.</p>

  <h2>8. التواصل</h2>
  <p>${contact ? `لأي طلب يتعلّق بالخصوصية: <a href="mailto:${escapeHtml(contact)}">${escapeHtml(contact)}</a>.` : "لأي طلب يتعلّق بالخصوصية تواصل معنا عبر القناة المذكورة في عقد اشتراكك."}</p>
</article>`;
  return page({ title: "سياسة الخصوصية — نهج", description: "كيف تجمع منصة نهج البيانات وتستخدمها وتحميها.", path: "/privacy", body, style: DOC_STYLE });
}
