import React,{useMemo,useState} from "react";
import { Bot, Hand, PauseCircle, Play, ShieldAlert, UserRound, Waypoints } from "lucide-react";
import type { WorkItem } from "../../types";
import { PageHeader, SectionTitle } from "../Primitives";
import { WorkRiver } from "../Visuals";

type Props={lang:"ar"|"en";items:WorkItem[];onTakeOver:(id:string)=>void;onResume:(id:string)=>void;onApproval:(id:string)=>void;approvalByWork:Record<string,string>};
export function WorkView({lang,items,onTakeOver,onResume,onApproval,approvalByWork}:Props){
  const ar=lang==="ar"; const [selectedId,setSelectedId]=useState(items[0]?.id||""); const item=useMemo(()=>items.find(w=>w.id===selectedId)||items[0],[items,selectedId]);
  return <div className="page-enter">
    <PageHeader eyebrow={ar?"العمل / مباشر":"WORK / LIVE"} title={ar?"العمل يتحرك أمامك.":"Watch the work move."} hint={ar?"كل حالة لها مسار، قرار، مصدر، وإنسان يستطيع الاستلام فورًا.":"Every case has a path, evidence, and a human takeover switch."}/>
    <div className="work-layout">
      <section className="work-queue surface">
        <SectionTitle title={ar?"الجاري":"Live"} meta={`${items.filter(i=>i.state!=="completed").length}`}/>
        <div className="work-queue-list">{items.map(w=><button key={w.id} className={`queue-card ${item?.id===w.id?"selected":""}`} onClick={()=>setSelectedId(w.id)}>
          <div><span className={`risk-dot risk-${w.riskLevel}`}/><b>{w.code}</b><em>{w.assignedMode==="ai"?<Bot/>:<UserRound/>}</em></div>
          <strong>{w.details?.studentName||w.contactName}</strong><small>{w.currentStepTitle}</small>
          <WorkRiver progress={w.progressPercent} risk={w.riskLevel}/>
        </button>)}</div>
      </section>
      {item&&<section className="work-focus surface-strong">
        <div className="work-focus-top"><div><em>{item.code}</em><h2>{item.details?.studentName||item.contactName}</h2><span>{item.skillName}</span></div><div className={`mode-orb ${item.assignedMode}`}><span>{item.assignedMode==="ai"?<Bot/>:<UserRound/>}</span><small>{item.assignedMode==="ai"?(ar?"نهج":"AI"):(ar?"موظف":"HUMAN")}</small></div></div>
        <div className="work-focus-river"><WorkRiver progress={item.progressPercent} risk={item.riskLevel}/><strong>{item.progressPercent}%</strong></div>
        <div className="work-now"><Waypoints/><span><small>{ar?"الآن":"NOW"}</small><strong>{item.currentStepTitle}</strong></span></div>
        <div className="timeline-minimal">{item.timeline.slice(0,5).map((t,i)=><div key={`${t.time}-${i}`}><span className={t.actor}><i>{t.actor==="ai"?<Bot/>:t.actor==="human"?<UserRound/>:<Waypoints/>}</i></span><section><b>{t.title}</b><small>{t.time}</small></section></div>)}</div>
        <div className="work-actions">
          {approvalByWork[item.id]&&<button className="approval-cta" onClick={()=>onApproval(approvalByWork[item.id])}><ShieldAlert/>{ar?"قرار مطلوب":"Decision required"}</button>}
          {item.assignedMode==="ai"?<button className="human-cta" onClick={()=>onTakeOver(item.id)}><Hand/>{ar?"استلم":"Take over"}</button>:<button className="ai-cta" onClick={()=>onResume(item.id)}><Play/>{ar?"أعد نهج":"Resume AI"}</button>}
        </div>
      </section>}
    </div>
  </div>
}
