import React,{useEffect,useId,useMemo,useState} from "react";
import { AlertTriangle, ArrowDownToLine, BrainCircuit, CirclePause, FileText, History, ShieldCheck, Sparkles, UserPlus, Zap } from "lucide-react";
import { api, ApiError, apiOrNull } from "../../lib/api";
import { Dialog } from "../Dialog";
import type { AutonomyLevel, Skill } from "../../types";
import { PageHeader, SectionTitle } from "../Primitives";
import { SkillRunway } from "../Visuals";
import { AutonomyBadge, Term } from "../Explain";
import { ladderStep, RISK_PLAIN, SKILL_STATUS_PLAIN } from "../../lib/glossary";

export type PromoteOptions={signOff?:boolean;note?:string};
type Props={lang:"ar"|"en";skills:Skill[];onPromote:(id:string,l:AutonomyLevel,options?:PromoteOptions)=>void;onRollback:(id:string,v:number)=>void;onToggleKill:(id:string)=>void;onOpenPeople?:()=>void;onSkillUpdated?:(skill:Skill)=>void;notify?:(text:string,error?:boolean)=>void};

interface PromotionReviewView{
  fromLevel:number;toLevel:number;upward:boolean;blocked:boolean;missing:string[];
  stats:{testsTotal:number;testsPassed:number;passRate:number|null;shadowCompared:number;shadowMatched:number;shadowAgreement:number|null;driftCount:number;exceptions:number};
  requirements:{key:string;met:boolean;label:string}[];
}

/*
 * مراجعة الترقية قبل الصعود على السُلّم.
 *
 * كان الضغط على رقمٍ أعلى يرفع المهارة فوراً. صار يفتح مراجعةً تعرض ما يبرّر
 * الصعود — نسبة النجاح، والتطابق في الظل، والاستثناءات — وتطلب توقيع المسؤول،
 * وتمنع الترقية حين يغيب الدليل. والخادم يفرض الشروط نفسها.
 */
