import React,{useMemo,useState} from "react";
import { Bot, Hand, PauseCircle, Play, ShieldAlert, UserRound, Waypoints } from "lucide-react";
import type { WorkItem } from "../../types";
import { Dt, PageHeader, SectionTitle } from "../Primitives";
import { DnaStepper, DnaTimeline, type DnaStep } from "../dna";
import { workStatePlain } from "../../lib/glossary";
import { timelineBadgeLabel, dataText } from "../../lib/labels";

const WORK_FLOW=["queued","collecting_data","waiting_documents","waiting_approval","executing","completed"];
const EN_STATE={done:"done",current:"current",pending:"upcoming",returned:"returned",blocked:"blocked"};
export const workStepText=(ar:boolean)=>ar?undefined:EN_STATE;
/** مراحل الحالة من `state` وحده؛ «رُفعت» تُرسم عقدةً مُرجَعة. */
export function workSteps(state:string,ar:boolean):DnaStep[]{
  const label=(st:string)=>workStatePlain(st, ar);
  if(state==="escalated")return [
    {key:"queued",label:label("queued"),state:"done"},
    {key:"escalated",label:label("escalated"),state:"returned"},
    {key:"completed",label:label("completed"),state:"pending"},
  ];
  const at=WORK_FLOW.indexOf(state);
  return WORK_FLOW.map((st,i)=>({key:st,label:label(st),state:i<at||(state==="completed"&&i===at)?"done":i===at?"current":"pending"}));
}

