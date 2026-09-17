import express from "express";
import path from "path";
import fs from "fs";
import { apiRouter, authRouter } from "./server/routes.ts";
import { bootstrapFirstAccount, purgeExpiredSessions } from "./server/auth.ts";
import { persistence } from "./server/db.ts";

async function startServer() {
  const app = express();
  const PORT = 3000;

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

  // المصادقة قبل كل شيء: هي المسار الوحيد المتاح بلا جلسة.
  app.use("/api/auth", authRouter);

  // Mount domain API routes
  app.use("/api", apiRouter);

  await bootstrapFirstAccount();
  const sessionCleanup = setInterval(() => purgeExpiredSessions(), 30 * 60_000);
  sessionCleanup.unref();

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`[NAHJ] Server running on http://0.0.0.0:${PORT}`);
  });

  // إيقاف نظيف: آخر لقطة تُكتب قبل الخروج فلا تضيع ثوانٍ من العمل.
  const shutdown = (signal: string) => {
    console.log(`[NAHJ] ${signal} received — flushing state.`);
    try { persistence.flush(); } finally { process.exit(0); }
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
