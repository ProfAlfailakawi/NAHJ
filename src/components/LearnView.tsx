import React, { useState } from "react";
import {
  Lightbulb,
  AlertTriangle,
  GitFork,
  Sparkles,
  CheckCircle2,
  HelpCircle,
  TrendingUp,
  Clock,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
  Zap,
} from "lucide-react";
import { LearningProposal } from "../types";

interface LearnViewProps {
  lang: "ar" | "en";
  proposals: LearningProposal[];
  onResolveClarification: (proposalId: string, clarificationId: string, answer: string) => void;
}

export const LearnView: React.FC<LearnViewProps> = ({
  lang,
  proposals,
  onResolveClarification,
}) => {
  const isAr = lang === "ar";
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [justResolvedId, setJustResolvedId] = useState<string | null>(null);

  const filteredProposals = proposals.filter((p) => {
    if (activeFilter === "conflicts") return p.type === "conflict";
    if (activeFilter === "drift") return p.type === "process_drift";
    if (activeFilter === "improvements") return p.type === "improvement";
    return true;
  });

  const handleSelectOption = (proposalId: string, clarificationId: string, option: string) => {
    setSelectedAnswers((prev) => ({ ...prev, [`${proposalId}_${clarificationId}`]: option }));
  };

  const handleSaveClarification = (proposalId: string, clarificationId: string) => {
    const key = `${proposalId}_${clarificationId}`;
    const ans = selectedAnswers[key];
    if (ans) {
      onResolveClarification(proposalId, clarificationId, ans);
      setJustResolvedId(proposalId);
      setTimeout(() => setJustResolvedId(null), 3000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1 rounded-md bg-amber-500/10 text-amber-400">
              <Lightbulb className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wide">
              {isAr ? "محرك الاكتشاف والملاحظة الحية" : "Continuous Observation & Discovery Engine"}
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-white">
            {isAr ? "التعلم الحي (What I Learned)" : "What I Learned"}
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            {isAr
              ? "الذكاء الاصطناعي لا يحوّل الملاحظات لسياسات سرًا. هنا تُعرض الأنماط المكتشفة، التضاربات، وفرص التحسين لتعتمدها القيادة."
              : "AI never silently converts observed behavior into official policy. Patterns, conflicts, and improvements are reviewed and codified here."}
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs">
          <button
            onClick={() => setActiveFilter("all")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeFilter === "all" ? "bg-slate-800 text-emerald-400 shadow-sm" : "text-slate-400 hover:text-white"
            }`}
          >
            {isAr ? "جميع الاكتشافات" : "All"} ({proposals.length})
          </button>
          <button
            onClick={() => setActiveFilter("conflicts")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeFilter === "conflicts" ? "bg-slate-800 text-amber-400 shadow-sm" : "text-slate-400 hover:text-white"
            }`}
          >
            {isAr ? "تضاربات" : "Conflicts"}
          </button>
          <button
            onClick={() => setActiveFilter("drift")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeFilter === "drift" ? "bg-slate-800 text-rose-400 shadow-sm" : "text-slate-400 hover:text-white"
            }`}
          >
            {isAr ? "انحراف إجرائي" : "Process Drift"}
          </button>
          <button
            onClick={() => setActiveFilter("improvements")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeFilter === "improvements" ? "bg-slate-800 text-teal-400 shadow-sm" : "text-slate-400 hover:text-white"
            }`}
          >
            {isAr ? "فرص تحسين" : "Improvements"}
          </button>
        </div>
      </div>

      {/* Discovery Feed Cards */}
      <div className="space-y-4">
        {filteredProposals.map((prop) => {
          const isResolved = prop.status === "resolved" || justResolvedId === prop.id;

          return (
            <div
              key={prop.id}
              className={`bg-slate-900/90 border rounded-2xl p-5 transition-all ${
                isResolved
                  ? "border-emerald-500/40 bg-emerald-950/10"
                  : prop.type === "conflict"
                  ? "border-amber-500/30"
                  : prop.type === "process_drift"
                  ? "border-rose-500/30"
                  : "border-slate-800"
              }`}
            >
              {/* Header Info */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                      prop.type === "conflict"
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        : prop.type === "process_drift"
                        ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                        : prop.type === "improvement"
                        ? "bg-teal-500/10 text-teal-400 border-teal-500/20"
                        : "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                    }`}
                  >
                    {prop.type === "conflict"
                      ? isAr ? "تضارب ممارسات" : "Conflicting Practice"
                      : prop.type === "process_drift"
                      ? isAr ? "انحراف تشغيلي (Drift)" : "Process Drift"
                      : prop.type === "improvement"
                      ? isAr ? "فرصة تحسين" : "Improvement Proposal"
                      : isAr ? "خطر ذاكرة مؤسسية" : "Institutional Risk"}
                  </span>
                  <span className="text-xs text-slate-400">
                    {prop.observedCasesCount} {isAr ? "حالة واقعية مرصودة" : "observed cases"}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span>{prop.detectedAt}</span>
                  <span className="font-mono text-emerald-400 font-medium">
                    {prop.confidence}% {isAr ? "دقة الرصد" : "detection accuracy"}
                  </span>
                </div>
              </div>

              {/* Title & Description */}
              <div className="mt-3 space-y-1.5">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  {prop.title}
                  {isResolved && (
                    <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {isAr ? "تم حسم السياسة واعتمادها" : "Policy Codified"}
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed max-w-4xl">{prop.summary}</p>
              </div>

              {/* Conflict Evidence Visual Infographic (Prompt Section 16 & 17) */}
              {prop.evidence.methodA && prop.evidence.methodB && (
                <div className="mt-4 p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                  <div className="text-xs font-semibold text-slate-400">
                    {isAr ? "مقارنة الطرق المتبعة فعليًا بين الموظفين:" : "Observed Employee Methods Comparison:"}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Method A */}
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800/90 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-200">{prop.evidence.methodA.name}</span>
                        <span className="font-mono font-extrabold text-amber-400">
                          {prop.evidence.methodA.percentage}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-amber-500 h-full rounded-full"
                          style={{ width: `${prop.evidence.methodA.percentage}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                        <span>متوسط الإنجاز: {prop.evidence.methodA.durationMin} دقيقة</span>
                        <span>نسبة الخطأ: {prop.evidence.methodA.errorRate}%</span>
                      </div>
                    </div>

                    {/* Method B */}
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800/90 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-200">{prop.evidence.methodB.name}</span>
                        <span className="font-mono font-extrabold text-teal-400">
                          {prop.evidence.methodB.percentage}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-teal-500 h-full rounded-full"
                          style={{ width: `${prop.evidence.methodB.percentage}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                        <span>متوسط الإنجاز: {prop.evidence.methodB.durationMin} دقيقة</span>
                        <span>نسبة الخطأ: {prop.evidence.methodB.errorRate}%</span>
                      </div>
                    </div>
                  </div>

                  {prop.evidence.details && (
                    <div className="text-[11px] text-slate-400 bg-slate-900/60 p-2 rounded-md">
                      {prop.evidence.details}
                    </div>
                  )}
                </div>
              )}

              {/* Clarification Questions - Prompt Section 169 */}
              {prop.clarifications && prop.clarifications.length > 0 && !isResolved && (
                <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-amber-500/20 space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                    <HelpCircle className="w-4 h-4" />
                    <span>{isAr ? "سؤال الحسم وتحديد السياسة الرسمية:" : "Policy Clarification Required:"}</span>
                  </div>

                  {prop.clarifications.map((c) => {
                    const key = `${prop.id}_${c.id}`;
                    const selected = selectedAnswers[key] || c.selectedAnswer;

                    return (
                      <div key={c.id} className="space-y-2">
                        <p className="text-xs font-semibold text-slate-200">{c.question}</p>
                        <div className="space-y-1.5">
                          {c.options.map((opt, idx) => (
                            <label
                              key={idx}
                              onClick={() => handleSelectOption(prop.id, c.id, opt)}
                              className={`w-full flex items-center gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                                selected === opt
                                  ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-300 font-semibold"
                                  : "bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800/80"
                              }`}
                            >
                              <input
                                type="radio"
                                name={c.id}
                                checked={selected === opt}
                                onChange={() => {}}
                                className="text-emerald-500 focus:ring-emerald-500"
                              />
                              <span>{opt}</span>
                            </label>
                          ))}
                        </div>

                        <div className="pt-2 flex justify-end">
                          <button
                            disabled={!selected}
                            onClick={() => handleSaveClarification(prop.id, c.id)}
                            className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:pointer-events-none text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer"
                          >
                            {isAr ? "اعتماد هذه السياسة وحفظها بالعقل التشغيلي" : "Codify Selected Policy"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