type Props={lang:"ar"|"en";items:WorkItem[];onTakeOver:(id:string)=>void;onResume:(id:string)=>void;onApproval:(id:string)=>void;approvalByWork:Record<string,string>};
export function WorkView({lang,items,onTakeOver,onResume,onApproval,approvalByWork}:Props){
  const ar=lang==="ar"; const [selectedId,setSelectedId]=useState(items[0]?.id||""); const item=useMemo(()=>items.find(w=>w.id===selectedId)||items[0],[items,selectedId]);
  /* مئة حالة وأكثر في عمودٍ واحد تُضيّع المهمّ: مرشّحٌ سريع ودفعاتٌ تُفتح بزرّ. */
  const [filter,setFilter]=useState<"all"|"live"|"approval"|"done">("all"); const [shown,setShown]=useState(24);
  const matches=(w:WorkItem)=>filter==="all"||(filter==="live"?w.state!=="completed"&&w.state!=="waiting_approval":filter==="approval"?w.state==="waiting_approval"||w.state==="escalated":w.state==="completed");
  const filtered=useMemo(()=>items.filter(matches),[items,filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts={all:items.length,live:items.filter(w=>w.state!=="completed"&&w.state!=="waiting_approval").length,approval:items.filter(w=>w.state==="waiting_approval"||w.state==="escalated").length,done:items.filter(w=>w.state==="completed").length};
  const tabs:[typeof filter,string][]=[["all",ar?"الكل":"All"],["live",ar?"جارية":"Running"],["approval",ar?"تحتاج قراراً":"Needs a decision"],["done",ar?"مكتملة":"Completed"]];
  return <div className="page-enter">
    <PageHeader eyebrow={ar?"العمل / مباشر":"WORK / LIVE"} title={ar?"العمل يتحرك أمامك.":"Watch the work move."} hint={ar?"كل حالة لها مسار، قرار، مصدر، وإنسان يستطيع الاستلام فورًا.":"Every case has a path, evidence, and a human takeover switch."}/>
    <div className="work-layout">
      <section className="work-queue surface">
        <SectionTitle title={ar?"الجاري":"Live"} meta={`${items.filter(i=>i.state!=="completed").length}`}/>
        <div className="work-filters" role="tablist" aria-label={ar?"تصفية الحالات":"Filter cases"}>{tabs.map(([key,label])=><button key={key} type="button" role="tab" aria-selected={filter===key} className={filter===key?"active":""} onClick={()=>{setFilter(key);setShown(24)}}>{label}<b>{counts[key]}</b></button>)}</div>
        <div className="work-queue-list">{filtered.slice(0,shown).map(w=><button key={w.id} className={`queue-card ${item?.id===w.id?"selected":""}`} onClick={()=>{setSelectedId(w.id);
          /* على الهاتف تقع اللوحة تحت قائمةٍ طويلة: يُنقل إليها المستخدم بدل أن يبحث عنها. */
          if(window.matchMedia("(max-width:1180px)").matches)requestAnimationFrame(()=>document.querySelector(".work-focus")?.scrollIntoView({behavior:"smooth",block:"start"}))}}>
          <div><span className={`risk-dot risk-${w.riskLevel}`}/><b>{w.code}</b><em>{w.assignedMode==="ai"?<Bot/>:<UserRound/>}</em></div>
          <strong>{w.details?.studentName||w.contactName}</strong><small><Dt t={w.currentStepTitle} ar={ar}/></small>
          <DnaStepper size="xs" steps={workSteps(w.state,ar)} stateText={workStepText(ar)} ariaLabel={workStatePlain(w.state, ar)}/>
        </button>)}</div>
        {filtered.length>shown&&<button type="button" className="btn-secondary work-more" onClick={()=>setShown(v=>v+24)}>{ar?`عرض ${Math.min(24,filtered.length-shown)} حالة أخرى من ${filtered.length-shown}`:`Show ${Math.min(24,filtered.length-shown)} more of ${filtered.length-shown}`}</button>}
        {filtered.length===0&&<p className="decision-muted">{ar?"لا حالات في هذا التصنيف.":"No cases in this group."}</p>}
      </section>
      {item&&<section className="work-focus surface-strong">
        <div className="work-focus-top"><div><em>{item.code}</em><h2>{item.details?.studentName||item.contactName}</h2><span><Dt t={item.skillName} ar={ar}/></span></div><div className={`mode-orb ${item.assignedMode}`}><span>{item.assignedMode==="ai"?<Bot/>:<UserRound/>}</span><small>{item.assignedMode==="ai"?(ar?"نهج":"AI"):(ar?"موظف":"HUMAN")}</small></div></div>
        <div className="work-focus-river"><DnaStepper size="sm" steps={workSteps(item.state,ar)} stateText={workStepText(ar)} ariaLabel={ar?"مراحل الحالة":"Case stages"}/><strong>{item.progressPercent}%</strong></div>
        <div className="work-now"><Waypoints/><span><small>{ar?"الآن":"NOW"}</small><strong><Dt t={item.currentStepTitle} ar={ar}/></strong></span></div>
        <DnaTimeline className="work-timeline" ariaLabel={ar?"سجل الحالة":"Case timeline"} wrapMeta items={item.timeline.slice(0,5).map((t,i)=>({key:`${t.time}-${i}`,
          icon:t.actor==="ai"?<Bot/>:t.actor==="human"?<UserRound/>:<Waypoints/>,tone:t.actor==="ai"?"accent":t.actor==="human"?"sky":"neutral",
          title:<><Dt t={t.title} ar={ar}/>{t.badge&&<span className="work-tl-badge" title={t.badge}>{timelineBadgeLabel(t.badge,ar)}</span>}</>,date:t.time,meta:t.details?dataText(t.details,ar):undefined}))}/>
        <div className="work-actions">
          {approvalByWork[item.id]&&<button className="approval-cta" onClick={()=>onApproval(approvalByWork[item.id])}><ShieldAlert/>{ar?"قرار مطلوب":"Decision required"}</button>}
          {item.assignedMode==="ai"?<button className="human-cta" onClick={()=>onTakeOver(item.id)}><Hand/>{ar?"استلم":"Take over"}</button>:<button className="ai-cta" onClick={()=>onResume(item.id)}><Play/>{ar?"أعد نهج":"Resume AI"}</button>}
        </div>
      </section>}
    </div>
  </div>
}