function PromotionDialog({lang,skill,target,onClose,onConfirm}:{lang:"ar"|"en";skill:Skill;target:number;onClose:()=>void;onConfirm:(o:PromoteOptions)=>void}){
  const ar=lang==="ar";
  const [review,setReview]=useState<PromotionReviewView|null>(null);
  const [loading,setLoading]=useState(true);
  const [signed,setSigned]=useState(false);
  const [note,setNote]=useState("");
  const signId=useId(); const noteId=useId();
  useEffect(()=>{let alive=true;setLoading(true);
    void apiOrNull<{review:PromotionReviewView}>(`/skills/${skill.id}/promotion-review?targetLevel=${target}`).then(d=>{if(alive){setReview(d?.review||null);setLoading(false)}}).catch(()=>{if(alive)setLoading(false)});
    return()=>{alive=false}},[skill.id,target]);
  const pct=(v:number|null)=>v===null?(ar?"لا بيانات":"no data"):`${v}%`;
  const blocked=!review||review.blocked;
  return <Dialog open onClose={onClose} closeLabel={ar?"إغلاق مراجعة الترقية":"Close promotion review"} icon={<ShieldCheck/>}
    eyebrow={ar?"مراجعة الترقية":"Promotion review"}
    title={ar?`ترقية «${skill.name}» إلى L${target} — ${ladderStep(target).plain}`:`Promote “${skill.nameEn||skill.name}” to L${target}`}>
    <p className="decision-muted">{ladderStep(target).yourPart}</p>
    {loading&&<p className="decision-muted">{ar?"تُحمَّل بيانات التقييم…":"Loading evaluation data…"}</p>}
    {review&&<>
      <dl className="promotion-stats">
        <div><dt>{ar?"نجاح التدرّب":"Practice pass rate"}</dt><dd>{pct(review.stats.passRate)}<small>{review.stats.testsTotal?` ${review.stats.testsPassed}/${review.stats.testsTotal}`:""}</small></dd></div>
        <div><dt>{ar?"التطابق في الظل":"Shadow agreement"}</dt><dd>{pct(review.stats.shadowAgreement)}<small>{review.stats.shadowCompared?` ${review.stats.shadowMatched}/${review.stats.shadowCompared}`:""}</small></dd></div>
        <div><dt>{ar?"الاستثناءات الموثّقة":"Documented exceptions"}</dt><dd>{review.stats.exceptions}</dd></div>
        <div><dt>{ar?"الموثوقية":"Reliability"}</dt><dd>{skill.reliabilityScore}%</dd></div>
      </dl>
      {review.requirements.length>0&&<ul className="promotion-reqs">{review.requirements.map(r=><li key={r.key} className={r.met?"met":"unmet"}><span aria-hidden="true">{r.met?"✓":"✕"}</span>{r.label}<span className="sr-only">{r.met?(ar?" — متحقّق":" — met"):(ar?" — غير متحقّق":" — not met")}</span></li>)}</ul>}
      {review.blocked&&<p className="decision-compliance" role="alert">{ar?"الترقية ممنوعة حتى يكتمل الدليل أعلاه.":"Promotion is blocked until the evidence above is complete."}</p>}
    </>}
    <div className="signoff-row">
      <input id={signId} type="checkbox" checked={signed} onChange={e=>setSigned(e.target.checked)} disabled={blocked}/>
      <label htmlFor={signId}>{ar?"راجعتُ الأرقام أعلاه وأوقّع على هذه الترقية باسمي":"I reviewed the figures above and sign off on this promotion"}</label>
    </div>
    <div className="decision-reason">
      <label htmlFor={noteId}>{ar?"ملاحظة للسجل (اختياري)":"Note for the record (optional)"}</label>
      <textarea id={noteId} rows={2} value={note} onChange={e=>setNote(e.target.value)}/>
    </div>
    <div className="approval-actions">
      <button type="button" onClick={onClose}>{ar?"إلغاء":"Cancel"}</button>
      <button type="button" className="approve" disabled={blocked||!signed} onClick={()=>onConfirm({signOff:true,note:note.trim()})}><ShieldCheck aria-hidden="true"/>{ar?"وقّع ورقِّ":"Sign off & promote"}</button>
    </div>
  </Dialog>;
}

/*
 * دليل الإجراء: ثنائي اللغة، بالتقويم والأرقام المختارة، ومطبوعٌ موقَّع لكل إصدار.
 */
