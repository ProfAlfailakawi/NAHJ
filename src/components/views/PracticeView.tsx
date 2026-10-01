import React from "react";
import { CheckCircle2, FlaskConical, GitCompareArrows, Play, ShieldCheck, XCircle } from "lucide-react";
import type { ShadowComparison, TestCase } from "../../types";
import { PageHeader, SectionTitle } from "../Primitives";
import { decisionLabel } from "../../lib/labels";
import { DnaRing, DnaStepper } from "../dna";
/* عتبتا بوّابة الترقية نفسها — ملفٌّ بلا تبعيات خادم، يُستورد هنا ولا يُنسخ. */
import { MIN_PASS_RATE, MIN_SHADOW_AGREEMENT } from "../../../server/engine/promotionReview";

type Props={lang:"ar"|"en";cases:TestCase[];shadow:ShadowComparison[];running:boolean;shadowRunning:boolean;onRunPractice:()=>void;onRunShadow:()=>void};
export function PracticeView({lang,cases,shadow,running,shadowRunning,onRunPractice,onRunShadow}:Props){
  const ar=lang==="ar"; const passed=cases.filter(c=>c.resultStatus==="pass").length;
  /*
   * الحالة التي لم تُقارَن لا تُعدّ تطابقاً ولا انحرافاً.
   *
   * وبدون هذا الفصل كان مقامُ النسبة يضمّ حالاتٍ بلا وقائع مسجَّلة — فتبدو
   * المطابقة أسوأ ممّا هي، أو يُعرض «≠» على حالةٍ لم يُقارنها أحد.
   */
  const compared=shadow.filter(s=>s.evaluated!==false);
  const matched=compared.filter(s=>s.matched).length;
  const skipped=shadow.length-compared.length;
  /*
   * مراحل المسار تتبع بوّابة الترقية (reviewPromotion): نسبة النجاح على الحالات
   * التي شُغّلت، والتطابق على ما قورن فعلاً، كلٌّ ≥ عتبته — لا «الكل أو لا شيء».
   * والحلقتان تبقيان على النسبتين الحقيقيتين.
   */
  const ran=cases.filter(c=>c.resultStatus);
  const passRate=ran.length?Math.round(ran.filter(c=>c.resultStatus==="pass").length/ran.length*100):null;
  const measured=shadow.filter(s=>s.evaluated===true);
  const agreement=measured.length?Math.round(measured.filter(s=>s.matched).length/measured.length*100):null;
  const practiceDone=passRate!==null&&passRate>=MIN_PASS_RATE;
  const shadowDone=agreement!==null&&agreement>=MIN_SHADOW_AGREEMENT;
  return <div className="page-enter">
    <PageHeader eyebrow={ar?"التخرّج والتقييم":"GRADUATION / EVALS"} title={ar?"قبل أن يعمل… يثبت نفسه.":"Before it works, it proves itself."} hint={ar?"اختبارات ثم ظل حقيقي. الاستقلالية تُكتسب ولا تُمنح.":"Practice first. Shadow next. Autonomy is earned."}/>
    <div className="graduation-grid">
      <section className="graduation-stage surface">
        <DnaStepper className="graduation-steps" size="lg"
          ariaLabel={ar?"مسار التخرّج":"Graduation path"}
          stateText={ar?undefined:{done:"done",current:"current",pending:"upcoming",returned:"returned",blocked:"blocked"}}
          steps={[
            {key:"practice",icon:<FlaskConical/>,label:ar?"تدريب":"Practice",state:practiceDone?"done":"current"},
            {key:"shadow",icon:<GitCompareArrows/>,label:ar?"ظل":"Shadow",state:shadowDone?"done":practiceDone?"current":"pending"},
            {key:"approval",icon:<ShieldCheck/>,label:ar?"اعتماد":"Approval",state:practiceDone&&shadowDone?"current":"pending"},
          ]}/>
        <DnaRing className="graduation-ring" value={cases.length?passed:null} max={cases.length||1} size={148} stroke={10}
          sublabel={ar?"اجتياز":"practice pass"}
          ariaLabel={ar?`اجتياز ${passed} من ${cases.length}`:`Practice pass ${passed} of ${cases.length}`}/>
        <button className="btn-primary" disabled={running} onClick={onRunPractice}><Play/>{running?(ar?"يختبر...":"Running..."):(ar?"شغّل الاختبارات":"Run practice")}</button>
      </section>
      <section className="eval-deck surface-strong">
        <SectionTitle title={ar?"حالات الاختبار":"Practice cases"} meta={`${passed}/${cases.length}`}/>
        <div className="eval-list">{cases.map(c=><div key={c.id} className={`eval-row ${c.resultStatus||"pending"}`}><span>{c.resultStatus==="pass"?<CheckCircle2/>:c.resultStatus==="fail"?<XCircle/>:<FlaskConical/>}</span><div><strong>{c.name}</strong><small>{c.scenario}</small></div><b>{c.executionTimeMs?`${c.executionTimeMs}ms`:"—"}</b></div>)}</div>
      </section>
      <section className="shadow-deck surface-strong">
        <div className="shadow-head"><DnaRing value={compared.length?matched:null} max={compared.length||1} size={56} stroke={5} ariaLabel={ar?`تطابق الظل ${matched} من ${compared.length}`:`Shadow agreement ${matched} of ${compared.length}`}/><div><em>SHADOW</em><strong>{matched}/{compared.length}</strong>{skipped>0&&<small className="shadow-skipped">{ar?`${skipped} بلا وقائع مسجَّلة — لم تُقارَن`:`${skipped} not compared`}</small>}</div><button className="btn-primary shadow-run" disabled={shadowRunning} onClick={onRunShadow} title={ar?"قارن قرارات الموظفين بما كان نهج سيقرّره":"Compare staff decisions with NAHJ's"}><Play/>{shadowRunning?(ar?"يقارن...":"Comparing..."):(ar?"شغّل مقارنة الظل":"Run shadow")}</button></div>
        <div className="shadow-pairs">{shadow.map(s=>{
          /* حالةٌ لم تُقارَن بعد ليست انحرافاً: تُعرض «بانتظار المقارنة» حتى يُشغَّل الظل. */
          const pending=s.evaluated===undefined&&!(s.aiAction||s.aiDecision);
          return <div key={s.id} className={pending||s.evaluated===false?"unmeasured":s.matched?"match":"drift"} title={pending?(ar?"لم تُقارَن بعد — اضغط تشغيل الظل":"Not compared yet"):s.evaluated===false?(ar?"لا وقائع مسجَّلة لهذه الحالة — لم يُشتق لها قرار":"No recorded facts"):s.divergenceReason||""}><span><i>H</i><small>{s.humanAction||s.humanDecision}</small></span><b>{pending?"…":s.evaluated===false?"?":s.matched?"=":"≠"}</b><span><i>AI</i><small title={s.aiAction||s.aiDecision||""}>{pending?(ar?"بانتظار المقارنة":"pending"):decisionLabel(s.aiAction||s.aiDecision,ar)}</small></span></div>})}</div>
      </section>
    </div>
  </div>
}
