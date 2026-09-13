import { GoogleGenAI } from "@google/genai";

let geminiClient: GoogleGenAI | null = null;

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
  if (client) {
    try {
      const response = await client.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          systemInstruction: systemInstruction || "You are NAHJ (نهج), an operational intelligence engine.",
          temperature: 0.2,
        },
      });
      if (response.text) {
        return response.text.trim();
      }
    } catch (err) {
      console.warn("Gemini API call error, falling back to deterministic engine:", err);
    }
  }
  return "";
}
