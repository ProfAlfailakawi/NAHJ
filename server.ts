import express from "express";
import path from "path";
import fs from "fs";
import { apiRouter, authRouter } from "./server/routes.ts";
import { paymentPublicRouter } from "./server/paymentRoutes.ts";
import { publicRouter } from "./server/publicPages.ts";
import { bootstrapFirstAccount, ensureOwnerAccount, purgeExpiredSessions } from "./server/auth.ts";
import { ensureSubscription, startBillingWorker, stopBillingWorker } from "./server/billing.ts";
import { DemoSandbox, DEMO_SESSION_TTL_MS, normalizeDemoSector, persistence } from "./server/db.ts";
import { neonMirror } from "./server/persistence.ts";
import { startBackupWorker, stopBackupWorker } from "./server/archive.ts";
import { startNotifyWorker, stopNotifyWorker } from "./server/notify.ts";
import { randomBytes } from "node:crypto";

/*
 * Express 4 لا يلتقط وعداً مرفوضاً من معالجٍ غير متزامن: يبقى الطلب معلّقاً،
 * وفي Node الحديث يُنهي الرفضُ غير الملتقط العمليةَ كلّها — خطأُ موصلٍ واحد
 * يُسقط الخدمة عن كل المؤسسة. نلفّ كل معالجٍ في الموجّه فيصل خطؤه إلى `next`.
 */
function catchAsyncErrors(router: express.Router): void {
  const wrap = (layer: { handle: Function }) => {
    const handle = layer.handle;
    if (handle.length > 3) return; // معالج أخطاء — يُترك كما هو
    layer.handle = function (req: express.Request, res: express.Response, next: express.NextFunction) {
      try {
        const out = handle.call(this, req, res, next);
        if (out && typeof out.catch === "function") out.catch(next);
        return out;
      } catch (err) {
        next(err);
      }
    };
  };
  for (const layer of (router as unknown as { stack: Array<{ handle: Function; route?: { stack: Array<{ handle: Function }> } }> }).stack) {
    if (layer.route) layer.route.stack.forEach(wrap);
    else if ((layer.handle as unknown as { stack?: unknown }).stack) catchAsyncErrors(layer.handle as unknown as express.Router);
    else wrap(layer);
  }
}

const DEMO_COOKIE = "nahj_demo";
/** Demo is on by default; a deployment that must never show it sets NAHJ_DEMO_ENABLED=false. */
const demoEnabled = () => process.env.NAHJ_DEMO_ENABLED !== "false";

