import React from "react";
import {
  AlertTriangle, ArrowUpLeft, BrainCircuit, CheckCircle2, Clock3, GraduationCap,
  Lightbulb, Route, ShieldCheck, Sparkles, Waypoints
} from "lucide-react";
import type { ApprovalRequest, LearningProposal, Organization, WorkItem } from "../../types";
import type { SectionId } from "../Shell";
import { BrainAtlas, MiniProcessGlyph, WorkRiver } from "../Visuals";
import { PageHeader, SectionTitle, Stat } from "../Primitives";
import { Term } from "../Explain";
import { WORK_STATE_PLAIN } from "../../lib/glossary";

type Props = {
  lang: "ar"|"en";
  organization: Organization;
  onNavigate: (s: SectionId) => void;
  approvals: ApprovalRequest[];
  proposals: LearningProposal[];
  workItems: WorkItem[];
  onApproval: (id: string) => void;
  /*
   * الأرقام تأتي من الخادم مشتقّة.
   *
   * كانت هذه الشاشة تكتب أرقامها بيدها: «143» فوق أطلس العقل، و«137» مُنجزاً،
   * وشريط ذاكرة كامل عند 61 و37 و11 و29. لم يكن أيٌّ منها يتحرّك بعمل المؤسسة.
   */
  todayMetrics?: { tasksCompletedToday: number; hoursSavedThisMonth: number } | null;
  memory?: {
    documentedSkills: number; activeSkills: number;
    singlePersonDependencies: number; candidatesForAutomation: number;
    undocumentedProcesses: number | null;
  } | null;
};

export function TodayView({ lang, organization, onNavigate, approvals, proposals, workItems, onApproval, todayMetrics, memory }: Props) {
  const ar = lang === "ar";
  const open = proposals.filter(p=>p.status==="pending");
  const active = workItems.filter(w=>w.state!=="completed").slice(0,3);
  const conflictCount = open.filter(p=>p.type==="conflict"||p.type==="process_drift").length;
  return (
    <div className="page-enter">
      <PageHeader eyebrow="NAHJ / PULSE" title={ar ? "العقل يعمل." : "The brain is working."} hint={ar ? "ما يظهر هنا هو ما يحتاجك أنت. الباقي يمشي وحده أو ينتظر دوره." : "What appears here needs you. The rest runs or waits its turn."} action={<button className="btn-primary" onClick={()=>onNavigate("teach")}><GraduationCap/>{ar?"علّم نهج":"Teach NAHJ"}</button>}/>

      <section className="hero-grid">
        <article className="brain-hero">
          <div className="hero-floating-meta top-start"><span className="status-live"><i/>{ar?"حي":"LIVE"}</span><span>{memory?.documentedSkills ?? 0}</span></div>
          <BrainAtlas/>
          <div className="brain-hero-caption">
            <div><span>COMPANY BRAIN</span><strong>{ar?"ذاكرة العمل الحيّة":"Living operational memory"}</strong></div>
            <button className="round-action" onClick={()=>onNavigate("skills")} aria-label={ar?"فتح المهارات":"Open skills"}><ArrowUpLeft/></button>
          </div>
        </article>
        <div className="pulse-stats">
          <Stat label={ar?"أُنجز اليوم":"DONE TODAY"} value={todayMetrics?.tasksCompletedToday ?? 0} tone="moss" icon={<CheckCircle2/>}/>
          <Stat label={ar?"وقت مستعاد":"TIME BACK"} value={`${todayMetrics?.hoursSavedThisMonth ?? organization.hoursSavedMonth}h`} tone="sky" icon={<Clock3/>}/>
          <Stat label={ar?"تعلّم":"LEARNING"} value={open.length} tone="amber" icon={<Sparkles/>}/>
          <Stat label={ar?"قرارك":"NEEDS YOU"} value={approvals.filter(a=>a.status==="pending").length+conflictCount} tone="rose" icon={<ShieldCheck/>}/>
        </div>
      </section>

      <section className="today-lower-grid">
        <article className="decision-deck surface-strong">
          <SectionTitle title={ar?"إشارة تحتاجك":"Needs you"} meta={`${approvals.length + open.length}`} icon={<ShieldCheck/>}/>
          <div className="decision-stack">
            {approvals.filter(a=>a.status==="pending").slice(0,1).map(a=><button key={a.id} className="decision-card approval" onClick={()=>onApproval(a.id)}>
              <span className="decision-icon"><ShieldCheck/></span>
              <span><strong>{ar?"اعتماد مالي":"Financial gate"}</strong><small>{a.workTitle}</small></span>
              <ArrowUpLeft/>
            </button>)}
            {open.slice(0,2).map(p=>{
              const isConflict=p.type==="conflict"||p.type==="process_drift";
              return <button key={p.id} className={`decision-card ${isConflict?"warning":"insight"}`} onClick={()=>onNavigate("learn")}>
                <span className="decision-icon">{isConflict?<AlertTriangle/>:<Lightbulb/>}</span>
                <span><strong>{p.title}</strong><small>{p.observedCasesCount} {ar?"حالة":"cases"}</small></span>
                <ArrowUpLeft/>
              </button>
            })}
          </div>
        </article>

        <article className="work-deck surface">
          <SectionTitle title={ar?"العمل يتحرك":"Work in motion"} meta={ar?"الآن":"NOW"} icon={<Waypoints/>}/>
          <div className="work-deck-glyph"><MiniProcessGlyph/></div>
          <div className="work-mini-grid">
            {active.map((w,i)=><button key={w.id} className="work-mini" onClick={()=>onNavigate("work")}>
              <div><span className={`risk-dot risk-${w.riskLevel}`}/><b>{w.code}</b></div>
              {/* `studentName` حقلٌ تعليمي في شاشة عامّة — يعمل في مدرسة ويختفي في عيادة. */}
              <strong>{w.contactName || w.title}</strong>
              <small className="work-mini-state">{ar ? (WORK_STATE_PLAIN[w.state] || w.state) : w.state}</small>
              <WorkRiver progress={w.progressPercent} risk={w.riskLevel}/>
            </button>)}
          </div>
        </article>
      </section>

      {/*
        * كان هذا الشريط أربعة أرقام مكتوبة: 61 و37 و11 و29. وأصدقها الآن هو
        * «غير الموثّقة»: تُعرض «—» لأنها غير قابلة للمعرفة — النظام لا يعلم ما
        * لم يُعرض عليه قطّ.
      */}
      <section className="memory-strip">
        <MemoryGlyph icon={<BrainCircuit/>} value={String(memory?.documentedSkills ?? 0)} label={ar?"موثقة":"Verified"}/>
        <MemoryGlyph icon={<Route/>} value={memory?.undocumentedProcesses === null || memory?.undocumentedProcesses === undefined ? "—" : String(memory.undocumentedProcesses)} label={ar?"غير موثقة":"Undocumented"}/>
        <MemoryGlyph icon={<AlertTriangle/>} value={String(memory?.singlePersonDependencies ?? 0)} label={ar?"تعتمد على شخص":"Single-person"}/>
        <MemoryGlyph icon={<Sparkles/>} value={String(memory?.candidatesForAutomation ?? 0)} label={ar?"جاهزة للترقية":"Ready to promote"}/>
      </section>
    </div>
  );
}

function MemoryGlyph({icon,value,label}:{icon:React.ReactNode;value:string;label:string}){
  return <div className="memory-glyph"><span>{icon}</span><strong>{value}</strong><small>{label}</small></div>;
}
