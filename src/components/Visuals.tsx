import { LADDER_NAME_AR } from "../lib/labels";
import React from "react";
import {
  BrainCircuit, BookOpenCheck, CalendarDays, Check, Circle, CircleDollarSign, FileCheck2, Fingerprint,
  GitBranch, GraduationCap, MessageCircleMore, Orbit, Route, ShieldCheck, Sparkles, UserRound,
  Waypoints
} from "lucide-react";

const nodeTones = {
  amber: { bg: "var(--amber-soft)", fg: "var(--amber)" },
  sky: { bg: "var(--sky-soft)", fg: "var(--sky)" },
  violet: { bg: "var(--violet-soft)", fg: "var(--violet)" },
  moss: { bg: "var(--mint)", fg: "var(--moss)" },
  rose: { bg: "var(--rose-soft)", fg: "var(--rose)" },
};

type Tone = keyof typeof nodeTones;

function VisualNode({ className, icon, tone, label }: { className: string; icon: React.ReactNode; tone: Tone; label: string }) {
  const t = nodeTones[tone];
  return (
    <div className={`visual-node ${className}`} style={{ background: t.bg, color: t.fg }} title={label} aria-label={label}>
      {icon}
    </div>
  );
}

export function LearningLens({ progress = 76, label, ar = true }: { progress?: number; label?: string; ar?: boolean }) {
  const circumference = 2 * Math.PI * 42;
  const dash = Math.max(0, Math.min(100, progress)) / 100 * circumference;
  return (
    <div className="learning-lens" aria-label={ar ? `تغطية التعلّم ${progress}%` : `Learning coverage ${progress}%`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="47" fill="none" stroke="color-mix(in srgb,var(--ink) 5.5%,transparent)" strokeWidth="1"/>
        <circle cx="60" cy="60" r="42" fill="none" stroke="color-mix(in srgb,var(--ink) 8%,transparent)" strokeWidth="5"/>
        <circle cx="60" cy="60" r="42" fill="none" stroke="var(--moss)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${dash} ${circumference}`} transform="rotate(-90 60 60)" className="lens-progress"/>
      </svg>
      {/* الرقم يظهر مرة واحدة: داخل الحلقة، لا فوق قوسها ولا مكرَّراً تحتها. */}
      <div className="learning-lens-core"><strong>{label ?? `${progress}%`}</strong></div>
    </div>
  );
}

export function TeachStageVisual({ active = false, eventCount = 0, ar = true }: { active?: boolean; eventCount?: number; ar?: boolean }) {
  return (
    <div className={`teach-stage-visual ${active ? "active" : ""}`} aria-label={ar ? "التقاط وضع التعليم" : "Teach mode capture"}>
      <div className="teach-radar r1"/><div className="teach-radar r2"/><div className="teach-radar r3"/>
      <div className="teach-core"><GraduationCap/></div>
      <div className="teach-source source-a" title={ar ? "المحادثة" : "Conversation"}><MessageCircleMore/></div>
      <div className="teach-source source-b" title={ar ? "المستندات" : "Documents"}><FileCheck2/></div>
      <div className="teach-source source-c" title={ar ? "التقويم" : "Calendar"}><CalendarDays/></div>
      <div className="teach-source source-d" title={ar ? "الأنظمة" : "Systems"}><Route/></div>
      <div className="teach-wave" aria-hidden="true">{Array.from({length:18}).map((_,i)=><i key={i} style={{height:`${9 + ((i*13)%28)}px`}}/>)}</div>
      <span className="teach-count" title={ar ? `الخطوات الملتقطة: ${eventCount}` : `Captured steps: ${eventCount}`} aria-label={ar ? `الخطوات الملتقطة: ${eventCount}` : `Captured steps: ${eventCount}`}>{eventCount}</span>
    </div>
  );
}

export function SkillRunway({ level, reliability, ar = true }: { level: number; reliability: number; ar?: boolean }) {
  const stages = ar ? LADDER_NAME_AR : ["Observe","Practice","Shadow","Suggest","Prepare","Approval","Auto"];
  return (
    <div className="skill-runway" aria-label={ar ? `مستوى الاستقلالية ${level}` : `Autonomy level ${level}`}>
      <div className="runway-line"><div style={{width:`${Math.min(100,(level/6)*100)}%`}}/></div>
      <div className="runway-stages">
        {stages.map((_,i)=><span key={i} className={i<=level?"done":""} title={stages[i]}><i>{i<level?<Check aria-hidden="true"/>:i===level?<Circle aria-hidden="true" fill="currentColor"/>:null}</i></span>)}
      </div>
      <div className="runway-reliability"><span style={{width:`${reliability}%`}}/></div>
    </div>
  );
}

export function ConnectionConstellation({ statuses, ar = true }: { statuses: {healthy:number; degraded:number; disconnected:number}; ar?: boolean }) {
  const nodes = [
    {x:66,y:58,icon:<CalendarDays/>,tone:"sky" as Tone,label:ar?"التقويم":"Calendar"},
    {x:318,y:50,icon:<Fingerprint/>,tone:"violet" as Tone,label:ar?"الهوية":"Identity"},
    {x:54,y:250,icon:<CircleDollarSign/>,tone:"amber" as Tone,label:ar?"الدفع":"Payments"},
    {x:330,y:252,icon:<FileCheck2/>,tone:"moss" as Tone,label:ar?"المستندات":"Documents"},
    {x:193,y:300,icon:<MessageCircleMore/>,tone:"rose" as Tone,label:ar?"القنوات":"Channels"},
  ];
  return (
    <div className="connection-constellation">
      <svg viewBox="0 0 390 330" fill="none" aria-hidden="true">
        {nodes.map((n,i)=><path key={i} d={`M195 165 C${(195+n.x)/2} ${(165+n.y)/2-30} ${n.x} ${n.y} ${n.x} ${n.y}`} stroke="color-mix(in srgb,var(--ink) 11%,transparent)" strokeWidth="1.5" strokeDasharray="5 6"/>) }
        <circle cx="195" cy="165" r="69" fill="color-mix(in srgb,var(--mint) 70%,transparent)" stroke="color-mix(in srgb,var(--moss) 18%,transparent)"/>
        <circle cx="195" cy="165" r="43" fill="var(--ink-bg)"/>
      </svg>
      <div className="constellation-core"><Orbit/></div>
      {nodes.map((n,i)=><div key={i} className="constellation-node" style={{left:`calc(${n.x/3.9}% - 25px)`,top:`calc(${n.y/3.3}% - 25px)`,background:nodeTones[n.tone].bg,color:nodeTones[n.tone].fg}} title={n.label}>{n.icon}</div>)}
      <div className="constellation-status" role="group" aria-label={ar?"حالة الموصلات: سليمة، متدهورة، منقطعة":"Connector health: healthy, degraded, disconnected"}>
        <b title={ar?"سليمة":"Healthy"} aria-label={`${ar?"سليمة":"Healthy"}: ${statuses.healthy}`}>{statuses.healthy}</b><i/>
        <b title={ar?"متدهورة":"Degraded"} aria-label={`${ar?"متدهورة":"Degraded"}: ${statuses.degraded}`}>{statuses.degraded}</b><i/>
        <b title={ar?"منقطعة":"Disconnected"} aria-label={`${ar?"منقطعة":"Disconnected"}: ${statuses.disconnected}`}>{statuses.disconnected}</b>
      </div>
    </div>
  );
}

export function GovernanceShield({ paused = false }: { paused?: boolean }) {
  return (
    <div className={`governance-shield ${paused ? "paused" : ""}`}>
      <span className="shield-ring ring-1"/><span className="shield-ring ring-2"/><span className="shield-ring ring-3"/>
      <div className="shield-core">{paused?<Route/>:<ShieldCheck/>}</div>
      <div className="shield-pip p1"/><div className="shield-pip p2"/><div className="shield-pip p3"/>
    </div>
  );
}

export function MiniProcessGlyph() {
  return (
    <svg viewBox="0 0 260 86" className="mini-process-glyph" fill="none" aria-hidden="true">
      <path d="M18 43h44c19 0 20-23 39-23h42c20 0 21 46 42 46h57" stroke="color-mix(in srgb,var(--ink) 14%,transparent)" strokeWidth="2.5" strokeLinecap="round"/>
      {[18,62,101,143,185,242].map((x,i)=><circle key={x} cx={x} cy={[43,43,20,20,66,66][i]} r={i===5?8:5} fill={i===5?"var(--ink)":"var(--white)"} stroke={i===5?"var(--ink)":"rgba(16,37,31,.25)"} strokeWidth="2"/>)}
      <circle cx="242" cy="66" r="2.5" fill="var(--mint)"/>
    </svg>
  );
}

export function EvidenceSplit({ a = 78, b = 22, ar = true }: { a?: number; b?: number; ar?: boolean }) {
  return (
    <div className="evidence-split" aria-label={ar ? `الطريقة أ ${a}٪، الطريقة ب ${b}٪` : `Method A ${a} percent, method B ${b} percent`}>
      <div className="evidence-track"><span className="a" style={{width:`${a}%`}}/><span className="b" style={{width:`${b}%`}}/></div>
      <div className="evidence-dots"><span><i className="a"/>{a}%</span><span><i className="b"/>{b}%</span></div>
    </div>
  );
}

export function FlowGlyph() { return <MiniProcessGlyph/>; }
export function LearningOrbit({progress=72}:{progress?:number}) { return <LearningLens progress={progress}/>; }

/* شريط نقاط: خليّة لكل حالة معروضة أصلاً في القائمة — اللون للحالة وحدها. */
export type DotState = "ok" | "bad" | "warn" | "none";
export function DotMatrix({ cells, label, className = "" }: { cells: { state: DotState; title?: string }[]; label: string; className?: string }) {
  return (
    <div className={`dot-matrix ${className}`} role="img" aria-label={label}>
      {cells.map((c, i) => <i key={i} className={`dm-${c.state}`} title={c.title}/>)}
    </div>
  );
}
