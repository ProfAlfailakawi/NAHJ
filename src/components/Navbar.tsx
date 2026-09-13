import React from "react";
import {
  Brain,
  ShieldCheck,
  AlertTriangle,
  Bell,
  Search,
  Globe,
  Briefcase,
  ChevronDown,
  CheckCircle2,
} from "lucide-react";
import { User, Organization } from "../types";

interface NavbarProps {
  organization: Organization;
  users: User[];
  currentUser: User;
  onSwitchUser: (userId: string) => void;
  lang: "ar" | "en";
  onToggleLang: () => void;
  perspective: "executive" | "manager" | "employee";
  onPerspectiveChange: (p: "executive" | "manager" | "employee") => void;
  pendingApprovalsCount: number;
  onOpenApprovals: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  organization,
  users,
  currentUser,
  onSwitchUser,
  lang,
  onToggleLang,
  perspective,
  onPerspectiveChange,
  pendingApprovalsCount,
  onOpenApprovals,
  searchQuery,
  onSearchChange,
}) => {
  const isAr = lang === "ar";

  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 lg:px-6 py-3 transition-colors">
      <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto">
        {/* Brand & Organization */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight text-white">
                {isAr ? "نَهْج" : "NAHJ"}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                {isAr ? "العقل التشغيلي" : "Company Brain"}
              </span>
            </div>
            <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
              <span>{isAr ? organization.name : organization.nameEn}</span>
              <span className="inline-block w-1 h-1 rounded-full bg-slate-600" />
              <span className="text-emerald-400/90 flex items-center gap-0.5 text-[11px]">
                <ShieldCheck className="w-3 h-3" />
                {organization.verifiedSkillsCount} {isAr ? "مهارات معتمدة" : "Verified Skills"}
              </span>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="hidden md:flex flex-1 max-w-md mx-4">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={
                isAr
                  ? "ابحث في المهارات، السياسات، الحالات، المعرفة..."
                  : "Search skills, policies, work items, sources..."
              }
              className="w-full bg-slate-950/70 border border-slate-800 rounded-lg ps-9 pe-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-all"
            />
          </div>
        </div>

        {/* Perspective, Approvals & User Switcher */}
        <div className="flex items-center gap-2.5">
          {/* Perspective Selector (Executive / Operational / Employee) */}
          <div className="hidden lg:flex items-center bg-slate-950/80 p-0.5 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => onPerspectiveChange("executive")}
              className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                perspective === "executive"
                  ? "bg-slate-800 text-emerald-400 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {isAr ? "رؤية القيادة (CEO)" : "Executive"}
            </button>
            <button
              onClick={() => onPerspectiveChange("manager")}
              className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                perspective === "manager"
                  ? "bg-slate-800 text-emerald-400 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {isAr ? "إدارة العمليات" : "Operations"}
            </button>
            <button
              onClick={() => onPerspectiveChange("employee")}
              className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                perspective === "employee"
                  ? "bg-slate-800 text-emerald-400 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {isAr ? "الموظف والميدان" : "Staff View"}
            </button>
          </div>

          {/* Pending Approvals Bell */}
          <button
            onClick={onOpenApprovals}
            className="relative p-2 rounded-lg bg-slate-950/70 border border-slate-800 hover:border-slate-700 text-slate-300 transition-colors"
            title={isAr ? "الموافقات المطلوبة" : "Pending Approvals"}
          >
            <Bell className="w-4 h-4" />
            {pendingApprovalsCount > 0 && (
              <span className="absolute -top-1 -end-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                {pendingApprovalsCount}
              </span>
            )}
          </button>

          {/* Language Toggle */}
          <button
            onClick={onToggleLang}
            className="px-2 py-1.5 rounded-lg bg-slate-950/70 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 flex items-center gap-1 transition-colors"
          >
            <Globe className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold">{isAr ? "English" : "العربية"}</span>
          </button>

          {/* Demo User Switcher Dropdown */}
          <div className="relative group">
            <button className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 hover:border-slate-700 px-2.5 py-1.5 rounded-lg text-xs transition-colors">
              <span className="text-base leading-none">{currentUser.avatar}</span>
              <div className="text-start hidden sm:block">
                <div className="font-semibold text-slate-200 leading-tight">{currentUser.name}</div>
                <div className="text-[10px] text-emerald-400 leading-tight capitalize">{currentUser.role}</div>
              </div>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {/* Dropdown Menu */}
            <div className="absolute end-0 mt-1 w-56 bg-slate-900 border border-slate-800 rounded-xl shadow-xl p-1.5 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all z-50">
              <div className="text-[11px] font-medium text-slate-400 px-2.5 py-1 border-b border-slate-800/80 mb-1">
                {isAr ? "التبديل بين أدوار العرض التجريبي:" : "Switch Demo Perspective:"}
              </div>
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => onSwitchUser(u.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                    currentUser.id === u.id
                      ? "bg-emerald-500/10 text-emerald-400 font-semibold"
                      : "text-slate-300 hover:bg-slate-800/70"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span>{u.avatar}</span>
                    <div className="text-start">
                      <div>{u.name}</div>
                      <div className="text-[10px] text-slate-400">{u.department}</div>
                    </div>
                  </div>
                  {currentUser.id === u.id && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
