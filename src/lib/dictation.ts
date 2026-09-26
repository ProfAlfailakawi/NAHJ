import { useCallback, useEffect, useRef, useState } from "react";

/*
 * الإملاء الصوتي في وضع التعليم — Web Speech API باللهجة الكويتية (ar-KW).
 *
 * الموظف يشرح وهو يعمل؛ الكتابة تقطع عمله. يتكلّم فيُكتب النص تحت الخطوة،
 * ويبقى قابلاً للتعديل قبل الاستخلاص: التعرّف الصوتي يخطئ، والنص المعتمد هو
 * ما يراجعه الموظف لا ما سمعه المتصفح. ولا يُرسل الصوت إلى خادم نهج — النص وحده.
 */

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: any) => void) | null; onerror: ((event: any) => void) | null; onend: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};

const recognitionCtor = (): (new () => Recognition) | null => {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};

export const dictationSupported = () => recognitionCtor() !== null;

export function useDictation(lang = "ar-KW") {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const onFinal = useRef<((text: string) => void) | null>(null);

  const stop = useCallback(() => { recognition.current?.stop(); }, []);

  const start = useCallback((handler: (text: string) => void) => {
    const Ctor = recognitionCtor();
    if (!Ctor) { setError("unsupported"); return; }
    recognition.current?.abort();
    const instance = new Ctor();
    instance.lang = lang;
    instance.continuous = true;
    instance.interimResults = true;
    onFinal.current = handler;
    instance.onresult = (event: any) => {
      let partial = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = String(result[0]?.transcript || "");
        if (result.isFinal) onFinal.current?.(text.trim());
        else partial += text;
      }
      setInterim(partial);
    };
    instance.onerror = (event: any) => { setError(String(event?.error || "error")); };
    instance.onend = () => { setListening(false); setInterim(""); };
    recognition.current = instance;
    setError(null);
    try { instance.start(); setListening(true); } catch { setError("start-failed"); }
  }, [lang]);

  useEffect(() => () => recognition.current?.abort(), []);
  return { listening, interim, error, start, stop, supported: dictationSupported() };
}
