import React from "react";
import {
  BrainCircuit, BookOpenCheck, CalendarDays, CircleDollarSign, FileCheck2, Fingerprint,
  GitBranch, GraduationCap, MessageCircleMore, Orbit, Route, ShieldCheck, Sparkles, UserRound,
  Waypoints, Zap
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

export function BrainAtlas({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brain-atlas ${compact ? "compact" : ""}`} aria-label="Company Brain operational map">
      <svg className="brain-atlas-lines" viewBox="0 0 780 430" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="gA" x1="70" y1="70" x2="710" y2="360" gradientUnits="userSpaceOnUse">
            <stop stopColor="#E0A04B"/><stop offset=".42" stopColor="#2F7D65"/><stop offset="1" stopColor="#5E79E6"/>
          </linearGradient>
          <filter id="softGlow"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <path className="brain-route route-a" d="M98 94C178 50 245 87 298 153C334 198 381 211 425 194C485 171 497 91 579 91C632 91 673 124 699 166" stroke="url(#gA)" strokeWidth="2.2" strokeLinecap="round"/>
        <path className="brain-route route-b" d="M83 314C155 332 210 327 259 285C305 246 336 225 390 232C455 241 473 337 550 337C608 337 649 306 696 265" stroke="rgba(94,121,230,.34)" strokeWidth="2" strokeLinecap="round"/>
        <path className="brain-route route-c" d="M112 203C166 204 208 187 249 162C297 132 344 117 398 127C447 137 462 193 506 208C558 225 614 204 674 202" stroke="rgba(47,125,101,.28)" strokeWidth="1.8" strokeLinecap="round"/>
        <circle cx="390" cy="215" r="126" stroke="rgba(16,37,31,.06)"/>
        <circle cx="390" cy="215" r="96" stroke="rgba(47,125,101,.13)" strokeDasharray="4 9" className="brain-orbit"/>
        <circle cx="390" cy="215" r="67" fill="rgba(224,240,231,.88)" stroke="rgba(47,125,101,.20)"/>
        <circle cx="390" cy="215" r="45" fill="#10251f" filter="url(#softGlow)"/>
        <circle cx="98" cy="94" r="5" fill="#E0A04B"/>
        <circle cx="699" cy="166" r="5" fill="#5E79E6"/>
        <circle cx="83" cy="314" r="5" fill="#8C6FE0"/>
        <circle cx="696" cy="265" r="5" fill="#2F7D65"/>
        <circle cx="112" cy="203" r="4.5" fill="#E46F61"/>
        <circle cx="674" cy="202" r="4.5" fill="#2F7D65"/>
        {[
          [172,72],[256,118],[318,316],[473,72],[570,150],[587,292],[222,254],[510,244]
        ].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="3.5" fill="#fffdf7" stroke="rgba(16,37,31,.22)" strokeWidth="1.4"/>)}
      </svg>
      <div className="brain-core"><BrainCircuit/></div>
      <VisualNode className="node-a" tone="amber" label="Knowledge" icon={<FileCheck2/>}/>
      <VisualNode className="node-b" tone="sky" label="Processes" icon={<GitBranch/>}/>
      <VisualNode className="node-c" tone="violet" label="People" icon={<UserRound/>}/>
      <VisualNode className="node-d" tone="moss" label="Policies" icon={<ShieldCheck/>}/>
      <VisualNode className="node-e" tone="rose" label="Signals" icon={<Waypoints/>}/>
      <div className="brain-spark" aria-hidden="true"><Sparkles/></div>
    </div>
  );
}

export function LearningLens({ progress = 76 }: { progress?: number }) {
  const circumference = 2 * Math.PI * 42;
  const dash = Math.max(0, Math.min(100, progress)) / 100 * circumference;
  return (
    <div className="learning-lens" aria-label={`Learning coverage ${progress}%`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="47" fill="none" stroke="rgba(16,37,31,.055)" strokeWidth="1"/>
        <circle cx="60" cy="60" r="42" fill="none" stroke="rgba(16,37,31,.08)" strokeWidth="5"/>
        <circle cx="60" cy="60" r="42" fill="none" stroke="#2f7d65" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${dash} ${circumference}`} transform="rotate(-90 60 60)" className="lens-progress"/>
        <path d="M19 72c16 12 29 11 40 2 16-13 24-18 42-8" fill="none" stroke="rgba(94,121,230,.35)" strokeWidth="1.5" strokeDasharray="4 5"/>
        <circle cx="24" cy="70" r="4" fill="#e0a04b"/><circle cx="53" cy="76" r="4" fill="#8c6fe0"/><circle cx="97" cy="65" r="4" fill="#5e79e6"/>
      </svg>
      <div className="learning-lens-core"><Zap/></div>
      <strong>{progress}%</strong>
    </div>
  );
}

