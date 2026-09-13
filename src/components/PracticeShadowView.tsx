import React, { useState } from "react";
import {
  FlaskConical,
  Eye,
  CheckCircle2,
  XCircle,
  Play,
  TrendingUp,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { PracticeCase, ShadowComparison } from "../types";

interface PracticeShadowViewProps {
  lang: "ar" | "en";
  practiceCases: PracticeCase[];
  shadowComparisons: ShadowComparison[];
  onRunPracticeSuite: () => void;
  isRunningSuite: boolean;
}

export const PracticeShadowView: React.FC<PracticeShadowViewProps> = ({
  lang,
  practiceCases,
  shadowComparisons,
  onRunPracticeSuite,
  isRunningSuite,
}) => {
  const isAr = lang === "ar";
  const [activeTab, setActiveTab] = useState<"practice" | "shadow">("practice");

  const passedCasesCount = practiceCases.filter((c) => c.status === "passed").length;
  const passRate = Math.round((passedCasesCount / practiceCases.length) * 100);

  const matchedShadowCount = shadowComparisons.filter((s) => s.matched).length;
  const shadowConcordance = Math.round((matchedShadowCount / shadowComparisons.length) * 100);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1 rounded-md bg-teal-500/10 text-teal-400">
              <FlaskConical className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold text-teal-400 uppercase tracking-wide">
              {isAr ? "مختبر التقييم والاعتماد التجريبي" : "Evaluation Bench & Shadow Sandbox"}
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-white">
            {isAr ? "المختبر التجريبي ووضع الظل (Practice & Shadow)" : "Practice & Shadow Verification"}
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            {isAr
              ? "الذكاء الاصطناعي لا يلمس بيانات العملاء أو الأنظمة الحية إلا بعد اجتياز حالات الاختبار التاريخية، ومحاكاة قرارات الموظفين في وضع الظل."
              : "AI never touches live customer workflows without proving accuracy against historical scenarios and silent shadow matching."}
          </p>
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs">
          <button
            onClick={() => setActiveTab("practice")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === "practice"
                ? "bg-slate-800 text-teal-400 font-bold shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            <span>{isAr ? "المختبر التجريبي (Practice)" : "Practice Mode"}</span>
          </button>
          <button
            onClick={() => setActiveTab("shadow")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === "shadow"
                ? "bg-slate-800 text-emerald-400 font-bold shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{isAr ? "وضع الظل (Shadow Mode)" : "Shadow Mode"}</span>
          </button>
        </div>
      </div>

      {/* PRACTICE MODE */}
      {activeTab === "practice" && (
        <div className="space-y-5">
          {/* Top Score & Action Card */}
          <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center font-mono font-extrabold text-2xl text-teal-400">
                {passRate}%
              </div>
              <div>
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  {isAr ? "نتيجة اجتياز حالات الاختبار التاريخية" : "Historical Test Suite Score"}
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                    {passedCasesCount} / {practiceCases.length} {isAr ? "حالات ناجحة" : "passed"}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {isAr
                    ? "الحد الأدنى للترقية إلى وضع الظل (Level 2) هو 85%. المهارة الحالية مؤهلة للاعتماد."
                    : "Graduation requirement is >85% pass rate on edge-cases and regulatory checks."}
                </p>
              </div>
            </div>

            <button
              disabled={isRunningSuite}
              onClick={onRunPracticeSuite}
              className="shrink-0 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 disabled:opacity-50 text-white font-bold text-xs px-4 py-3 rounded-xl shadow-lg shadow-teal-500/20 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Play className={`w-4 h-4 ${isRunningSuite ? "animate-spin" : ""}`} />
              <span>
                {isRunningSuite
                  ? isAr ? "جارٍ تشغيل الاختبارات الآلية..." : "Running 10 test cases..."
                  : isAr ? "إعادة تشغيل مجموعة الاختبار (Run 10 Tests)" : "Run Full Practice Suite"}
              </span>
            </button>
          </div>

          {/* Test Cases Table/List */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {isAr ? "حالات الاختبار وحواف العمليات (Edge Cases & Synthetic Runs):" : "Synthetic & Historical Scenarios:"}
            </div>

            <div className="space-y-2">
              {practiceCases.map((cs) => (
                <div
                  key={cs.id}
                  className="bg-slate-900/80 border border-slate-800/90 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-400">{cs.id}</span>
                      <span className="font-bold text-sm text-white">{cs.title}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                        {cs.type}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300">{cs.inputDescription}</p>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2 pt-0.5">
                      <span className="text-emerald-400">المتوقع: {cs.expectedOutcome}</span>
                      <span>•</span>
                      <span className="text-teal-400">النتيجة: {cs.actualOutcome}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-end">
                      <div className="text-xs font-mono font-bold text-slate-300">{cs.score}% match</div>
                      <div className="text-[10px] text-slate-500">{cs.durationMs}ms</div>
                    </div>
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SHADOW MODE (Prompt Section 14) */}
      {activeTab === "shadow" && (
        <div className="space-y-5">
          {/* Top Metric */}
          <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center font-mono font-extrabold text-2xl text-emerald-400">
                {shadowConcordance}%
              </div>
              <div>
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  {isAr ? "معدل تطابق قرارات الذكاء الاصطناعي مع قرارات الموظفين الحقيقيين" : "Shadow Concordance Rate"}
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                    {matchedShadowCount} / {shadowComparisons.length} {isAr ? "تطابق تام" : "matches"}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {isAr
                    ? "الذكاء الاصطناعي يستمع لكل معاملة حقيقية وينتج قراره في الظل دون تنفيذه، ثم نقارنه بما فعله الموظف فعليًا."
                    : "AI mirrors real production workflows silently, producing decisions compared against actual human choices."}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-xs text-emerald-300 font-semibold max-w-xs">
              {isAr
                ? "✨ توصية الترقية: المهارة مؤهلة للترقية إلى Level 3 (تقديم اقتراحات حية للموظفين)."
                : "✨ Ready for graduation to Level 3 (Active Suggestions)."}
            </div>
          </div>

          {/* Side by Side Comparison Feed */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {isAr ? "مقارنة القرارات الحية جنبًا إلى جنب (Human vs AI Shadow):" : "Side-by-Side Operational Decisions:"}
            </div>

            <div className="space-y-3">
              {shadowComparisons.map((item) => (
                <div
                  key={item.id}
                  className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-400">{item.workItemId}</span>
                      <span className="font-bold text-white">{item.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">{item.timestamp}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                          item.matched
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        }`}
                      >
                        {item.matched ? (isAr ? "تطابق 100%" : "Full Match") : (isAr ? "تباين طفيف" : "Divergence")}
                      </span>
                    </div>
                  </div>

                  {/* Side-by-side boxes */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Human Action */}
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-300">
                          {isAr ? "قرار الموظف البشري:" : "Human Staff Action:"}
                        </span>
                        <span className="text-slate-500 text-[11px]">{item.humanActor}</span>
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed">{item.humanDecision}</p>
                    </div>

                    {/* AI Shadow Decision */}
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-emerald-500/20 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-emerald-400">
                          {isAr ? "قرار الذكاء الاصطناعي (في الظل):" : "AI Shadow Decision:"}
                        </span>
                        <span className="text-emerald-400 text-[11px] font-mono">{item.confidence}% conf</span>
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed">{item.aiDecision}</p>
                    </div>
                  </div>

                  {item.divergenceReason && (
                    <div className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-lg">
                      <span className="font-bold">{isAr ? "سبب التباين: " : "Divergence Analysis: "}</span>
                      {item.divergenceReason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
