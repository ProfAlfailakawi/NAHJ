import React from "react";
import { Activity, BarChart3, Bell, BookOpenCheck, BrainCircuit, CircleHelp, Building2, CreditCard, Crown, FlaskConical, GraduationCap, History, Languages, LogOut, MessagesSquare, PlugZap, RefreshCw, Search, ShieldCheck, Sparkles, Users, Workflow } from "lucide-react";
import { BrandLockup, NahjMark } from "./Brand";
import type { Organization, User } from "../types";

export type SectionId = "today" | "learn" | "teach" | "skills" | "practice" | "work" | "simulator" | "connections" | "analytics" | "control" | "audit" | "accounts" | "billing" | "owner" | "sectors";

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
  onSignOut?: () => void;
  signingOut?: boolean;
  /** يفتح دليل نهج السريع. كان زرّ المساعدة أيقونةً بلا مُعالج نقر. */
  onHelp?: () => void;
  /** يفتح لوحة الأوامر. كان حقل البحث يَعِد بـ⌘K ولا يفعل شيئاً. */
  onSearch?: () => void;
  /** يُخفي مدخل لوحة المالك عمّن ليس مالكاً — لا يُعرض قفلٌ على باب لا يخصّه. */
  isOwner?: boolean;
  /** شريط حالة الترخيص، يُمرَّر كما هو ليُرسم فوق كل سطح. */
  licenceBanner?: React.ReactNode;
  children: React.ReactNode;
};

const nav: { id: SectionId; ar: string; en: string; icon: React.ElementType; group?: "core"|"operate"|"govern"|"owner" }[] = [
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
  { id: "accounts", ar: "الحسابات", en: "Accounts", icon: Users, group:"govern" },
  { id: "billing", ar: "الاشتراك", en: "Subscription", icon: CreditCard, group:"govern" },
  { id: "sectors", ar: "النشاط", en: "Sector", icon: Building2, group:"govern" },
  { id: "owner", ar: "لوحة المالك", en: "Owner console", icon: Crown, group:"owner" },
];