export function TeachStageVisual({ active = false, eventCount = 0 }: { active?: boolean; eventCount?: number }) {
  return (
    <div className={`teach-stage-visual ${active ? "active" : ""}`} aria-label="Teach mode capture">
      <div className="teach-radar r1"/><div className="teach-radar r2"/><div className="teach-radar r3"/>
      <div className="teach-core"><GraduationCap/></div>
      <div className="teach-source source-a" title="Conversation"><MessageCircleMore/></div>
      <div className="teach-source source-b" title="Documents"><FileCheck2/></div>
      <div className="teach-source source-c" title="Calendar"><CalendarDays/></div>
      <div className="teach-source source-d" title="Systems"><Route/></div>
      <div className="teach-wave" aria-hidden="true">{Array.from({length:18}).map((_,i)=><i key={i} style={{height:`${9 + ((i*13)%28)}px`}}/>)}</div>
      <span className="teach-count">{eventCount}</span>
    </div>
  );
}

export function SkillRunway({ level, reliability }: { level: number; reliability: number }) {
  const stages = ["Observe","Practice","Shadow","Suggest","Prepare","Approval","Auto"];
  return (
    <div className="skill-runway" aria-label={`Autonomy level ${level}`}>
      <div className="runway-line"><div style={{width:`${Math.min(100,(level/6)*100)}%`}}/></div>
      <div className="runway-stages">
        {stages.map((_,i)=><span key={i} className={i<=level?"done":""} title={stages[i]}><i>{i<level?"✓":i===level?"●":""}</i></span>)}
      </div>
      <div className="runway-reliability"><span style={{width:`${reliability}%`}}/></div>
    </div>
  );
}

export function WorkRiver({ progress = 64, risk = "medium" }: { progress?: number; risk?: "low"|"medium"|"high"|"critical" }) {
  const tone = risk === "high" || risk === "critical" ? "#e46f61" : risk === "medium" ? "#e0a04b" : "#2f7d65";
  return (
    <svg className="work-river" viewBox="0 0 420 80" fill="none" aria-hidden="true">
      <path d="M20 39H92c21 0 22-22 44-22h58c24 0 24 45 48 45h60c22 0 22-25 44-25h55" stroke="rgba(16,37,31,.09)" strokeWidth="9" strokeLinecap="round"/>
      <path d="M20 39H92c21 0 22-22 44-22h58c24 0 24 45 48 45h60c22 0 22-25 44-25h55" stroke={tone} strokeOpacity=".88" strokeWidth="3" strokeLinecap="round" pathLength="100" strokeDasharray={`${progress} 100`}/>
      {[20,92,136,194,242,302,346,401].map((x,i)=><circle key={x} cx={x} cy={[39,39,17,17,62,62,37,37][i]} r={i===Math.min(7,Math.floor(progress/14))?6:4.2} fill={i*14<=progress?tone:"#fffdf7"} stroke={i*14<=progress?tone:"rgba(16,37,31,.16)"} strokeWidth="2"/>)}
    </svg>
  );
}

