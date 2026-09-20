import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BrainCircuit, History, Search, ShieldCheck, Workflow } from "lucide-react";
import type { SectionId } from "./Shell";
import type { AuditEvent, Skill, WorkItem, ApprovalRequest } from "../types";
import { SKILL_STATUS_PLAIN, WORK_STATE_PLAIN, ladderStep } from "../lib/glossary";

/*
 * لوحة الأوامر.
 *
 * كان في شريط الأدوات حقل بحث يحمل «⌘K» ولا يفعل شيئاً: يُكتب فيه فلا يبحث، ولا
 * يستجيب للاختصار المكتوب عليه. وهو أسوأ من غيابه — يَعِد بقدرة غير موجودة،
 * فيجرّبها من يُعرض عليه المنتج أمامه.
 *
 * والبحث هنا في المخزون المحمَّل أصلاً في الواجهة: لا طلب شبكة ولا انتظار. ما
 * يُبحث فيه هو ما يراه المستخدم فعلاً، فلا يَعِد بنتائج من خارج صلاحيته.
 */

export interface CommandTarget {
  id: string;
  kind: "nav" | "skill" | "work" | "approval" | "audit";
  title: string;
  subtitle: string;
  section: SectionId;
  /* ما يُفتح بعد الانتقال — طلب اعتماد مثلاً. */
  approvalId?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  lang: "ar" | "en";
  skills: Skill[];
  workItems: WorkItem[];
  approvals: ApprovalRequest[];
  audit: AuditEvent[];
  isOwner: boolean;
  onGo: (target: CommandTarget) => void;
}

const NAV: Array<{ id: SectionId; ar: string; en: string; hintAr: string }> = [
  { id: "today", ar: "اليوم", en: "Today", hintAr: "ما يحتاجك الآن" },
  { id: "learn", ar: "يتعلّم", en: "Learn", hintAr: "ما اكتشفه نهج وينتظر حسمك" },
  { id: "teach", ar: "علّم نهج", en: "Teach", hintAr: "نفّذ عملك بينما يسجّل خطواتك" },
  { id: "skills", ar: "المهارات", en: "Skills", hintAr: "كل ما تعرف المؤسسة أن تفعله" },
  { id: "practice", ar: "التدرّب والظل", en: "Practice", hintAr: "اختبارات المهارات قبل التشغيل" },
  { id: "work", ar: "العمل", en: "Work", hintAr: "الحالات الجارية" },
  { id: "simulator", ar: "المحادثة", en: "Simulator", hintAr: "قناة العميل الخارجية" },
  { id: "connections", ar: "الربط", en: "Connections", hintAr: "الأنظمة الموصولة وصلاحياتها" },
  { id: "analytics", ar: "الأثر", en: "Impact", hintAr: "الأرقام المشتقّة من عملك" },
  { id: "control", ar: "الحوكمة", en: "Control", hintAr: "الحواجز ومفتاح الإيقاف الطارئ" },
  { id: "audit", ar: "السجلّ", en: "Audit", hintAr: "أثر كل ما جرى" },
  { id: "accounts", ar: "الحسابات", en: "Accounts", hintAr: "من يدخل وبأي صلاحية" },
  { id: "billing", ar: "الاشتراك", en: "Subscription", hintAr: "المدّة والباقة والفواتير" },
  { id: "sectors", ar: "النشاط", en: "Sector", hintAr: "حزمة القطاع المركّبة" },
];

/** مطابقة بسيطة بلا ترتيب ذكيّ: النتيجة تُفهم، وترتيبها لا يفاجئ. */
const matches = (haystack: string, needle: string) =>
  haystack.toLowerCase().includes(needle.toLowerCase());

