import React, { useState } from "react";
import {
  MessageSquare,
  Send,
  Sparkles,
  Bot,
  User,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  CreditCard,
  Building2,
  FileCheck2,
  Upload,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  ArrowRight,
  Cpu,
  Terminal,
  Code,
  Layers,
  ChevronDown,
} from "lucide-react";
import { ApprovalRequest } from "../types";

interface SimulatorViewProps {
  lang: "ar" | "en";
  onTriggerApproval: (approval: ApprovalRequest) => void;
  isApprovalApproved: boolean;
  onApproveDirectly: () => void;
}

interface ChatMessage {
  id: string;
  sender: "user" | "ai" | "system";
  text: string;
  time: string;
  mcpToolCall?: {
    toolName: string;
    server: string;
    latencyMs: number;
    idempotencyKey: string;
    requestPayload: any;
    responsePayload: any;
    policyStatus?: string;
  };
  metadata?: {
    type?: "seats_check" | "ocr_verified" | "tour_booked" | "approval_pending" | "invoice_ready";
    details?: string;
  };
}

export const SimulatorView: React.FC<SimulatorViewProps> = ({
  lang,
  onTriggerApproval,
  isApprovalApproved,
  onApproveDirectly,
}) => {
  const isAr = lang === "ar";

  const [inputVal, setInputVal] = useState("");
  const [activeMcpPayloadModal, setActiveMcpPayloadModal] = useState<any | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "m_1",
      sender: "user",
      text: "السلام عليكم، أبي أسجل ولدي عندكم بالسنة الجديدة",
      time: "10:14 AM",
    },
    {
      id: "m_2",
      sender: "ai",
      text: "وعليكم السلام ورحمة الله وبركاته! أهلاً بك في أكاديمية المستقبل. يسعدنا جداً انضمامكم إلينا. كم عمر ولدك، أو ما هو تاريخ ميلاده لنحدد المرحلة الدراسية المناسبة؟",
      time: "10:14 AM",
    },
  ]);

  const [simStep, setSimStep] = useState<number>(1);
  const [isTyping, setIsTyping] = useState(false);

  // Live MCP traces list
  const [mcpTraces, setMcpTraces] = useState<Array<{
    tool: string;
    server: string;
    status: "success" | "gated";
    latency: number;
    params: any;
    result: any;
  }>>([
    {
      tool: "brain_query_policies",
      server: "NAHJ Company Brain MCP",
      status: "success",
      latency: 4,
      params: { query: "admission_cutoff_2026" },
      result: { approvedAgeMin: "3y6m", effectiveDate: "2025/2026" },
    },
  ]);

  // Auto-send predefined replies for quick demo flow
  const handleSendPrompt = (text: string) => {
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      sender: "user",
      text,
      time: "10:15 AM",
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputVal("");
    setIsTyping(true);

    // AI simulation logic over Model Context Protocol
    setTimeout(() => {
      setIsTyping(false);

      if (simStep === 1) {
        const checkSeatsCall = {
          toolName: "sis_check_seats",
          server: "Future SIS Core MCP Server",
          latencyMs: 18,
          idempotencyKey: `idem_mcp_sis_kg2_${Date.now()}`,
          requestPayload: {
            jsonrpc: "2.0",
            method: "tools/call",
            params: {
              name: "sis_check_seats",
              arguments: { grade: "KG2", academicYear: "2025/2026" },
            },
          },
          responsePayload: {
            jsonrpc: "2.0",
            result: {
              availableSeats: 4,
              maxCapacity: 25,
              sections: ["الشعبة أ (الصباحية)", "الشعبة ب (المختلطة)"],
              tuitionAnnualKwd: 1500,
            },
          },
        };

        setMcpTraces((prev) => [
          {
            tool: "sis_check_seats",
            server: "Future SIS Core MCP",
            status: "success",
            latency: 18,
            params: { grade: "KG2" },
            result: { seats: 4, capacity: 25 },
          },
          {
            tool: "sis_get_tuition_fees",
            server: "Future SIS Core MCP",
            status: "success",
            latency: 22,
            params: { grade: "KG2" },
            result: { tuition: 1500, currency: "KWD" },
          },
          ...prev,
        ]);

        setMessages((prev) => [
          ...prev,
          {
            id: `ai_${Date.now()}`,
            sender: "ai",
            text: "عظيم! بناءً على تاريخ الميلاد، المرحلة المناسبة ليوسف هي (الروضة الثانية - KG2).\n\nاستعلمنا فوراً عبر بروتوكول MCP من نظام التسجيل SIS: يتوفر حالياً 4 مقاعد شاغرة فقط في الروضة الثانية.\n\nالرسوم الدراسية السنوية المعتمدة رسمياً هي 1,500 د.ك (شاملة الأنشطة والكتب).\n\nيرجى تزويدنا بصورة البطاقة المدنية للطفل للمطابقة وحجز موعد المقابلة الشخصية.",
            time: "10:15 AM",
            mcpToolCall: checkSeatsCall,
            metadata: {
              type: "seats_check",
              details: "MCP tools/call: sis_check_seats (Grade KG2) • 4 seats available • Latency: 18ms",
            },
          },
        ]);
        setSimStep(2);
      } else if (simStep === 2) {
        const ocrCall = {
          toolName: "ocr_verify_civil_id",
          server: "DocVault Vision & OCR MCP Server",
          latencyMs: 115,
          idempotencyKey: `idem_mcp_ocr_${Date.now()}`,
          requestPayload: {
            jsonrpc: "2.0",
            method: "tools/call",
            params: {
              name: "ocr_verify_civil_id",
              arguments: {
                civilIdNumber: "319081200192",
                studentName: "يوسف أحمد الكندري",
              },
            },
          },
          responsePayload: {
            jsonrpc: "2.0",
            result: {
              valid: true,
              extractedAgeMonths: 65,
              gradeEligible: "KG2",
              expiryDate: "2030-08-12",
            },
          },
          policyStatus: "PASSED (POL-ADM-01)",
        };

        setMcpTraces((prev) => [
          {
            tool: "ocr_verify_civil_id",
            server: "DocVault Vision MCP",
            status: "success",
            latency: 115,
            params: { civilId: "319081200192" },
            result: { age: "5.4y", eligible: true },
          },
          {
            tool: "calendar_book_tour",
            server: "Campus Calendar MCP",
            status: "success",
            latency: 42,
            params: { slot: "Thursday 4:30 PM" },
            result: { confirmed: true, roomId: "Hall-B" },
          },
          {
            tool: "knet_create_invoice",
            server: "K-Net Payment MCP",
            status: "gated",
            latency: 12,
            params: { amountKwd: 1500 },
            result: { requiresApproval: true, policy: "POL-FIN-02" },
          },
          ...prev,
        ]);

        setMessages((prev) => [
          ...prev,
          {
            id: `ai_${Date.now()}`,
            sender: "ai",
            text: "تم استلام البطاقة المدنية وفحصها بنجاح عبر أداة MCP Vision:\n• الاسم: يوسف أحمد الكندري\n• الرقم المدني: 319081200192\n• مطابقة السن: مؤهل لمرحلة KG2 بنسبة 100%.\n\nتم حجز موعد المقابلة والجولة المدرسية: يوم الخميس القادم الساعة 4:30 مساءً في قاعة التقييم B.\n\n⚠️ نظراً لأن رسوم التسجيل (1,500 د.ك) تتجاوز سقف العمل التلقائي (50 د.ك) طبقاً لسياسة الحوكمة المالية POL-FIN-02، تم إيقاف إصدار الفاتورة آلياً وتحويلها فوراً للمديرة (نورة الصباح) للاعتماد قبل إرسال رابط الدفع.",
            time: "10:16 AM",
            mcpToolCall: ocrCall,
            metadata: {
              type: "approval_pending",
              details: "MCP Policy Gate: POL-FIN-02 (Amount 1,500 KWD > 50 KWD threshold). Escalated to Manager.",
            },
          },
        ]);
        setSimStep(3);
      }
    }, 1100);
  };

  const handleSimulateCivilIdUpload = () => {
    handleSendPrompt("📎 تم إرفاق صورة البطاقة المدنية للطفل يوسف");
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-teal-950/40 via-slate-900 to-slate-900 border border-teal-500/30 rounded-2xl p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1 rounded-md bg-teal-500/20 text-teal-400">
                <MessageSquare className="w-4 h-4" />
              </span>
              <span className="text-xs font-bold text-teal-400 uppercase tracking-wide">
                {isAr ? "محاكي تجربة ولي الأمر المربوط بـ MCP" : "Customer Simulator Experience with MCP"}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-950 text-teal-300 border border-teal-800">
                Live Model Context Protocol
              </span>
            </div>
            <h1 className="text-2xl font-extrabold text-white">
              {isAr ? "محاكاة تسجيل طالب جديد (أكاديمية المستقبل)" : "Student Admission Live Simulator"}
            </h1>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              {isAr
                ? "عِش التجربة كما يعيشها ولي الأمر: استجابة دقيقة عبر بروتوكول MCP، استعلام فوري عن مقاعد SIS، قراءة البطاقة المدنية، حجز المقابلة، وحظر الدفع المالي حتى اعتماد الإدارة."
                : "Experience the golden path: Conversational intake powered by real MCP tools, SIS seat query, OCR extraction, tour booking, and financial policy gating."}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 font-medium flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              {isAr ? "قناة الواتساب والويب الرسمية" : "WhatsApp / Web Channel"}
            </span>
          </div>
        </div>
      </div>

      {/* Simulator Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Chat Simulation Window */}
        <div className="lg:col-span-8 bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-col h-[600px] overflow-hidden">
          {/* Top Bar of Chat */}
          <div className="p-3.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>{isAr ? "مساعد القبول والتسجيل — نَهْج" : "Future Academy Admission Assistant"}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                </div>
                <div className="text-[10px] text-slate-400">
                  {isAr ? "موصول عبر MCP: SIS Core • تقويم الجولات • بوابة K-Net" : "Connected via MCP: SIS Core • Calendar • K-Net"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-teal-400 bg-teal-950/60 px-2 py-0.5 rounded-md border border-teal-800">
                MCP Client: v2024-11-05
              </span>
              <div className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                Autonomy Level 5
              </div>
            </div>
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3.5">
            {messages.map((m) => {
              const isUser = m.sender === "user";

              return (
                <div
                  key={m.id}
                  className={`flex items-start gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs ${
                      isUser
                        ? "bg-slate-700 text-slate-200"
                        : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    }`}
                  >
                    {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>

                  <div className="space-y-2 max-w-lg">
                    <div
                      className={`p-3.5 rounded-2xl text-xs leading-relaxed whitespace-pre-line ${
                        isUser
                          ? "bg-slate-800 text-white rounded-tr-none"
                          : "bg-slate-950 border border-slate-800 text-slate-200 rounded-tl-none"
                      }`}
                    >
                      {m.text}
                    </div>

                    {/* MCP Tool Call Badge attached to message */}
                    {m.mcpToolCall && (
                      <div className="p-2 rounded-xl bg-teal-950/40 border border-teal-500/30 text-[11px] space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-teal-300 font-bold flex items-center gap-1.5">
                            <Cpu className="w-3.5 h-3.5 text-teal-400" />
                            <span>MCP tools/call: {m.mcpToolCall.toolName}</span>
                          </span>
                          <button
                            onClick={() => setActiveMcpPayloadModal(m.mcpToolCall)}
                            className="text-[10px] text-teal-400 hover:underline cursor-pointer flex items-center gap-1"
                          >
                            <Terminal className="w-3 h-3" />
                            <span>{isAr ? "معاينة JSON-RPC" : "View JSON-RPC"}</span>
                          </button>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between">
                          <span>Server: {m.mcpToolCall.server}</span>
                          <span className="text-emerald-400 font-bold">{m.mcpToolCall.latencyMs}ms</span>
                        </div>
                      </div>
                    )}

                    {/* Metadata Card attached to message */}
                    {m.metadata?.details && (
                      <div className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800/90 text-[11px] font-mono text-slate-400 flex items-center gap-2">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{m.metadata.details}</span>
                      </div>
                    )}

                    <div className="text-[10px] text-slate-500 px-1">{m.time}</div>
                  </div>
                </div>
              );
            })}

            {isTyping && (
              <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-950/60 p-2.5 rounded-xl w-fit border border-slate-800">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>{isAr ? "الذكاء الاصطناعي يستدعي أدوات MCP من نظام SIS..." : "AI invoking MCP tools on SIS..."}</span>
              </div>
            )}

            {/* If approved in the main system, show the finalized outcome! */}
            {isApprovalApproved && (
              <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/50 space-y-2 animate-in fade-in">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{isAr ? "تم اعتماد الطلب رسميًا من الإدارة!" : "Management Sign-off Granted!"}</span>
                </div>
                <p className="text-xs text-slate-200 leading-relaxed">
                  {isAr
                    ? "تم استدعاء أداة MCP الرسمية (knet_create_invoice) بعد فك حظر السياسة، واستخراج رابط سداد رسوم الدفعة الأولى (1,500 د.ك) وإنشاء ملف الطالب FA-2026-904."
                    : "MCP tool knet_create_invoice executed after policy clearance. Student file FA-2026-904 created in SIS Core."}
                </p>
                <div className="pt-1 flex items-center gap-2 font-mono text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                    K-Net Invoice: INV-904-KG2
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                    Signed by Noura Al-Sabah
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Interactive Prompts & Input */}
          <div className="p-3 bg-slate-950/90 border-t border-slate-800 space-y-2.5">
            {/* Quick Demo Script Buttons */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
              {simStep === 1 && (
                <button
                  onClick={() => handleSendPrompt("عمره 5 سنوات واسمه يوسف أحمد")}
                  className="shrink-0 bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isAr ? "إرسال: 'عمره 5 سنوات واسمه يوسف أحمد'" : "Send: 'Age 5, name Yousef Ahmed'"}</span>
                </button>
              )}

              {simStep === 2 && (
                <button
                  onClick={handleSimulateCivilIdUpload}
                  className="shrink-0 bg-teal-500 hover:bg-teal-600 text-white font-bold px-3.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isAr ? "محاكاة رفع البطاقة المدنية (MCP OCR)" : "Simulate Civil ID Upload (MCP OCR)"}</span>
                </button>
              )}

              {simStep === 3 && !isApprovalApproved && (
                <button
                  onClick={onApproveDirectly}
                  className="shrink-0 bg-rose-500 hover:bg-rose-600 text-white font-bold px-3.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-lg shadow-rose-500/20"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isAr ? "اعتماد نورة المالي الفوري (Approve Tuition 1,500 KD)" : "Approve as Manager"}</span>
                </button>
              )}
            </div>

            {/* Real Text Input */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && inputVal.trim()) {
                    handleSendPrompt(inputVal);
                  }
                }}
                placeholder={isAr ? "اكتب رسالة ولي الأمر هنا..." : "Type guardian message..."}
                className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-teal-500"
              />
              <button
                onClick={() => {
                  if (inputVal.trim()) handleSendPrompt(inputVal);
                }}
                className="bg-teal-500 hover:bg-teal-600 text-white p-2 rounded-xl transition-colors cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Right: Operational MCP Telemetry Panel */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-teal-400" />
                {isAr ? "سجل استدعاءات MCP الحية" : "Live MCP Protocol Trace"}
              </span>
              <span className="text-[10px] font-mono text-teal-400 bg-teal-950 px-2 py-0.5 rounded">
                JSON-RPC 2.0
              </span>
            </div>

            {/* Live MCP Traces List */}
            <div className="space-y-2 max-h-[220px] overflow-y-auto">
              {mcpTraces.map((tr, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-teal-300 font-bold">tools/call {tr.tool}</span>
                    <span className="text-slate-400 text-[10px]">{tr.latency}ms</span>
                  </div>
                  <div className="text-[10px] text-slate-400 flex items-center justify-between">
                    <span>{tr.server}</span>
                    <span
                      className={`font-bold ${
                        tr.status === "gated" ? "text-amber-400" : "text-emerald-400"
                      }`}
                    >
                      {tr.status === "gated" ? "GATED (POL-FIN-02)" : "200 OK"}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* System Connectors Status */}
            <div className="space-y-2 text-xs pt-1 border-t border-slate-800">
              <div className="p-2 rounded-xl bg-slate-950 border border-slate-800/90 flex items-center justify-between">
                <span className="text-slate-300">Future SIS MCP Server:</span>
                <span className="text-emerald-400 font-mono font-bold">Connected (21/25)</span>
              </div>
              <div className="p-2 rounded-xl bg-slate-950 border border-slate-800/90 flex items-center justify-between">
                <span className="text-slate-300">DocVault OCR MCP:</span>
                <span className="text-emerald-400 font-mono font-bold">Identity Matched</span>
              </div>
              <div className="p-2 rounded-xl bg-slate-950 border border-slate-800/90 flex items-center justify-between">
                <span className="text-slate-300">محرك الحوكمة POL-FIN-02:</span>
                <span className={isApprovalApproved ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                  {isApprovalApproved ? "Approved by Noura" : "Gated (> 50 KWD)"}
                </span>
              </div>
            </div>

            {/* Provenance Evidence */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-[11px]">
              <span className="font-bold text-slate-300 block">
                {isAr ? "مصدر القواعد (Provenance):" : "Provenance Sources:"}
              </span>
              <div className="text-slate-400 space-y-1">
                <div>• لائحة القبول والتسجيل 2025/2026 (مادة 4)</div>
                <div>• خادم Future SIS Core MCP Server (JSON-RPC)</div>
                <div>• مصفوفة الصلاحيات المالية للمديرة نورة</div>
              </div>
            </div>

            {/* Value Proposition Note */}
            <div className="p-3 rounded-xl bg-teal-950/20 border border-teal-500/20 text-[11px] text-teal-300 leading-relaxed">
              {isAr
                ? "💡 الربط المباشر مع MCP يمنع الهلوسة نهائياً: الوكيل يستعلم من أنظمة المؤسسة الحقيقية فقط، ولا يمكنه تجاوز قواعد الصرف المالي دون مصافحة حوكمة صريحة."
                : "💡 Direct MCP integration completely eliminates hallucination: the agent interacts with verified organizational systems and never bypasses policy gates."}
            </div>
          </div>
        </div>
      </div>

      {/* JSON-RPC Trace Modal */}
      {activeMcpPayloadModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono text-teal-400 bg-teal-950 px-2 py-0.5 rounded">
                  MCP Protocol Trace: {activeMcpPayloadModal.toolName}
                </span>
                <h3 className="text-sm font-bold text-white mt-1">
                  JSON-RPC 2.0 Request &amp; Response
                </h3>
              </div>
              <button
                onClick={() => setActiveMcpPayloadModal(null)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded bg-slate-800 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 text-xs font-mono">
              <div className="space-y-1.5">
                <div className="text-slate-400 font-bold">1. JSON-RPC Request (Agent → MCP Server):</div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl overflow-x-auto text-teal-300">
                  <pre>{JSON.stringify(activeMcpPayloadModal.requestPayload, null, 2)}</pre>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-slate-400 font-bold">2. JSON-RPC Response (MCP Server → Agent):</div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl overflow-x-auto text-emerald-300">
                  <pre>{JSON.stringify(activeMcpPayloadModal.responsePayload, null, 2)}</pre>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950 text-[11px] text-slate-400 flex items-center justify-between">
                <span>Idempotency Key: {activeMcpPayloadModal.idempotencyKey}</span>
                <span className="text-teal-400">Latency: {activeMcpPayloadModal.latencyMs}ms</span>
              </div>
            </div>

            <div className="p-3 border-t border-slate-800 bg-slate-950 flex justify-end">
              <button
                onClick={() => setActiveMcpPayloadModal(null)}
                className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold px-4 py-2 rounded-xl cursor-pointer"
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
