import React, { useEffect, useRef, useState } from "react";
import { Anchor, UserRound } from "lucide-react";
import type { WorkItem } from "../../types";
import { NahjGlyph } from "../Brand";
import { workStatePlain } from "../../lib/glossary";
import { dataText } from "../../lib/labels";

/*
 * «نهر العمل»: عرضٌ بديل للقمع نفسه. كل مرحلة قناة، وكل حالة قارب.
 * ما استلمه موظف يرسو على «ضفّتك» — من assignedMode كما يعيده الخادم بعد «استلم»
 * (المعالج نفسه في لوحة الحالة). لا يكتب هذا العرض شيئاً؛ النقر على قارب يختاره فقط.
 */
const FLOW = ["queued", "collecting_data", "waiting_documents", "waiting_approval", "executing", "completed"];

export function WorkRiver({ ar, items, selectedId, onSelect }: { ar: boolean; items: WorkItem[]; selectedId?: string; onSelect: (id: string) => void }) {
  /* على الهاتف ستة قوارب لكل قناة (والباقي عدداً) حتى لا يطول النهر صفحاتٍ. */
  const [perChannel, setPerChannel] = useState(() => (typeof window !== "undefined" && window.innerWidth < 640 ? 6 : 14));
  useEffect(() => {
    const on = () => setPerChannel(window.innerWidth < 640 ? 6 : 14);
    window.addEventListener("resize", on); return () => window.removeEventListener("resize", on);
  }, []);
  const PER_CHANNEL = perChannel;
  const stages = [...FLOW, ...(items.some(w => w.state === "escalated") ? ["escalated"] : [])];
  const afloat = items.filter(w => w.assignedMode !== "human_takeover");
  const banked = items.filter(w => w.assignedMode === "human_takeover");
  /* قاربٌ استُلم للتوّ (تغيّر وضعه بعد نجاح الاستلام) يُرسى بحركة واحدة. */
  const prev = useRef<Map<string, string>>(new Map());
  const [docking, setDocking] = useState<Set<string>>(new Set());
  useEffect(() => {
    const fresh: string[] = [];
    for (const w of items) {
      const before = prev.current.get(w.id);
      if (before === "ai" && w.assignedMode === "human_takeover") fresh.push(w.id);
      prev.current.set(w.id, w.assignedMode);
    }
    if (!fresh.length) return;
    setDocking(new Set(fresh));
    const t = window.setTimeout(() => setDocking(new Set()), 1400);
    return () => window.clearTimeout(t);
  }, [items]);

  const boat = (w: WorkItem) => (
    <button key={w.id} type="button" className={`river-boat rk-${w.riskLevel} ${w.id === selectedId ? "selected" : ""} ${docking.has(w.id) ? "docking" : ""} ${w.state === "waiting_approval" ? "at-gate" : ""}`}
      onClick={() => onSelect(w.id)} aria-pressed={w.id === selectedId}
      aria-label={`${w.code} — ${w.contactName || w.title} — ${workStatePlain(w.state, ar)}`} title={dataText(w.currentStepTitle, ar)}>
      <span aria-hidden="true">{w.assignedMode === "ai" ? <NahjGlyph /> : <UserRound />}</span><b dir="ltr">{w.code}</b>
    </button>
  );

  return (
    <div className="wave-river" role="group" aria-label={ar ? "نهر العمل: الحالات حسب المرحلة" : "Work river: cases by stage"}>
      {stages.map((st, i) => {
        const boats = afloat.filter(w => w.state === st);
        return (
          <div key={st} className={`river-channel ${boats.length ? "has" : ""} ${st === "escalated" ? "esc" : ""} ${st === "waiting_approval" ? "gate" : ""}`} style={{ ["--i" as string]: i } as React.CSSProperties}>
            <div className="river-label"><small>{workStatePlain(st, ar)}</small><b>{boats.length}</b></div>
            <div className="river-water">
              {boats.slice(0, PER_CHANNEL).map(boat)}
              {boats.length > PER_CHANNEL && <span className="river-more">+{boats.length - PER_CHANNEL}</span>}
            </div>
          </div>
        );
      })}
      <div className={`river-bank ${banked.length ? "has" : ""}`}>
        <div className="river-label"><small><Anchor aria-hidden="true" />{ar ? "ضفّتك — استلمها موظف" : "Your bank — taken over"}</small><b>{banked.length}</b></div>
        <div className="river-water">
          {banked.slice(0, PER_CHANNEL).map(boat)}
          {banked.length > PER_CHANNEL && <span className="river-more">+{banked.length - PER_CHANNEL}</span>}
          {!banked.length && <span className="river-empty">{ar ? "لا حالة مستلمة الآن" : "Nothing taken over"}</span>}
        </div>
      </div>
    </div>
  );
}