export function ConnectionConstellation({ statuses }: { statuses: {healthy:number; degraded:number; disconnected:number} }) {
  const nodes = [
    {x:66,y:58,icon:<CalendarDays/>,tone:"sky" as Tone,label:"Calendar"},
    {x:318,y:50,icon:<Fingerprint/>,tone:"violet" as Tone,label:"Identity"},
    {x:54,y:250,icon:<CircleDollarSign/>,tone:"amber" as Tone,label:"Payments"},
    {x:330,y:252,icon:<FileCheck2/>,tone:"moss" as Tone,label:"Documents"},
    {x:193,y:300,icon:<MessageCircleMore/>,tone:"rose" as Tone,label:"Channels"},
  ];
  return (
    <div className="connection-constellation">
      <svg viewBox="0 0 390 330" fill="none" aria-hidden="true">
        {nodes.map((n,i)=><path key={i} d={`M195 165 C${(195+n.x)/2} ${(165+n.y)/2-30} ${n.x} ${n.y} ${n.x} ${n.y}`} stroke="rgba(16,37,31,.11)" strokeWidth="1.5" strokeDasharray="5 6"/>) }
        <circle cx="195" cy="165" r="69" fill="rgba(224,240,231,.66)" stroke="rgba(47,125,101,.14)"/>
        <circle cx="195" cy="165" r="43" fill="#10251f"/>
      </svg>
      <div className="constellation-core"><Orbit/></div>
      {nodes.map((n,i)=><div key={i} className="constellation-node" style={{left:`calc(${n.x/3.9}% - 25px)`,top:`calc(${n.y/3.3}% - 25px)`,background:nodeTones[n.tone].bg,color:nodeTones[n.tone].fg}} title={n.label}>{n.icon}</div>)}
      <div className="constellation-status"><b>{statuses.healthy}</b><i/><b>{statuses.degraded}</b><i/><b>{statuses.disconnected}</b></div>
    </div>
  );
}

export function ImpactHalo({ value = 84.5, label = "h" }: { value?: number; label?: string }) {
  return (
    <div className="impact-halo">
      <svg viewBox="0 0 220 220" aria-hidden="true">
        <defs><linearGradient id="impactG" x1="30" y1="20" x2="190" y2="200"><stop stopColor="#2f7d65"/><stop offset=".5" stopColor="#5e79e6"/><stop offset="1" stopColor="#8c6fe0"/></linearGradient></defs>
        <circle cx="110" cy="110" r="91" fill="none" stroke="rgba(16,37,31,.055)" strokeWidth="18"/>
        <circle cx="110" cy="110" r="91" fill="none" stroke="url(#impactG)" strokeWidth="18" strokeLinecap="round" strokeDasharray="430 572" transform="rotate(-90 110 110)"/>
        <circle cx="110" cy="110" r="65" fill="#fffdf7" stroke="rgba(16,37,31,.06)"/>
      </svg>
      <div><strong>{value}</strong><span>{label}</span></div>
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
      <path d="M18 43h44c19 0 20-23 39-23h42c20 0 21 46 42 46h57" stroke="rgba(16,37,31,.14)" strokeWidth="2.5" strokeLinecap="round"/>
      {[18,62,101,143,185,242].map((x,i)=><circle key={x} cx={x} cy={[43,43,20,20,66,66][i]} r={i===5?8:5} fill={i===5?"#10251f":"#fffdf7"} stroke={i===5?"#10251f":"rgba(16,37,31,.25)"} strokeWidth="2"/>)}
      <circle cx="242" cy="66" r="2.5" fill="#dff0e7"/>
    </svg>
  );
}

export function EvidenceSplit({ a = 78, b = 22 }: { a?: number; b?: number }) {
  return (
    <div className="evidence-split" aria-label={`Method A ${a} percent, method B ${b} percent`}>
      <div className="evidence-track"><span className="a" style={{width:`${a}%`}}/><span className="b" style={{width:`${b}%`}}/></div>
      <div className="evidence-dots"><span><i className="a"/>{a}%</span><span><i className="b"/>{b}%</span></div>
    </div>
  );
}

export function FlowGlyph() { return <MiniProcessGlyph/>; }
export function CompanyBrainVisual(props:{compact?:boolean}) { return <BrainAtlas {...props}/>; }
export function LearningOrbit({progress=72}:{progress?:number}) { return <LearningLens progress={progress}/>; }
