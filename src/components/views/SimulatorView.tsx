import React,{useEffect,useRef,useState} from "react";
import { Bot, CreditCard, FileUp, RotateCcw, Send, ShieldCheck, UserRound } from "lucide-react";
import { PageHeader } from "../Primitives";

type SimMessage={id:string;sender:"customer"|"ai"|"system";text:string;timestamp:string;cardType?:string;metadata?:Record<string,any>};
export type SimulatorState={step:string;messages:SimMessage[];requiresManagerApproval?:boolean;approvalStatus?:string;civilIdVerified?:boolean};
type Props={lang:"ar"|"en";state:SimulatorState;busy:boolean;onSend:(text:string)=>void;onReset:()=>void;onUpload:()=>void;onOpenApproval:()=>void};
export function SimulatorView({lang,state,busy,onSend,onReset,onUpload,onOpenApproval}:Props){
  const ar=lang==="ar"; const [text,setText]=useState(""); const end=useRef<HTMLDivElement|null>(null); useEffect(()=>end.current?.scrollIntoView({behavior:"smooth"}),[state.messages.length]);
  const send=()=>{if(!text.trim()||busy)return;onSend(text.trim());setText("")};
  return <div className="page-enter">
    <PageHeader eyebrow="CHANNEL / SIMULATOR" title={ar?"العميل لا يرى نهج. يرى مؤسستك.":"The customer sees your organization — not NAHJ."} hint={ar?"هذه محاكاة للقناة الخارجية قبل ربط WhatsApp الحقيقي.":"A safe channel simulation before real WhatsApp."}/>
    <div className="sim-layout">
      <section className="phone-stage surface">
        <div className="phone-shell">
          <div className="phone-top"><span><b>Future Academy</b><small><i/> online</small></span><button onClick={onReset}><RotateCcw/></button></div>
          <div className="phone-feed">{state.messages.map(m=><div key={m.id} className={`bubble-row ${m.sender}`}><span>{m.sender==="customer"?<UserRound/>:<Bot/>}</span><div className="bubble"><p>{m.text}</p>{m.cardType==="document_request"&&<button onClick={onUpload}><FileUp/>{ar?"رفع البطاقة":"Upload ID"}</button>}{m.metadata?.paymentUrl&&<button><CreditCard/>{ar?"الدفع":"Pay"}</button>}</div></div>)}{busy&&<div className="typing"><i/><i/><i/></div>}<div ref={end}/></div>
          <div className="phone-compose"><input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")send()}} placeholder={ar?"اكتب رسالة...":"Message..."}/><button onClick={send}><Send/></button></div>
        </div>
      </section>
      <aside className="sim-trace surface-strong">
        <div className="trace-orb"><Bot/></div>
        <strong>{state.step}</strong><span>{ar?"حالة العملية":"process state"}</span>
        <div className="trace-ladder">{["intent","grade","seat","document","visit","approval","done"].map((s,i)=><div key={s} className={i<=stepIndex(state.step)?"done":""}><i>{i<stepIndex(state.step)?"✓":i===stepIndex(state.step)?"●":""}</i><small>{s}</small></div>)}</div>
        {state.requiresManagerApproval&&state.approvalStatus==="pending"&&<button className="approval-cta mt-auto" onClick={onOpenApproval}><ShieldCheck/>{ar?"افتح بوابة القرار":"Open approval gate"}</button>}
      </aside>
    </div>
  </div>
}
function stepIndex(step:string){const map:Record<string,number>={initial:0,age_asked:1,grade_confirmed:2,doc_requested:3,approval_triggered:5,completed:6};return map[step]??0}
