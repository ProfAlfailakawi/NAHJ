import React from "react";
import type { Connector } from "../../types";
import { NahjGlyph } from "../Brand";
import { connectorTypeLabel, dataText } from "../../lib/labels";
import { usePrefersReducedMotion } from "./motion";

/*
 * «الكوكبة الصادقة»: عقدةٌ لكل موصل موجود فعلاً — لا أعداد حالةٍ مرسومة.
 * المحاكى متقطّع شفاف، والقائم يتوهّج. وحين يجري «الفحص» الموجود على موصل تمشي نبضةٌ على خيطه.
 */
const W = 520, H = 360, CX = 260, CY = 180;

export function HonestConstellation({ ar, connectors, testingId }: { ar: boolean; connectors: Connector[]; testingId: string | null }) {
  const reduced = usePrefersReducedMotion();
  const n = connectors.length;
  const live = connectors.filter(c => c.mode === "live").length;
  return (
    <figure className="honest-constellation">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" preserveAspectRatio="xMidYMid meet"
        aria-label={ar ? `${n} موصل: ${live} قائم و${n - live} محاكاة` : `${n} connectors: ${live} live, ${n - live} simulated`}>
        {connectors.map((c, i) => {
          const a = -Math.PI / 2 + (i / Math.max(1, n)) * Math.PI * 2;
          const x = CX + 190 * Math.cos(a), y = CY + 128 * Math.sin(a);
          const sim = c.mode !== "live";
          const testing = testingId === c.id;
          const id = `hc-thread-${i}`;
          return (
            <g key={c.id} className={`hc-node ${sim ? "sim" : "live"} st-${c.status} ${testing ? "testing" : ""}`}>
              <path id={id} className="hc-thread" d={`M${CX} ${CY} L${x.toFixed(1)} ${y.toFixed(1)}`} />
              {testing && (reduced
                ? <circle className="hc-pulse" cx={(CX + x) / 2} cy={(CY + y) / 2} r="5" />
                : <circle className="hc-pulse" r="5"><animateMotion dur="1.2s" repeatCount="indefinite"><mpath href={`#${id}`} /></animateMotion></circle>)}
              <circle className="hc-halo" cx={x} cy={y} r="24" />
              <circle className="hc-dot" cx={x} cy={y} r="16" />
              <text className="hc-name" x={x} y={y + 34} textAnchor="middle">{short(dataText(c.name, ar))}</text>
              <text className="hc-kind" x={x} y={y + 49} textAnchor="middle">{sim ? (ar ? "محاكاة" : "simulated") : (ar ? "قائم" : "live")} · {connectorTypeLabel(c.type, ar)}</text>
              <title>{`${c.name} — ${sim ? (ar ? "محاكاة: لا يخرج منها طلب شبكة" : "simulated: no network calls") : (ar ? "وصلة قائمة" : "live link")}`}</title>
            </g>
          );
        })}
        <circle className="hc-core" cx={CX} cy={CY} r="30" />
      </svg>
      <span className="hc-core-icon" aria-hidden="true"><NahjGlyph /></span>
      <figcaption>
        <span><i className="hc-k live" />{ar ? `قائم ${live}` : `Live ${live}`}</span>
        <span><i className="hc-k sim" />{ar ? `محاكاة ${n - live}` : `Simulated ${n - live}`}</span>
      </figcaption>
      {n === 0 && <p className="hc-empty">{ar ? "لا موصلات معرّفة." : "No connectors defined."}</p>}
    </figure>
  );
}
function short(s: string) { return s.length > 16 ? `${s.slice(0, 15)}…` : s; }
