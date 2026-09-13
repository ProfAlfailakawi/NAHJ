import React, { useState } from "react";
import {
  History,
  ShieldCheck,
  Search,
  Filter,
  HelpCircle,
  Clock,
  CheckCircle2,
  Lock,
  FileText,
  User,
  Bot,
  Cpu,
  Layers,
  Activity,
} from "lucide-react";
import { AuditLogEntry } from "../types";

interface AuditViewProps {
  lang: "ar" | "en";
  logs: AuditLogEntry[];
}

export const AuditView: React.FC<AuditViewProps> = ({ lang, logs }) => {
  const isAr = lang === "ar";
  const [search, setSearch] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "mcp" | "policy" | "human">("all");

  const filteredLogs = logs.filter((l) => {
    const matchesSearch =
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      l.actor.toLowerCase().includes(search.toLowerCase()) ||
      l.workItemId.toLowerCase().includes(search.toLowerCase()) ||
      (l.policyApplied && l.policyApplied.toLowerCase().includes(search.toLowerCase())) ||
      (l.provenanceSource && l.provenanceSource.toLowerCase().includes(search.toLowerCase()));

    if (!matchesSearch) return false;

    if (activeFilter === "mcp") {
      return l.actor.includes("MCP") || l.provenanceSource?.includes("MCP") || l.action.includes("MCP");
    }
    if (activeFilter === "policy") {
      return l.policyApplied && (l.actor.includes("Policy") || l.action.includes("إيقاف") || l.action.includes("طلب"));
    }
    if (activeFilter === "human") {
      return !l.actor.includes("AI") && !l.actor.includes("MCP") && !l.actor.includes("Policy");
    }

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1 rounded-md bg-slate-800 text-slate-300">
              <History className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">
              {isAr ? "سجل التدقيق الحي غير القابل للتعديل المربوط بـ MCP" : "Append-Only Immutable Audit Log with MCP Trace"}
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-950 text-teal-300 border border-teal-800">
              MCP Protocol Audited
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-white">
            {isAr ? "سجل التدقيق والتتبع (Audit Log)" : "Operational Audit Log"}
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            {isAr
              ? "سجل غير قابل للتعديل أو الحذف (Append-only) يوثق كل إجراء، استدعاءات MCP، والسياسات المطبقة، ومصدر البيانات، وزمن الاستجابة."
              : "Append-only, immutable event trail recording every action, MCP tool call, policy gate, and data provenance."}
          </p>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5">
          {/* Filter Pills */}
          <div className="flex items-center p-1 bg-slate-900 border border-slate-800 rounded-xl text-xs">
            <button
              onClick={() => setActiveFilter("all")}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                activeFilter === "all" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              {isAr ? "الكل" : "All"}
            </button>
            <button
              onClick={() => setActiveFilter("mcp")}
              className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                activeFilter === "mcp" ? "bg-teal-500 text-slate-950" : "text-slate-400 hover:text-white"
              }`}
            >
              <Cpu className="w-3 h-3" />
              <span>MCP</span>
            </button>
            <button
              onClick={() => setActiveFilter("policy")}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                activeFilter === "policy" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"
              }`}
            >
              {isAr ? "الحوكمة" : "Policy"}
            </button>
            <button
              onClick={() => setActiveFilter("human")}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                activeFilter === "human" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              {isAr ? "بشري" : "Human"}
            </button>
          </div>

          <div className="relative w-full sm:w-auto">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isAr ? "بحث بالمعاملة أو السياسة..." : "Filter logs..."}
              className="w-full sm:w-56 bg-slate-900 border border-slate-800 rounded-xl ps-8 pe-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-700"
            />
          </div>
        </div>
      </div>

      {/* Log Table / List */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-medium text-[11px]">
              <tr>
                <th className="py-3 px-4 text-start">{isAr ? "الوقت" : "Time"}</th>
                <th className="py-3 px-4 text-start">{isAr ? "المعاملة" : "Case ID"}</th>
                <th className="py-3 px-4 text-start">{isAr ? "المنفذ (Actor)" : "Actor"}</th>
                <th className="py-3 px-4 text-start">{isAr ? "الإجراء المنفذ" : "Action"}</th>
                <th className="py-3 px-4 text-start">{isAr ? "المصدر / بروتوكول MCP" : "Provenance / Protocol"}</th>
                <th className="py-3 px-4 text-start">{isAr ? "السياسة المطبقة" : "Policy"}</th>
                <th className="py-3 px-4 text-start">{isAr ? "الزمن" : "Latency"}</th>
                <th className="py-3 px-4 text-start">{isAr ? "التفسير" : "Explain"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredLogs.map((log) => {
                const isAi = log.actor.includes("AI") || log.actor.includes("Agent");
                const isMcp = log.actor.includes("MCP") || log.provenanceSource?.includes("MCP");

                return (
                  <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
                      {log.timestamp}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-white whitespace-nowrap">
                      {log.workItemId}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1 w-fit ${
                          isMcp
                            ? "bg-teal-500/10 text-teal-300 border border-teal-500/20"
                            : isAi
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-slate-800 text-slate-300 border border-slate-700"
                        }`}
                      >
                        {isMcp ? <Cpu className="w-3 h-3 text-teal-400" /> : isAi ? <Bot className="w-3 h-3" /> : <User className="w-3 h-3" />}
                        <span>{log.actor}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-200 font-medium max-w-xs">{log.action}</td>
                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px] truncate max-w-[200px]">
                      {log.provenanceSource || "SIS Database"}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {log.policyApplied ? (
                        <span className="font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                          {log.policyApplied}
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
                      {log.latencyMs}ms
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="text-teal-400 hover:text-teal-300 font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                        <span>{isAr ? "ليش؟" : "Why?"}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Log Explainability Modal / Card */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-teal-400" />
                <h3 className="text-sm font-bold text-white">
                  {isAr ? "تفسير القرار الإجرائي (Explainability)" : "Decision Explainability Trace"}
                </h3>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded-md bg-slate-800 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-slate-400 block">{isAr ? "الإجراء المنفذ:" : "Executed Action:"}</span>
                <span className="text-white font-bold">{selectedLog.action}</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-slate-400 block">{isAr ? "السياسة والقاعدة:" : "Policy Applied:"}</span>
                <span className="text-amber-400 font-mono font-bold">
                  {selectedLog.policyApplied || "Default Routing"}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-slate-400 block">{isAr ? "المصدر والأدلة المعتمدة (Provenance):" : "Provenance Source:"}</span>
                <span className="text-teal-300 font-mono">
                  {selectedLog.provenanceSource || "لائحة أكاديمية المستقبل 2025/2026 + SIS Core API"}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1 text-slate-400">
                <span className="block font-bold text-slate-300">{isAr ? "حالة الأمان وعدم التكرار:" : "Security & Idempotency:"}</span>
                <div>• بروتوكول الاتصال: Model Context Protocol (v2024-11-05)</div>
                <div>• منع التكرار: مفتاح حتمي Idempotency Key مسجل في الذاكرة لمنع ازدواجية الرسوم أو المقاعد.</div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-4 py-2 rounded-xl transition-colors cursor-pointer"
              >
                {isAr ? "إغلاق" : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