export function CommandPalette({ open, onClose, lang, skills, workItems, approvals, audit, isOwner, onGo }: Props) {
  const ar = lang === "ar";
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      /* التركيز بعد الرسم، وإلا ذهب إلى عنصر لم يوجد بعد. */
      const timer = window.setTimeout(() => input.current?.focus(), 30);
      return () => window.clearTimeout(timer);
    }
  }, [open]);

  const results = useMemo<CommandTarget[]>(() => {
    const q = query.trim();
    const nav: CommandTarget[] = NAV
      .filter(item => item.id !== "owner" || isOwner)
      .filter(item => !q || matches(item.ar, q) || matches(item.en, q) || matches(item.hintAr, q))
      .map(item => ({ id: `nav_${item.id}`, kind: "nav", title: ar ? item.ar : item.en, subtitle: item.hintAr, section: item.id }));

    if (!q) return nav.slice(0, 8);

    const skillHits: CommandTarget[] = skills
      .filter(skill => matches(skill.name, q) || matches(skill.nameEn, q) || matches(skill.category, q))
      .slice(0, 6)
      .map(skill => ({
        id: `skill_${skill.id}`, kind: "skill", title: skill.name,
        subtitle: `${SKILL_STATUS_PLAIN[skill.status] || skill.status} · ${ladderStep(skill.autonomyLevel).plain}`,
        section: "skills",
      }));

    const workHits: CommandTarget[] = workItems
      .filter(item => matches(item.title || "", q) || matches(item.code || "", q) || matches(item.contactName || "", q))
      .slice(0, 6)
      .map(item => ({
        id: `work_${item.id}`, kind: "work", title: `${item.code} — ${item.contactName || item.title}`,
        subtitle: WORK_STATE_PLAIN[item.state] || item.state, section: "work",
      }));

    const approvalHits: CommandTarget[] = approvals
      .filter(approval => approval.status === "pending" && (matches(approval.workTitle || "", q) || matches(approval.reasonCode || "", q)))
      .slice(0, 4)
      .map(approval => ({
        id: `appr_${approval.id}`, kind: "approval", title: approval.workTitle,
        subtitle: ar ? "ينتظر اعتمادك" : "Awaiting your approval", section: "work", approvalId: approval.id,
      }));

    const auditHits: CommandTarget[] = audit
      .filter(event => matches(event.action || "", q) || matches(event.details || "", q) || matches(event.actorName || "", q))
      .slice(0, 5)
      .map(event => ({
        id: `aud_${event.id}`, kind: "audit", title: event.action,
        subtitle: `${event.actorName} · ${event.timestamp}`, section: "audit",
      }));

    return [...approvalHits, ...skillHits, ...workHits, ...nav.slice(0, 3), ...auditHits];
  }, [query, skills, workItems, approvals, audit, ar, isOwner]);

  useEffect(() => { setCursor(0); }, [query]);

  if (!open) return null;

  const go = (target: CommandTarget) => { onGo(target); onClose(); };

  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") { onClose(); return; }
    if (event.key === "ArrowDown") { event.preventDefault(); setCursor(c => Math.min(c + 1, results.length - 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
    if (event.key === "Enter" && results[cursor]) { event.preventDefault(); go(results[cursor]); }
  };

  const icon = (kind: CommandTarget["kind"]) =>
    kind === "skill" ? <BrainCircuit /> : kind === "work" ? <Workflow />
      : kind === "approval" ? <ShieldCheck /> : kind === "audit" ? <History /> : <ArrowLeft />;

  return (
    <div className="palette-backdrop" onMouseDown={event => { if (event.currentTarget === event.target) onClose(); }}>
      <div className="palette" role="dialog" aria-label={ar ? "بحث وتنقّل" : "Search and navigate"}>
        <div className="palette-input">
          <Search />
          <input
            ref={input}
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={onKey}
            placeholder={ar ? "ابحث عن مهارة، حالة، أو شاشة..." : "Search a skill, case or screen..."}
            aria-label={ar ? "بحث" : "Search"}
          />
          <kbd>ESC</kbd>
        </div>

        <div className="palette-results">
          {!results.length && (
            <p className="palette-empty">
              {ar ? "لا نتيجة. جرّب اسم مهارة أو رقم حالة." : "No results. Try a skill name or case code."}
            </p>
          )}
          {results.map((result, index) => (
            <button
              key={result.id}
              className={`palette-row ${index === cursor ? "active" : ""}`}
              onMouseEnter={() => setCursor(index)}
              onClick={() => go(result)}
            >
              <span className={`palette-icon kind-${result.kind}`}>{icon(result.kind)}</span>
              <span className="palette-copy">
                <strong>{result.title}</strong>
                <small>{result.subtitle}</small>
              </span>
            </button>
          ))}
        </div>

        <div className="palette-foot">
          <span>↑↓ {ar ? "تنقّل" : "navigate"}</span>
          <span>⏎ {ar ? "افتح" : "open"}</span>
          <span>ESC {ar ? "إغلاق" : "close"}</span>
        </div>
      </div>
    </div>
  );
}
