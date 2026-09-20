import React, { useEffect, useRef, useState } from "react";
import { BookOpen, GraduationCap, HelpCircle, X } from "lucide-react";
import { AUTONOMY_LADDER, GLOSSARY, glossaryMap, ladderStep } from "../lib/glossary";

/*
 * طبقة الشرح.
 *
 * المصطلح يُعرض ومعه معناه — لا يُخفى ولا يُترك وحده. إخفاؤه يترك الموظف عاجزاً
 * عن قراءة الوثائق أو سؤال زميله، وتركُه وحده يجعله يخمّن.
 */

/**
 * مصطلح قابل للشرح.
 *
 * زرٌّ لا `span` مع `title`: تلميح المتصفح لا يعمل باللمس إطلاقاً — أي أنه غائب
 * عن نصف من يستعملون المنتج — ولا يبلغه من يتنقّل بلوحة المفاتيح. وزرٌّ يفتح
 * لوحةً صغيرة يعمل للجميع.
 */
export function Term({ k, children }: { k: string; children?: React.ReactNode }) {
  const entry = glossaryMap[k];
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLSpanElement | null>(null);

  /* الإغلاق بالنقر خارجها وبمفتاح الهروب — وإلا بقيت معلّقة فوق الشاشة. */
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (wrapper.current && !wrapper.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", escape); };
  }, [open]);

  if (!entry) return <>{children}</>;

  return (
    <span className="term-wrap" ref={wrapper}>
      <button type="button" className={`term ${open ? "open" : ""}`} onClick={() => setOpen(v => !v)}
        aria-expanded={open} aria-label={`ما معنى ${entry.term}؟`}>
        {children || entry.term}
      </button>
      {open && (
        <span className="term-pop" role="dialog">
          <b>{entry.term} <i>{entry.termEn}</i></b>
          <span>{entry.plain}</span>
          <em>{entry.why}</em>
        </span>
      )}
    </span>
  );
}

/** شارة مستوى استقلالية بلغة الموظف: الرقم للمتخصّص، والجملة للجميع. */
export function AutonomyBadge({ level, compact = false }: { level: number; compact?: boolean }) {
  const step = ladderStep(level);
  return (
    <span className={`autonomy-badge ${compact ? "compact" : ""}`} title={`${step.code} — ${step.yourPart}`}>
      <i>L{step.level}</i>
      {!compact && <span>{step.plain}</span>}
    </span>
  );
}

/**
 * لوحة المساعدة.
 *
 * زرّ المساعدة في الشريط الجانبي كان موجوداً منذ البداية بلا أي مُعالج نقر — أي
 * أنه أيقونةٌ تُرى ولا تفعل. هذه هي اللوحة التي كان يجب أن يفتحها.
 */
export function HelpPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="help-backdrop" onMouseDown={event => { if (event.currentTarget === event.target) onClose(); }}>
      <aside className="help-panel" role="dialog" aria-label="دليل نهج السريع">
        <header>
          <div>
            <em>دليل سريع</em>
            <h2>نهج بلغتك</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق"><X /></button>
        </header>

        <section className="help-section">
          <h3><GraduationCap /> ما الذي يُطلب منك فعلاً</h3>
          <ol className="help-steps">
            <li><b>اعمل كالمعتاد.</b> نهج يتعلّم من عملك الحقيقي، ولا يُطلب منك كتابة إجراءات ولا ملء نماذج.</li>
            <li><b>أجب عن سؤاله حين يسأل.</b> يسأل عمّا لم يفهمه — وجوابك يصير قاعدة معتمدة.</li>
            <li><b>راجع ما يصلك.</b> ما يظهر لك هو ما يحتاج إنساناً؛ الباقي لا يصلك أصلاً.</li>
            <li><b>صحّح حين يخطئ.</b> التصحيح ليس شكوى — هو الطريقة الوحيدة التي يتحسّن بها.</li>
          </ol>
        </section>

        <section className="help-section">
          <h3><BookOpen /> سُلّم الاستقلالية</h3>
          <p className="help-note">
            لكل مهارة مستوى يحدّد ما يفعله نهج وحده وما يبقى عليك. لا يرتفع المستوى
            إلا بقرار بشري، وبعد أن تُثبت المهارة نفسها بالقياس.
          </p>
          <div className="ladder-list">
            {AUTONOMY_LADDER.map(step => (
              <div key={step.level}>
                <i>L{step.level}</i>
                <div>
                  <strong>{step.plain}</strong>
                  <small>{step.yourPart}</small>
                </div>
                <em>{step.code}</em>
              </div>
            ))}
          </div>
        </section>

        <section className="help-section">
          <h3><HelpCircle /> المصطلحات</h3>
          <div className="glossary-list">
            {GLOSSARY.map(entry => (
              <div key={entry.key}>
                <strong>{entry.term} <i>{entry.termEn}</i></strong>
                <p>{entry.plain}</p>
                <small>{entry.why}</small>
              </div>
            ))}
          </div>
        </section>

        <footer className="help-foot">
          لك دائماً أن تستلم أي حالة بنفسك، وأن توقف أي مهارة فوراً. لا يحتاج ذلك إذن أحد.
        </footer>
      </aside>
    </div>
  );
}
