import { Router, Request, Response } from "express";
import { DEFAULT_CURRENCY, formatMoney, listPlans, type Plan, type PlanFeatures } from "./billing.ts";
import { contactEmail, renderLandingPage, renderPrivacyPage, renderTermsPage } from "./marketingPages.ts";
import { authCookieNames } from "./auth.ts";
import { listSectors } from "./packs/index.ts";
import { createLead, LeadError } from "./leads.ts";

/*
 * الصفحة العامة — ما يراه من لم يشترِ بعد.
 *
 * كان كل شيء خلف تسجيل الدخول: لا صفحة تُرسل لعميل محتمل، ولا سعرٌ يُقرأ بلا
 * حساب. فيُرسل المالك صورةً من جدول أسعارٍ في ملف، ويُنسى تحديثها فيُقتبس سعرٌ
 * قديم في اجتماع.
 *
 * وهذه الصفحة تُبنى من الباقات المخزَّنة نفسها: تغييرُ السعر في لوحة المالك
 * يُغيّره هنا في اللحظة نفسها. وثلاثة قيود تحكمها:
 *
 *   ١. **العلني وحده.** الباقات الخاصة والمؤرشفة لا تخرج، ولا رقمٌ واحد عن
 *      المؤسسة المشتركة ولا عن المسوّقين ولا عن الإيراد. الصفحة بلا جلسة،
 *      فكل ما تُعيده عامّ بطبيعته.
 *
 *   ٢. **ما ليس مبنياً يُقال إنه ليس مبنياً.** ميزةُ الباقة تُعرض بحالتها
 *      الحقيقية: مبنيّة، أو محاكاة معلنة، أو في خارطة الطريق. ومن يكتشف بعد
 *      الشراء أن «التكامل» لم يكن مبنياً لا يجدّد — والبيع الذي يُنقض في أول
 *      تجديد أغلى من بيعٍ لم يقع.
 *
 *   ٣. **كل نصٍّ يُهرَّب.** أسماء الباقات وأوصافها يكتبها المالك في لوحته،
 *      وتُعرض هنا لزائرٍ بلا حساب. ونصٌّ يُحقن من حقلٍ إداري في صفحة عامة هو
 *      ثغرة XSS مكتملة الأركان.
 */

/* ------------------------------------------------------------ الهروب */

const ENTITIES: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};

