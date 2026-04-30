import { useEffect, useMemo, useRef, useState } from "react";
import * as Plot from "@observablehq/plot";
import type { AggregatorSnapshot } from "../orchestrator/aggregator.js";
import type { SweepSpec } from "../state/urlCodec.js";

type Props = {
  snapshot: AggregatorSnapshot | null;
  sweep: SweepSpec | null;
  productive_hours_per_day: number;
  totalRunsExpected: number;
};

type CellPoint = {
  x: number;
  items: number;
  items_lo: number;
  items_hi: number;
  arrived: number;
  unfinished: number;
  lt_days: number;
  lt_lo: number;
  lt_hi: number;
};

type HoverState = { screenX: number; screenY: number; point: CellPoint };

const SVG_NS = "http://www.w3.org/2000/svg";
const W = 1100;
const PLOT_LEFT = 60;
const PLOT_RIGHT = 1020;     // W - marginRight (80) = 1020

export function UCurveChart({ snapshot, sweep, productive_hours_per_day, totalRunsExpected }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState<HoverState | null>(null);

  const points = useMemo<CellPoint[]>(() => {
    if (!sweep || !snapshot) return [];
    const pts: CellPoint[] = [];
    for (const [sv, c] of snapshot.cells) {
      pts.push({
        x: sv,
        items: c.mean_items_completed,
        items_lo: c.p05_items_completed,
        items_hi: c.p95_items_completed,
        arrived: c.mean_items_arrived,
        unfinished: c.mean_items_unfinished,
        lt_days: c.mean_median_lead_time / productive_hours_per_day,
        lt_lo: c.p05_median_lead_time / productive_hours_per_day,
        lt_hi: c.p95_median_lead_time / productive_hours_per_day,
      });
    }
    pts.sort((a, b) => a.x - b.x);
    return pts;
  }, [snapshot, sweep, productive_hours_per_day]);

  useEffect(() => {
    const host = chartRef.current;
    if (!host) return;
    while (host.firstChild) host.removeChild(host.firstChild);
    if (!sweep || points.length === 0) return;

    const ltHi = Math.max(...points.map((p) => p.lt_hi));
    const ltLo = Math.min(...points.map((p) => p.lt_lo));
    const ltMax = (ltHi || 1) * 1.1;
    const ltMin = Math.max(0, ltLo * 0.85);
    const icHi = Math.max(...points.map((p) => p.items_hi));
    const icLo = Math.min(...points.map((p) => p.items_lo));
    const icMax = (icHi || 1) * 1.1;
    const icMin = Math.max(0, icLo * 0.85);

    const fig = Plot.plot({
      width: W, height: 360, marginLeft: 60, marginRight: 80, marginBottom: 50,
      style: { background: "transparent", color: "var(--text-soft)", fontFamily: "JetBrains Mono, monospace", fontSize: "11px" },
      x: { label: sweep.variable, domain: [sweep.min, sweep.max], grid: false },
      y: { label: "Lead time (days)", domain: [ltMin, ltMax] },
      marks: [
        Plot.areaY(points, { x: "x", y1: "lt_lo", y2: "lt_hi", fill: "var(--series-2)", fillOpacity: 0.15, curve: "monotone-x" }),
        Plot.lineY(points, { x: "x", y: "lt_days", stroke: "var(--series-2)", strokeWidth: 2.5, curve: "monotone-x" }),
        Plot.dot(points, { x: "x", y: "lt_days", fill: "var(--series-2)", r: 3 }),
        Plot.text(points.slice(-1), { x: "x", y: "lt_days", text: () => "Lead Time", dx: 8, dy: -6, fill: "var(--series-2)", textAnchor: "start", fontFamily: "Inter", fontSize: 12, fontWeight: 500 }),
      ],
    });

    const fig2 = Plot.plot({
      width: W, height: 360, marginLeft: 60, marginRight: 80, marginBottom: 50,
      style: { background: "transparent", color: "var(--text-soft)", fontFamily: "JetBrains Mono, monospace", fontSize: "11px", position: "absolute", top: "0", left: "0", pointerEvents: "none" },
      x: { domain: [sweep.min, sweep.max], axis: null },
      y: { axis: "right", label: "Items completed (per run)", domain: [icMin, icMax] },
      marks: [
        Plot.areaY(points, { x: "x", y1: "items_lo", y2: "items_hi", fill: "var(--series-1)", fillOpacity: 0.15, curve: "monotone-x" }),
        Plot.lineY(points, { x: "x", y: "items", stroke: "var(--series-1)", strokeWidth: 2.5, curve: "monotone-x" }),
        Plot.dot(points, { x: "x", y: "items", fill: "var(--series-1)", r: 3 }),
        Plot.text(points.slice(-1), { x: "x", y: "items", text: () => "Items completed", dx: 8, dy: -6, fill: "var(--series-1)", textAnchor: "start", fontFamily: "Inter", fontSize: 12, fontWeight: 500 }),
      ],
    });

    const wrap = document.createElement("div");
    wrap.style.position = "relative";
    wrap.appendChild(fig);
    wrap.appendChild(fig2);

    if (snapshot && snapshot.total_runs >= totalRunsExpected * 0.5 && points.length >= 3) {
      const minLead = points.reduce((acc, p) => (p.lt_days < acc.lt_days ? p : acc), points[0]!);
      const maxThroughput = points.reduce((acc, p) => (p.items > acc.items ? p : acc), points[0]!);

      const PLOT_TOP = 20;
      const PLOT_BOTTOM = 360 - 50;
      const PLOT_H = PLOT_BOTTOM - PLOT_TOP;
      const yForLead = (lt: number) => PLOT_TOP + (1 - (lt - ltMin) / Math.max(0.0001, ltMax - ltMin)) * PLOT_H;
      const yForThroughput = (tp: number) => PLOT_TOP + (1 - (tp - icMin) / Math.max(0.0001, icMax - icMin)) * PLOT_H;

      const ann = document.createElementNS(SVG_NS, "svg");
      ann.setAttribute("style", "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;");
      ann.setAttribute("viewBox", "0 0 1100 360");
      const xFor = (v: number) => ((v - sweep.min) / (sweep.max - sweep.min)) * 980 + 60;

      const ltY = yForLead(minLead.lt_days);
      const ltLabelY = ltY < 50 ? ltY + 22 : ltY - 12;
      const ltLabel = document.createElementNS(SVG_NS, "text");
      ltLabel.setAttribute("x", String(xFor(minLead.x)));
      ltLabel.setAttribute("y", String(ltLabelY));
      ltLabel.setAttribute("text-anchor", "middle");
      ltLabel.setAttribute("font-family", "Caveat, cursive");
      ltLabel.setAttribute("font-size", "20");
      ltLabel.setAttribute("fill", "var(--series-2)");
      ltLabel.textContent = `shortest lead time ≈ ${minLead.x.toFixed(0)}`;
      ann.appendChild(ltLabel);

      const tpY = yForThroughput(maxThroughput.items);
      const tpLabelY = tpY < 50 ? tpY + 22 : tpY - 12;
      const xClose = Math.abs(xFor(minLead.x) - xFor(maxThroughput.x)) < 120;
      const yClose = Math.abs(ltLabelY - tpLabelY) < 22;
      const finalTpY = xClose && yClose ? tpLabelY + 24 : tpLabelY;
      const tpLabel = document.createElementNS(SVG_NS, "text");
      tpLabel.setAttribute("x", String(xFor(maxThroughput.x)));
      tpLabel.setAttribute("y", String(finalTpY));
      tpLabel.setAttribute("text-anchor", "middle");
      tpLabel.setAttribute("font-family", "Caveat, cursive");
      tpLabel.setAttribute("font-size", "20");
      tpLabel.setAttribute("fill", "var(--series-1)");
      tpLabel.textContent = `most items completed ≈ ${maxThroughput.x.toFixed(0)}`;
      ann.appendChild(tpLabel);
      wrap.appendChild(ann);
    }

    host.appendChild(wrap);
    return () => { while (host.firstChild) host.removeChild(host.firstChild); };
  }, [points, sweep, totalRunsExpected, snapshot]);

  function handleMove(evt: React.MouseEvent<HTMLDivElement>) {
    if (!hostRef.current || !chartRef.current || !sweep || points.length === 0) return;
    const chartRect = chartRef.current.getBoundingClientRect();
    const hostRect = hostRef.current.getBoundingClientRect();
    // Translate cursor x into the chart's viewBox (0..W).
    const xInChart = ((evt.clientX - chartRect.left) / chartRect.width) * W;
    if (xInChart < PLOT_LEFT || xInChart > PLOT_RIGHT) {
      setHovered(null);
      return;
    }
    const sweepValue = ((xInChart - PLOT_LEFT) / (PLOT_RIGHT - PLOT_LEFT)) * (sweep.max - sweep.min) + sweep.min;
    let nearest = points[0]!;
    let bestDist = Math.abs(nearest.x - sweepValue);
    for (const p of points) {
      const d = Math.abs(p.x - sweepValue);
      if (d < bestDist) { nearest = p; bestDist = d; }
    }
    const nearestSvgX = ((nearest.x - sweep.min) / (sweep.max - sweep.min)) * (PLOT_RIGHT - PLOT_LEFT) + PLOT_LEFT;
    const nearestPixelX = (nearestSvgX / W) * chartRect.width + chartRect.left - hostRect.left;
    setHovered({
      screenX: nearestPixelX,
      screenY: chartRect.top - hostRect.top,
      point: nearest,
    });
  }

  if (!sweep) {
    return <div className="card-loading">No sweep variable selected. Set one in Build → Monte Carlo to see the U-curve.</div>;
  }
  if (!snapshot || snapshot.total_runs === 0) {
    return <div className="card-loading">Waiting for first runs…</div>;
  }
  return (
    <div ref={hostRef} className="chart-host" onMouseMove={handleMove} onMouseLeave={() => setHovered(null)}>
      <div ref={chartRef} />
      {hovered && (
        <div className="chart-tooltip" style={{ left: hovered.screenX, top: hovered.screenY }}>
          <div className="tt-title">{sweep.variable} = {hovered.point.x}</div>
          <div className="tt-row"><span className="tt-key">Lead time (median)</span><span className="tt-val">{hovered.point.lt_days.toFixed(1)} d</span></div>
          <div className="tt-row"><span className="tt-key">Lead time (p5–p95)</span><span className="tt-val">{hovered.point.lt_lo.toFixed(1)} – {hovered.point.lt_hi.toFixed(1)} d</span></div>
          <div className="tt-row" style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid rgba(244,238,220,0.18)" }}>
            <span className="tt-key">Items completed</span><span className="tt-val">{hovered.point.items.toFixed(1)}</span>
          </div>
          <div className="tt-row"><span className="tt-key">Items arrived</span><span className="tt-val">{hovered.point.arrived.toFixed(1)}</span></div>
          <div className="tt-row"><span className="tt-key">Items unfinished</span><span className="tt-val">{hovered.point.unfinished.toFixed(1)}</span></div>
        </div>
      )}
    </div>
  );
}
