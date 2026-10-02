import React, { useCallback, useEffect, useId, useState } from "react";
import { AlertTriangle, Circle, UserPlus, Users } from "lucide-react";
import { api, ApiError, apiOrNull } from "../../lib/api";
import { Dt, PageHeader, SectionTitle } from "../Primitives";
import { DnaRing } from "../dna";
import { dataText } from "../../lib/labels";

/*
 * من تعتمد عليه المؤسسة وحده.
 *
 * تحذير «تعتمد على شخص واحد» كان يظهر على المهارة ولا يقود إلى شيء. هذه الشاشة
 * تجمعه حول الأشخاص: من يحمل وحده أيّ إجراء، وزرٌّ يسند زميلاً بديلاً، ومقياس
 * غطاءٍ يُحفظ يوماً بيوم ليُرى هل تقلّ المخاطرة أم تزيد.
 */

interface CoverageReport {
  score: number | null;
  total: number;
  covered: number;
  singlePoints: { id: string; name: string; ownerName: string; autonomyLevel: number; riskLevel: string }[];
  people: { name: string; soleSkills: number; skills: { id: string; name: string; covered: boolean; backups: string[] }[] }[];
  history: { date: string; score: number; singlePoints: number; total: number }[];
}

type Props = { lang: "ar" | "en"; canAssign: boolean; notify: (text: string, error?: boolean) => void; onChanged?: () => void };

function BackupForm({ skillId, ar, onAssigned, notify }: { skillId: string; ar: boolean; onAssigned: (c: CoverageReport) => void; notify: Props["notify"] }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const inputId = useId();
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const data = await api<{ message: string; coverage: CoverageReport }>(`/skills/${skillId}/backup`, { method: "POST", body: JSON.stringify({ name }) });
      onAssigned(data.coverage); setName(""); notify(data.message);
    } catch (error) {
      notify(error instanceof ApiError ? error.message : (ar ? "تعذّر الإسناد" : "Could not assign"), true);
    } finally { setBusy(false); }
  };
  return (
    <form className="backup-form" onSubmit={submit}>
      <label htmlFor={inputId}>{ar ? "زميل بديل" : "Backup colleague"}</label>
      <input id={inputId} value={name} onChange={event => setName(event.target.value)} placeholder={ar ? "اسم الزميل" : "Colleague name"} />
      <button type="submit" disabled={busy || !name.trim()}><UserPlus aria-hidden="true" />{ar ? "أسند" : "Assign"}</button>
    </form>
  );
}

