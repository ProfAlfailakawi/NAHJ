import React from "react";
import {
  Activity, AlertTriangle, ArrowUpLeft, BookOpenCheck, BrainCircuit, CheckCircle2, Circle, Clock3, GraduationCap,
  Lightbulb, MessagesSquare, Route, ShieldCheck, Sparkles, Users, Waypoints
} from "lucide-react";
import type { ApprovalRequest, LearningProposal, Organization, Skill, WorkItem } from "../../types";
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
  todayMetrics?: { auditEventsToday: number; hoursSavedThisMonth: number } | null;
  memory?: {
    documentedSkills: number; activeSkills: number;
    singlePersonDependencies: number; candidatesForAutomation: number;
    undocumentedProcesses: number | null;
  } | null;
  /* لبطاقة «خطواتك الأولى» في مؤسسةٍ بدأت للتو. */
  skills?: Skill[];
  practiceCount?: number;
  canManageAccounts?: boolean;
};

export function TodayView({ lang, organization, onNavigate, approvals, proposals, workItems, onApproval, todayMetrics, memory, skills = [], practiceCount = 0, canManageAccounts = false }: Props) {
  const ar = lang === "ar";
  const open = proposals.filter(p=>p.status==="pending");
  const active = workItems.filter(w=>w.state!=="completed").slice(0,3);
  const conflictCount = open.filter(p=>p.type==="conflict"||p.type==="process_drift").length;
  return (
    <div className="page-enter">
      <PageHeader eyebrow="NAHJ / PULSE" title={ar ? "العقل يعمل." : "The brain is working."} hint={ar ? "ما يظهر هنا هو ما يحتاجك أنت. الباقي يمشي وحده أو ينتظر دوره." : "What appears here needs you. The rest runs or waits its turn."} action={<button className="btn-primary" onClick={()=>onNavigate("teach")}><GraduationCap/>{ar?"علّم نهج":"Teach NAHJ"}</button>}/>

      {/*
        * مؤسسةٌ بدأت للتو: لا حالات بعد، فالشاشة الأولى تقول ماذا تفعل أولاً
        * بدل أرقامٍ صفرية ولوحاتٍ فارغة. وتختفي بطبيعتها حين يبدأ العمل.
        */}
      {workItems.length === 0 && (
        <GettingStarted ar={ar} onNavigate={onNavigate} steps={[
          { id: "skills", done: skills.some(skill => skill.status !== "draft"), icon: <BrainCircuit/>,
            title: ar ? "راجع قوالب مهاراتك" : "Review your skill templates",
            detail: ar ? `${skills.length ? `${skills.length} قالب من قطاعك` : "لا قوالب بعد"} — عدّل خطواتها بما يطابق عملكم.` : "Adjust steps to match how you work." },
          { id: "teach", done: false, icon: <GraduationCap/>,
            title: ar ? "علّم نهج أول عملية" : "Teach NAHJ a first process",
            detail: ar ? "اكتب خطوات عمليةٍ يكررها موظفوك، ونهج يحوّلها إلى مهارة ويسألك عمّا لم يفهمه." : "Write the steps; NAHJ turns them into a skill." },
          ...(canManageAccounts ? [{ id: "accounts" as SectionId, done: false, icon: <Users/>,
            title: ar ? "أضف فريقك" : "Add your team",
            detail: ar ? "حسابٌ لكل موظف بدوره: مدير يعتمد، وموظف يشغّل، ومشاهد يطّلع." : "One account per person, by role." }] : []),
          { id: "practice", done: practiceCount > 0, icon: <BookOpenCheck/>,
            title: ar ? "درّبه قبل أن يعمل" : "Practice before it works",
            detail: ar ? "حالات اختبارٍ ومقارنةٌ بقرارات موظفيك — ولا ترتفع صلاحيته إلا بما يُثبته." : "Tests and shadow before any autonomy." },
          { id: "simulator", done: false, icon: <MessagesSquare/>,
            title: ar ? "جرّب محادثة عميل" : "Try a customer conversation",
            detail: ar ? "اكتب كما يكتب عميلك، وشاهد متى يطلب نهج موافقتك." : "See when NAHJ asks for approval." },
        ]}/>
      )}

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
          {/* «نشاط» لا «أُنجز»: العدّ يشمل كل ما سُجِّل، لا المهام المكتملة وحدها. */}
          <Stat label={ar?"نشاط اليوم":"ACTIVITY TODAY"} value={todayMetrics?.auditEventsToday ?? 0} tone="moss" icon={<Activity/>}/>
          <Stat label={ar?"وقت مستعاد":"TIME BACK"} value={`${todayMetrics?.hoursSavedThisMonth ?? organization.hoursSavedMonth}h`} tone="sky" icon={<Clock3/>}/>
          <Stat label={ar?"تعلّم":"LEARNING"} value={open.length} tone="amber" icon={<Sparkles/>}/>
          <Stat label={ar?"قرارك":"NEEDS YOU"} value={approvals.filter(a=>a.status==="pending").length+conflictCount} tone="rose" icon={<ShieldCheck/>}/>
        </div>
      </section>

      <section className="today-lower-grid">
        <article className="decision-deck surface-strong">
          <SectionTitle title={ar?"إشارة تحتاجك":"Needs you"} meta={`${approvals.length + open.length}`} icon={<ShieldCheck/>}/>
          <div className="decision-stack">
            {approvals.filter(a=>a.status==="pending").length===0&&open.length===0&&<p className="empty-note">{ar?"لا شيء ينتظرك الآن. ما يحتاج قرارك يظهر هنا.":"Nothing needs you right now."}</p>}
            {approvals.filter(a=>a.status==="pending").slice(0,1).map(a=><button key={a.id} className="decision-card approval" onClick={()=>onApproval(a.id)}>
              <span className="decision-icon"><ShieldCheck/></span>
              <span><strong>{ar?"قرارٌ ينتظر موافقتك":"Awaiting your approval"}</strong><small>{a.workTitle}</small></span>
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
          {active.length===0&&<p className="empty-note">{ar?"لا حالات عمل جارية بعد. تبدأ حين تُفعَّل أول مهارة أو تصل أول محادثة.":"No work in motion yet."}</p>}
          {active.length>0&&<div className="work-deck-glyph"><MiniProcessGlyph/></div>}
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

type Step = { id: SectionId; done: boolean; icon: React.ReactNode; title: string; detail: string };
function GettingStarted({ ar, steps, onNavigate }: { ar: boolean; steps: Step[]; onNavigate: (s: SectionId) => void }) {
  const doneCount = steps.filter(step => step.done).length;
  return (
    <section className="getting-started surface-strong" aria-labelledby="gs-title">
      <div className="gs-head">
        <div><em>{ar ? "البداية" : "GETTING STARTED"}</em><h2 id="gs-title">{ar ? "خطواتك الأولى مع نهج" : "Your first steps"}</h2></div>
        <span className="gs-count">{doneCount}/{steps.length}</span>
      </div>
      <ol>
        {steps.map((step, index) => (
          <li key={step.id} className={step.done ? "done" : ""}>
            <button type="button" onClick={() => onNavigate(step.id)}>
              <span className="gs-mark" aria-hidden="true">{step.done ? <CheckCircle2/> : <Circle/>}</span>
              <span className="gs-icon" aria-hidden="true">{step.icon}</span>
              <span className="gs-text"><strong>{index + 1}. {step.title}</strong><small>{step.detail}</small></span>
              <ArrowUpLeft className="gs-go" aria-hidden="true"/>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function MemoryGlyph({icon,value,label}:{icon:React.ReactNode;value:string;label:string}){
  return <div className="memory-glyph"><span>{icon}</span><strong>{value}</strong><small>{label}</small></div>;
}
