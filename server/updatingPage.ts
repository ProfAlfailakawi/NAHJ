import fs from "node:fs";
import type { Request, Response } from "express";

/*
 * صفحة «نُحدّث البرنامج» (public/updating.html) تُقدَّم من هنا لا من الملفات الثابتة.
 *
 * سكربتها مضمَّن، وسياسة CSP في الإنتاج لا تسمح إلا بسكربتٍ يحمل nonce الطلب.
 * `express.static` يبثّ الملف بلا nonce فيُحجب سكربتها: تبقى الصفحة ولا تسأل
 * الخادم ولا يعمل زرّها. و`res.send` يمرّ بـ cspMiddleware فيُعلَّم السكربت.
 * ولا تُخزَّن: هي جوابُ لحظةِ نشر، لا نسخةٌ تُحفظ.
 */
export function updatingPageRoute(file: string) {
  return (_req: Request, res: Response) => {
    let html: string;
    try {
      html = fs.readFileSync(file, "utf8");
    } catch {
      res.status(404).end();
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.type("html").send(html);
  };
}
