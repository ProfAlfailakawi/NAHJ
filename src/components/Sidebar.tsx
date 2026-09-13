import React from "react";
import {
  Sun,
  Lightbulb,
  GraduationCap,
  Sparkles,
  Layers,
  FlaskConical,
  Briefcase,
  MessageSquare,
  Link2,
  BarChart3,
  Sliders,
  History,
  AlertCircle,
  HelpCircle,
} from "lucide-react";

export type NavTab =
  | "today"
  | "learn"
  | "teach"
  | "skills"
  | "practice"
  | "work"
  | "simulator"
  | "connections"
  | "analytics"
  | "control"
  | "audit";

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  lang: "ar" | "en";
  pendingApprovalsCount: number;
  newLearnedItemsCount: number;
  activeWorkCount: number;
  onOpenTeachModal?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  lang,
  pendingApprovalsCount,
  newLearnedItemsCount,
  activeWorkCount,
}) => {
  const isAr = lang === "ar";

  const navItems = [
    {
      id: "today" as NavTab,
      labelAr: "اليوم",
      labelEn: "Today",
      icon: Sun,
      badge: pendingApprovalsCount > 0 ? `${pendingApprovalsCount}` : undefined,
      badgeVariant: "rose",
    },
    {
      id: "learn" as NavTab,
      labelAr: "التعلم الحي",
      labelEn: "Learn",
      icon: Lightbulb,
      badge: newLearnedItemsCount > 0 ? `${newLearnedItemsCount}` : undefined,
      badgeVariant: "amber",
    },
    {
      id: "teach" as NavTab,
      labelAr: "تعليم الذكاء الاصطناعي",
      labelEn: "Teach AI",
      icon: GraduationCap,
      special: true,
    },
    {
      id: "skills" as NavTab,
      labelAr: "المهارات المعتمدة",
      labelEn: "Skills",
      icon: Layers,
    },
    {
      id: "practice" as NavTab,
      labelAr: "المختبر والظل",
      labelEn: "Practice & Shadow",
      icon: FlaskConical,
    },
    {
      id: "work" as NavTab,
      labelAr: "سير العمل الحي",
      labelEn: "Live Work",
      icon: Briefcase,
      badge: activeWorkCount > 0 ? `${activeWorkCount}` : undefined,
      badgeVariant: "blue",
    },
    {
      id: "simulator" as NavTab,
      labelAr: "محاكي ولي الأمر",
      labelEn: "Customer Simulator",
      icon: MessageSquare,
      highlight: true,
    },
    {
      id: "connections" as NavTab,
      labelAr: "الموصلات و MCP",
      labelEn: "Connections & MCP",
      icon: Link2,
      badge: "MCP",
      badgeVariant: "emerald",
    },
    {
      id: "analytics" as NavTab,
      labelAr: "الأثر والتحليلات",
      labelEn: "Analytics",
      icon: BarChart3,
    },
    {
      id: "control" as NavTab,
      labelAr: "الحوكمة والأمان",
      labelEn: "Control",
      icon: Sliders,
    },
    {
      id: "audit" as NavTab,
      labelAr: "سجل التدقيق",
      labelEn: "Audit Log",
      icon: History,
    },
  ];

  return (
    <aside className="w-full lg:w-64 shrink-0 bg-slate-900/60 border-e border-slate-800 p-3 lg:py-4 flex flex-col justify-between">
      {/* Navigation Links */}
      <nav className="space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;

          if (item.special) {
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-semibold text-xs transition-all mb-2 ${
                  isActive
                    ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20"
                    : "bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/25 text-emerald-300"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 text-emerald-300" />
                  <span>{isAr ? item.labelAr : item.labelEn}</span>
                </div>
                <span className="text-[10px] bg-emerald-500/30 text-emerald-200 px-1.5 py-0.5 rounded-md uppercase font-bold">
                  {isAr ? "استوديو" : "Studio"}
                </span>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? "bg-slate-800 text-emerald-400 font-semibold shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-slate-800/50"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon
                  className={`w-4 h-4 ${
                    isActive
                      ? "text-emerald-400"
                      : item.highlight
                      ? "text-teal-400"
                      : "text-slate-400 group-hover:text-slate-200"
                  }`}
                />
                <span>{isAr ? item.labelAr : item.labelEn}</span>
              </div>

              {item.badge && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    item.badgeVariant === "rose"
                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                      : item.badgeVariant === "amber"
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Institutional Memory Bottom Status Card */}
      <div className="mt-4 p-3 rounded-xl bg-slate-950/60 border border-slate-800/90 text-xs">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            {isAr ? "العقل التشغيلي" : "Company Brain"}
          </span>
          <span className="text-[10px] text-emerald-400 font-mono font-bold">143 Process</span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-1.5 mb-2 overflow-hidden">
          <div className="bg-emerald-500 h-full rounded-full" style={{ width: "76%" }} />
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          {isAr
            ? "76% من إجراءات المؤسسة موثقة ومعتمدة داخل النظام."
            : "76% of organizational processes codified & verified."}
        </p>
      </div>
    </aside>
  );
};
