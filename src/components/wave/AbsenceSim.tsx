import React from "react";
import { CalendarOff, CircleSlash, X } from "lucide-react";
import type { WorkItem } from "../../types";
import { dataText } from "../../lib/labels";

/*
 * «يومٌ غائب» — محاكاةٌ للقراءة فقط، تُحسب في المتصفح من بيانات الغطاء المحمَّلة أصلاً.
 * تتوقف المهارة إن كان الغائب يحملها وحده (لا بديل مسمّى ولا تغطية يعلنها الخادم)،
 * وتتوقف معها كل حالة عمل لم تكتمل تتبعها. لا يُكتب شيءٌ ولا يُرسل شيء.
 */
export type HolderMap = Map<string, { owner: string; covered: boolean; backups: string[] }>;

export function absenceImpact(person: string, bySkill: HolderMap, names: Map<string, string>, workItems: WorkItem[]) {
  const stalled: { id: string; name: string }[] = [];
  const carried: { id: string; name: string; by: string[] }[] = [];
  for (const [id, info] of bySkill) {
    const holders = [info.owner, ...info.backups].filter(Boolean);
    if (!holders.includes(person)) continue;
    const others = holders.filter(h => h !== person);
    /* «مغطّاة» بلا اسم بديل (الخادم يعلم أن غير المالك يقدر عليها) لا تُعدّ متوقفة. */
    if (others.length === 0 && !info.covered) stalled.push({ id, name: names.get(id) || id });
    else carried.push({ id, name: names.get(id) || id, by: others });
  }
  const ids = new Set(stalled.map(s => s.id));
  const stoppedCases = workItems.filter(w => w.state !== "completed" && ids.has(w.skillId));
  return { stalled, carried, stoppedCases };
}

export function AbsencePanel({ ar, people, absent, onPick, impact, workLoaded }: {
  ar: boolean; people: string[]; absent: string | null; onPick: (p: string | null) => void;
  impact: ReturnType<typeof absenceImpact> | null; workLoaded: boolean;
}) {
  return (
    <section className="surface-strong absence-sim" aria-labelledby="absence-title">
      <div className="absence-head">
        <CalendarOff aria-hidden="true" />
        <div>
          <h2 id="absence-title" aria-level={2}>{ar ? "يومٌ غائب" : "A day absent"}</h2>
          <small>{ar ? "محاكاة للقراءة فقط — لا تغيّر شيئاً. اختر موظفاً لترى ما يتوقف لو غاب غداً." : "Read-only simulation — changes nothing. Pick someone to see what would stall if they were out tomorrow."}</small>
        </div>
        {absent && <button type="button" className="absence-clear" onClick={() => onPick(null)} aria-label={ar ? "إنهاء المحاكاة" : "End simulation"}><X aria-hidden="true" /></button>}
      </div>
      <div className="absence-people" role="group" aria-label={ar ? "اختر موظفاً" : "Choose a person"}>
        {people.map(p => <button key={p} type="button" aria-pressed={absent === p} className={absent === p ? "on" : ""} onClick={() => onPick(absent === p ? null : p)}>{p}</button>)}
      </div>
      {absent && impact && (
        <div className="absence-result" aria-live="polite">
          <div className="absence-figures">
            <div className={impact.stalled.length ? "hot" : ""}><strong>{impact.stalled.length}</strong><span>{ar ? "مهارة تتوقف" : "skills stall"}</span></div>
            <div className={impact.stoppedCases.length ? "hot" : ""}><strong>{workLoaded ? impact.stoppedCases.length : "—"}</strong><span>{ar ? "حالة عمل تتوقف" : "cases stop"}</span></div>
            <div><strong>{impact.carried.length}</strong><span>{ar ? "يحملها زميل" : "carried by a colleague"}</span></div>
          </div>
          {impact.stalled.length > 0
            ? <ul className="absence-list">{impact.stalled.map(s => <li key={s.id}><CircleSlash aria-hidden="true" />{dataText(s.name, ar)}</li>)}</ul>
            : <p className="decision-muted">{ar ? `لا مهارة تتوقف بغياب ${absent} — كل ما يحمله له بديل.` : `Nothing stalls without ${absent} — everything has a backup.`}</p>}
        </div>
      )}
    </section>
  );
}
