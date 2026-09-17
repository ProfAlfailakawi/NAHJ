import React from "react";
import {
  Activity, BarChart3, Bell, BookOpenCheck, BrainCircuit, CircleHelp, GraduationCap,
  History, Languages, MessagesSquare, PlugZap, RefreshCw, Search, ShieldCheck, Sparkles, Workflow, FlaskConical, LogOut
} from "lucide-react";
import { BrandLockup, NahjMark } from "./Brand";
import type { Organization, User } from "../types";

export type SectionId = "today" | "learn" | "teach" | "skills" | "practice" | "work" | "simulator" | "connections" | "analytics" | "control" | "audit";

type ShellProps = {
  section: SectionId;
  onSection: (id: SectionId) => void;
  organization: Organization;
  user: User;
  lang: "ar" | "en";
  onToggleLang: () => void;
  alerts: number;
  onAlert: () => void;
  serverLive?: boolean;
  demoEnabled?: boolean;
  demoActive?: boolean;
  demoBusy?: boolean;
  onEnterDemo?: () => void;
  onResetDemo?: () => void;
  onExitDemo?: () => void;
  children: React.ReactNode;
};

const nav: { id: SectionId; ar: string; en: string; icon: React.ElementType; group?: "core"|"operate"|"govern" }[] = [
  { id: "today", ar: "اليوم", en: "Today", icon: Activity, group:"core" },
  { id: "learn", ar: "يتعلّم", en: "Learn", icon: Sparkles, group:"core" },
  { id: "teach", ar: "علّم", en: "Teach", icon: GraduationCap, group:"core" },
  { id: "skills", ar: "المهارات", en: "Skills", icon: BrainCircuit, group:"core" },
  { id: "practice", ar: "التدرّب", en: "Practice", icon: BookOpenCheck, group:"operate" },
  { id: "work", ar: "العمل", en: "Work", icon: Workflow, group:"operate" },
  { id: "simulator", ar: "المحادثة", en: "Simulator", icon: MessagesSquare, group:"operate" },
  { id: "connections", ar: "الربط", en: "Connections", icon: PlugZap, group:"operate" },
  { id: "analytics", ar: "الأثر", en: "Impact", icon: BarChart3, group:"govern" },
  { id: "control", ar: "الحوكمة", en: "Control", icon: ShieldCheck, group:"govern" },
  { id: "audit", ar: "السجل", en: "Audit", icon: History, group:"govern" },
];

export function Shell({
  section, onSection, organization, user, lang, onToggleLang, alerts, onAlert, serverLive = false,
  demoEnabled = false, demoActive = false, demoBusy = false, onEnterDemo, onResetDemo, onExitDemo, children,
}: ShellProps) {
  const ar = lang === "ar";
  let lastGroup: string | undefined;
  return (
    <div className="app-shell" dir={ar ? "rtl" : "ltr"}>
      <div className="ambient-canvas" aria-hidden="true"/>
      <aside className="desktop-rail">
        <div className="rail-brand"><NahjMark size={48}/></div>
        <nav className="rail-nav">
          {nav.map(({ id, ar: a, en, icon: Icon, group }) => {
            const divider = lastGroup && group !== lastGroup;
            lastGroup = group;
            return (
              <React.Fragment key={id}>
                {divider && <div className="rail-divider"/>}
                <div className="nav-item-wrap">
                  <button className={`nav-icon ${section === id ? "active" : ""}`} onClick={() => onSection(id)} aria-label={ar ? a : en}>
                    <Icon/>
                    {id === "learn" && alerts > 0 && <i className="nav-signal"/>}
                  </button>
                  <span className="nav-tooltip">{ar ? a : en}</span>
                </div>
              </React.Fragment>
            );
          })}
        </nav>
        <button className="nav-icon rail-help" aria-label={ar?"مساعدة":"Help"}><CircleHelp/></button>
      </aside>

      <div className="shell-body">
        <header className="topbar">
          <div className="topbar-org">
            <div className="lg:hidden"><BrandLockup compact/></div>
            <div className="hidden lg:flex items-center gap-3 min-w-0">
              <div className="org-glyph"><BrainCircuit/></div>
              <div className="min-w-0">
                <div className="org-name">{ar ? organization.name : organization.nameEn}</div>
                <div className="org-meta flex items-center gap-2">
                  <span className={`live-dot ${serverLive ? "on" : "demo"}`}/>
                  <span>{serverLive ? (ar?"المحرك متصل":"Engine live") : (ar?"وضع العرض":"Demo mode")}</span>
                  <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    Firebase: nahj-a27a4
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="command-search">
            <Search/>
            <input placeholder={ar ? "ابحث في عقل المؤسسة" : "Search the company brain"}/>
            <kbd>⌘K</kbd>
          </div>
          <div className="top-actions">
            {demoActive ? (
              /* The badge is deliberately loud. Anyone looking over a shoulder
                 during a walkthrough should be able to tell at a glance that
                 none of these records are real. */
              <div className="demo-chip" role="status" aria-label={ar ? "بيئة تجريبية معزولة" : "Isolated demo environment"}>
                <FlaskConical aria-hidden="true"/>
                <span>{ar ? "بيئة تجريبية" : "DEMO"}</span>
                <i aria-hidden="true"/>
                <button type="button" onClick={onResetDemo} disabled={demoBusy} title={ar ? "إعادة تعيين البيانات التجريبية" : "Reset demo data"} aria-label={ar ? "إعادة تعيين البيانات التجريبية" : "Reset demo data"}><RefreshCw/></button>
                <button type="button" onClick={onExitDemo} disabled={demoBusy} title={ar ? "الخروج من البيئة التجريبية" : "Exit demo"} aria-label={ar ? "الخروج من البيئة التجريبية" : "Exit demo"}><LogOut/></button>
              </div>
            ) : demoEnabled ? (
              <button type="button" className="demo-enter" onClick={onEnterDemo} disabled={demoBusy}>
                <FlaskConical aria-hidden="true"/>
                <span>{ar ? "تجربة العرض" : "Try the demo"}</span>
              </button>
            ) : null}
            <button className="top-icon" onClick={onToggleLang} aria-label="Language"><Languages/></button>
            <button className="top-icon notification" onClick={onAlert} aria-label="Alerts"><Bell/>{alerts>0&&<b>{alerts>9?"9+":alerts}</b>}</button>
            <div className="user-chip">
              <div>{user.name.slice(0,1)}</div>
              <span><strong>{user.name.split(" ")[0]}</strong><small>{user.department}</small></span>
            </div>
          </div>
        </header>
        <main className="content-stage">{children}</main>
        <nav className="mobile-dock" aria-label="Mobile navigation">
          {nav.slice(0,8).map(({id, icon:Icon, ar:a, en})=><button key={id} className={section===id?"active":""} onClick={()=>onSection(id)} aria-label={ar?a:en}><Icon/></button>)}
        </nav>
      </div>
    </div>
  );
}