function readDemoCookie(req: express.Request): string {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === DEMO_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function setDemoCookie(res: express.Response, sessionId: string): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    sessionId
      ? `${DEMO_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(DEMO_SESSION_TTL_MS / 1000)}${secure}`
      : `${DEMO_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
  );
}

async function startServer() {
  const app = express();
  /*
   * المنفذ من البيئة، و3000 افتراضًا.
   *
   * لا يتغيّر شيء في النشر القائم: `Dockerfile` يعلن 3000، وCaddy يوجّه إلى
   * `nahj:3000`، ولا يضبط أحدٌ PORT هناك — فيبقى 3000 كما كان حرفيًا.
   *
   * لكنه كان رقمًا مثبّتًا لا يقرأ شيئًا، فمن يضبط PORT ظنًّا أنه فعل شيئًا لا
   * يفعل: يستمع الخادم في موضع ويُنتظر في آخر، ولا خطأ يقول ذلك. والمنصّات التي
   * تحقن المنفذ ولا تتفاوض عليه — Cloud Run مثلًا — لا تعمل معه إطلاقًا.
   */
  const PORT = Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 3000;

  // Do not advertise the server framework (reduces info disclosure / fingerprinting)
  app.disable("x-powered-by");
  /*
   * النشر خلف Caddy على شبكة Docker الخاصة. بدون هذا يرى الخادم عنوان الوكيل
   * لكل زائر، فيصير حدّ محاولات الدخول لكل IP حدّاً واحداً على الجميع، ولا يُعرف
   * أن الطلب وصل مشفّراً. يُوثق بالوكلاء على الشبكات الخاصة وحدها، فلا يزوّر
   * زائرٌ من الإنترنت ترويسة X-Forwarded-For.
   */
  app.set("trust proxy", "loopback, linklocal, uniquelocal");

  // Conservative security response headers. Kept intentionally minimal so they
  // cannot break the SPA or embedding in the AI Studio applet host (no CSP /
  // X-Frame-Options which could interfere with iframe embedding or HMR).
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    /* HSTS على HTTPS وحده (مباشرةً أو خلف وكيلٍ يُعلنه) — لا يُرسل على HTTP المحلي. */
    if (_req.secure) {
      res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    }
    next();
  });

  /*
   * إشعارات بوابة الدفع تُركَّب قبل قارئ JSON.
   *
   * التوقيع محسوبٌ على البايتات كما أرسلها المزوّد، و`express.json` يستهلك
   * الجسم ويُعيد بناءه — فيضيع ما يُتحقق منه. وموضعُها هنا، قبل المصادقة
   * وحارس CSRF وحارس الاشتراك، مقصود: المزوّد لا يملك جلسة، ومؤسسةٌ مجمّدة
   * لعدم السداد يجب أن يصل إشعار سدادها لا أن يُردّ بـ402.
   *
   * وحمايتها توقيعها وحده: بلا توقيعٍ صحيح لا يُقرأ من الإشعار حرف.
   */
  app.use("/api/payments", paymentPublicRouter);

  // Cap JSON body size to mitigate trivial memory-exhaustion payloads
  app.use(express.json({ limit: "1mb" }));

  /*
   * الصفحة العامة — قبل المصادقة وبعد قارئ JSON.
   *
   * لا جلسة لها ولا تقرأ بيانات مؤسسة: باقاتٌ علنية وحدها. وموضعها هنا يجعل
   * رابط الأسعار يُفتح لمن لا حساب له — وهو الغرض منه.
   */
  app.use(publicRouter);

  // Health check endpoints for cloud deployment and probes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", app: "NAHJ - نهج", timestamp: new Date().toISOString() });
  });
  app.get("/healthz", (req, res) => {
    res.status(200).send("ok");
  });
  app.get("/_health", (req, res) => {
    res.status(200).send("ok");
  });

  /**
   * Demo binding. This sits AHEAD of every API route, so a request carrying a
   * demo cookie can only ever reach that visitor's own in-memory sandbox — it
   * cannot fall through to the institution's real store, and it never writes to
   * Firestore. Requests without the cookie bypass this entirely.
   */
  app.use("/api", (req, res, next) => {
    const sessionId = readDemoCookie(req);
    if (!sessionId.startsWith("demo_")) { next(); return; }
    if (!DemoSandbox.run(sessionId, DEMO_SESSION_TTL_MS, next)) {
      // The sandbox aged out. Clear the cookie rather than silently serving real data.
      setDemoCookie(res, "");
      next();
    }
  });

  app.get("/api/demo/config", (req, res) => {
    res.json({
      enabled: demoEnabled(),
      active: DemoSandbox.isDemoRequest(),
      ttlMs: DEMO_SESSION_TTL_MS,
    });
  });

  app.post("/api/demo/enter", (req, res) => {
    if (!demoEnabled()) { res.status(404).json({ error: "البيئة التجريبية غير مفعّلة في هذا النشر" }); return; }
    const sessionId = `demo_${randomBytes(32).toString("hex")}`;
    const sector = normalizeDemoSector(req.body?.sector);
    DemoSandbox.create(sessionId, DEMO_SESSION_TTL_MS, sector);
    setDemoCookie(res, sessionId);
    res.json({ ok: true, demo: true, sector, ttlMs: DEMO_SESSION_TTL_MS });
  });

  /*
   * رابطٌ يُرسل: /try/clinic يفتح العرض على عيادةٍ مباشرةً.
   *
   * هو ما تضعه في رسالة لعميلٍ محتمل من قطاعه، وما تشير إليه بطاقات صفحة
   * الهبوط. ولا يُنشئ إلا صندوقاً معزولاً في الذاكرة؛ رمزٌ مجهول يعود إلى التعليم.
   */
  app.get("/try/:sector?", (req, res) => {
    if (!demoEnabled()) { res.redirect(302, "/"); return; }
    const sessionId = `demo_${randomBytes(32).toString("hex")}`;
    DemoSandbox.create(sessionId, DEMO_SESSION_TTL_MS, normalizeDemoSector(req.params.sector));
    setDemoCookie(res, sessionId);
    res.redirect(302, "/app");
  });

  app.post("/api/demo/reset", (req, res) => {
    const sessionId = readDemoCookie(req);
    if (!DemoSandbox.reset(sessionId, DEMO_SESSION_TTL_MS)) {
      res.status(410).json({ error: "انتهت الجلسة التجريبية" });
      return;
    }
    res.json({ ok: true });
  });

  app.post("/api/demo/exit", (req, res) => {
    const sessionId = readDemoCookie(req);
    if (sessionId) DemoSandbox.destroy(sessionId);
    setDemoCookie(res, "");
    res.json({ ok: true });
  });

  /*
   * المصادقة. تأتي بعد ربط البيئة التجريبية مباشرة، لأن الزائر التجريبي لا يملك حساباً
   * أصلاً — والحارس في routes.ts يمرّره لأن طلبه مقيّد بصندوقه الخاص في الذاكرة.
   */
  app.use("/api/auth", authRouter);

  // Mount domain API routes
  catchAsyncErrors(authRouter);
  catchAsyncErrors(apiRouter);
  app.use("/api", apiRouter);

  /* مسار API مجهول يُجاب بـ404 JSON، لا بصفحة التطبيق وحالة 200. */
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "المسار غير موجود.", code: "NOT_FOUND" });
  });

  /*
   * معالج الأخطاء الأخير: JSON موحّد دائماً. بدونه يردّ Express بصفحة HTML،
   * وخارج الإنتاج تحمل تلك الصفحة أثر المكدّس كاملاً.
   */
  app.use((err: { status?: number; statusCode?: number; type?: string }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) return next(err);
    const status = err?.status || err?.statusCode || 500;
    if (status >= 500) console.error("[NAHJ] unhandled route error:", err);
    const message = err?.type === "entity.parse.failed" ? "جسم الطلب ليس JSON صالحاً."
      : err?.type === "entity.too.large" ? "جسم الطلب أكبر من المسموح."
      : status >= 500 ? "حدث خطأ غير متوقع في الخادم." : "طلب غير صالح.";
    res.status(status).json({ error: message, code: status >= 500 ? "SERVER_ERROR" : "BAD_REQUEST" });
  });

  await bootstrapFirstAccount();
  /*
   * الترخيص يُهيَّأ قبل الاستماع لا بعده.
   *
   * أول طلب قد يصل في الملّي ثانية التالية لفتح المنفذ، وحارس الاشتراك يقرأ حالةً
   * يجب أن تكون موجودة حينها — لا أن تُنشأ تحت أول قارئ لها.
   */
  ensureSubscription();
  ensureOwnerAccount();
  startBillingWorker();
  /* النسخ الدوري — لا يكتب نسخةً عند الإقلاع، فالنشر المتكرر يُزيح نسخة الأمس. */
  startBackupWorker();
  /* الإشعارات: تُحسب التذكيرات ويُفرَغ الطابور خارج مسار الطلب. */
  startNotifyWorker();

  const sessionCleanup = setInterval(() => purgeExpiredSessions(), 30 * 60_000);
  sessionCleanup.unref();

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`[NAHJ] Server running on http://0.0.0.0:${PORT}`);
  });

  // إيقاف نظيف: آخر لقطة تُكتب قبل الخروج فلا تضيع ثوانٍ من العمل.
  const shutdown = (signal: string) => {
    console.log(`[NAHJ] ${signal} received — flushing state.`);
    try { persistence.flush(); stopBillingWorker(); stopBackupWorker(); stopNotifyWorker(); } catch { /* نكمل إلى مرآة Neon */ }
    // آخر لقطة إلى Neon قبل أن تُمحى الحاوية — بمهلةٍ أقصر من مهلة Cloud Run (10 ثوانٍ).
    Promise.race([neonMirror.syncNow(), new Promise((resolve) => setTimeout(resolve, 8_000))])
      .finally(() => process.exit(0));
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  server.on("error", (err: any) => {
    console.error("[NAHJ] Server listen error:", err);
  });

  // Vite middleware for development / production static fallback
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server }, // Bind HMR to the Express server to avoid port 24678 conflicts
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(200).send("NAHJ OS is active. Preparing static assets...");
      }
    });
  }
}

/* آخر شبكة أمان: رفضٌ غير ملتقط خارج الطلبات يُسجَّل ولا يُسقط الخدمة. */
process.on("unhandledRejection", (reason) => {
  console.error("[NAHJ] unhandled rejection:", reason);
});

startServer().catch((err) => {
  console.error("[NAHJ] Fatal error starting server:", err);
});