function ManualPanel({lang,skill,onSkillUpdated,notify}:{lang:"ar"|"en";skill:Skill;onSkillUpdated?:(s:Skill)=>void;notify?:(t:string,e?:boolean)=>void}){
  const ar=lang==="ar";
  const [mlang,setMlang]=useState<"ar"|"en"|"both">("ar");
  const [calendar,setCalendar]=useState<"gregorian"|"hijri">("gregorian");
  const [digits,setDigits]=useState<"arab"|"latn">("arab");
  const [version,setVersion]=useState(skill.activeVersion);
  const [signature,setSignature]=useState("");
  const [verdict,setVerdict]=useState<{valid:boolean;reason:string}|null>(null);
  const [drafts,setDrafts]=useState<Record<string,string>>({});
  const ids={lang:useId(),cal:useId(),dig:useId(),ver:useId(),sig:useId()};
  useEffect(()=>{setVersion(skill.activeVersion);setVerdict(null);setDrafts({})},[skill.id,skill.activeVersion]);
  const versions=[...new Set([skill.activeVersion,...(skill.versions||[]).map(v=>v.version)])].sort((a,b)=>b-a);
  const open=()=>{
    const url=`/api/skills/${encodeURIComponent(skill.id)}/manual?version=${version}&lang=${mlang}&calendar=${calendar}&digits=${digits}`;
    const w=window.open(url,"_blank");
    if(w)w.addEventListener("load",()=>{try{w.focus();w.print()}catch{/* الطباعة من المتصفح */}});
  };
  const verify=async(e:React.FormEvent)=>{e.preventDefault();
    const d=await apiOrNull<{valid:boolean;reason:string}>("/manuals/verify",{method:"POST",body:JSON.stringify({skillId:skill.id,version,signature})});
    setVerdict(d||{valid:false,reason:ar?"تعذّر التحقق":"Could not verify"});
  };
  const saveTranslation=async()=>{
    try{
      const d=await api<{skill:Skill}>(`/skills/${skill.id}/translation`,{method:"POST",body:JSON.stringify({steps:Object.entries(drafts).map(([id,titleEn])=>({id,titleEn}))})});
      onSkillUpdated?.(d.skill);setDrafts({});notify?.(ar?"حُفظ النص الإنجليزي":"English text saved");
    }catch(error){notify?.(error instanceof ApiError?error.message:(ar?"تعذّر الحفظ":"Could not save"),true)}
  };
  return <section className="manual-panel">
    <SectionTitle title={ar?"دليل الإجراء المطبوع":"Printable procedure manual"} meta={`v${version}`}/>
    <div className="manual-options">
      <label htmlFor={ids.ver}>{ar?"الإصدار":"Version"}</label>
      <select id={ids.ver} value={version} onChange={e=>setVersion(Number(e.target.value))}>{versions.map(v=><option key={v} value={v}>v{v}</option>)}</select>
      <label htmlFor={ids.lang}>{ar?"اللغة":"Language"}</label>
      <select id={ids.lang} value={mlang} onChange={e=>setMlang(e.target.value as any)}><option value="ar">العربية</option><option value="en">English</option><option value="both">{ar?"العربية والإنجليزية":"Arabic + English"}</option></select>
      <label htmlFor={ids.cal}>{ar?"التقويم":"Calendar"}</label>
      <select id={ids.cal} value={calendar} onChange={e=>setCalendar(e.target.value as any)}><option value="gregorian">{ar?"ميلادي":"Gregorian"}</option><option value="hijri">{ar?"هجري (أم القرى)":"Hijri (Umm al-Qura)"}</option></select>
      <label htmlFor={ids.dig}>{ar?"الأرقام":"Digits"}</label>
      <select id={ids.dig} value={digits} onChange={e=>setDigits(e.target.value as any)}><option value="arab">٠١٢٣</option><option value="latn">0123</option></select>
    </div>
    <button type="button" className="btn-secondary" onClick={open}><FileText aria-hidden="true"/>{ar?"افتح الدليل للطباعة":"Open manual to print"}</button>
    <details className="manual-translate">
      <summary>{ar?"النص الإنجليزي للخطوات":"English step text"}</summary>
      {skill.steps.map(step=>{const id=`en_${step.id}`;return <div key={step.id} className="manual-translate-row">
        <label htmlFor={id}>{step.order}. {step.title}</label>
        <input id={id} dir="ltr" lang="en" value={drafts[step.id]??step.titleEn??""} onChange={e=>setDrafts(v=>({...v,[step.id]:e.target.value}))}/>
      </div>})}
      <button type="button" className="btn-secondary" disabled={!Object.keys(drafts).length} onClick={()=>void saveTranslation()}>{ar?"احفظ":"Save"}</button>
    </details>
    <form className="manual-verify" onSubmit={verify}>
      <label htmlFor={ids.sig}>{ar?"تحقّق من توقيع دليلٍ مطبوع":"Verify a printed manual's signature"}</label>
      <input id={ids.sig} dir="ltr" value={signature} onChange={e=>setSignature(e.target.value)} placeholder="HMAC-SHA256"/>
      <button type="submit" className="btn-secondary" disabled={signature.trim().length<64}>{ar?"تحقّق":"Verify"}</button>
      {verdict&&<p role="status" className={verdict.valid?"verify-ok":"verify-bad"}>{verdict.reason}</p>}
    </form>
  </section>;
}
const stages=["Observe","Practice","Shadow","Suggest","Prepare","Approval","Autopilot"];

