import React, { useEffect, useRef, useState } from "react";
import { Fingerprint } from "lucide-react";
import { dataText } from "../../lib/labels";
import { usePrefersReducedMotion } from "./motion";

/*
 * «مسرح التعليم» — عرضٌ فقط فوق ما تملكه الشاشة.
 *
 * DictationWave: الشاشة لا تفتح مجرى ميكروفون (الإملاء عبر SpeechRecognition في المتصفح)،
 * فلا سعة صوت تُقاس. الموجة إذن مؤشّر نشاط التعرّف: تعلو حين يصل نصٌّ جديد وتهدأ بغيابه،
 * وتظهر أثناء الإملاء وحده. ولا تسجيل ولا رفع جديد.
 */
export function DictationWave({ active, interim, ar }: { active: boolean; interim: string; ar: boolean }) {
  const reduced = usePrefersReducedMotion();
  const BARS = 28;
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0.15));
  const energy = useRef(0.2);
  const last = useRef("");
  useEffect(() => {
    if (interim !== last.current) { energy.current = Math.min(1, 0.45 + Math.abs(interim.length - last.current.length) / 12); last.current = interim; }
  }, [interim]);
  useEffect(() => {
    if (!active || reduced) return;
    let raf = 0, prev = 0;
    const tick = (t: number) => {
      if (t - prev > 70) {
        prev = t;
        energy.current = Math.max(0.12, energy.current * 0.92);
        setLevels(v => [...v.slice(1), Math.min(1, energy.current * (0.55 + Math.random() * 0.45))]);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, reduced]);
  if (!active) return null;
  return (
    <div className="dictation-wave" role="img" aria-label={ar ? "الإملاء يعمل — مؤشّر نشاط التعرّف على الكلام" : "Dictation on — speech recognition activity"}>
      <span className="dw-bars" aria-hidden="true">{levels.map((l, i) => <i key={i} style={{ transform: `scaleY(${reduced ? 0.35 + ((i * 7) % 5) / 10 : Math.max(0.08, l)})` }} />)}</span>
      <small>{ar ? "مؤشّر نشاط التعرّف — ليس قياس صوت" : "Recognition activity — not an audio level"}</small>
    </div>
  );
}

type Step = { id: string; action: string; system: string };

/*
 * كل خطوة تهبط بطاقةً على خيطٍ واحد. وبعد الاستخلاص تنطوي البطاقات إلى «بصمة المهارة»:
 * حلقةٌ لكل خطوة مستخلصة ونقطةٌ لكل قاعدة — من نتيجة الخادم نفسها، لا رقم جديد.
 */
export function TeachThread({ steps, ar, result }: { steps: Step[]; ar: boolean; result: { steps: number; rules: number } | null }) {
  const reduced = usePrefersReducedMotion();
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    if (!result) { setFolded(false); return; }
    if (reduced) { setFolded(true); return; }
    const t = window.setTimeout(() => setFolded(true), 650);
    return () => window.clearTimeout(t);
  }, [result, reduced]);
  const seen = useRef<Set<string>>(new Set(steps.map(s => s.id)));
  const fresh = steps.filter(s => !seen.current.has(s.id)).map(s => s.id);
  useEffect(() => { steps.forEach(s => seen.current.add(s.id)); }, [steps]);
  if (!steps.length) return null;
  return (
    <div className={`teach-thread ${result ? "folding" : ""} ${folded ? "folded" : ""}`}>
      {!folded && (
        <ol className="tt-cards" aria-label={ar ? "الخطوات على خيط الجلسة" : "Steps on the session thread"}>
          {steps.map((s, i) => (
            <li key={s.id} className={fresh.includes(s.id) ? "landing" : ""} style={{ ["--i" as string]: i } as React.CSSProperties}>
              <i aria-hidden="true">{i + 1}</i>
              <span>{dataText(s.action, ar)}</span>
              <small>{s.system}</small>
            </li>
          ))}
        </ol>
      )}
      {result && folded && <SkillFingerprintMark steps={result.steps} rules={result.rules} ar={ar} />}
    </div>
  );
}

function SkillFingerprintMark({ steps, rules, ar }: { steps: number; rules: number; ar: boolean }) {
  const rings = Math.max(1, Math.min(steps, 9));
  return (
    <figure className="tt-fingerprint" aria-label={ar ? `بصمة المهارة: ${steps} خطوة و${rules} قاعدة` : `Skill fingerprint: ${steps} steps, ${rules} rules`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        {Array.from({ length: rings }).map((_, i) => {
          const r = 14 + i * 5.5; const c = 2 * Math.PI * r; const gap = (i * 37) % 360;
          return <circle key={i} cx="60" cy="60" r={r} strokeDasharray={`${c * (0.62 + ((i * 13) % 30) / 100)} ${c}`} transform={`rotate(${gap - 90} 60 60)`} style={{ ["--d" as string]: `${i * 70}ms` } as React.CSSProperties} />;
        })}
        {Array.from({ length: Math.min(rules, 12) }).map((_, i) => {
          const a = (i / Math.max(1, Math.min(rules, 12))) * Math.PI * 2 - Math.PI / 2; const r = 14 + rings * 5.5 + 6;
          return <circle key={`r${i}`} className="tt-rule" cx={60 + r * Math.cos(a)} cy={60 + r * Math.sin(a)} r="2.6" />;
        })}
      </svg>
      <figcaption><Fingerprint aria-hidden="true" /><strong>{steps}</strong>{ar ? "خطوات" : "steps"} · <strong>{rules}</strong>{ar ? "قواعد" : "rules"}</figcaption>
    </figure>
  );
}
