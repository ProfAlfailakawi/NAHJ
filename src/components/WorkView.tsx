import React, { useState } from "react";
import {
  Briefcase,
  Clock,
  CheckCircle2,
  AlertCircle,
  UserCheck,
  Play,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  HelpCircle,
  Activity,
  FileCheck2,
  Lock,
} from "lucide-react";
import { WorkItem, WorkStatus } from "../types";

interface WorkViewProps {
  lang: "ar" | "en";
  workItems: WorkItem[];
  onTakeOver: (id: string) => void;
  onResumeAi: (id: string) => void;
  onOpenApproval: (id: string) => void;
}

export const WorkView: React.FC<WorkViewProps> = ({
  lang,
  workItems,
  onTakeOver,
  onResumeAi,
  onOpenApproval,
}) => {
  const isAr = lang === "ar";
  const [selectedWorkId, setSelectedWorkId] = useState<string>(workItems[0]?.id || "");
  const selectedItem = workItems.find((w) => w.id === selectedWorkId) || workItems[0];

  const statusBadge = (status: WorkStatus) => {
    switch (status) {
      case "completed":
        return {
          bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
          text: isAr ? "مكتمل بنجاح" : "Completed",
        };
      case "needs_human_decision":
        return {
          bg: "bg-rose-500/10 text-rose-400 border-rose-500/30",
          text: isAr ? "بانتظار قرار بشري" : "Needs Decision",
        };
      case "human_takeover":
        return {
          bg: "bg-amber-500/10 text-amber-400 border-amber-500/30",
          text: isAr ? "مستلم بشريًا" : "Human Takeover",
        };
      case "in_progress":
        return {
          bg: "bg-teal-500/10 text-teal-400 border-teal-500/20",
          text: isAr ? "قيد المعالجة" : "In Progress",
        };
      default:
        return {
          bg: "bg-slate-800 text-slate-400 border-slate-700",
          text: status,
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1 rounded-md bg-blue-500/10 text-blue-400">
              <Briefcase className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold text-blue-400 uppercase tracking-wide">
              {isAr ? "سير العمل الحي والعمليات الجارية" : "Live Execution & State Machine"}
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-white">
            {isAr ? "سير العمل المباشر (Active Work)" : "Live Active Work"}
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            {isAr
              ? "متابعة حالة كل معاملة طالب في الوقت الفعلي. يمكنك استلام أي معاملة فورًا (Take Over) أو إعادة تفويضها للذكاء الاصطناعي."
              : "Track every student admission transaction in real-time. Staff can seamlessly take over or hand back to AI."}
          </p>
        </div>

        <div className="text-xs px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300">
          <span className="text-teal-400 font-mono font-bold">{workItems.length}</span>{" "}
          {isAr ? "معاملات نشطة" : "Active cases"}
        </div>
      </div>

      {/* Main Grid: Work List + Timeline Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: WorkItems List */}
        <div className="lg:col-span-5 space-y-3">
          {workItems.map((item) => {
            const isSelected = selectedWorkId === item.id;
            const badge = statusBadge(item.status);

            return (
              <div
                key={item.id}
                onClick={() => setSelectedWorkId(item.id)}
                className={`p-4 rounded-xl border transition-all cursor-pointer space-y-2.5 ${
                  isSelected
                    ? "bg-slate-900 border-teal-500/50 shadow-md shadow-teal-500/5"
                    : "bg-slate-900/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/90"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-400">{item.id}</span>
                      <span className="text-xs text-teal-400">{item.customerName}</span>
                    </div>
                    <h3 className="text-sm font-bold text-white mt-0.5">{item.title}</h3>
                  </div>

                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold border ${badge.bg}`}>
                    {badge.text}
                  </span>
                </div>

                <div className="text-xs text-slate-300 bg-slate-950 p-2 rounded-lg border border-slate-800/80 flex items-center justify-between">
                  <span className="text-slate-400">{isAr ? "الخطوة الحالية:" : "Current Step:"}</span>
                  <span className="font-semibold text-white">{item.currentStepTitle}</span>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>
                      {isAr ? "التقدم الإجرائي:" : "Progress:"} {item.completedStepsCount} / {item.totalStepsCount}
                    </span>
                    <span className="font-mono">{Math.round((item.completedStepsCount / item.totalStepsCount) * 100)}%</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-teal-500 h-full rounded-full"
                      style={{ width: `${(item.completedStepsCount / item.totalStepsCount) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Selected WorkItem Details & Timeline */}
        {selectedItem && (
          <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-5">
            {/* Header of detail */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-400">{selectedItem.id}</span>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${statusBadge(selectedItem.status).bg}`}>
                    {statusBadge(selectedItem.status).text}
                  </span>
                </div>
                <h2 className="text-lg font-extrabold text-white mt-1">{selectedItem.title}</h2>
                <div className="text-xs text-slate-400">
                  {isAr ? "ولي الأمر:" : "Guardian:"} <span className="text-slate-200 font-semibold">{selectedItem.customerName}</span>
                </div>
              </div>

              {/* Takeover / Resume Buttons (Prompt Section 102) */}
              <div className="flex items-center gap-2">
                {selectedItem.status === "human_takeover" ? (
                  <button
                    onClick={() => onResumeAi(selectedItem.id)}
                    className="bg-teal-500 hover:bg-teal-600 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>{isAr ? "إعادة التفويض للذكاء الاصطناعي" : "Resume AI"}</span>
                  </button>
                ) : (
                  <button
                    onClick={() => onTakeOver(selectedItem.id)}
                    className="bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/20 text-xs font-semibold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>{isAr ? "استلام بشري فوري (Take Over)" : "Take Over"}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Explainability Card (Why did AI do this?) */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-teal-400 flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4" />
                  {isAr ? "تفسير القرار التشغيلي (Explainability):" : "Why did AI take this action?"}
                </span>
                <span className="font-mono text-slate-400 text-[11px]">Source: SIS-POL-24</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {isAr
                  ? "تم مطابقة عمر الطالب (5 سنوات) مع مرحلة KG2. النظام تحقق من توفر 4 مقاعد شاغرة في SIS وجلب الرسوم الرسمية (1,500 د.ك). الخطوة الحالية متوقفة بناءً على سياسة الحوكمة POL-FIN-02 لاعتماد المدير المالي قبل إرسال رابط الدفع."
                  : "Child matched KG2 by DOB criteria. 4 available seats verified in SIS. Official tuition 1,500 KWD retrieved. Gated by POL-FIN-02 requiring manager sign-off before invoice generation."}
              </p>
            </div>

            {/* Event Timeline */}
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-teal-400" />
                <span>{isAr ? "السجل الإجرائي للمعاملة (Event Audit Trail):" : "Execution Event Trail:"}</span>
              </div>

              <div className="space-y-2 ps-2 border-s border-slate-800">
                {selectedItem.events.map((ev) => (
                  <div key={ev.id} className="relative ps-4 pb-3 space-y-1 text-xs">
                    <span className="absolute -start-1.5 top-1.5 w-2.5 h-2.5 rounded-full bg-teal-500 border-2 border-slate-950" />
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">{ev.action}</span>
                      <span className="font-mono text-slate-500 text-[11px]">{ev.timestamp}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-teal-400 font-mono">
                        {ev.actor}
                      </span>
                      {ev.system && <span className="text-slate-500">• {ev.system}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
