import React from "react";
import {
  BarChart3,
  TrendingUp,
  Clock,
  CheckCircle2,
  Sparkles,
  Zap,
  ArrowDownRight,
  ArrowUpRight,
  ShieldCheck,
  Building2,
} from "lucide-react";

interface AnalyticsViewProps {
  lang: "ar" | "en";
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ lang }) => {
  const isAr = lang === "ar";

  const comparisonRows = [
    {
      process: isAr ? "تسجيل وقبول طالب جديد (KG)" : "New Student Admission (KG)",
      before: isAr ? "48 ساعة عمل" : "48 staff hours",
      after: isAr ? "4.5 دقيقة" : "4.5 minutes",
      savings: "99.8%",
    },
    {
      process: isAr ? "فحص الوثائق ومطابقة العمر" : "Document & Age Verification",
      before: isAr ? "6 ساعات" : "6 hours",
      after: isAr ? "10 ثوانٍ" : "10 seconds",
      savings: "99.9%",
    },
    {
      process: isAr ? "إعادة تخصيص مقاعد الانتظار" : "Waitlist Seat Reallocation",
      before: isAr ? "24 ساعة" : "24 hours",
      after: isAr ? "دقيقة واحدة" : "1 minute",
      savings: "99.3%",
    },
    {
      process: isAr ? "مطابقة سداد الرسوم وإصدار الرقم" : "Tuition Clearance & SIS Sync",
      before: isAr ? "3 أيام" : "3 days",
      after: isAr ? "12 دقيقة" : "12 minutes",
      savings: "99.7%",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1 rounded-md bg-teal-500/10 text-teal-400">
              <BarChart3 className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold text-teal-400 uppercase tracking-wide">
              {isAr ? "مؤشرات الأداء والعائد التشغيلي (ROI)" : "Operational Impact & ROI"}
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-white">
            {isAr ? "الأثر والتحليلات التشغيلية" : "Operational Impact & Analytics"}
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            {isAr
              ? "تحليل دقيق لساعات العمل المحررة، سرعة إنجاز المعاملات، ونسبة استئصال الأخطاء البشرية في إدخال البيانات."
              : "Measurable metrics on staff hours reclaimed, process cycle time reductions, and error eradication."}
          </p>
        </div>

        <div className="text-xs px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300">
          {isAr ? "آخر 30 يومًا تشغيليًا" : "Last 30 Operational Days"}
        </div>
      </div>

      {/* Top 4 Impact Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{isAr ? "إجمالي الساعات المحررة" : "Hours Reclaimed"}</span>
            <Clock className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">482 <span className="text-xs font-normal text-slate-400">{isAr ? "ساعة" : "hrs"}</span></div>
          <div className="text-[11px] text-emerald-400 flex items-center gap-0.5">
            <ArrowUpRight className="w-3 h-3" />
            <span>+34% {isAr ? "عن الشهر الماضي" : "vs previous month"}</span>
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{isAr ? "دقة التطابق مع الموظفين" : "Concordance Rate"}</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">94.8%</div>
          <div className="text-[11px] text-slate-400">
            {isAr ? "في 1,420 قرار ظل متطابق" : "Across 1,420 shadow runs"}
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{isAr ? "انخفاض الأخطاء اليدوية" : "Error Reduction"}</span>
            <ArrowDownRight className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">-91.2%</div>
          <div className="text-[11px] text-teal-400">
            {isAr ? "صفر حالات تسجيل بأعمار مخالفة" : "Zero age misclassifications"}
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{isAr ? "الوفر المالي المباشر" : "Financial Value Saved"}</span>
            <Sparkles className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">14,200 <span className="text-xs font-normal text-slate-400">{isAr ? "د.ك" : "KWD"}</span></div>
          <div className="text-[11px] text-slate-400">
            {isAr ? "وفورات تكاليف التشغيل والوقت" : "Equivalent operational value"}
          </div>
        </div>
      </div>

      {/* Speed & Duration Comparison Infographic Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Zap className="w-4 h-4 text-teal-400" />
            <span>{isAr ? "مقارنة زمن إنجاز الإجراءات: التقليدي مقابل نَهْج" : "Process Duration: Before vs. With NAHJ"}</span>
          </h2>
          <span className="text-xs text-emerald-400 font-mono font-bold">99% Faster</span>
        </div>

        <div className="space-y-2.5">
          {comparisonRows.map((r, i) => (
            <div
              key={i}
              className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
            >
              <div className="font-bold text-white max-w-sm">{r.process}</div>

              <div className="flex items-center gap-6">
                <div>
                  <span className="text-slate-500 block text-[10px]">{isAr ? "الطريقة التقليدية:" : "Manual Staff:"}</span>
                  <span className="text-slate-300 font-mono font-semibold">{r.before}</span>
                </div>

                <div>
                  <span className="text-slate-500 block text-[10px]">{isAr ? "مع منصة نَهْج:" : "With NAHJ:"}</span>
                  <span className="text-teal-400 font-mono font-bold">{r.after}</span>
                </div>

                <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono font-bold text-xs">
                  {r.savings}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
