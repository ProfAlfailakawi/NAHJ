import React,{useEffect,useState} from "react";
import { AudioLines, Check, CircleStop, FileCheck2, GraduationCap, Mic, Mic2, MicOff, Plus, Sparkles, WandSparkles } from "lucide-react";
import { useDictation } from "../../lib/dictation";
import type { SkillStep } from "../../types";
import { apiOrNull } from "../../lib/api";
import { PageHeader } from "../Primitives";
import { TeachStageVisual } from "../Visuals";

type EventRow={id:string;time:string;action:string;system:string;note?:string};
type Synthesis={steps:SkillStep[];rules:string[];questions:{id:string;question:string;answered?:boolean}[]};
type Props={lang:"ar"|"en";onSkillCodified:(skill?:unknown)=>void;onNotify:(message:string)=>void};

/*
 * المثال الأول يأتي من قطاع المؤسسة (`/teach/sample`) — لا من مدرسةٍ مكتوبة هنا.
 * كانت الشاشة تبدأ بـ«تسجيل طالب جديد — KG» في عيادةٍ ومكتب محاماة.
 */
export function TeachView({lang,onSkillCodified,onNotify}:Props){
  const ar=lang==="ar";
  const [title,setTitle]=useState("");
  const [events,setEvents]=useState<EventRow[]>([]);
  const [sessionId,setSessionId]=useState<string|null>(null);
  const [recording,setRecording]=useState(false);
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState<Synthesis|null>(null);
  const [answers,setAnswers]=useState<Record<string,string>>({});
  const [newAction,setNewAction]=useState("");
  const [codified,setCodified]=useState(false);
  /* الإملاء: إلى أي خطوة يُكتب النص؟ null ⇒ خطوة جديدة من الكلام نفسه. */
  const dictation=useDictation("ar-KW");
  const [dictateTarget,setDictateTarget]=useState<string|null>(null);
  const setNote=(id:string,note:string)=>setEvents(v=>v.map(e=>e.id===id?{...e,note}:e));
  const toggleDictation=(target:string|null)=>{
    if(dictation.listening){dictation.stop();return}
    setDictateTarget(target);
    dictation.start(text=>{
      if(!text)return;
      if(target)setEvents(v=>v.map(e=>e.id===target?{...e,note:e.note?`${e.note} ${text}`:text}:e));
      else setNewAction(current=>current?`${current} ${text}`:text);
    });
  };

  useEffect(()=>{
    let alive=true;
    void apiOrNull<{title:string;events:{action:string;system:string;note?:string}[]}>("/teach/sample").then(sample=>{
      if(!alive||!sample)return;
      setTitle(current=>current||sample.title);
      setEvents(current=>current.length?current:sample.events.map((e,i)=>({id:`sample_${i}`,time:"",action:e.action,system:e.system,note:e.note})));
    });
    return ()=>{alive=false};
  },[]);

  const ensureSession=async()=>{
    if(sessionId)return sessionId;
    const data=await apiOrNull<{success:boolean;session:{id:string}}>("/teach/start",{method:"POST",body:JSON.stringify({title})});
    const id=data?.session?.id || `local_${Date.now()}`;
    setSessionId(id); return id;
  };

  const toggleRecording=async()=>{
    if(!recording){await ensureSession();setRecording(true);onNotify(ar?"بدأت جلسة التعليم المصرّح بها":"Authorized teaching session started");}
    else setRecording(false);
  };

  const addEvent=async()=>{
    if(!newAction.trim())return;
    const id=await ensureSession();
    const ev:EventRow={id:`ev_${Date.now()}`,time:new Date().toLocaleTimeString("ar-KW",{hour:"2-digit",minute:"2-digit"}),action:newAction,system:ar?"يدوي":"Manual"};
    setEvents(v=>[...v,ev]); setNewAction("");
    if(!id.startsWith("local_")) await apiOrNull("/teach/record-event",{method:"POST",body:JSON.stringify({sessionId:id,action:ev.action,system:ev.system})});
  };

  const synthesize=async()=>{
    setBusy(true);
    const id=await ensureSession();
    if(!id.startsWith("local_")){
      for(const ev of events){await apiOrNull("/teach/record-event",{method:"POST",body:JSON.stringify({sessionId:id,action:ev.action,system:ev.system,voiceNote:ev.note})});}
    }
    const data=await apiOrNull<{steps:SkillStep[];rules:string[];questions:{id:string;question:string}[]}>("/teach/synthesize",{method:"POST",body:JSON.stringify({sessionId:id})});
    setRecording(false);setBusy(false);
    /* لا مهارةٌ بديلة مكتوبة سلفاً حين يفشل الاستخلاص — يُقال إنه فشل. */
    if(!data||!Array.isArray(data.steps)){onNotify(ar?"تعذّر استخلاص المهارة — أضف خطوات أوضح وحاول مجدداً":"Could not synthesize — add clearer steps and retry");return;}
    setResult({steps:data.steps,rules:data.rules||[],questions:data.questions||[]});
    onNotify(ar?"نهج استخلص المهارة ووجد أسئلة قبل الاعتماد":"NAHJ synthesized the skill and found open questions");
  };

  const codify=async()=>{
    setBusy(true);
    const data=await apiOrNull<{success:boolean;skill?:unknown}>("/teach/codify",{method:"POST",body:JSON.stringify({sessionId,title,answers})});
    setCodified(true);setBusy(false);onSkillCodified(data?.skill);onNotify(ar?"دخلت المهارة عقل المؤسسة":"Skill added to Company Brain");
  };

  return <div className="page-enter">
    <PageHeader eyebrow={ar?"علّم / مباشر":"TEACH / LIVE"} title={ar?"ورّني كيف تسوونها.":"Show me how you do it."} hint={ar?"جلسة واضحة ومصرّح بها. نهج يلتقط المنطق، لا النقرات فقط.":"An explicit session. NAHJ learns the logic, not just the clicks."}/>
    <section className="teach-layout">
      <article className="teach-stage surface">
        <div className="teach-title-row"><input value={title} onChange={e=>setTitle(e.target.value)} placeholder={ar?"اسم العملية التي ستعلّمها":"Process name"} aria-label={ar?"اسم العملية":"Process name"}/><span><FileCheck2/>{events.length}</span></div>
        <TeachStageVisual active={recording||busy} eventCount={events.length}/>
        <div className="teach-controls">
          <button className={`record-orb ${recording?"recording":""}`} onClick={toggleRecording} aria-label={recording?(ar?"إيقاف":"Stop"):(ar?"بدء":"Start")}>{recording?<CircleStop/>:<Mic2/>}</button>
          <div className="teach-input"><input value={newAction} onChange={e=>setNewAction(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void addEvent()}} placeholder={ar?"أضف خطوة قصيرة... أو أملِها بصوتك":"Add a step... or dictate it"} aria-label={ar?"خطوة جديدة":"New step"}/>
            {dictation.supported&&<button type="button" className={dictation.listening&&dictateTarget===null?"dictating":""} onClick={()=>toggleDictation(null)} aria-pressed={dictation.listening&&dictateTarget===null} aria-label={dictation.listening&&dictateTarget===null?(ar?"أوقف الإملاء":"Stop dictation"):(ar?"أملِ الخطوة بصوتك (عربي كويتي)":"Dictate the step (Kuwaiti Arabic)")}>{dictation.listening&&dictateTarget===null?<MicOff/>:<Mic/>}</button>}
            <button type="button" onClick={()=>void addEvent()} aria-label={ar?"إضافة":"Add"}><Plus/></button></div>
          <button className="synthesize-button" disabled={busy} onClick={()=>void synthesize()}><WandSparkles/>{busy?(ar?"يفهم...":"Learning..."):(ar?"استخلص المهارة":"Synthesize")}</button>
        </div>
      </article>

      <article className="teach-capture surface-strong">
        {!result?<>
          <div className="capture-head"><span>{ar?"الالتقاط المباشر":"LIVE CAPTURE"}</span><b>{events.length}</b></div>
          {dictation.listening&&<p className="dictation-live" role="status" aria-live="polite"><AudioLines aria-hidden="true"/>{dictation.interim||(ar?"أستمع…":"Listening…")}</p>}
          {dictation.error&&dictation.error!=="aborted"&&<p className="dictation-error" role="alert">{dictation.error==="not-allowed"?(ar?"لم يُسمح باستخدام الميكروفون.":"Microphone permission denied."):(ar?"تعذّر الإملاء الصوتي — اكتب الخطوة بدلاً منه.":"Dictation failed — type the step instead.")}</p>}
          <div className="capture-timeline">{events.map((e,i)=><div key={e.id}><i>{i+1}</i><span><strong>{e.action}</strong><small>{e.system}</small>
            <label className="transcript-edit"><span className="sr-only">{ar?`شرح الخطوة ${i+1}`:`Step ${i+1} explanation`}</span>
              <textarea rows={1} value={e.note||""} onChange={ev=>setNote(e.id,ev.target.value)} placeholder={ar?"اشرح لماذا — بالكتابة أو بالصوت":"Explain why — type or speak"}/></label>
            {dictation.supported&&<button type="button" className={`transcript-mic ${dictation.listening&&dictateTarget===e.id?"dictating":""}`} onClick={()=>toggleDictation(e.id)} aria-pressed={dictation.listening&&dictateTarget===e.id} aria-label={dictation.listening&&dictateTarget===e.id?(ar?"أوقف الإملاء":"Stop dictation"):(ar?`أملِ شرح الخطوة ${i+1}`:`Dictate step ${i+1} explanation`)}>{dictation.listening&&dictateTarget===e.id?<MicOff/>:<Mic/>}</button>}
          </span></div>)}</div>
        </>:<>
          <div className="synthesis-wow"><Sparkles/><span><em>{ar?"تعلّمت مهارة":"NEW SKILL"}</em><strong>{title}</strong></span></div>
          <div className="skill-fingerprint">
            <div>{result.steps.map((s,i)=><span key={s.id} title={s.title}><i>{i+1}</i></span>)}</div>
            <strong>{result.steps.length}</strong><small>{ar?"خطوات":"steps"}</small>
          </div>
          <div className="rule-dots">{result.rules.map((r,i)=><span key={i} title={r}/>)}</div>
          <div className="teach-questions">{result.questions.map(q=><label key={q.id}><span>{q.question}</span><input value={answers[q.id]||""} onChange={e=>setAnswers(v=>({...v,[q.id]:e.target.value}))} placeholder={ar?"الإجابة المعتمدة":"Verified answer"}/></label>)}</div>
          <button className="btn-primary w-full" disabled={busy||codified} onClick={()=>void codify()}>{codified?<Check/>:<GraduationCap/>}{codified?(ar?"دخلت عقل المؤسسة":"Added to Company Brain"):(ar?"اعتمد المهارة":"Approve & codify")}</button>
        </>}
      </article>
    </section>
  </div>
}