export function Shell({
  section, onSection, organization, user, lang, onToggleLang, alerts, onAlert, serverLive = false,
  demoEnabled = false, demoActive = false, demoBusy = false, onEnterDemo, onResetDemo, onExitDemo,
  onSignOut, signingOut = false, isOwner = false, licenceBanner, onHelp, onSearch, children,
}: ShellProps) {
  const ar = lang === "ar";
  /* مدخل المالك يُحذف من القائمة لا يُعطَّل: قائمةٌ فيها بابٌ مقفل تدعو إلى طرقه. */
  const visibleNav = nav.filter(item => item.id !== "owner" || isOwner);
  let lastGroup: string | undefined;
  return (
    <div className="app-shell" dir={ar ? "rtl" : "ltr"}>
      <div className="ambient-canvas" aria-hidden="true"/>
      <aside className="desktop-rail">
        <div className="rail-brand"><NahjMark size={48}/></div>
        <nav className="rail-nav">
          {visibleNav.map(({ id, ar: a, en, icon: Icon, group }) => {
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
        {/* كان هذا الزرّ بلا مُعالج نقر — أيقونةٌ تُرى ولا تفعل. */}
        <button className="nav-icon rail-help" onClick={onHelp} aria-label={ar?"دليل سريع":"Quick guide"} title={ar?"دليل سريع":"Quick guide"}><CircleHelp/></button>
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
                  <span className={`live-dot ${demoActive ? "demo" : serverLive ? "on" : "demo"}`}/>
                  <span>{demoActive ? (ar?"صندوق معزول":"Isolated sandbox") : serverLive ? (ar?"المحرك متصل":"Engine live") : (ar?"وضع العرض":"Demo mode")}</span>
                  {/* داخل الصندوق التجريبي لا تُكتب ولا تُقرأ وثيقةٌ واحدة من Firebase، فوسمُ
                      «متصل» باسم المشروع الحقيقي كان يقول على الشاشة ما ليس صحيحًا — ويكشف
                      اسم مشروعٍ داخلي أمام من يُعرض عليه المنتج. */}
                  <span className={`hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${demoActive ? "bg-amber-500/15 text-amber-300 border-amber-500/30" : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${demoActive ? "bg-amber-400" : "bg-emerald-400"}`}></span>
                    {demoActive ? (ar?"بلا اتصال بأي قاعدة بيانات":"No database connection") : "Firebase: nahj-a27a4"}
                  </span>
                </div>
              </div>
            </div>
          </div>
          {/*
            * كان حقلَ إدخالٍ حقيقياً يُكتب فيه فلا يبحث، ويحمل «⌘K» ولا يستجيب
            * للاختصار. وهذا أسوأ من غيابه: يَعِد بقدرة غير موجودة فيجرّبها من
            * يُعرض عليه المنتج. صار زرّاً يفتح لوحة الأوامر فعلاً.
          */}
          <button type="button" className="command-search" onClick={onSearch}
            aria-label={ar ? "ابحث في عقل المؤسسة" : "Search the company brain"}>
            <Search/>
            <span>{ar ? "ابحث في عقل المؤسسة" : "Search the company brain"}</span>
            <kbd>⌘K</kbd>
          </button>
          <div className="top-actions">
            {demoActive ? (
              /* The badge is deliberately loud. Anyone looking over a shoulder
                 during a walkthrough should be able to tell at a glance that
                 none of these records are real. */
              /* أيقونات بلا كلام: الوسم يبقى ظاهرًا بلونه وأيقونته، والمعنى كاملٌ
                 في `aria-label` لمن يقرأ بالشاشة ولمن يمرّ على الأيقونة. */
              <div className="demo-chip demo-chip--icon" role="status" aria-label={ar ? "بيئة تجريبية معزولة — بيانات اصطناعية" : "Isolated demo environment — synthetic data"} title={ar ? "بيئة تجريبية معزولة — بيانات اصطناعية" : "Isolated demo environment — synthetic data"}>
                <FlaskConical aria-hidden="true"/>
                <i aria-hidden="true"/>
                <button type="button" onClick={onResetDemo} disabled={demoBusy} title={ar ? "إعادة تعيين البيانات التجريبية" : "Reset demo data"} aria-label={ar ? "إعادة تعيين البيانات التجريبية" : "Reset demo data"}><RefreshCw/></button>
                <button type="button" onClick={onExitDemo} disabled={demoBusy} title={ar ? "الخروج من البيئة التجريبية" : "Exit demo"} aria-label={ar ? "الخروج من البيئة التجريبية" : "Exit demo"}><LogOut/></button>
              </div>
            ) : demoEnabled ? (
              /* أيقونة صامتة: المدخل ثانويّ ولا ينبغي أن يزاحم شريط الأدوات
                 بعبارة. الوصف في `title`/`aria-label` لقارئ الشاشة ولمن يمرّ. */
              <button
                type="button"
                className="demo-enter demo-enter--icon"
                onClick={onEnterDemo}
                disabled={demoBusy}
                title={ar ? "تجربة العرض — بيئة تجريبية معزولة" : "Try the demo — isolated sandbox"}
                aria-label={ar ? "تجربة العرض" : "Try the demo"}
              >
                <FlaskConical aria-hidden="true"/>
              </button>
            ) : null}
            <button className="top-icon" onClick={onToggleLang} aria-label="Language"><Languages/></button>
            <button className="top-icon notification" onClick={onAlert} aria-label="Alerts"><Bell/>{alerts>0&&<b>{alerts>9?"9+":alerts}</b>}</button>
            <div className="user-chip">
              <div>{user.name.slice(0,1)}</div>
              <span><strong>{user.name.split(" ")[0]}</strong><small>{user.department}</small></span>
            </div>
            {/*
              * تسجيل الخروج — لم يكن له مدخل إطلاقًا.
              *
              * المسار `POST /api/auth/logout` موجود ومكتمل منذ البداية: يحذف
              * صفّ الجلسة ويمسح الكوكي. و`authApi.logout` موجودة في العميل.
              * لكن لا شيء في الواجهة كان يناديها — فالحساب يبقى مفتوحًا حتى
              * تنتهي مهلته، ولا سبيل إلى تركه على جهازٍ مشترك.
              *
              * ولا يظهر داخل البيئة التجريبية: هناك لا حساب يُخرَج منه، وزرّ
              * «الخروج من البيئة» في الشارة أعلاه هو الخروج المقصود. وأيقونتان
              * بالمعنى نفسه في شريطٍ واحد تُربك لا تُعين.
            */}
            {!demoActive && onSignOut ? (
              <button
                type="button"
                className="top-icon"
                onClick={onSignOut}
                disabled={signingOut}
                title={ar ? "تسجيل الخروج" : "Sign out"}
                aria-label={ar ? "تسجيل الخروج" : "Sign out"}
              >
                <LogOut aria-hidden="true"/>
              </button>
            ) : null}
          </div>
        </header>
        <main className="content-stage">{licenceBanner}{children}</main>
        <nav className="mobile-dock" aria-label="Mobile navigation">
          {visibleNav.slice(0,8).map(({id, icon:Icon, ar:a, en})=><button key={id} className={section===id?"active":""} onClick={()=>onSection(id)} aria-label={ar?a:en}><Icon/></button>)}
        </nav>
      </div>
    </div>
  );
}
