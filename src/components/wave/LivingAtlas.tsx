import React, { useEffect, useMemo, useRef, useState } from "react";
import { BrainCircuit, Pause, Play, ShieldAlert, Waypoints } from "lucide-react";
import type { ApprovalRequest, AuditEvent, Skill, WorkItem } from "../../types";
import type { SectionId } from "../Shell";
import { actionLabel, actorLabel, dataText } from "../../lib/labels";
import { usePrefersReducedMotion } from "./motion";

/*
 * «العقل الحي»: أطلسٌ واحد بعرض الصفحة.
 *
 * كل ما فيه مقروءٌ مما تحمله «اليوم» أصلاً — لا رقم جديد ولا طلب جديد:
 *  - كوكب لكل مهارة، حجمه بعدد تشغيلاتها (usageCount) ولونه بخطرها.
 *  - نبضة لكل حالة عمل لم تكتمل، على مسار مهارتها، وموضعها بنسبة تقدّمها.
 *  - ما ينتظر قراراً يتوهّج كهرمانياً ويقف عند البوابة.
 *  - شريط زمن يعيد أحداث الأمس من سجلّ التدقيق: من فعل ماذا وتحت أي سياسة.
 */
type Props = {
  ar: boolean;
  skills: Skill[];
  workItems: WorkItem[];
  approvals: ApprovalRequest[];
  audit: AuditEvent[];
  paused?: boolean;
  onNavigate: (s: SectionId) => void;
  onApproval: (id: string) => void;
};

/* هندستان: عريضة للشاشات الواسعة، وطولية للهاتف حتى تبقى الكواكب وأرقامها مقروءة. */
const WIDE = { W: 1000, H: 500, inner: [245, 118], outer: [440, 205], r: [9, 17], runs: 13, core: [44, 34] };
const TALL = { W: 600, H: 660, inner: [140, 165], outer: [215, 290], r: [16, 20], runs: 19, core: [52, 40] };
type Geo = typeof WIDE;
const MAX_PLANETS = 12;

type Planet = { skill: Skill; x: number; y: number; r: number; waiting: number; live: number };

/* نقطة على منحنى تربيعي من الكوكب إلى المركز؛ t=0 عند الكوكب و1 عند العقل. */
function curve(p: { x: number; y: number }, bend: number, CX: number, CY: number) {
  const mx = (p.x + CX) / 2, my = (p.y + CY) / 2;
  const dx = CX - p.x, dy = CY - p.y; const len = Math.hypot(dx, dy) || 1;
  const cx = mx + (-dy / len) * bend, cy = my + (dx / len) * bend;
  return {
    d: `M${p.x.toFixed(1)} ${p.y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${CX} ${CY}`,
    at: (t: number) => ({ x: (1 - t) ** 2 * p.x + 2 * (1 - t) * t * cx + t * t * CX, y: (1 - t) ** 2 * p.y + 2 * (1 - t) * t * cy + t * t * CY }),
  };
}

function dayKey(d: Date) { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }

export function LivingAtlas({ ar, skills, workItems, approvals, audit, paused = false, onNavigate, onApproval }: Props) {
  const reduced = usePrefersReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<Geo>(WIDE);
  useEffect(() => {
    const el = stageRef.current; if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setGeo(entry.contentRect.width < 720 ? TALL : WIDE));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const { W, H } = geo; const CX = W / 2, CY = H / 2;
  const waitingIds = useMemo(() => new Set(approvals.filter(a => a.status === "pending").map(a => a.workItemId)), [approvals]);
  const isWaiting = (w: WorkItem) => w.state === "waiting_approval" || waitingIds.has(w.id);
  const active = useMemo(() => workItems.filter(w => w.state !== "completed"), [workItems]);

  const planets: Planet[] = useMemo(() => {
    const top = [...skills].sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0)).slice(0, MAX_PLANETS);
    const maxUse = Math.max(1, ...top.map(s => s.usageCount || 0));
    return top.map((skill, i) => {
      /* مداران: الداخلي للنصف الأكثر تشغيلاً. البداية من الأعلى، وتوزيعٌ متساوٍ على كل مدار. */
      const inner = i < Math.ceil(top.length / 2);
      const ring = inner ? top.slice(0, Math.ceil(top.length / 2)) : top.slice(Math.ceil(top.length / 2));
      const idx = inner ? i : i - Math.ceil(top.length / 2);
      const a = -Math.PI / 2 + (idx / Math.max(1, ring.length)) * Math.PI * 2 + (inner ? 0 : Math.PI / Math.max(1, ring.length));
      const [rx, ry] = inner ? geo.inner : geo.outer;
      const mine = active.filter(w => w.skillId === skill.id);
      return {
        skill, x: CX + rx * Math.cos(a), y: CY + ry * Math.sin(a),
        r: geo.r[0] + geo.r[1] * Math.sqrt((skill.usageCount || 0) / maxUse),
        waiting: mine.filter(isWaiting).length, live: mine.length,
      };
    });
  }, [skills, active, waitingIds, geo]); // eslint-disable-line react-hooks/exhaustive-deps

  /* شريط الزمن: أحداث الأمس بطابعها الحقيقي (at). وإن خلا الأمس فآخر يومٍ مسجّل قبل اليوم، ويُقال ذلك. */
  const replay = useMemo(() => {
    const stamped = audit.filter(e => e.at && !Number.isNaN(Date.parse(e.at))).map(e => ({ e, t: new Date(e.at as string) }));
    const today = new Date(); const y = new Date(today); y.setDate(today.getDate() - 1);
    let day = stamped.filter(x => dayKey(x.t) === dayKey(y));
    let isYesterday = true;
    if (!day.length) {
      const before = stamped.filter(x => x.t < new Date(today.getFullYear(), today.getMonth(), today.getDate())).sort((a, b) => +b.t - +a.t);
      if (before.length) { const k = dayKey(before[0].t); day = before.filter(x => dayKey(x.t) === k); isYesterday = false; }
    }
    day.sort((a, b) => +a.t - +b.t);
    return { events: day, isYesterday, date: day[0]?.t ?? null };
  }, [audit]);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => { setCursor(0); setPlaying(false); }, [replay.events.length]);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!playing) return;
    timer.current = window.setInterval(() => setCursor(c => {
      if (c >= replay.events.length - 1) { setPlaying(false); return c; }
      return c + 1;
    }), 1100);
    return () => window.clearInterval(timer.current);
  }, [playing, replay.events.length]);
  const current = replay.events[cursor]?.e;
  const litSkill = current ? planets.find(p => (current.details || "").includes(p.skill.name) || (p.skill.nameEn && (current.details || "").includes(p.skill.nameEn)))?.skill.id : undefined;

  const firstWaiting = approvals.find(a => a.status === "pending");
  const waitingCount = active.filter(isWaiting).length;
  const fmtTime = (d: Date) => d.toLocaleTimeString(ar ? "ar-KW-u-nu-latn" : "en-GB", { hour: "2-digit", minute: "2-digit" });
  const fmtDate = (d: Date) => d.toLocaleDateString(ar ? "ar-KW-u-nu-latn" : "en-GB", { weekday: "long", day: "numeric", month: "long" });
  const animate = !reduced && !paused;

  return (
    <section className={`living-atlas surface ${paused ? "is-paused" : ""}`} aria-labelledby="atlas-title">
      <header className="atlas-head">
        <div>
          <em>{ar ? "العقل الحي" : "LIVING BRAIN"}</em>
          <h2 id="atlas-title">{ar ? "أطلس العمل الآن" : "The work atlas, now"}</h2>
        </div>
        <div className="atlas-legend" aria-hidden="true">
          <span><i className="lg-low" />{ar ? "خطر منخفض" : "Low risk"}</span>
          <span><i className="lg-medium" />{ar ? "متوسط" : "Medium"}</span>
          <span><i className="lg-high" />{ar ? "مرتفع" : "High"}</span>
          <span><i className="lg-wait" />{ar ? "ينتظر قرارك" : "Awaiting you"}</span>
          <span><i className="lg-pulse" />{ar ? "حالة جارية" : "Live case"}</span>
        </div>
      </header>

      <div className="atlas-stage" ref={stageRef} style={{ aspectRatio: `${W} / ${H}` }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img"
          aria-label={ar
            ? `${planets.length} مهارة على الأطلس، ${active.length} حالة جارية، ${waitingCount} تنتظر قراراً${paused ? "، والتنفيذ الآلي متوقف" : ""}`
            : `${planets.length} skills, ${active.length} live cases, ${waitingCount} awaiting a decision${paused ? ", autopilot paused" : ""}`}>
          <ellipse className="atlas-orbit" cx={CX} cy={CY} rx={geo.inner[0]} ry={geo.inner[1]} />
          <ellipse className="atlas-orbit" cx={CX} cy={CY} rx={geo.outer[0]} ry={geo.outer[1]} />
          {planets.map((p, i) => {
            const c = curve(p, i % 2 ? 40 : -40, CX, CY);
            return <path key={`path-${p.skill.id}`} id={`atlas-path-${i}`} d={c.d} className={`atlas-path ${p.live ? "has-live" : ""} ${p.waiting ? "has-wait" : ""} ${litSkill === p.skill.id ? "is-lit" : ""}`} />;
          })}
          {/* النبضات: الموضع الثابت = نسبة التقدّم؛ الحركة (إن سُمح بها) تمرّ على المسار نفسه. */}
          {planets.flatMap((p, i) => {
            const c = curve(p, i % 2 ? 40 : -40, CX, CY);
            return active.filter(w => w.skillId === p.skill.id).slice(0, 4).map((w, k) => {
              const t = Math.max(0.08, Math.min(0.92, (w.progressPercent || 0) / 100));
              const pt = c.at(t);
              const wait = isWaiting(w);
              if (wait || !animate) return <circle key={w.id} className={`atlas-pulse ${wait ? "wait" : ""}`} cx={pt.x} cy={pt.y} r={wait ? 7 : 5.5}><title>{`${w.code} — ${dataText(w.currentStepTitle, ar)}`}</title></circle>;
              return <circle key={w.id} className="atlas-pulse moving" r={5.5}>
                <title>{`${w.code} — ${dataText(w.currentStepTitle, ar)}`}</title>
                <animateMotion dur={`${6 + (k % 3)}s`} begin={`${-(t * 6).toFixed(2)}s`} repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="linear">
                  <mpath href={`#atlas-path-${i}`} />
                </animateMotion>
              </circle>;
            });
          })}
          {planets.map(p => (
            <g key={p.skill.id} className={`atlas-planet rk-${p.skill.riskLevel} ${p.waiting ? "waiting" : ""} ${litSkill === p.skill.id ? "is-lit" : ""} ${p.skill.killSwitchActive ? "killed" : ""}`}
              transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}>
              {p.waiting > 0 && <circle className="planet-glow" r={p.r + 10} />}
              <circle className="planet-body" r={p.r} />
              <text className="planet-runs" y={geo.runs * 0.35} fontSize={geo.runs} textAnchor="middle">{p.skill.usageCount ?? 0}</text>
              <text className="planet-name" y={p.r + 17} textAnchor="middle">{shorten(ar ? dataText(p.skill.name, ar) : (p.skill.nameEn || p.skill.name), geo === TALL ? 12 : 18)}</text>
              <title>{`${ar ? p.skill.name : p.skill.nameEn || p.skill.name} — ${ar ? "تشغيل" : "runs"}: ${p.skill.usageCount ?? 0}`}</title>
            </g>
          ))}
          <g className={`atlas-core ${current && !litSkill ? "is-lit" : ""}`} transform={`translate(${CX} ${CY})`}>
            <circle r={geo.core[0]} className="core-halo" />
            <circle r={geo.core[1]} className="core-body" />
          </g>
        </svg>
        <span className="atlas-core-icon" aria-hidden="true">{paused ? <ShieldAlert /> : <BrainCircuit />}</span>
        {planets.length === 0 && <p className="atlas-empty">{ar ? "لا مهارات بعد — يمتلئ الأطلس حين تُعلَّم أول مهارة." : "No skills yet — the atlas fills as you teach NAHJ."}</p>}
      </div>

      <div className="atlas-actions">
        <button type="button" onClick={() => onNavigate("skills")}><BrainCircuit aria-hidden="true" />{ar ? "المهارات" : "Skills"}<b>{skills.length}</b></button>
        <button type="button" onClick={() => onNavigate("work")}><Waypoints aria-hidden="true" />{ar ? "حالات جارية" : "Live cases"}<b>{active.length}</b></button>
        <button type="button" className={waitingCount ? "attn" : ""} disabled={!firstWaiting} onClick={() => firstWaiting && onApproval(firstWaiting.id)}><ShieldAlert aria-hidden="true" />{ar ? "تنتظر قرارك" : "Awaiting you"}<b>{waitingCount}</b></button>
      </div>

      <div className="atlas-replay" role="group" aria-label={ar ? "إعادة تشغيل الأمس من السجل" : "Replay yesterday from the log"}>
        <div className="replay-head">
          <strong>{ar ? "إعادة يومٍ من السجل" : "Replay a day from the log"}</strong>
          <small>{replay.date ? (replay.isYesterday ? (ar ? `أمس — ${fmtDate(replay.date)}` : `Yesterday — ${fmtDate(replay.date)}`) : (ar ? `لا أحداث أمس؛ آخر يومٍ مسجّل: ${fmtDate(replay.date)}` : `Nothing yesterday; last logged day: ${fmtDate(replay.date)}`)) : (ar ? "لا أحداث بطابع زمني في السجل — غير مقيس" : "No timestamped events in the log — not measured")}</small>
        </div>
        {replay.events.length > 0 ? <>
          <div className="replay-controls">
            <button type="button" className="replay-play" onClick={() => { if (cursor >= replay.events.length - 1) setCursor(0); setPlaying(v => !v); }}
              aria-label={playing ? (ar ? "إيقاف الإعادة" : "Pause replay") : (ar ? "شغّل الإعادة" : "Play replay")}>{playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}</button>
            <input type="range" min={0} max={replay.events.length - 1} value={cursor} onChange={e => { setPlaying(false); setCursor(Number(e.target.value)); }}
              aria-label={ar ? "موضع الإعادة" : "Replay position"} aria-valuetext={current ? `${fmtTime(replay.events[cursor].t)} ${actionLabel(current.action, ar)}` : ""} />
            <span className="replay-count" dir="ltr">{cursor + 1}/{replay.events.length}</span>
          </div>
          {current && <div className="replay-event" aria-live="polite">
            <time>{fmtTime(replay.events[cursor].t)}</time>
            <span className={`replay-actor a-${current.actorType}`}>{actorLabel(current.actorName, ar)}</span>
            <strong>{actionLabel(current.action, ar)}</strong>
            <span className={`replay-policy ${current.policyCode ? "" : "none"}`}>{ar ? "السياسة" : "Policy"}: <b dir="ltr">{current.policyCode || "—"}</b></span>
          </div>}
        </> : null}
      </div>
    </section>
  );
}

function shorten(s: string, max: number) { return s.length > max ? `${s.slice(0, max - 1)}…` : s; }
