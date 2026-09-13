import React from "react";
import { AlertTriangle, FileClock, Lightbulb, Route, Sparkles, UserRoundCheck } from "lucide-react";
import type { LearningProposal } from "../../types";
import { EvidenceSplit, LearningLens } from "../Visuals";
import { PageHeader, SectionTitle } from "../Primitives";

type Props={lang:"ar"|"en";proposals:LearningProposal[];onResolve:(proposalId:string,clarificationId:string,answer:string)=>void};

const meta={
  new_skill:{icon:Sparkles,tone:"moss",label:"SKILL"},
  conflict:{icon:AlertTriangle,tone:"amber",label:"CONFLICT"},
  process_drift:{icon:Route,tone:"rose",label:"DRIFT"},
  improvement:{icon:Lightbulb,tone:"sky",label:"BETTER"},
  single_person_risk:{icon:UserRoundCheck,tone:"violet",label:"RISK"},
  outdated_source:{icon:FileClock,tone:"amber",label:"STALE"},
} as const;

export function LearnView({lang,proposals,onResolve}:Props){
  const ar=lang==="ar"; const open=proposals.filter(p=>p.status==="pending");
  return <div className="page-enter">
    <PageHeader eyebrow="LEARN / SIGNALS" title={ar?"نهج لاحظ شيئًا.":"NAHJ noticed something."} hint={ar?"المشاهدة ليست حقيقة. أنت من يحوّلها إلى معرفة معتمدة.":"Observation becomes truth only after review."}/>
    <div className="learn-layout">
      <aside className="learn-radar surface">
        <LearningLens progress={76}/>
        <div className="learn-radar-caption"><strong>76%</strong><span>{ar?"من العمل معروف":"work mapped"}</span></div>
        <div className="signal-quads">
          <Mini value={open.length} label={ar?"بانتظارك":"OPEN"}/><Mini value="168" label={ar?"ملاحظة":"OBSERVED"}/><Mini value="7" label={ar?"تعارض":"CONFLICT"}/><Mini value="4" label={ar?"تحسين":"BETTER"}/>
        </div>
      </aside>
      <section className="learning-feed surface-strong">
        <SectionTitle title={ar?"إشارات اليوم":"Signals"} meta={`${open.length}`}/>
        <div className="signal-list">
          {open.map((p)=>{
            const m=meta[p.type]; const Icon=m.icon; const q=p.clarifications?.find(c=>!c.selectedAnswer) || p.clarifications?.[0];
            const a=p.evidence.methodA?.percentage; const b=p.evidence.methodB?.percentage;
            return <article key={p.id} className={`signal-card tone-${m.tone}`}>
              <div className="signal-head"><span className="signal-icon"><Icon/></span><div><em>{m.label}</em><strong>{p.title}</strong></div><b>{p.observedCasesCount}</b></div>
              {(a!==undefined&&b!==undefined)&&<EvidenceSplit a={a} b={b}/>} 
              {q&&<div className="clarify-block"><p>{q.question}</p><div>{q.options.map(o=><button key={o} onClick={()=>onResolve(p.id,q.id,o)}>{o}</button>)}</div></div>}
              {!q&&p.evidence.details&&<div className="signal-note">{p.evidence.details}</div>}
            </article>
          })}
        </div>
      </section>
    </div>
  </div>
}
function Mini({value,label}:{value:string|number;label:string}){return <div className="signal-mini"><strong>{value}</strong><span>{label}</span></div>}
