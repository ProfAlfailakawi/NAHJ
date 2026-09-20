import React,{useMemo,useState} from "react";
import { AlertTriangle, ArrowDownToLine, BrainCircuit, CirclePause, History, ShieldCheck, Sparkles, Zap } from "lucide-react";
import type { AutonomyLevel, Skill } from "../../types";
import { PageHeader, SectionTitle } from "../Primitives";
import { SkillRunway } from "../Visuals";
import { AutonomyBadge, Term } from "../Explain";
import { ladderStep, RISK_PLAIN, SKILL_STATUS_PLAIN } from "../../lib/glossary";

type Props={lang:"ar"|"en";skills:Skill[];onPromote:(id:string,l:AutonomyLevel)=>void;onRollback:(id:string,v:number)=>void;onToggleKill:(id:string)=>void};
const stages=["Observe","Practice","Shadow","Suggest","Prepare","Approval","Autopilot"];

export function SkillsView({lang,skills,onPromote,onRollback,onToggleKill}:Props){
  const ar=lang==="ar"; const [selected,setSelected]=useState(skills[0]?.id||"");
  const skill=useMemo(()=>skills.find(s=>s.id===selected)||skills[0],[skills,selected]);
  return <div className="page-enter">
    <PageHeader eyebrow="SKILLS / MEMORY" title={ar?"كل ما تعرفه المؤسسة.":"What the organization knows how to do."} hint={ar?"المهارة إجراءٌ من عمل مؤسستك مكتوبٌ بخطواته وقراراته واستثناءاته — لا نصُّ أمرٍ يُكتب لنموذج.":"A skill is verified operational memory — not a prompt."}/>
    <div className="skills-layout">
      <section className="skills-map surface">
        <div className="skills-axis">{stages.map((stage,i)=><span key={stage} title={ar?ladderStep(i).yourPart:stage}>{ar?ladderStep(i).plain.split(" ").slice(0,2).join(" "):stage}</span>)}</div>
        <div className="skills-lanes">
          {skills.map(s=><button key={s.id} className={`skill-lane ${skill?.id===s.id?"selected":""}`} onClick={()=>setSelected(s.id)}>
            <div className="skill-lane-head"><span className={`skill-glyph risk-${s.riskLevel}`}><BrainCircuit/></span><div><strong>{ar?s.name:s.nameEn}</strong><small>{s.category}</small></div><b>{s.reliabilityScore}%</b></div><AutonomyBadge level={s.autonomyLevel} compact/>
            <SkillRunway level={s.autonomyLevel} reliability={s.reliabilityScore}/>
          </button>)}
        </div>
      </section>
      {skill&&<aside className="skill-inspector surface-strong">
        <div className="inspector-hero"><span className={`skill-glyph large risk-${skill.riskLevel}`}><BrainCircuit/></span><div><em>{ar?(SKILL_STATUS_PLAIN[skill.status]||skill.status):skill.status.toUpperCase()}</em><strong>{ar?skill.name:skill.nameEn}</strong><small>v{skill.activeVersion} · {skill.ownerName}</small></div></div>
        <div className="reliability-orb" style={{"--value":`${skill.reliabilityScore}%`} as React.CSSProperties}><strong>{skill.reliabilityScore}%</strong><span>{ar?"موثوقية":"reliability"}</span></div>
        <SectionTitle title={ar?<Term k="autonomy">مستوى الاستقلالية</Term>:"Autonomy"} meta={`${skill.autonomyLevel}/6`}/>
        {/*
          * «L4 — Prepare» لا تقول للموظف شيئاً. الجملة تقول ماذا يفعل النظام
          * وماذا يبقى عليه هو — وهو الفرق الذي لا يُفهم من الاسمين إطلاقاً.
        */}
        <div className="autonomy-plain">
          <strong>{ladderStep(skill.autonomyLevel).plain}</strong>
          <small>{ladderStep(skill.autonomyLevel).yourPart}</small>
        </div>
        <div className="autonomy-chooser">{stages.map((st,i)=><button key={st} className={i===skill.autonomyLevel?"active":""} disabled={i>6} onClick={()=>onPromote(skill.id,i as AutonomyLevel)} title={ar?`L${i} — ${ladderStep(i).plain}: ${ladderStep(i).yourPart}`:st}>{i<skill.autonomyLevel?<span>✓</span>:i===skill.autonomyLevel?<span>●</span>:<span/>}<small>{i}</small></button>)}</div>
        <div className="skill-risk-plain" title={skill.riskLevel}>{ar?(RISK_PLAIN[skill.riskLevel]||skill.riskLevel):skill.riskLevel}</div>
        <div className="skill-mini-metrics"><div><strong>{skill.usageCount}</strong><span>{ar?"تشغيل":"runs"}</span></div><div><strong>{skill.successRate}%</strong><span>{ar?"نجاح":"success"}</span></div><div><strong>{skill.hoursSavedTotal}h</strong><span>{ar?"وقت":"saved"}</span></div></div>
        <div className="skill-alerts">{skill.isSinglePointOfFailure&&<div><AlertTriangle/><span>{ar?"تعتمد على شخص واحد":"Single-person dependency"}</span></div>}{skill.killSwitchActive&&<div className="danger"><CirclePause/><span>{ar?"المهارة متوقفة":"Skill paused"}</span></div>}</div>
        <div className="inspector-actions"><button onClick={()=>onToggleKill(skill.id)} className={skill.killSwitchActive?"resume":"danger"}>{skill.killSwitchActive?<Zap/>:<CirclePause/>}{skill.killSwitchActive?(ar?"استئناف":"Resume"):(ar?"إيقاف":"Pause")}</button>{skill.activeVersion>1&&<button onClick={()=>onRollback(skill.id,skill.activeVersion-1)}><History/>{ar?"رجوع":"Rollback"}</button>}</div>
      </aside>}
    </div>
  </div>
}
