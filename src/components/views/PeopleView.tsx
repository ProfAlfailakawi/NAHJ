import React, { useCallback, useEffect, useId, useState } from "react";
import { AlertTriangle, UserPlus, Users } from "lucide-react";
import { api, ApiError, apiOrNull } from "../../lib/api";
import { PageHeader, SectionTitle } from "../Primitives";

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
  const load = useCallback(async () => {
    const data = await apiOrNull<{ coverage: CoverageReport }>("/people/coverage");
    if (data?.coverage) setCoverage(data.coverage);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const assigned = (next: CoverageReport) => { setCoverage(next); onChanged?.(); };

  const history = coverage?.history || [];
  const max = 100;
  return (
    <div className="page-enter">
      <PageHeader eyebrow={ar ? "الأشخاص / الاعتماد" : "PEOPLE / COVERAGE"}
        title={ar ? "لو غاب أحدهم غداً، من يعرف كيف يُنجَز عمله؟" : "If someone is out tomorrow, who knows how to do their work?"}
        hint={ar ? "كل إجراءٍ يحمله شخصٌ واحد مخاطرة. أسند زميلاً بديلاً لكل مهارة، وتابع الغطاء يوماً بيوم." : "Every procedure held by one person is a risk. Assign a backup for each skill and track coverage over time."} />
      <div className="people-layout">
        <section className="surface-strong people-score">
          <Users aria-hidden="true" />
          <strong>{coverage?.score == null ? "—" : `${coverage.score}%`}</strong>
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
                <div><AlertTriangle aria-hidden="true" /><span><strong>{point.name}</strong><small>{ar ? `يحملها: ${point.ownerName}` : `Held by: ${point.ownerName}`}</small></span></div>
                {canAssign && <BackupForm skillId={point.id} ar={ar} onAssigned={assigned} notify={notify} />}
              </li>
            ))}
          </ul>
        </section>
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
      </div>
    </div>
  );
}
