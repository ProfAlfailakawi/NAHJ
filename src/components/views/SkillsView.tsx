import React,{useMemo,useState} from "react";
import { AlertTriangle, ArrowDownToLine, BrainCircuit, CirclePause, History, ShieldCheck, Sparkles, Zap } from "lucide-react";
import type { AutonomyLevel, Skill } from "../../types";
import { PageHeader, SectionTitle } from "../Primitives";
import { SkillRunway } from "../Visuals";

type Props={lang:"ar"|"en";skills:Skill[];onPromote:(id:string,l:AutonomyLevel)=>void;onRollback:(id:string,v:number)=>void;onToggleKill:(id:string)=>void};
const stages=["Observe","Practice","Shadow","Suggest","Prepare","Approval","Autopilot"];

export function SkillsView({lang,skills,onPromote,onRollback,onToggleKill}:Props){
  const ar=lang==="ar"; const [selected,setSelected]=useState(skills[0]?.id||"");
  const skill=useMemo(()=>skills.find(s=>s.id===selected)||skills[0],[skills,selected]);
  return <div className="page-enter">
    <PageHeader eyebrow="SKILLS / MEMORY" title={ar?"كل ما تعرفه المؤسسة.":"What the organization knows how to do."} hint={ar?"المهارة ليست Prompt؛ هي خطوات وقواعد واستثناءات واختبارات وتاريخ.":"A skill is verified operational memory — not a prompt."}/>
    <div className="skills-layout">
      <section className="skills-map surface">
        <div className="skills-axis"><span>{ar?"يشاهد":"Observe"}</span><span>{ar?"يتدرّب":"Practice"}</span><span>{ar?"ظل":"Shadow"}</span><span>{ar?"يقترح":"Suggest"}</span><span>{ar?"يجهّز":"Prepare"}</span><span>{ar?"بموافقة":"Approval"}</span><span>{ar?"ذاتي":"Auto"}</span></div>
        <div className="skills-lanes">
          {skills.map(s=><button key={s.id} className={`skill-lane ${skill?.id===s.id?"selected":""}`} onClick={()=>setSelected(s.id)}>
            <div className="skill-lane-head"><span className={`skill-glyph risk-${s.riskLevel}`}><BrainCircuit/></span><div><strong>{ar?s.name:s.nameEn}</strong><small>{s.category}</small></div><b>{s.reliabilityScore}%</b></div>
            <SkillRunway level={s.autonomyLevel} reliability={s.reliabilityScore}/>
          </button>)}
        </div>
      </section>
      {skill&&<aside className="skill-inspector surface-strong">
        <div className="inspector-hero"><span className={`skill-glyph large risk-${skill.riskLevel}`}><BrainCircuit/></span><div><em>{skill.status.toUpperCase()}</em><strong>{ar?skill.name:skill.nameEn}</strong><small>v{skill.activeVersion} · {skill.ownerName}</small></div></div>
        <div className="reliability-orb" style={{"--value":`${skill.reliabilityScore}%`} as React.CSSProperties}><strong>{skill.reliabilityScore}%</strong><span>{ar?"موثوقية":"reliability"}</span></div>
        <SectionTitle title={ar?"الاستقلالية":"Autonomy"} meta={`${skill.autonomyLevel}/6`}/>
        <div className="autonomy-chooser">{stages.map((st,i)=><button key={st} className={i===skill.autonomyLevel?"active":""} disabled={i>6} onClick={()=>onPromote(skill.id,i as AutonomyLevel)} title={st}>{i<skill.autonomyLevel?<span>✓</span>:i===skill.autonomyLevel?<span>●</span>:<span/>}<small>{i}</small></button>)}</div>
        <div className="skill-mini-metrics"><div><strong>{skill.usageCount}</strong><span>{ar?"تشغيل":"runs"}</span></div><div><strong>{skill.successRate}%</strong><span>{ar?"نجاح":"success"}</span></div><div><strong>{skill.hoursSavedTotal}h</strong><span>{ar?"وقت":"saved"}</span></div></div>
        <div className="skill-alerts">{skill.isSinglePointOfFailure&&<div><AlertTriangle/><span>{ar?"تعتمد على شخص واحد":"Single-person dependency"}</span></div>}{skill.killSwitchActive&&<div className="danger"><CirclePause/><span>{ar?"المهارة متوقفة":"Skill paused"}</span></div>}</div>
        <div className="inspector-actions"><button onClick={()=>onToggleKill(skill.id)} className={skill.killSwitchActive?"resume":"danger"}>{skill.killSwitchActive?<Zap/>:<CirclePause/>}{skill.killSwitchActive?(ar?"استئناف":"Resume"):(ar?"إيقاف":"Pause")}</button>{skill.activeVersion>1&&<button onClick={()=>onRollback(skill.id,skill.activeVersion-1)}><History/>{ar?"رجوع":"Rollback"}</button>}</div>
      </aside>}
    </div>
  </div>
}
