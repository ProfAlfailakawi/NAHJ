import { randomBytes } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/*
 * سياسة أمان المحتوى (CSP).
 *
 * كانت غائبة عمداً خشية كسر التضمين في مضيف AI Studio وإعادة التحميل الحيّ.
 * والحلّ ليس غيابها بل ضبطها: لا `frame-ancestors` (التضمين يبقى كما هو)،
 * وتُرسل في الإنتاج وحده (خادم Vite للتطوير يحقن سكربتات مضمَّنة للتحميل
 * الحيّ). السكربتات المضمَّنة في الصفحات العامة تُعلَّم بـnonce لكل طلب، فلا
 * حاجة إلى 'unsafe-inline' للسكربت. والأنماط المضمَّنة مسموحة: الواجهة تضبط
 * متغيّرات CSS عبر `style=` في مواضع كثيرة.
 */
export function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https:",
  ].join("; ");
}

/** يضيف nonce إلى كل `<script>` في صفحة HTML لا تحمله. */
export function nonceScripts(html: string, nonce: string): string {
  return html.replace(/<script(?![^>]*\bnonce=)/gi, `<script nonce="${nonce}"`);
}

export const cspEnabled = () => process.env.NODE_ENV === "production" || process.env.NAHJ_FORCE_CSP === "true";

export function cspMiddleware() {
  return (_req: Request, res: Response, next: NextFunction) => {
    if (!cspEnabled()) return next();
    const nonce = randomBytes(16).toString("base64");
    res.locals.cspNonce = nonce;
    res.setHeader("Content-Security-Policy", buildCsp(nonce));
    const send = res.send.bind(res);
    res.send = ((body?: unknown) => {
      if (typeof body === "string" && /^\s*<(!doctype html|html)/i.test(body)) body = nonceScripts(body, nonce);
      return send(body as never);
    }) as typeof res.send;
    next();
  };
}
