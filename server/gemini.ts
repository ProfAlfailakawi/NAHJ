import { GoogleGenAI } from "@google/genai";
import { checkLimit, incrementUsage, readUsage } from "./billing.ts";
import { LIMIT_LABEL_AR, noteUsage, recordBlock } from "./entitlements.ts";
import { DemoSandbox, requestAccount } from "./db.ts";

let geminiClient: GoogleGenAI | null = null;

const AI_TIMEOUT_MS = Math.max(1_000, Number(process.env.NAHJ_AI_TIMEOUT_MS) || 15_000);

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`AI request timed out after ${ms}ms`)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function getGemini(): GoogleGenAI | null {
  if (!geminiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (key && key !== "MY_GEMINI_API_KEY" && key.trim().length > 0) {
      try {
        geminiClient = new GoogleGenAI({
          apiKey: key,
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build",
            },
          },
        });
      } catch (err) {
        console.warn("Failed to initialize GoogleGenAI client:", err);
        geminiClient = null;
      }
    }
  }
  return geminiClient;
}

export async function generateAiResponse(prompt: string, systemInstruction?: string): Promise<string> {
  const client = getGemini();
  /*
   * بلغت المؤسسة حدّ نداءات الذكاء الشهري: لا نداءٌ خارجي بعدها، ويعمل المنطق الحتمي كما يعمل
   * بلا مفتاح — فلا تنقطع المحادثة ولا يضيع شيء، وتُسجَّل الحادثة في التدقيق وتظهر في الاشتراك.
   */
  if (client && !DemoSandbox.isDemoRequest() && requestAccount.getStore()?.role !== "owner") {
    const used = readUsage("aiCalls");
    const check = checkLimit("aiCallsPerMonth", used, 1);
    if (!check.allowed) {
      recordBlock("aiCallsPerMonth", { allowed: false, message: LIMIT_LABEL_AR.aiCallsPerMonth, limit: check.limit, used });
      return "";
    }
  }
  if (client) {
    try {
      /*
       * مهلة قصوى: نداءٌ معلّق عند المزوّد كان يُبقي رسالة المستخدم في المحادثة دائرةً
       * بلا نهاية (الطلب لا يعود). بعد المهلة نرتدّ إلى المنطق الحتمي كما نفعل عند أي خطأ.
       */
      const response = await withTimeout(client.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          systemInstruction: systemInstruction || "You are NAHJ (نهج), an operational intelligence engine.",
          temperature: 0.2,
        },
      }), AI_TIMEOUT_MS);
      /*
       * القياس يقع عند النداء الفعلي لا عند الطلب: ارتداد المحرّك إلى المنطق
       * الحتمي (بلا مفتاح، أو عند خطأ) لا يُحتسب على حصّة المؤسسة — وإلا حاسبناها
       * على استدعاء لم يحدث.
       */
      if (!DemoSandbox.isDemoRequest()) {
        try { incrementUsage("aiCalls"); noteUsage("aiCallsPerMonth"); } catch { /* القياس لا يُسقط الاستجابة */ }
      }
      if (response.text) {
        return response.text.trim();
      }
    } catch (err) {
      console.warn("Gemini API call error, falling back to deterministic engine:", err);
    }
  }
  return "";
}
