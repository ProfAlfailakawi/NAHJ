import express from "express";
import path from "path";
import fs from "fs";
import { apiRouter, authRouter } from "./server/routes.ts";
import { paymentPublicRouter } from "./server/paymentRoutes.ts";
import { bootstrapFirstAccount, ensureOwnerAccount, purgeExpiredSessions } from "./server/auth.ts";
import { ensureSubscription, startBillingWorker, stopBillingWorker } from "./server/billing.ts";
import { DemoSandbox, DEMO_SESSION_TTL_MS, persistence } from "./server/db.ts";
import { startBackupWorker, stopBackupWorker } from "./server/archive.ts";
import { randomBytes } from "node:crypto";

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

  // Conservative security response headers. Kept intentionally minimal so they
  // cannot break the SPA or embedding in the AI Studio applet host (no CSP /
  // X-Frame-Options which could interfere with iframe embedding or HMR).
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
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
    DemoSandbox.create(sessionId, DEMO_SESSION_TTL_MS);
    setDemoCookie(res, sessionId);
    res.json({ ok: true, demo: true, ttlMs: DEMO_SESSION_TTL_MS });
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
  app.use("/api", apiRouter);

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

  const sessionCleanup = setInterval(() => purgeExpiredSessions(), 30 * 60_000);
  sessionCleanup.unref();

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`[NAHJ] Server running on http://0.0.0.0:${PORT}`);
  });

  // إيقاف نظيف: آخر لقطة تُكتب قبل الخروج فلا تضيع ثوانٍ من العمل.
  const shutdown = (signal: string) => {
    console.log(`[NAHJ] ${signal} received — flushing state.`);
    try { persistence.flush(); stopBillingWorker(); stopBackupWorker(); } finally { process.exit(0); }
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

startServer().catch((err) => {
  console.error("[NAHJ] Fatal error starting server:", err);
});
