import React from "react";
import { CheckCircle2, FlaskConical, GitCompareArrows, Play, ShieldCheck, XCircle } from "lucide-react";
import type { ShadowComparison, TestCase } from "../../types";
import { PageHeader, SectionTitle } from "../Primitives";

type Props={lang:"ar"|"en";cases:TestCase[];shadow:ShadowComparison[];running:boolean;shadowRunning:boolean;onRunPractice:()=>void;onRunShadow:()=>void};
export function PracticeView({lang,cases,shadow,running,shadowRunning,onRunPractice,onRunShadow}:Props){
  const ar=lang==="ar"; const passed=cases.filter(c=>c.resultStatus==="pass").length; const matched=shadow.filter(s=>s.matched).length;
  return <div className="page-enter">
    <PageHeader eyebrow="GRADUATION / EVALS" title={ar?"قبل أن يعمل… يثبت نفسه.":"Before it works, it proves itself."} hint={ar?"اختبارات ثم ظل حقيقي. الاستقلالية تُكتسب ولا تُمنح.":"Practice first. Shadow next. Autonomy is earned."}/>
    <div className="graduation-grid">
      <section className="graduation-stage surface">
        <div className="graduation-track">
          {[
            {n:"01",icon:<FlaskConical/>,label:ar?"اختبارات":"Practice",active:true},
            {n:"02",icon:<GitCompareArrows/>,label:ar?"ظل":"Shadow",active:passed===cases.length&&cases.length>0},
            {n:"03",icon:<ShieldCheck/>,label:ar?"اعتماد":"Approval",active:false},
          ].map((s,i)=><div key={i} className={s.active?"active":""}><span>{s.icon}</span><b>{s.n}</b><small>{s.label}</small></div>)}
          <i/>
        </div>
        <div className="graduation-score"><strong>{cases.length?Math.round(passed/cases.length*100):0}%</strong><span>{ar?"اجتياز":"practice pass"}</span></div>
        <button className="btn-primary" disabled={running} onClick={onRunPractice}><Play/>{running?(ar?"يختبر...":"Running..."):(ar?"شغّل الاختبارات":"Run practice")}</button>
      </section>
      <section className="eval-deck surface-strong">
        <SectionTitle title={ar?"حالات الاختبار":"Practice cases"} meta={`${passed}/${cases.length}`}/>
        <div className="eval-list">{cases.map(c=><div key={c.id} className={`eval-row ${c.resultStatus||"pending"}`}><span>{c.resultStatus==="pass"?<CheckCircle2/>:c.resultStatus==="fail"?<XCircle/>:<FlaskConical/>}</span><div><strong>{c.name}</strong><small>{c.scenario}</small></div><b>{c.executionTimeMs?`${c.executionTimeMs}ms`:"—"}</b></div>)}</div>
      </section>
      <section className="shadow-deck surface-strong">
        <div className="shadow-head"><div><em>SHADOW</em><strong>{matched}/{shadow.length}</strong></div><button className="round-action" disabled={shadowRunning} onClick={onRunShadow}><Play/></button></div>
        <div className="shadow-pairs">{shadow.map(s=><div key={s.id} className={s.matched?"match":"drift"}><span><i>H</i><small>{s.humanAction||s.humanDecision}</small></span><b>{s.matched?"=":"≠"}</b><span><i>AI</i><small>{s.aiAction||s.aiDecision}</small></span></div>)}</div>
      </section>
    </div>
  </div>
}
