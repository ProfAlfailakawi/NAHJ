import React, { useState } from "react";
import {
  Layers,
  ShieldCheck,
  AlertTriangle,
  Clock,
  CheckCircle2,
  ChevronRight,
  TrendingUp,
  X,
  RotateCcw,
  Sliders,
  ShieldAlert,
  ArrowUpRight,
  GitBranch,
  FileText,
  Workflow,
  Lock,
} from "lucide-react";
import { Skill, AutonomyLevel } from "../types";

interface SkillsViewProps {
  lang: "ar" | "en";
  skills: Skill[];
  onPromoteSkill: (skillId: string, targetLevel: AutonomyLevel) => void;
  onRollbackSkill: (skillId: string, version: number) => void;
  onToggleKillSwitch: (skillId: string) => void;
}

export const SkillsView: React.FC<SkillsViewProps> = ({
  lang,
  skills,
  onPromoteSkill,
  onRollbackSkill,
  onToggleKillSwitch,
}) => {
  const isAr = lang === "ar";
  const [selectedSkill, setSelectedSkill] = useState<Skill>(skills[0]);
  const [activeTab, setActiveTab] = useState<"overview" | "steps" | "rules" | "sources" | "versions" | "autonomy">("overview");

  const autonomyLabels: Record<AutonomyLevel, { ar: string; en: string }> = {
    0: { ar: "0 — مراقبة فقط (Observe)", en: "Level 0 — Observe" },
    1: { ar: "1 — مختبر تجريبي (Practice)", en: "Level 1 — Practice" },
    2: { ar: "2 — قرارات ظل (Shadow)", en: "Level 2 — Shadow" },
    3: { ar: "3 — اقتراحات للموظف (Suggest)", en: "Level 3 — Suggest" },
    4: { ar: "4 — تجهيز المعاملة (Prepare)", en: "Level 4 — Prepare" },
    5: { ar: "5 — موافقة قبل التنفيذ (Approval)", en: "Level 5 — Approval to Execute" },
    6: { ar: "6 — تشغيل تلقائي محكوم (Autopilot)", en: "Level 6 — Autopilot" },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1 rounded-md bg-emerald-500/10 text-emerald-400">
              <Layers className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide">
              {isAr ? "الرسم البياني التشغيلي المعتمد" : "Verified Operational Graph"}
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-white">
            {isAr ? "المهارات التشغيلية المعتمدة" : "Verified Operational Skills"}
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            {isAr
              ? "كل عملية تتعلمها المنصة تتحول إلى مهارة مهيكلة وموثقة ومملوكة للمؤسسة، تكسب حق الاستقلالية تدريجيًا بعد إثبات الجدارة."
              : "Every learned procedure becomes a versioned, auditable operational skill that gradually earns autonomy."}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-xs px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300">
            <span className="text-emerald-400 font-mono font-bold">{skills.length}</span>{" "}
            {isAr ? "مهارات تشغيلية" : "Skills active"}
          </div>
        </div>
      </div>

      {/* Main Grid: Skills List + Detailed Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Skills Selection Cards */}
        <div className="lg:col-span-5 space-y-3">
          {skills.map((skill) => {
            const isSelected = selectedSkill.id === skill.id;

            return (
              <div
                key={skill.id}
                onClick={() => setSelectedSkill(skill)}
                className={`p-4 rounded-xl border transition-all cursor-pointer space-y-2.5 ${
                  isSelected
                    ? "bg-slate-900 border-emerald-500/50 shadow-md shadow-emerald-500/5"
                    : "bg-slate-900/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/90"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-emerald-400 uppercase">
                        {skill.category}
                      </span>
                      <span className="text-xs font-mono text-slate-500">v{skill.activeVersion}</span>
                      {skill.killSwitchActive && (
                        <span className="text-[10px] bg-rose-500/20 text-rose-300 px-1.5 py-0.2 rounded font-bold">
                          {isAr ? "متوقفة بطوارئ" : "Paused"}
                        </span>
                      )}
                    </div>
                    <h2 className="text-sm font-bold text-white mt-0.5">{skill.name}</h2>
                  </div>

                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-bold border ${
                      skill.autonomyLevel >= 5
                        ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                        : "bg-teal-500/10 text-teal-300 border-teal-500/30"
                    }`}
                  >
                    L{skill.autonomyLevel}
                  </span>
                </div>

                <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{skill.purpose}</p>

                {/* Evidence Metrics */}
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/60">
                  <div className="flex items-center gap-1 text-emerald-400">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span className="font-mono font-bold">{skill.reliabilityScore}%</span>
                    <span className="text-slate-500">({skill.reliabilityTier})</span>
                  </div>
                  <div>
                    <span>{skill.usageCount} {isAr ? "تنفيذ" : "runs"}</span>
                    <span className="mx-1.5">•</span>
                    <span className="text-teal-400 font-mono">{skill.hoursSavedTotal}h {isAr ? "وفرت" : "saved"}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Selected Skill Detail Panel */}
        <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-5">
          {/* Header of detail */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-medium">
                  {selectedSkill.department}
                </span>
                <span className="text-xs text-slate-500 font-mono">ID: {selectedSkill.slug}</span>
              </div>
              <h2 className="text-lg font-extrabold text-white mt-1">{selectedSkill.name}</h2>
              <div className="text-xs text-slate-400">
                {isAr ? "المسؤول البشري:" : "Owner:"} <span className="text-slate-200 font-semibold">{selectedSkill.ownerName}</span>
              </div>
            </div>

            {/* Kill Switch Toggle Button */}
            <button
              onClick={() => onToggleKillSwitch(selectedSkill.id)}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer ${
                selectedSkill.killSwitchActive
                  ? "bg-rose-500 text-white hover:bg-rose-600"
                  : "bg-slate-800 hover:bg-slate-700 text-rose-400 border border-rose-500/20"
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>
                {selectedSkill.killSwitchActive
                  ? isAr ? "استئناف العمل (إلغاء الإيقاف)" : "Resume Execution"
                  : isAr ? "إيقاف طوارئ فوري (Kill Switch)" : "Emergency Pause"}
              </span>
            </button>
          </div>

          {/* Navigation Tabs for details */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs border-b border-slate-800/80">
            <button
              onClick={() => setActiveTab("overview")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                activeTab === "overview" ? "bg-slate-800 text-emerald-400 font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              {isAr ? "نظرة عامة" : "Overview"}
            </button>
            <button
              onClick={() => setActiveTab("steps")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                activeTab === "steps" ? "bg-slate-800 text-emerald-400 font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              {isAr ? "خطوات التنفيذ (Steps)" : "Steps"} ({selectedSkill.steps.length})
            </button>
            <button
              onClick={() => setActiveTab("rules")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                activeTab === "rules" ? "bg-slate-800 text-emerald-400 font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              {isAr ? "القواعد والقرارات (Rules)" : "Rules & Decisions"}
            </button>
            <button
              onClick={() => setActiveTab("autonomy")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                activeTab === "autonomy" ? "bg-slate-800 text-emerald-400 font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              {isAr ? "سلم الاستقلالية" : "Autonomy Ladder"}
            </button>
            <button
              onClick={() => setActiveTab("versions")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                activeTab === "versions" ? "bg-slate-800 text-emerald-400 font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              {isAr ? "الإصدارات والتراجع" : "Versions & Rollback"}
            </button>
          </div>

          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <div className="space-y-4">
              <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                {selectedSkill.purpose}
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs">
                  <span className="text-slate-400 block mb-1">{isAr ? "مستوى الاستقلالية:" : "Autonomy:"}</span>
                  <span className="font-bold text-white text-sm">
                    {autonomyLabels[selectedSkill.autonomyLevel][isAr ? "ar" : "en"]}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs">
                  <span className="text-slate-400 block mb-1">{isAr ? "درجة الموثوقية:" : "Reliability Score:"}</span>
                  <span className="font-mono font-bold text-emerald-400 text-sm">
                    {selectedSkill.reliabilityScore}%
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs">
                  <span className="text-slate-400 block mb-1">{isAr ? "مستوى المخاطر:" : "Risk Profile:"}</span>
                  <span className="font-bold text-amber-400 capitalize text-sm">
                    {selectedSkill.riskLevel}
                  </span>
                </div>
              </div>

              {/* Actions Allowed List (Prompt Section 111) */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="text-xs font-semibold text-slate-300 block">
                  {isAr ? "الأفعال المصرح للذكاء الاصطناعي بتنفيذها (Action Allowlist):" : "Authorized Actions Allowlist:"}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedSkill.allowedActions.map((act) => (
                    <span
                      key={act}
                      className="text-xs font-mono px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-emerald-400"
                    >
                      {act}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: STEPS */}
          {activeTab === "steps" && (
            <div className="space-y-3">
              {selectedSkill.steps.map((st) => (
                <div
                  key={st.id}
                  className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold flex items-center justify-center">
                        {st.order}
                      </span>
                      <span className="font-bold text-slate-200">{st.title}</span>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${
                        st.isAutomated
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      }`}
                    >
                      {st.isAutomated ? (isAr ? "آلي" : "Automated") : (isAr ? "موافقة بشرية" : "Human Approval")}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 ps-7 leading-relaxed">{st.description}</p>
                  <div className="flex items-center gap-2 ps-7 text-[11px] text-teal-400 font-mono">
                    <span>النظام: {st.system}</span>
                    {st.decisionRule && <span className="text-amber-400">({st.decisionRule})</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 3: RULES & DECISIONS */}
          {activeTab === "rules" && (
            <div className="space-y-3">
              <div className="text-xs text-slate-400">
                {isAr
                  ? "القواعد الحتمية المقيدة لعمل الذكاء الاصطناعي في هذه المهارة:"
                  : "Deterministic business rules gating this skill:"}
              </div>
              {selectedSkill.decisions.map((dec, i) => (
                <div key={i} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-amber-400">شرط: {dec.condition}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 uppercase font-mono text-slate-400">
                      {dec.risk} risk
                    </span>
                  </div>
                  <div className="text-slate-200 ps-2 border-s-2 border-emerald-500">
                    النتيجة المقررة: {dec.outcome}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 4: AUTONOMY LADDER */}
          {activeTab === "autonomy" && (
            <div className="space-y-4">
              <div className="text-xs text-slate-300">
                {isAr
                  ? "سلم الترقية التدريجي: لا يحصل الذكاء الاصطناعي على استقلالية أعلى إلا بعد إثبات الجدارة بنسبة نجاح >85% في الاختبارات."
                  : "Autonomy Ladder: AI earns higher autonomy gradually after passing verification thresholds."}
              </div>

              <div className="space-y-2">
                {([0, 1, 2, 3, 4, 5, 6] as AutonomyLevel[]).map((lvl) => {
                  const isCurrent = selectedSkill.autonomyLevel === lvl;

                  return (
                    <div
                      key={lvl}
                      className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                        isCurrent
                          ? "bg-emerald-950/20 border-emerald-500/50 text-white font-bold"
                          : "bg-slate-950 border-slate-800 text-slate-400"
                      }`}
                    >
                      <div className="flex items-center gap-3 text-xs">
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center font-bold font-mono text-xs ${
                            isCurrent ? "bg-emerald-500 text-white" : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {lvl}
                        </span>
                        <div>{autonomyLabels[lvl][isAr ? "ar" : "en"]}</div>
                      </div>

                      {!isCurrent && (
                        <button
                          onClick={() => onPromoteSkill(selectedSkill.id, lvl)}
                          className="text-xs px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 font-semibold transition-colors cursor-pointer"
                        >
                          {isAr ? "تعيين هذا المستوى" : "Set Level"}
                        </button>
                      )}
                      {isCurrent && (
                        <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                          {isAr ? "المستوى الحالي" : "Current"}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 5: VERSIONS & ROLLBACK */}
          {activeTab === "versions" && (
            <div className="space-y-3">
              <div className="text-xs text-slate-400">
                {isAr
                  ? "سجل الإصدارات الموثقة وإمكانية التراجع الفوري دون فقدان بيانات التدقيق:"
                  : "Version history and instant rollback without losing audit traces:"}
              </div>

              {selectedSkill.versions.map((ver) => {
                const isCurrentVer = selectedSkill.activeVersion === ver.version;

                return (
                  <div
                    key={ver.version}
                    className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                      isCurrentVer ? "bg-slate-950 border-emerald-500/40" : "bg-slate-950/60 border-slate-800"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white font-mono text-sm">v{ver.version}</span>
                        <span className="text-slate-400">({ver.createdAt})</span>
                        {isCurrentVer && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
                            {isAr ? "الإصدار النشط" : "Active"}
                          </span>
                        )}
                      </div>

                      {!isCurrentVer && (
                        <button
                          onClick={() => onRollbackSkill(selectedSkill.id, ver.version)}
                          className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs px-2.5 py-1 rounded-lg border border-slate-700 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>{isAr ? `استرجاع v${ver.version}` : `Rollback to v${ver.version}`}</span>
                        </button>
                      )}
                    </div>

                    <p className="text-slate-300 leading-relaxed">{ver.changeSummary}</p>
                    <div className="text-[11px] text-slate-500">
                      {isAr ? "معتمد بواسطة:" : "Approved by:"} {ver.approvedBy}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
