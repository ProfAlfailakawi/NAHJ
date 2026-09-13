import React, { useState } from "react";
import {
  GraduationCap,
  Sparkles,
  Mic,
  Play,
  CheckCircle2,
  HelpCircle,
  Plus,
  ArrowRight,
  Layers,
  ShieldCheck,
  Building2,
  FileText,
  Calendar,
  CreditCard,
  Eye,
  Check,
  Brain,
} from "lucide-react";
import { SkillStep } from "../types";

interface TeachStudioViewProps {
  lang: "ar" | "en";
  onSkillCodified: () => void;
}

export const TeachStudioView: React.FC<TeachStudioViewProps> = ({
  lang,
  onSkillCodified,
}) => {
  const isAr = lang === "ar";

  // State
  const [sessionTitle, setSessionTitle] = useState("تسجيل وقبول طالب جديد (مرحلة الروضة KG)");
  const [isRecording, setIsRecording] = useState(false);
  const [recordedEvents, setRecordedEvents] = useState<
    { id: string; time: string; action: string; system: string; note?: string }[]
  >([
    {
      id: "ev_1",
      time: "10:14",
      action: "استقبال استفسار ولي الأمر والتحقق من تاريخ الميلاد",
      system: "بوابة التواصل / محاكي المحادثة",
      note: "أول شيء نشوف عمر الطفل عشان نحدد الروضة أولى KG1 ولا ثانية KG2",
    },
    {
      id: "ev_2",
      time: "10:16",
      action: "الاستعلام عن شواغر المقاعد في الشعبة أ",
      system: "Future SIS Core",
      note: "نفتح نظام SIS للتأكد إن باقي مقاعد وما تجاوزنا السعة القصوى 25 طالباً",
    },
    {
      id: "ev_3",
      time: "10:19",
      action: "جلب الرسوم الدراسية الرسمية المعتمدة (1,500 د.ك)",
      system: "جدول الفوترة المركزي SIS Billing",
      note: "الرسوم ثابتة ولا يحق لأي موظف تغييرها بدون خصم معتمد من الإدارة",
    },
  ]);

  const [newEventAction, setNewEventAction] = useState("");
  const [newEventSystem, setNewEventSystem] = useState("Future SIS Core");
  const [newEventNote, setNewEventNote] = useState("");

  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthesizedResult, setSynthesizedResult] = useState<{
    steps: SkillStep[];
    rules: string[];
    questions: { id: string; question: string; answered?: boolean }[];
  } | null>(null);

  const [answeredQuestions, setAnsweredQuestions] = useState<Record<string, string>>({});
  const [isCodified, setIsCodified] = useState(false);

  const handleAddEvent = () => {
    if (!newEventAction.trim()) return;
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    setRecordedEvents((prev) => [
      ...prev,
      {
        id: `ev_${Date.now()}`,
        time: timeStr,
        action: newEventAction,
        system: newEventSystem,
        note: newEventNote || undefined,
      },
    ]);
    setNewEventAction("");
    setNewEventNote("");
  };

  const handleSynthesize = async () => {
    setIsSynthesizing(true);
    try {
      const res = await fetch("/api/teach/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "demo_teach" }),
      });
      const data = await res.json();
      setSynthesizedResult({
        steps: data.steps,
        rules: data.rules,
        questions: data.questions,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsSynthesizing(false);
    }
  };

  const handleCodifySkill = () => {
    setIsCodified(true);
    setTimeout(() => {
      onSkillCodified();
    }, 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-950/30 via-slate-900 to-slate-900 border border-emerald-500/30 rounded-2xl p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="p-1 rounded-md bg-emerald-500/20 text-emerald-400">
                <GraduationCap className="w-4 h-4" />
              </span>
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide">
                {isAr ? "استوديو تعليم الذكاء الاصطناعي (Teach Mode)" : "Teach Mode Studio"}
              </span>
            </div>
            <h1 className="text-2xl font-extrabold text-white">
              {isAr ? "علّم نهج طريقة عمل مؤسستك خطوة بخطوة" : "Demonstrate the Process to NAHJ"}
            </h1>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              {isAr
                ? "الموظف ينفذ العمل ويشرح أسبابه صوتيًا أو كتابيًا. الذكاء الاصطناعي يربط الإجراءات بالأنظمة، يستخلص القواعد الحتمية، ويطرح الأسئلة التوضيحية قبل الاعتماد."
                : "Staff demonstrates work while explaining nuances. NAHJ correlates actions to systems, extracts deterministic rules, and poses targeted clarification questions."}
            </p>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <span className="text-xs px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 font-medium flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              {isAr ? "جلسة مصرحة ومرئية" : "Authorized & Audited"}
            </span>
          </div>
        </div>
      </div>

      {/* Main Studio Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Event Recording & Timeline */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                <span>{isAr ? "تسجيل خطوات العمل الحية" : "Live Demonstration Sequence"}</span>
              </h2>
              <span className="text-xs text-slate-400 font-mono">
                {recordedEvents.length} {isAr ? "خطوات مسجلة" : "events captured"}
              </span>
            </div>

            {/* Title input */}
            <div className="space-y-1">
              <label className="text-xs text-slate-400 font-medium">
                {isAr ? "عنوان العملية المراد تعليمها:" : "Process Name:"}
              </label>
              <input
                type="text"
                value={sessionTitle}
                onChange={(e) => setSessionTitle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Captured Event List */}
            <div className="space-y-2.5 pt-2">
              {recordedEvents.map((ev, index) => (
                <div
                  key={ev.id}
                  className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/90 hover:border-slate-700 transition-all space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-bold flex items-center justify-center">
                        {index + 1}
                      </span>
                      <span className="font-bold text-slate-200">{ev.action}</span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-500">{ev.time}</span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 font-medium text-teal-400">
                      {ev.system}
                    </span>
                    {ev.note && <span className="italic text-slate-300">"{ev.note}"</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Input Row for adding another step */}
            <div className="pt-3 border-t border-slate-800/80 space-y-2.5">
              <div className="text-xs font-semibold text-slate-300">
                {isAr ? "إضافة خطوة أو إجراء جديد للعملية:" : "Add Next Action or Explanation:"}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder={isAr ? "ماذا فعلت؟ (مثال: حجز موعد مقابلة)" : "Action performed..."}
                  value={newEventAction}
                  onChange={(e) => setNewEventAction(e.target.value)}
                  className="sm:col-span-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                />
                <select
                  value={newEventSystem}
                  onChange={(e) => setNewEventSystem(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none"
                >
                  <option value="Future SIS Core">Future SIS Core</option>
                  <option value="تقويم المقابلات والجولات">School Calendar</option>
                  <option value="خزينة الوثائق الرسمية">Doc Vault OCR</option>
                  <option value="بوابة K-Net">K-Net Gateway</option>
                  <option value="الإدارة المالية والاعتمادات">Finance Gateway</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder={isAr ? "شرح صوتي / نصي لسبب الخطوة أو الشرط..." : "Reason / explanation..."}
                  value={newEventNote}
                  onChange={(e) => setNewEventNote(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={handleAddEvent}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isAr ? "إضافة" : "Add"}</span>
                </button>
              </div>
            </div>

            {/* Synthesize CTA Button */}
            <div className="pt-3">
              <button
                disabled={isSynthesizing || recordedEvents.length === 0}
                onClick={handleSynthesize}
                className="w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-600 hover:to-teal-600 text-white font-bold py-3 rounded-xl shadow-lg shadow-emerald-500/20 text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Sparkles className={`w-4 h-4 ${isSynthesizing ? "animate-spin" : ""}`} />
                <span>
                  {isSynthesizing
                    ? isAr
                      ? "جارٍ استخلاص المهارة وربط القواعد..."
                      : "Synthesizing skill & extracting rules..."
                    : isAr
                    ? "استخلص المهارة واكتشف القواعد (Synthesize Skill)"
                    : "Synthesize Skill & Discover Logic"}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Right: AI Understanding & The WOW Moment (Prompt Section 72) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-teal-400" />
                <span>{isAr ? "فهم الذكاء الاصطناعي للمهارة" : "AI Codification Output"}</span>
              </h2>
              {synthesizedResult && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
                  {isAr ? "تم الاكتشاف" : "Discovered"}
                </span>
              )}
            </div>

            {!synthesizedResult && !isSynthesizing && (
              <div className="py-16 text-center space-y-3 px-4">
                <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 mx-auto flex items-center justify-center text-slate-400">
                  <Brain className="w-6 h-6 text-slate-500" />
                </div>
                <div className="text-xs font-semibold text-slate-300">
                  {isAr ? "بانتظار استخلاص المهارة" : "Awaiting Synthesis"}
                </div>
                <p className="text-[11px] text-slate-500 max-w-xs mx-auto leading-relaxed">
                  {isAr
                    ? "بعد انتهاء الموظف من عرض الخطوات، اضغط 'استخلص المهارة' ليقوم الذكاء الاصطناعي بربط الخطوات وطرح أسئلة التدقيق."
                    : "Click 'Synthesize Skill' once you have demonstrated the steps to trigger procedural extraction."}
                </p>
              </div>
            )}

            {isSynthesizing && (
              <div className="py-16 text-center space-y-3">
                <div className="w-10 h-10 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto" />
                <div className="text-xs font-bold text-emerald-400">
                  {isAr ? "يحلل الذكاء الاصطناعي طريقة العمل..." : "Analyzing Operational Graph..."}
                </div>
                <p className="text-[11px] text-slate-400">
                  {isAr ? "ربط الأنظمة واستخراج القواعد الحتمية" : "Extracting deterministic rules & decision gates"}
                </p>
              </div>
            )}

            {/* WOW MOMENT CARD (Prompt Section 72) */}
            {synthesizedResult && (
              <div className="space-y-4 animate-in fade-in duration-300">
                {/* The Moment Box */}
                <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/40 space-y-2">
                  <div className="text-xs font-extrabold text-emerald-300 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" />
                    <span>I learned a new skill! (تعلمت مهارة جديدة)</span>
                  </div>
                  <div className="text-sm font-bold text-white">
                    {sessionTitle}
                  </div>

                  {/* Badges breakdown */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px]">
                      <span className="text-slate-400 block">{isAr ? "الخطوات المكتشفة:" : "Steps Detected:"}</span>
                      <span className="font-mono font-bold text-emerald-400 text-sm">
                        {synthesizedResult.steps.length} {isAr ? "خطوات" : "steps"}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px]">
                      <span className="text-slate-400 block">{isAr ? "القواعد الحتمية:" : "Rules Codified:"}</span>
                      <span className="font-mono font-bold text-teal-400 text-sm">
                        {synthesizedResult.rules.length} {isAr ? "قواعد" : "rules"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Clarification questions before graduation */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1 text-xs font-bold text-amber-400">
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>{isAr ? "أسئلة للوضوح قبل الاعتماد الرسمي:" : "Open Questions to Resolve:"}</span>
                  </div>

                  {synthesizedResult.questions.map((q) => (
                    <div key={q.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                      <p className="text-xs text-slate-200">{q.question}</p>
                      <input
                        type="text"
                        placeholder={isAr ? "إجابة الموظف أو المدير..." : "Your answer..."}
                        value={answeredQuestions[q.id] || ""}
                        onChange={(e) =>
                          setAnsweredQuestions((prev) => ({ ...prev, [q.id]: e.target.value }))
                        }
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  ))}
                </div>

                {/* Approve & Codify Button */}
                <div className="pt-2">
                  <button
                    disabled={isCodified}
                    onClick={handleCodifySkill}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-800 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-500/20"
                  >
                    {isCodified ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>{isAr ? "تم اعتماد المهارة وإضافتها للعقل التشغيلي!" : "Codified & Added to Brain!"}</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>{isAr ? "اعتماد المهارة رسميًا (Approve & Codify Skill)" : "Approve & Codify Skill"}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
