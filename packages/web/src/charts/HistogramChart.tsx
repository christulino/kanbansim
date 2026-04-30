import { useMemo, useRef, useState } from "react";
import type { AggregatorSnapshot } from "../orchestrator/aggregator.js";
import type { SweepSpec } from "../state/urlCodec.js";

type Props = {
  snapshot: AggregatorSnapshot | null;
  sweep: SweepSpec | null;
  productive_hours_per_day: number;
};

type BoxStats = {
  x: number;
  min: number;
  p10: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
  max: number;
  count: number;
  isOptimal: boolean;
};

const W = 1100;
const H = 360;
const M_LEFT = 60;
const M_RIGHT = 20;
const M_TOP = 20;
const M_BOTTOM = 50;

type HoverState = { screenX: number; screenY: number; box: BoxStats };

export function HistogramChart({ snapshot, sweep, productive_hours_per_day }: Props) {
  const stickyMaxRef = useRef(1);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState<HoverState | null>(null);

  const boxes = useMemo<BoxStats[]>(() => {
    if (!snapshot || snapshot.cells.size === 0) return [];
    let optimalSv: number | null = null;
    let optimalLT = Infinity;
    for (const c of snapshot.cells.values()) {
      if (c.run_count > 0 && c.mean_median_lead_time < optimalLT) {
        optimalLT = c.mean_median_lead_time;
        optimalSv = c.sweep_value;
      }
    }
    const out: BoxStats[] = [];
    for (const cell of snapshot.cells.values()) {
      if (cell.lead_time_samples.length === 0) continue;
      const samples = cell.lead_time_samples.map((h) => h / productive_hours_per_day).slice().sort((a, b) => a - b);
      const at = (q: number) =>
        samples[Math.min(samples.length - 1, Math.max(0, Math.floor(q * (samples.length - 1))))]!;
      out.push({
        x: cell.sweep_value,
        min: samples[0]!,
        p10: at(0.1),
        p25: at(0.25),
        median: at(0.5),
        p75: at(0.75),
        p90: at(0.9),
        max: samples[samples.length - 1]!,
        count: samples.length,
        isOptimal: cell.sweep_value === optimalSv,
      });
    }
    out.sort((a, b) => a.x - b.x);
    return out;
  }, [snapshot, productive_hours_per_day]);

  if (!sweep) {
    return <div className="card-loading">No sweep variable selected. Set one in Build → Monte Carlo to see distributions.</div>;
  }
  if (boxes.length === 0) {
    return <div className="card-loading">Collecting completed items…</div>;
  }

  const observedMaxLT = Math.max(...boxes.map((b) => b.p90));
  const observedMinLT = Math.min(...boxes.map((b) => b.p10));
  if (observedMaxLT > stickyMaxRef.current) stickyMaxRef.current = observedMaxLT * 1.05;
  const yMax = stickyMaxRef.current;
  // Floor the y-axis at ~80% of the smallest p10 across cells (clamped at 0). When the
  // shortest-lead-time cell sits well above zero, this preserves the visual fluctuations
  // instead of stranding all the boxes near the top of the chart.
  const yMin = Math.max(0, observedMinLT * 0.8);

  const xScale = (v: number) => M_LEFT + ((v - sweep.min) / (sweep.max - sweep.min)) * (W - M_LEFT - M_RIGHT);
  const yScale = (v: number) => M_TOP + (1 - (v - yMin) / Math.max(0.0001, yMax - yMin)) * (H - M_TOP - M_BOTTOM);

  // Box width: half the gap between adjacent sweep cells, with a sane minimum.
  const cellPx = (W - M_LEFT - M_RIGHT) / Math.max(1, (sweep.max - sweep.min) / sweep.step);
  const boxW = Math.max(8, Math.min(40, cellPx * 0.55));

  const yTicks = niceTicks(yMin, yMax, 5);

  function showHover(box: BoxStats, evt: React.MouseEvent) {
    if (!hostRef.current) return;
    const target = (evt.currentTarget as SVGElement).getBoundingClientRect();
    const host = hostRef.current.getBoundingClientRect();
    setHovered({
      screenX: target.left + target.width / 2 - host.left,
      screenY: target.top - host.top,
      box,
    });
  }

  return (
    <div ref={hostRef} className="chart-host">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "auto" }}>
        {/* Y grid lines + labels */}
        {yTicks.map((t) => (
          <g key={`y-${t}`}>
            <line x1={M_LEFT} x2={W - M_RIGHT} y1={yScale(t)} y2={yScale(t)} stroke="var(--rule-soft)" strokeDasharray="2 4" />
            <text x={M_LEFT - 8} y={yScale(t) + 3} textAnchor="end" fontFamily="JetBrains Mono, monospace" fontSize="11" fill="var(--text-soft)">
              {t.toFixed(0)}
            </text>
          </g>
        ))}

        {/* X axis */}
        <line x1={M_LEFT} x2={W - M_RIGHT} y1={H - M_BOTTOM} y2={H - M_BOTTOM} stroke="var(--rule)" />
        {boxes.map((b) => (
          <text
            key={`xlabel-${b.x}`}
            x={xScale(b.x)}
            y={H - M_BOTTOM + 16}
            textAnchor="middle"
            fontFamily="JetBrains Mono, monospace"
            fontSize="11"
            fill="var(--text-soft)"
          >
            {b.x}
          </text>
        ))}
        <text
          x={(M_LEFT + W - M_RIGHT) / 2}
          y={H - 10}
          textAnchor="middle"
          fontFamily="JetBrains Mono, monospace"
          fontSize="11"
          fill="var(--text-soft)"
          letterSpacing="0.12em"
        >
          {sweep.variable.toUpperCase()}
        </text>

        {/* Y axis label */}
        <text
          x={18}
          y={(M_TOP + H - M_BOTTOM) / 2}
          textAnchor="middle"
          fontFamily="JetBrains Mono, monospace"
          fontSize="11"
          fill="var(--text-soft)"
          letterSpacing="0.12em"
          transform={`rotate(-90 18 ${(M_TOP + H - M_BOTTOM) / 2})`}
        >
          LEAD TIME (DAYS)
        </text>

        {/* Box plots */}
        {boxes.map((b) => {
          const cx = xScale(b.x);
          const fillColor = b.isOptimal ? "var(--accent)" : "var(--series-4)";
          const strokeColor = b.isOptimal ? "var(--accent-deep)" : "var(--series-4)";
          return (
            <g key={`box-${b.x}`}>
              {/* Whisker line p10 → p90 */}
              <line x1={cx} x2={cx} y1={yScale(b.p10)} y2={yScale(b.p90)} stroke={strokeColor} strokeWidth={1} />
              {/* Whisker caps */}
              <line x1={cx - boxW / 4} x2={cx + boxW / 4} y1={yScale(b.p10)} y2={yScale(b.p10)} stroke={strokeColor} strokeWidth={1} />
              <line x1={cx - boxW / 4} x2={cx + boxW / 4} y1={yScale(b.p90)} y2={yScale(b.p90)} stroke={strokeColor} strokeWidth={1} />
              {/* IQR box (p25..p75) */}
              <rect
                x={cx - boxW / 2}
                y={yScale(b.p75)}
                width={boxW}
                height={Math.max(1, yScale(b.p25) - yScale(b.p75))}
                fill={fillColor}
                fillOpacity={0.35}
                stroke={strokeColor}
                strokeWidth={1.2}
              />
              {/* Median line */}
              <line
                x1={cx - boxW / 2}
                x2={cx + boxW / 2}
                y1={yScale(b.median)}
                y2={yScale(b.median)}
                stroke={strokeColor}
                strokeWidth={2}
              />
              {/* Invisible hover target spanning the full whisker range */}
              <rect
                x={cx - boxW / 2 - 2}
                y={yScale(b.p90) - 4}
                width={boxW + 4}
                height={Math.max(1, yScale(b.p10) - yScale(b.p90) + 8)}
                fill="transparent"
                style={{ cursor: "crosshair" }}
                onMouseEnter={(e) => showHover(b, e)}
                onMouseLeave={() => setHovered(null)}
              />
            </g>
          );
        })}
      </svg>

      {hovered && (
        <div className="chart-tooltip" style={{ left: hovered.screenX, top: hovered.screenY }}>
          <div className="tt-title">{sweep.variable} = {hovered.box.x}{hovered.box.isOptimal ? "  (lowest median)" : ""}</div>
          <div className="tt-row"><span className="tt-key">Median</span><span className="tt-val">{hovered.box.median.toFixed(1)} d</span></div>
          <div className="tt-row"><span className="tt-key">p25 – p75</span><span className="tt-val">{hovered.box.p25.toFixed(1)} – {hovered.box.p75.toFixed(1)} d</span></div>
          <div className="tt-row"><span className="tt-key">p10 – p90</span><span className="tt-val">{hovered.box.p10.toFixed(1)} – {hovered.box.p90.toFixed(1)} d</span></div>
          <div className="tt-row"><span className="tt-key">min – max</span><span className="tt-val">{hovered.box.min.toFixed(1)} – {hovered.box.max.toFixed(1)} d</span></div>
          <div className="tt-row" style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid rgba(244,238,220,0.18)" }}>
            <span className="tt-key">Sample size</span><span className="tt-val">{hovered.box.count.toLocaleString()} items</span>
          </div>
        </div>
      )}

      <div className="hist-meta mono">
        Each box: lead-time distribution at one sweep value. Filled ends of whiskers = p10/p90. Box = p25–p75 (IQR). Inner line = median.
        Highlighted box = cell with the lowest mean median lead time.
      </div>
    </div>
  );
}

function niceTicks(min: number, max: number, target: number): number[] {
  const range = max - min || 1;
  const rough = range / target;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const candidates = [1, 2, 5, 10].map((m) => m * pow);
  const step = candidates.find((c) => range / c <= target * 1.2) ?? candidates[candidates.length - 1]!;
  const out: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let v = start; v <= max + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}