/** يُهرِّب كل ما يُكتب في الصفحة. لا استثناء ولو بدا النصّ آمناً. */
export const escapeHtml = (value: unknown): string =>
  String(value ?? "").replace(/[&<>"']/g, character => ENTITIES[character]);

/* -------------------------------------------------- حالة بناء الميزات */

export type BuildState = "built" | "simulated" | "planned";

export interface FeatureView {
  key: keyof PlanFeatures;
  label: string;
  state: BuildState;
  note: string;
}

/**
 * ما هو مبنيٌّ فعلاً من ميزات الباقات.
 *
 * موضعٌ واحد للحقيقة: تُقرأ منه صفحة البيع، ويُقرأ منه الفحص. فلا يُعلَن في
 * صفحةٍ ما يخالف ما في الشيفرة.
 */
export const FEATURE_BUILD_STATE: Record<keyof PlanFeatures, { label: string; state: BuildState; note: string }> = {
  teachMode: { label: "وضع التعليم", state: "built", note: "يُركّب المهارة ممّا يفعله موظفوكم فعلاً." },
  shadowEngine: { label: "محرّك الظل", state: "built", note: "يقارن قرار نهج بقرار الموظف قبل أن يُمنح التنفيذ." },
  processIntelligence: { label: "ذكاء العمليات", state: "built", note: "قياسٌ مشتقّ من عملكم، ولا رقم بلا أساس." },
  customPolicies: { label: "سياسات مخصّصة", state: "built", note: "لوائحكم تحكم المحرّك، لا ثوابت مكتوبة." },
  prioritySupport: { label: "دعم بأولوية", state: "built", note: "التزامٌ تعاقدي لا ميزة برمجية." },
  dedicatedSuccessManager: { label: "مدير نجاح مخصّص", state: "built", note: "التزامٌ تعاقدي لا ميزة برمجية." },
  mcp: { label: "بروتوكول MCP", state: "built", note: "نهج خادم MCP: يستقبل JSON-RPC ويُنفّذ أدواته." },
  externalConnectors: { label: "موصلات الأنظمة الخارجية", state: "simulated", note: "معروضة في المنتج كمحاكاة معلنة. أول وصلة حقيقية تُبنى مع أول عميل." },
  apiAccess: { label: "واجهة برمجية", state: "planned", note: "مسارات المنتج قائمة خلف جلسة؛ مفاتيح التطبيقات لم تُبنَ بعد." },
  sso: { label: "دخول موحّد (SSO)", state: "planned", note: "الحسابات اليوم بكلمة مرور وجلسات مُجزَّأة." },
  whiteLabel: { label: "علامة المؤسسة", state: "planned", note: "الهوية اليوم هوية نهج." },
  onPremise: { label: "نشر داخل المؤسسة", state: "built", note: "نشرٌ مستقلّ بقاعدة بياناتكم على خوادمكم." },
};

const STATE_LABEL: Record<BuildState, string> = {
  built: "مبنيّ",
  simulated: "محاكاة معلنة",
  planned: "خارطة الطريق",
};

export function featuresOf(plan: Plan): FeatureView[] {
  return (Object.keys(FEATURE_BUILD_STATE) as Array<keyof PlanFeatures>)
    .filter(key => plan.features?.[key])
    .map(key => ({ key, ...FEATURE_BUILD_STATE[key] }));
}

/* ------------------------------------------------------------ البيانات */

export interface PublicPlanView {
  code: string;
  name: string;
  tagline: string;
  currency: string;
  monthly: string;
  quarterly: string;
  annual: string;
  setupFee: string;
  limits: { seats: string; skills: string; workItems: string; autonomy: string };
  features: FeatureView[];
}

export const CUSTOM_PRICE = "سعرٌ مخصّص";

function priceLabel(amount: number, currency: string): string {
  return amount > 0 ? formatMoney(amount, currency) : CUSTOM_PRICE;
}

/** الباقات العلنية وحدها — والخاصة والمؤرشفة لا تخرج من هنا أبداً. */
export function publicPlans(): PublicPlanView[] {
  return listPlans(false)
    .filter(plan => plan.isPublic && !plan.archived)
    .map(plan => ({
      code: plan.code,
      name: plan.nameAr || plan.nameEn,
      tagline: plan.taglineAr || plan.taglineEn || "",
      currency: plan.currency || DEFAULT_CURRENCY,
      /* سعرٌ صفريّ يعني باقةً تُسعَّر بالعقد، لا باقةً مجانية — و«KWD 0.000 شهرياً»
       * على صفحة بيع تقول للزائر العكس تماماً. */
      monthly: priceLabel(plan.priceMonthly, plan.currency),
      quarterly: priceLabel(plan.priceQuarterly, plan.currency),
      annual: priceLabel(plan.priceAnnual, plan.currency),
      setupFee: plan.setupFee > 0 ? formatMoney(plan.setupFee, plan.currency) : "",
      limits: {
        seats: plan.limits.seats === null ? "بلا حدّ" : String(plan.limits.seats),
        skills: plan.limits.skills === null ? "بلا حدّ" : String(plan.limits.skills),
        workItems: plan.limits.workItemsPerMonth === null ? "بلا حدّ" : plan.limits.workItemsPerMonth.toLocaleString("en-US"),
        autonomy: `L${plan.limits.maxAutonomyLevel}`,
      },
      features: featuresOf(plan),
    }));
}

/* -------------------------------------------------------------- الصفحة */

const STYLE = `
  :root { --ink:#10251f; --muted:#6b7f79; --line:#e3ebe8; --moss:#2f6b57; --amber:#8a6a1f; --bg:#f7faf9; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font-family:system-ui,"Segoe UI",Tahoma,sans-serif; line-height:1.8; }
  .wrap { max-width:1100px; margin:0 auto; padding:48px 20px 80px; }
  header h1 { font-size:34px; margin:0 0 8px; letter-spacing:-.5px; }
  header p { color:var(--muted); margin:0; max-width:680px; font-size:16px; }
  .cycle { display:flex; gap:8px; margin:28px 0 20px; flex-wrap:wrap; }
  .cycle button { border:1px solid var(--line); background:#fff; color:var(--ink); border-radius:999px;
    padding:8px 18px; font:inherit; font-size:14px; cursor:pointer; }
  .cycle button[aria-pressed="true"] { background:var(--ink); color:#fff; border-color:var(--ink); }
  .plans { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px; }
  .plan { background:#fff; border:1px solid var(--line); border-radius:22px; padding:22px; }
  .plan h2 { margin:0 0 4px; font-size:20px; }
  .plan .tag { color:var(--muted); font-size:14px; min-height:22px; }
  .cta { display:flex; flex-wrap:wrap; gap:12px; justify-content:center; margin:32px 0 8px; }
  .cta a { padding:12px 20px; border-radius:999px; border:1px solid var(--line); background:#fff; color:var(--ink); text-decoration:none; font-weight:700; }
  .cta a.primary { background:var(--ink); color:#fff; border-color:var(--ink); }
  .price { font-size:30px; font-weight:800; margin:14px 0 2px; letter-spacing:-1px; }
  .per { color:var(--muted); font-size:13px; }
  .setup { color:var(--muted); font-size:13px; margin-top:6px; }
  .limits { list-style:none; padding:0; margin:16px 0; border-top:1px solid var(--line); }
  .limits li { display:flex; justify-content:space-between; padding:7px 0; border-bottom:1px solid var(--line); font-size:14px; }
  .limits b { font-variant-numeric:tabular-nums; }
  .feat { list-style:none; padding:0; margin:0; }
  .feat li { padding:6px 0; font-size:14px; display:flex; gap:8px; align-items:flex-start; }
  .dot { width:8px; height:8px; border-radius:50%; margin-top:8px; flex:none; background:var(--moss); }
  .dot.simulated, .dot.planned { background:var(--amber); }
  .state { font-size:12px; color:var(--amber); }
  .honest { margin-top:36px; background:#fff; border:1px solid var(--line); border-radius:22px; padding:22px; }
  .honest h3 { margin:0 0 10px; font-size:18px; }
  .honest li { font-size:14px; margin-bottom:6px; }
  footer { margin-top:32px; color:var(--muted); font-size:13px; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0e1614; --ink:#eaf2ef; --line:#22332e; --muted:#9bb0aa; }
    .plan, .honest { background:#121d1a; }
    .cycle button { background:#121d1a; color:var(--ink); }
  }
`;

/**
 * يرسم صفحة الأسعار.
 *
 * صفحةٌ واحدة مكتفية بذاتها: لا إطار عمل ولا طلب شبكة بعد التحميل. تُفتح على
 * أي جهاز وتُرسل رابطاً في محادثة، وتبقى صحيحة لأنها تُبنى من الباقات نفسها
 * التي يُفوتر بها.
 */
export function renderPricingPage(): string {
  const plans = publicPlans();
  const contact = contactEmail();
  const cards = plans.map(plan => `
    <article class="plan">
      <h2>${escapeHtml(plan.name)}</h2>
      <div class="tag">${escapeHtml(plan.tagline)}</div>
      <div class="price" data-monthly="${escapeHtml(plan.monthly)}" data-quarterly="${escapeHtml(plan.quarterly)}" data-annual="${escapeHtml(plan.annual)}">${escapeHtml(plan.monthly)}</div>
      <div class="per" data-per${plan.monthly === CUSTOM_PRICE ? ' hidden' : ""}>شهرياً</div>
      ${plan.setupFee ? `<div class="setup">رسوم تأسيس مرة واحدة: ${escapeHtml(plan.setupFee)}</div>` : ""}
      <ul class="limits">
        <li><span>المقاعد</span><b>${escapeHtml(plan.limits.seats)}</b></li>
        <li><span>المهارات</span><b>${escapeHtml(plan.limits.skills)}</b></li>
        <li><span>حالات العمل شهرياً</span><b>${escapeHtml(plan.limits.workItems)}</b></li>
        <li><span>سقف الاستقلالية</span><b>${escapeHtml(plan.limits.autonomy)}</b></li>
      </ul>
      <ul class="feat">
        ${plan.features.map(feature => `
          <li>
            <span class="dot ${escapeHtml(feature.state)}"></span>
            <span>${escapeHtml(feature.label)}${feature.state === "built" ? "" : ` <span class="state">— ${escapeHtml(STATE_LABEL[feature.state])}</span>`}</span>
          </li>`).join("")}
      </ul>
    </article>`).join("");

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>نهج — الباقات والأسعار</title>
<meta name="description" content="باقات نهج وأسعارها، وما هو مبنيٌّ منها وما هو في خارطة الطريق.">
<link rel="icon" href="data:,">
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>نهج — الباقات</h1>
    <p>عقلٌ تشغيلي يتعلّم من موظفيكم وهم يعملون، ولا ينفّذ إجراءً إلا بصلاحيةٍ استحقّها في التدرّب. الأسعار أدناه هي التي يُفوتَر بها فعلاً.</p>
  </header>

  ${plans.length ? `
  <div class="cycle" role="group" aria-label="دورة الفوترة">
    <button type="button" data-cycle="monthly" aria-pressed="true">شهري</button>
    <button type="button" data-cycle="quarterly" aria-pressed="false">ربع سنوي</button>
    <button type="button" data-cycle="annual" aria-pressed="false">سنوي</button>
  </div>
  <div class="plans">${cards}</div>` : `
  <div class="honest"><p>لا باقات علنية منشورة بعد. تواصل معنا لنعرض عليك عرضاً مفصّلاً.</p></div>`}

  <!--
    القسم الذي يمنع النقض بعد الشراء.
    من يكتشف بعد التوقيع أن «التكامل» لم يكن مبنياً لا يجدّد.
  -->
  <section class="honest">
    <h3>ما هو مبنيٌّ اليوم، وما ليس بعد</h3>
    <ul>
      <li><strong>مبنيّ:</strong> التعلّم من العمل، والحوكمة والموافقات وسقوف الاستقلالية، وسجلّ تدقيق لا يُعدَّل، والقياس المشتقّ، والاشتراك والفوترة والتحصيل الإلكتروني، والتصدير والنسخ الاحتياطي.</li>
      <li><strong>محاكاة معلنة:</strong> موصلات الأنظمة الخارجية — تظهر داخل المنتج بوسم «محاكاة»، ولا تُخرج طلباً إلى أي نظام. أول وصلة حقيقية تُبنى مع أول عميل وبقراره.</li>
      <li><strong>خارطة الطريق:</strong> الواجهة البرمجية للتطبيقات، والدخول الموحّد، وعلامة المؤسسة.</li>
    </ul>
    <p style="color:var(--muted);font-size:14px;margin:8px 0 0">نكتب هذا قبل البيع لا بعده: البيع الذي يُنقض في أول تجديد أغلى من بيعٍ لم يقع.</p>
  </section>

  <section class="cta">
    <a class="primary" href="/#contact">اطلب عرضاً توضيحياً</a>
    ${contact ? `<a href="mailto:${escapeHtml(contact)}?subject=${encodeURIComponent("طلب عرض — نهج")}">تواصل معنا: ${escapeHtml(contact)}</a>` : ""}
  </section>

  <footer><a href="/">الرئيسية</a> · <a href="/terms">شروط الاستخدام</a> · <a href="/privacy">سياسة الخصوصية</a><br>الأسعار بالدينار الكويتي وتشمل ما هو مذكور أعلاه. ${contact ? `للتعاقد أو لعرضٍ مخصّص راسلنا على ${escapeHtml(contact)}.` : "للتعاقد أو لعرضٍ مخصّص تواصل معنا."}</footer>
</div>
<script>
  /* تبديل الدورة يقرأ الأسعار المرسومة في الصفحة — لا طلب شبكة بعد التحميل. */
  var labels = { monthly: "شهرياً", quarterly: "كل ثلاثة أشهر", annual: "سنوياً" };
  document.querySelectorAll('[data-cycle]').forEach(function (button) {
    button.addEventListener('click', function () {
      var cycle = button.getAttribute('data-cycle');
      document.querySelectorAll('[data-cycle]').forEach(function (other) {
        other.setAttribute('aria-pressed', String(other === button));
      });
      document.querySelectorAll('.price').forEach(function (price) {
        price.textContent = price.getAttribute('data-' + cycle) || price.textContent;
        var per = price.parentNode.querySelector('[data-per]');
        if (per) { per.textContent = labels[cycle]; per.hidden = price.textContent === ${JSON.stringify(CUSTOM_PRICE)}; }
      });
    });
  });
</script>
</body>
</html>`;
}

/* ------------------------------------------------------------ المسارات */

export const publicRouter = Router();

/*
 * بلا جلسة عمداً — وهو ما يجعل حدّها صارماً: لا شيء هنا يقرأ بيانات مؤسسة.
 */
publicRouter.get("/pricing", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  /* لا فهرسة للصفحة افتراضياً: نشرُ الأسعار قرار مالكٍ لا أثرُ نشرٍ عابر. */
  res.setHeader("X-Robots-Tag", "noindex");
  res.setHeader("Cache-Control", "public, max-age=120");
  res.send(renderPricingPage());
});

/* القطاعات المتاحة للعرض — لشاشة الدخول قبل أي جلسة. عامّةٌ بطبيعتها. */
publicRouter.get("/api/public/sectors", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json({
    sectors: listSectors().map(sector => ({
      code: sector.code, nameAr: sector.nameAr, nameEn: sector.nameEn, logo: sector.logo, descriptionAr: sector.descriptionAr,
    })),
  });
});

/*
 * طلب عرض من الصفحة العامة. بلا جلسة بطبيعته، فيُحدّ لكل عنوان: خمسة طلبات في
 * الساعة تكفي إنساناً أخطأ وأعاد، ولا تكفي من يملأ القاعدة.
 */
const LEAD_WINDOW_MS = 60 * 60_000;
const LEAD_MAX_PER_WINDOW = 5;
const leadHits = new Map<string, { count: number; resetAt: number }>();

publicRouter.post("/api/public/leads", (req: Request, res: Response) => {
  if (!marketingEnabled()) return void res.status(404).json({ error: "غير متاح." });
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const nowMs = Date.now();
  const hit = leadHits.get(ip);
  if (hit && hit.resetAt > nowMs && hit.count >= LEAD_MAX_PER_WINDOW) {
    return void res.status(429).json({ error: "وصلنا طلبك. إن احتجت شيئاً آخر حاول بعد قليل." });
  }
  if (!hit || hit.resetAt <= nowMs) leadHits.set(ip, { count: 1, resetAt: nowMs + LEAD_WINDOW_MS });
  else hit.count += 1;
  if (leadHits.size > 10_000) for (const [key, value] of leadHits) if (value.resetAt <= nowMs) leadHits.delete(key);

  try {
    createLead(req.body || {});
    res.status(201).json({ ok: true });
  } catch (error) {
    if (error instanceof LeadError) return void res.status(error.status).json({ error: error.message });
    throw error;
  }
});

publicRouter.get("/api/public/pricing", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "public, max-age=120");
  res.json({ plans: publicPlans(), featureStates: FEATURE_BUILD_STATE });
});

/*
 * robots.txt — كان يقع على مسار الواجهة فيُعاد HTML التطبيق بدله. الأسطح
 * التشغيلية والواجهة البرمجية خلف دخول ولا معنى لزحفها.
 */
/*
 * الموقع التسويقي — مفعّلٌ في نشر المالك، ومطفأٌ في نشر كل عميل.
 *
 * كل مؤسسةٍ مشترية على خادمها. وموظفوها حين يفتحون عنوانها يريدون الدخول إلى
 * عملهم، لا صفحةً تبيعهم نهج وتدعوهم إلى «اطلب عرضاً». فـ NAHJ_MARKETING=off
 * يجعل الجذر هو التطبيق، ويغلق نموذج الطلبات، ويمنع الفهرسة.
 */
export const marketingEnabled = () => (process.env.NAHJ_MARKETING || "").trim().toLowerCase() !== "off";

publicRouter.get("/api/public/site", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json({ marketing: marketingEnabled() });
});

publicRouter.get("/robots.txt", (_req: Request, res: Response) => {
  if (!marketingEnabled()) return void res.type("text/plain").send("User-agent: *\nDisallow: /\n");
  const base = (process.env.NAHJ_PUBLIC_URL || "").replace(/\/+$/, "");
  res.type("text/plain").send(
    "User-agent: *\nDisallow: /api/\nDisallow: /app\nDisallow: /try/\nAllow: /\n" + (base ? `Sitemap: ${base}/sitemap.xml\n` : ""),
  );
});

publicRouter.get("/sitemap.xml", (_req: Request, res: Response) => {
  if (!marketingEnabled()) return void res.status(404).type("text/plain").send("");
  const base = (process.env.NAHJ_PUBLIC_URL || "").replace(/\/+$/, "");
  if (!base) return void res.status(404).type("text/plain").send("NAHJ_PUBLIC_URL غير مضبوط.");
  const urls = ["/", "/pricing", "/terms", "/privacy"]
    .map(path => `<url><loc>${escapeHtml(base + path)}</loc></url>`).join("");
  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
});

/*
 * الصفحة الرئيسية: الهبوط لمن لا جلسة له، والتطبيق لمن له جلسة أو عرض.
 *
 * من سجّل دخوله أمس ويفتح الرابط الرئيسي اليوم يريد عمله لا إعلاناً. فالكوكي
 * وحده يُقرأ هنا — لا تُفحص صلاحيته: جلسةٌ منتهية تصل إلى التطبيق فيطلب الدخول.
 */
function hasAppCookie(req: Request): boolean {
  const cookies = String(req.headers.cookie || "");
  return cookies.split(";").some(part => {
    const name = part.trim().split("=")[0];
    return name === authCookieNames.session || name === "nahj_demo";
  });
}

const sendHtml = (res: Response, html: string, cache = "public, max-age=300") => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", cache);
  res.send(html);
};

publicRouter.get("/", (req: Request, res: Response, next) => {
  if (hasAppCookie(req) || !marketingEnabled()) return next();
  /* الكوكي يغيّر الجواب: لا يُخزَّن ما يُعاد لزائرٍ ليُعاد لمستخدمٍ مسجّل. */
  res.setHeader("Vary", "Cookie");
  sendHtml(res, renderLandingPage(), "private, max-age=0");
});
publicRouter.get("/terms", (_req: Request, res: Response) => sendHtml(res, renderTermsPage()));
publicRouter.get("/privacy", (_req: Request, res: Response) => sendHtml(res, renderPrivacyPage()));
