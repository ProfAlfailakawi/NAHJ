import React, { useState } from "react";
import {
  Sliders,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Lock,
  RotateCcw,
  Zap,
  CheckCircle2,
  Users,
  Database,
  History,
} from "lucide-react";

interface ControlViewProps {
  lang: "ar" | "en";
  globalKillSwitch: boolean;
  onToggleGlobalKillSwitch: () => void;
}

export const ControlView: React.FC<ControlViewProps> = ({
  lang,
  globalKillSwitch,
  onToggleGlobalKillSwitch,
}) => {
  const isAr = lang === "ar";
  const [financialThreshold, setFinancialThreshold] = useState("50");
  const [errorCircuitLimit, setErrorCircuitLimit] = useState("2.0");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1 rounded-md bg-rose-500/10 text-rose-400">
              <Sliders className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold text-rose-400 uppercase tracking-wide">
              {isAr ? "الحوكمة وحواجز الأمان الحاسمة" : "Security & Governance Boundaries"}
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-white">
            {isAr ? "الحوكمة والتحكم (Control & Governance)" : "Control & Governance"}
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            {isAr
              ? "التحكم المطلق بيد القيادة: حدود الصلاحيات المالية، قواطع الدائرة الآلية (Circuit Breakers)، وزر إيقاف الطوارئ الشامل."
              : "Definitive authority in leadership hands: risk thresholds, automated circuit breakers, and global emergency stop."}
          </p>
        </div>

        <div className="text-xs px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300">
          {isAr ? "مستوى الحماية: عالي (Enterprise Strict)" : "Security Profile: Enterprise Strict"}
        </div>
      </div>

      {/* GLOBAL KILL SWITCH CARD (Prompt Section 109) */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          globalKillSwitch
            ? "bg-rose-950/40 border-rose-500"
            : "bg-slate-900/90 border-slate-800"
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-400" />
              <h2 className="text-base font-extrabold text-white">
                {isAr ? "زر الإيقاف الشامل للطوارئ (Global Kill Switch)" : "Global Emergency Kill Switch"}
              </h2>
              {globalKillSwitch && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-500 text-white font-extrabold animate-pulse">
                  {isAr ? "النظام متوقف كليًا" : "ALL WORKERS PAUSED"}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
              {isAr
                ? "بضغطة واحدة، يتوقف الذكاء الاصطناعي عن تنفيذ أي إجراء في جميع الأنظمة وتتحول كافة العمليات فورًا إلى الوضع البشري بنسبة 100%."
                : "Freezes all autonomous and semi-autonomous actions across all systems instantly. Hand-offs fall back to 100% human operations."}
            </p>
          </div>

          <button
            onClick={onToggleGlobalKillSwitch}
            className={`px-5 py-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer shadow-lg ${
              globalKillSwitch
                ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20"
                : "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/30"
            }`}
          >
            {globalKillSwitch
              ? isAr ? "استئناف عمل النظام (Resume Operations)" : "Resume All Operations"
              : isAr ? "إيقاف طوارئ فوري لجميع العمليات" : "ACTIVATE GLOBAL KILL SWITCH"}
          </button>
        </div>
      </div>

      {/* Risk Engine Thresholds */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Financial Risk Gate */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" />
              <span>{isAr ? "حاجز المخاطر المالية (Financial Risk Gate)" : "Financial Risk Gate"}</span>
            </h2>
            <span className="text-xs font-mono text-amber-400 font-bold">POL-FIN-02</span>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            {isAr
              ? "أي معاملة تنطوي على مبالغ أو خصومات أو التزامات تتجاوز هذا الحد تتطلب موافقة بشرية صريحة ولا يمكن للذكاء الاصطناعي تنفيذها تلقائيًا."
              : "Transactions involving amounts or discounts exceeding this threshold strictly mandate human authorization."}
          </p>

          <div className="space-y-1.5">
            <label className="text-xs text-slate-300 font-medium block">
              {isAr ? "الحد الأقصى للعمل التلقائي بدون موافقة (دينار كويتي):" : "Auto-Action Threshold (KWD):"}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={financialThreshold}
                onChange={(e) => setFinancialThreshold(e.target.value)}
                className="w-32 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
              />
              <span className="text-xs text-slate-400 font-bold">{isAr ? "د.ك" : "KWD"}</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
            {isAr
              ? "مثال: رسوم الروضة (1,500 د.ك) تتجاوز حد 50 د.ك، لذلك يتم حجز المعاملة لمديرة القبول نورة دائمًا."
              : "Example: Tuition of 1,500 KWD exceeds 50 KWD, automatically creating a mandatory sign-off gate."}
          </div>
        </div>

        {/* Circuit Breakers */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-teal-400" />
              <span>{isAr ? "قواطع الدائرة الذاتية (Circuit Breakers)" : "Automated Circuit Breakers"}</span>
            </h2>
            <span className="text-xs font-mono text-teal-400 font-bold">Auto-Downgrade</span>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            {isAr
              ? "في حال تجاوزت نسبة الأخطاء أو عدم تطابق الظل هذا الحد خلال نافذة 1 ساعة، يتم خفض استقلالية المهارة تلقائيًا إلى وضع التجهيز (Level 4)."
              : "If the failure or divergence rate spikes above this threshold within 1 hour, NAHJ auto-downgrades autonomy."}
          </p>

          <div className="space-y-1.5">
            <label className="text-xs text-slate-300 font-medium block">
              {isAr ? "أقصى نسبة خطأ مقبولة في الساعة:" : "Max Hourly Error Rate (%):"}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.5"
                value={errorCircuitLimit}
                onChange={(e) => setErrorCircuitLimit(e.target.value)}
                className="w-32 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-teal-500"
              />
              <span className="text-xs text-slate-400 font-bold">%</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
            {isAr
              ? "الحالة الحالية: نسبة الخطأ المستمرة 0.0% — جميع القواطع مغلقة وتعمل بأمان تام."
              : "Status: 0.0% current error rate. All breakers closed and healthy."}
          </div>
        </div>
      </div>
    </div>
  );
};
