import React,{useEffect,useRef,useState} from "react";
import { Bot, CreditCard, FileUp, RotateCcw, Send, ShieldCheck, UserRound } from "lucide-react";
import { PageHeader } from "../Primitives";

type SimMessage={id:string;sender:"customer"|"ai"|"system";text:string;timestamp:string;cardType?:string;metadata?:Record<string,any>};
export type SimulatorState={step:string;messages:SimMessage[];requiresManagerApproval?:boolean;approvalStatus?:string;civilIdVerified?:boolean;stages?:string[];stage?:number;samplePrompts?:string[];orgName?:string;approvalId?:string};
type Props={lang:"ar"|"en";state:SimulatorState;busy:boolean;onSend:(text:string)=>void;onReset:()=>void;onUpload:()=>void;onOpenApproval:()=>void};
export function SimulatorView({lang,state,busy,onSend,onReset,onUpload,onOpenApproval}:Props){
  const ar=lang==="ar"; const [text,setText]=useState(""); const end=useRef<HTMLDivElement|null>(null); useEffect(()=>end.current?.scrollIntoView({behavior:"smooth"}),[state.messages.length]);
  const send=()=>{if(!text.trim()||busy)return;onSend(text.trim());setText("")};
  /* مراحل السير من حزمة القطاع؛ والتعليم على سيره المكتوب. */
  const ladder=state.stages?.length?state.stages:(ar?["النيّة","الصف","المقعد","المستند","الزيارة","الاعتماد","تم"]:["intent","grade","seat","document","visit","approval","done"]);
  const current=state.stages?.length?(state.stage??0):stepIndex(state.step);
  return <div className="page-enter">
    <PageHeader eyebrow="CHANNEL / SIMULATOR" title={ar?"العميل لا يرى نهج. يرى مؤسستك.":"The customer sees your organization — not NAHJ."} hint={ar?"محاكاة لقناة التواصل مع عملائك (مثل واتساب) — جرّب رسالةً وشاهد كيف يردّ ومتى يطلب موافقتك.":"A safe simulation of your customer channel (e.g. WhatsApp)."}/>
    <div className="sim-layout">
      <section className="phone-stage surface">
        <div className="phone-shell">
          <div className="phone-top"><span><b>{state.orgName||(ar?"مؤسستك":"Your organization")}</b><small><i/> {ar?"متصل":"online"}</small></span><button onClick={onReset} aria-label={ar?"محادثة جديدة":"New conversation"} title={ar?"محادثة جديدة":"New conversation"}><RotateCcw/></button></div>
          <div className="phone-feed">{state.messages.map(m=><div key={m.id} className={`bubble-row ${m.sender}`}><span>{m.sender==="customer"?<UserRound/>:<Bot/>}</span><div className="bubble"><p>{m.text}</p>{m.cardType==="document_request"&&<button onClick={onUpload}><FileUp/>{ar?"رفع المستند":"Upload document"}</button>}{m.metadata?.paymentUrl&&<button><CreditCard/>{ar?"الدفع":"Pay"}</button>}</div></div>)}{busy&&<div className="typing"><i/><i/><i/></div>}<div ref={end}/></div>
          {!!state.samplePrompts?.length&&state.messages.filter(m=>m.sender==="customer").length===0&&<div className="sim-prompts" aria-label={ar?"جرّب إحدى هذه الرسائل":"Try one of these"}>{state.samplePrompts.map(p=><button key={p} disabled={busy} onClick={()=>onSend(p)}>{p}</button>)}</div>}
          <div className="phone-compose"><input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")send()}} placeholder={ar?"اكتب رسالة...":"Message..."}/><button onClick={send}><Send/></button></div>
        </div>
      </section>
      <aside className="sim-trace surface-strong">
        <div className="trace-orb"><Bot/></div>
        <strong>{ladder[Math.min(current,ladder.length-1)]}</strong><span>{ar?"مرحلة المحادثة":"conversation stage"}</span>
        <div className="trace-ladder">{ladder.map((s,i)=><div key={s} className={i<=current?"done":""}><i>{i<current?"✓":i===current?"●":""}</i><small>{s}</small></div>)}</div>
        {state.approvalStatus==="rejected"&&<p className="sim-note">{ar?"رُفض الطلب وأُعيد إلى الموظف المختص.":"Rejected and returned to staff."}</p>}
        <p className="sim-note">{ar?"اكتب كما يكتب عميلك. حين يبلغ الطلب قراراً حسّاساً يتوقّف نهج ويطلب موافقتك — افتح بوابة القرار واعتمده أو ارفضه.":"Write as your customer would. At a sensitive decision NAHJ stops and asks for your approval."}</p>
        {state.requiresManagerApproval&&state.approvalStatus==="pending"&&<button className="approval-cta mt-auto" onClick={onOpenApproval}><ShieldCheck/>{ar?"افتح بوابة القرار":"Open approval gate"}</button>}
      </aside>
    </div>
  </div>
}
function stepIndex(step:string){const map:Record<string,number>={initial:0,age_asked:1,grade_confirmed:2,doc_requested:3,approval_triggered:5,completed:6};return map[step]??0}
