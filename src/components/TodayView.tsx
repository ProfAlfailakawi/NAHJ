import React from "react";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  Brain,
  Lightbulb,
  ArrowUpRight,
  ArrowRight,
  Sparkles,
  ShieldAlert,
  ChevronRight,
  GraduationCap,
  Play,
  Layers,
  FileCheck2,
} from "lucide-react";
import { NavTab } from "./Sidebar";
import { WorkItem, ApprovalRequest } from "../types";

interface TodayViewProps {
  lang: "ar" | "en";
  onNavigate: (tab: NavTab) => void;
  approvals: ApprovalRequest[];
  workItems: WorkItem[];
  onOpenApproval: (id: string) => void;
}

export const TodayView: React.FC<TodayViewProps> = ({
  lang,
  onNavigate,
  approvals,
  workItems,
  onOpenApproval,
}) => {
  const isAr = lang === "ar";

  return (
    <div className="space-y-6">
      {/* Top Banner / Pulse */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-900/80 border border-slate-800 p-5 rounded-2xl shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide">
              {isAr ? "الحالة التشغيلية: نشطة ومحمية" : "Operational Status: Active & Governed"}
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-extrabold text-white">
            {isAr ? "اليوم في أكاديمية المستقبل" : "Today at Future Academy"}
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            {isAr
              ? "الذكاء الاصطناعي ينفذ المهام المعتمدة، يراقب الانحرافات التشغيلية، ويطلب موافقتك عند الحدود المالية."
              : "AI executes verified skills, monitors process drift, and holds for your sign-off at risk boundaries."}
          </p>
        </div>

        {/* Quick Action CTA */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => onNavigate("teach")}
            className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
          >
            <GraduationCap className="w-4 h-4" />
            <span>{isAr ? "علّم الذكاء الاصطناعي مهارة جديدة" : "Teach AI a Skill"}</span>
          </button>
          <button
            onClick={() => onNavigate("simulator")}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-2.5 rounded-xl border border-slate-700 transition-colors"
          >
            <Play className="w-3.5 h-3.5 text-teal-400" />
            <span>{isAr ? "محاكي ولي الأمر" : "Customer Sim"}</span>
          </button>
        </div>
      </div>

      {/* Core KPI Infographic Cards (Prompt Section 59) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-slate-900/80 border border-slate-800/90 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">{isAr ? "مهام أُنجزت اليوم" : "Tasks Done Today"}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">137</div>
          <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            <span>+18% {isAr ? "عن الأسبوع الماضي" : "vs last week"}</span>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800/90 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">{isAr ? "ساعات عمل موفرة" : "Staff Hours Saved"}</span>
            <Clock className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">41.5 <span className="text-xs font-normal text-slate-400">{isAr ? "ساعة" : "hrs"}</span></div>
          <div className="text-[11px] text-slate-400 mt-1">
            {isAr ? "تعادل طاقة 5 موظفين بدوام كامل" : "Equal to 5 full-time staff days"}
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800/90 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">{isAr ? "تضاربات رُصدت بالعمل" : "Conflicts Detected"}</span>
            <AlertCircle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">3</div>
          <div className="text-[11px] text-amber-400/90 mt-1">
            {isAr ? "تنتظر مراجعة وتحديد السياسة" : "Pending policy resolution"}
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800/90 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">{isAr ? "مهارات مرشحة للترقية" : "Skills Ready to Graduate"}</span>
            <GraduationCap className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">2</div>
          <div className="text-[11px] text-indigo-400 mt-1">
            {isAr ? "اجتازت اختبارات الظل بنجاح" : "Passed shadow evals >90%"}
          </div>
        </div>
      </div>

      {/* Main Split: "Needs Your Attention" & "Institutional Memory Platform" */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Needs Your Attention (Triage Priority) */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                {isAr ? "يتطلب تدخلك الآن (Needs Your Attention)" : "Needs Your Attention"}
              </h2>
            </div>
            <span className="text-xs text-slate-400 font-medium">
              {approvals.length + 2} {isAr ? "حالات حرجة" : "Critical items"}
            </span>
          </div>

          <div className="space-y-2.5">
            {/* Approval Request Card (Golden Scenario highlight!) */}
            {approvals.map((appr) => (
              <div
                key={appr.id}
                className="bg-slate-900 border border-rose-500/40 rounded-xl p-4 hover:border-rose-500/60 transition-all shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-semibold">
                        {isAr ? "اعتماد مالي مطلوب" : "Approval Required"}
                      </span>
                      <span className="text-xs font-mono text-slate-400">POL-FIN-02</span>
                    </div>
                    <h3 className="text-sm font-bold text-white">{appr.workTitle}</h3>
                    <p className="text-xs text-slate-300 leading-relaxed">{appr.reasonDescription}</p>
                    <div className="text-[11px] text-slate-400 font-medium pt-1">
                      {isAr ? "المبلغ المقيد: 1,500 د.ك (مرحلة KG2) — طلب التحاق جديد" : "Amount: 1,500 KWD — New Admission"}
                    </div>
                  </div>

                  <button
                    onClick={() => onOpenApproval(appr.id)}
                    className="shrink-0 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition-colors cursor-pointer"
                  >
                    {isAr ? "مراجعة واعتماد" : "Review & Approve"}
                  </button>
                </div>
              </div>
            ))}

            {/* Conflict Triage Card */}
            <div className="bg-slate-900/80 border border-amber-500/30 rounded-xl p-4 hover:border-amber-500/50 transition-all">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold">
                      {isAr ? "تضارب في طريقة العمل" : "Conflicting Practice"}
                    </span>
                    <span className="text-xs text-slate-400">38 حالة رُصدت</span>
                  </div>
                  <h3 className="text-sm font-bold text-white">
                    {isAr ? "تضارب أسبقية قائمة الانتظار لـ KG2" : "KG2 Waiting List Prioritization Conflict"}
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {isAr
                      ? "78% من الموظفين يعتمدون أسبقية التسجيل الزمني، بينما 22% يعطون الأولوية للأشقاء. ما هي السياسة المعتمدة؟"
                      : "78% follow timestamp priority, 22% favor enrolled siblings. Which is official policy?"}
                  </p>
                </div>
                <button
                  onClick={() => onNavigate("learn")}
                  className="shrink-0 bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-700 transition-colors"
                >
                  {isAr ? "حسم السياسة" : "Resolve Policy"}
                </button>
              </div>
            </div>

            {/* Single Person Dependency Warning */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-all">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-semibold">
                      {isAr ? "خطر ذاكرة مؤسسية" : "Single-Person Risk"}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white">
                    {isAr ? "إجراء تسجيل أصحاب الهمم لا يعرفه سوى موظف واحد" : "Special Needs Intake Depends on 1 Employee"}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {isAr
                      ? "المعرفة محتكرة لدى الأخصائية دلال الهاجري. يوصى ببدء جلسة Teach AI قبل الإجازات."
                      : "Only Sarah Al-Hajji knows the exact procedure. Teach session recommended."}
                  </p>
                </div>
                <button
                  onClick={() => onNavigate("teach")}
                  className="shrink-0 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-700 transition-colors"
                >
                  {isAr ? "ابدأ التعليم" : "Start Teach"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Institutional Memory Platform Infographic (Prompt Section 9) */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              {isAr ? "الذاكرة المؤسسية والذكاء الإجرائي" : "Institutional Memory Intelligence"}
            </h2>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">
                  {isAr ? "تغطية العمليات المعروفة" : "Documented Processes"}
                </span>
                <span className="font-mono font-bold text-emerald-400">106 / 143</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full" style={{ width: "74%" }} />
              </div>
            </div>

            {/* Infographic stat rows */}
            <div className="space-y-2.5 pt-2 border-t border-slate-800/80 text-xs">
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-400">{isAr ? "إجراءات قيد الرصد وغير موثقة:" : "Undocumented processes:"}</span>
                <span className="font-mono font-bold text-amber-400">37</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-400">{isAr ? "تعتمد على موظف واحد فقط:" : "Depend on single employee:"}</span>
                <span className="font-mono font-bold text-rose-400">11</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-400">{isAr ? "تتضمن ممارسات متضاربة:" : "Contain conflicting practices:"}</span>
                <span className="font-mono font-bold text-amber-400">8</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-400">{isAr ? "مرشحة للأتمتة الكاملة:" : "Candidates for Autopilot:"}</span>
                <span className="font-mono font-bold text-teal-400">29</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-400">{isAr ? "تحتوي خطوات زائدة/مكررة:" : "Contain redundant steps:"}</span>
                <span className="font-mono font-bold text-slate-300">6</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
              {isAr
                ? "💡 حتى بدون تشغيل أي أتمتة، يعمل نهج كـ 'خزينة ذاكرة تشغيلية' تحمي المدرسة من ضياع الخبرات عند انتقال الكفاءات."
                : "💡 Even with zero automated execution, NAHJ preserves institutional knowledge and eliminates single-person operational risk."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