export function PeopleView({ lang, canAssign, notify, onChanged }: Props) {
  const ar = lang === "ar";
  const [coverage, setCoverage] = useState<CoverageReport | null>(null);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    const data = await apiOrNull<{ coverage: CoverageReport }>("/people/coverage");
    if (data?.coverage) setCoverage(data.coverage);
    setLoaded(true);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const assigned = (next: CoverageReport) => { setCoverage(next); onChanged?.(); };

  const history = coverage?.history || [];
  const max = 100;
  /* شبكة شخص × مهارة من بيانات الغطاء نفسها: ممتلئة = يحملها ومغطّاة، تحذير = يحملها وحده، فارغة = لا يحملها. */
  const gridSkills = (() => {
    const seen = new Map<string, string>();
    for (const person of coverage?.people || []) for (const skill of person.skills) if (!seen.has(skill.id)) seen.set(skill.id, skill.name);
    return Array.from(seen, ([id, name]) => ({ id, name }));
  })();
  return (
    <div className="page-enter">
      <PageHeader eyebrow={ar ? "الأشخاص / الاعتماد" : "PEOPLE / COVERAGE"}
        title={ar ? "لو غاب أحدهم غداً، من يعرف كيف يُنجَز عمله؟" : "If someone is out tomorrow, who knows how to do their work?"}
        hint={ar ? "كل إجراءٍ يحمله شخصٌ واحد مخاطرة. أسند زميلاً بديلاً لكل مهارة، وتابع الغطاء يوماً بيوم." : "Every procedure held by one person is a risk. Assign a backup for each skill and track coverage over time."} />
      {!loaded && (
        <div className="people-layout" role="status" aria-busy="true" aria-label={ar ? "جارٍ التحميل" : "Loading"}>
          <div className="surface-strong skel-card"><i className="skel skel-ring"/><i className="skel skel-line"/></div>
          <div className="surface-strong skel-card"><i className="skel skel-line"/><i className="skel skel-line"/><i className="skel skel-line short"/></div>
        </div>
      )}
      {loaded && <div className="people-layout">
        <section className="surface-strong people-score">
          <Users aria-hidden="true" />
          {/* المقياس مرة واحدة: حلقةٌ بنسبتها في وسطها، وتحتها العدّ بالكلام. */}
          {coverage && coverage.total > 0
            ? <DnaRing className="people-ring" value={coverage.covered} max={coverage.total} size={150} stroke={10}
                label={coverage.score == null ? "—" : `${coverage.score}%`}
                ariaLabel={ar ? `${coverage.covered} من ${coverage.total} مهارة لها أكثر من شخص` : `${coverage.covered} of ${coverage.total} skills covered`} />
            : <strong>{coverage?.score == null ? "—" : `${coverage.score}%`}</strong>}
          <span>{ar ? "غطاء المعرفة" : "Knowledge coverage"}</span>
          <small>{coverage ? (ar ? `${coverage.covered} من ${coverage.total} مهارة لها أكثر من شخص` : `${coverage.covered} of ${coverage.total} skills have more than one person`) : ""}</small>
          {history.length > 1 && (
            <figure className="coverage-trend">
              <svg viewBox={`0 0 ${Math.max(history.length - 1, 1) * 20} 60`} preserveAspectRatio="none" role="img"
                aria-label={ar ? `تطوّر الغطاء من ${history[0].score}% إلى ${history[history.length - 1].score}%` : `Coverage from ${history[0].score}% to ${history[history.length - 1].score}%`}>
                <polyline fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke"
                  points={history.map((point, index) => `${index * 20},${60 - (point.score / max) * 56}`).join(" ")} />
              </svg>
              <figcaption>{ar ? `آخر ${history.length} يوماً` : `Last ${history.length} days`}</figcaption>
            </figure>
          )}
        </section>
        <section className="surface-strong people-risks">
          <SectionTitle title={ar ? "مهارات يحملها شخص واحد" : "Skills held by one person"} meta={`${coverage?.singlePoints.length ?? 0}`} />
          {coverage && coverage.singlePoints.length === 0 && <p className="decision-muted">{ar ? "لا مهارة تعتمد على شخص واحد." : "No skill depends on a single person."}</p>}
          <ul className="spof-list">
            {coverage?.singlePoints.map(point => (
              <li key={point.id}>
                <div><AlertTriangle aria-hidden="true" /><span><strong><Dt t={point.name} ar={ar} /></strong><small>{ar ? `يحملها: ${point.ownerName}` : `Held by: ${point.ownerName}`}</small></span></div>
                {canAssign && <BackupForm skillId={point.id} ar={ar} onAssigned={assigned} notify={notify} />}
              </li>
            ))}
          </ul>
        </section>
        {coverage && coverage.people.length > 0 && gridSkills.length > 0 && (
          <section className="surface people-matrix">
            <SectionTitle title={ar ? "من يحمل ماذا" : "Who holds what"} />
            <div className="people-matrix-scroll">
              <table>
                <caption className="sr-only">{ar ? "شبكة الأشخاص والمهارات" : "People by skill grid"}</caption>
                <thead><tr><td />{gridSkills.map(skill => <th key={skill.id} scope="col" title={dataText(skill.name, ar)}><span><Dt t={skill.name} ar={ar} /></span></th>)}</tr></thead>
                <tbody>
                  {coverage.people.map(person => (
                    <tr key={person.name}>
                      <th scope="row">{person.name}</th>
                      {gridSkills.map(skill => {
                        const held = person.skills.find(item => item.id === skill.id);
                        const state = !held ? "none" : held.covered ? "ok" : "warn";
                        const text = !held ? (ar ? "لا يحملها" : "Does not hold") : held.covered ? (ar ? "يحملها ومغطّاة" : "Holds, covered") : (ar ? "يحملها وحده" : "Sole holder");
                        return <td key={skill.id} className={`pm-${state}`} title={text}>
                          {state === "warn" ? <AlertTriangle aria-hidden="true" /> : <Circle aria-hidden="true" fill={state === "ok" ? "currentColor" : "none"} />}
                          <span className="sr-only">{text}</span>
                        </td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pm-legend" aria-hidden="true">
              <span className="pm-ok"><Circle fill="currentColor" />{ar ? "يحملها ومغطّاة" : "Holds, covered"}</span>
              <span className="pm-warn"><AlertTriangle />{ar ? "يحملها وحده" : "Sole holder"}</span>
              <span className="pm-none"><Circle />{ar ? "لا يحملها" : "Does not hold"}</span>
            </div>
          </section>
        )}
        <section className="surface people-list">
          <SectionTitle title={ar ? "الأشخاص" : "People"} meta={`${coverage?.people.length ?? 0}`} />
          <ul>
            {coverage?.people.map(person => (
              <li key={person.name}>
                <strong>{person.name}</strong>
                <span className={person.soleSkills ? "is-risk" : ""}>{person.soleSkills
                  ? (ar ? `يحمل وحده ${person.soleSkills} من ${person.skills.length}` : `Sole holder of ${person.soleSkills} of ${person.skills.length}`)
                  : (ar ? `${person.skills.length} مهارة، كلها مغطّاة` : `${person.skills.length} skills, all covered`)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>}
    </div>
  );
}