export function SkillsView({lang,skills,onPromote,onRollback,onToggleKill,onOpenPeople,onSkillUpdated,notify}:Props){
  const ar=lang==="ar"; const [selected,setSelected]=useState(skills[0]?.id||"");
  const [promoteTo,setPromoteTo]=useState<number|null>(null);
  const skill=useMemo(()=>skills.find(s=>s.id===selected)||skills[0],[skills,selected]);
  return <div className="page-enter">
    <PageHeader eyebrow={ar?"المهارات / الذاكرة":"SKILLS / MEMORY"} title={ar?"كل ما تعرفه المؤسسة.":"What the organization knows how to do."} hint={ar?"المهارة إجراءٌ من عمل مؤسستك مكتوبٌ بخطواته وقراراته واستثناءاته — لا نصُّ أمرٍ يُكتب لنموذج.":"A skill is verified operational memory — not a prompt."}/>
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
        <div className="autonomy-chooser" role="group" aria-label={ar?"اختر مستوى الاستقلالية":"Choose autonomy level"}>{stages.map((st,i)=>{const label=ar?`المستوى ${i}: ${ladderStep(i).plain}${i===skill.autonomyLevel?" (الحالي)":i>skill.autonomyLevel?" — يتطلب مراجعة وتوقيعاً":""}`:`Level ${i}: ${st}${i===skill.autonomyLevel?" (current)":i>skill.autonomyLevel?" — requires review and sign-off":""}`;
          return <button key={st} type="button" className={i===skill.autonomyLevel?"active":""} aria-current={i===skill.autonomyLevel?"step":undefined} aria-label={label} title={label}
            onClick={()=>{if(i===skill.autonomyLevel)return;if(i>skill.autonomyLevel)setPromoteTo(i);else onPromote(skill.id,i as AutonomyLevel)}}>
            {i<skill.autonomyLevel?<span aria-hidden="true">✓</span>:i===skill.autonomyLevel?<span aria-hidden="true">●</span>:<span aria-hidden="true"/>}<small aria-hidden="true">{i}</small></button>})}</div>
        <div className="skill-risk-plain" title={skill.riskLevel}>{ar?(RISK_PLAIN[skill.riskLevel]||skill.riskLevel):skill.riskLevel}</div>
        <div className="skill-mini-metrics"><div><strong>{skill.usageCount}</strong><span>{ar?"تشغيل":"runs"}</span></div><div><strong>{skill.successRate}%</strong><span>{ar?"نجاح":"success"}</span></div><div><strong>{skill.hoursSavedTotal}h</strong><span>{ar?"وقت":"saved"}</span></div></div>
        <div className="skill-alerts">{skill.isSinglePointOfFailure&&!(skill.backupOwnerNames||[]).length&&<div><AlertTriangle aria-hidden="true"/><span>{ar?`تعتمد على شخص واحد (${skill.ownerName})`:`Single-person dependency (${skill.ownerName})`}</span>{onOpenPeople&&<button type="button" className="spof-nudge" onClick={onOpenPeople}><UserPlus aria-hidden="true"/>{ar?"أسند زميلاً بديلاً":"Assign a backup"}</button>}</div>}{skill.killSwitchActive&&<div className="danger"><CirclePause/><span>{ar?"المهارة متوقفة":"Skill paused"}</span></div>}</div>
        <div className="inspector-actions"><button onClick={()=>onToggleKill(skill.id)} className={skill.killSwitchActive?"resume":"danger"}>{skill.killSwitchActive?<Zap/>:<CirclePause/>}{skill.killSwitchActive?(ar?"استئناف":"Resume"):(ar?"إيقاف":"Pause")}</button>{skill.activeVersion>1&&<button onClick={()=>onRollback(skill.id,skill.activeVersion-1)}><History/>{ar?"رجوع":"Rollback"}</button>}</div>
        <ManualPanel lang={lang} skill={skill} onSkillUpdated={onSkillUpdated} notify={notify}/>
      </aside>}
    </div>
    {skill&&promoteTo!==null&&<PromotionDialog lang={lang} skill={skill} target={promoteTo} onClose={()=>setPromoteTo(null)} onConfirm={o=>{onPromote(skill.id,promoteTo as AutonomyLevel,o);setPromoteTo(null)}}/>}
  </div>
}
