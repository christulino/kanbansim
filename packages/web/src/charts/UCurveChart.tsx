import { useEffect, useRef } from "react";
import * as Plot from "@observablehq/plot";
import type { AggregatorSnapshot } from "../orchestrator/aggregator.js";
import type { SweepSpec } from "../state/urlCodec.js";

type Props = {
  snapshot: AggregatorSnapshot | null;
  sweep: SweepSpec | null;
  productive_hours_per_day: number;
  totalRunsExpected: number;
};

type CellPoint = { x: number; throughput: number; lt_days: number; tp_lo: number; tp_hi: number; lt_lo: number; lt_hi: number };

const SVG_NS = "http://www.w3.org/2000/svg";

export function UCurveChart({ snapshot, sweep, productive_hours_per_day, totalRunsExpected }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    while (host.firstChild) host.removeChild(host.firstChild);
    if (!sweep || !snapshot) return;

    const points: CellPoint[] = [];
    for (const [sv, c] of snapshot.cells) {
      points.push({
        x: sv,
        throughput: c.mean_throughput,
        lt_days: c.mean_median_lead_time / productive_hours_per_day,
        tp_lo: c.p05_throughput, tp_hi: c.p95_throughput,
        lt_lo: c.p05_median_lead_time / productive_hours_per_day,
        lt_hi: c.p95_median_lead_time / productive_hours_per_day,
      });
    }
    points.sort((a, b) => a.x - b.x);
    if (points.length === 0) return;

    const ltMax = Math.max(...points.map((p) => p.lt_hi)) * 1.1 || 1;
    const tpMax = Math.max(...points.map((p) => p.tp_hi)) * 1.1 || 1;

    const fig = Plot.plot({
      width: 1100,
      height: 360,
      marginLeft: 60,
      marginRight: 80,
      marginBottom: 50,
      style: { background: "transparent", color: "var(--text-soft)", fontFamily: "JetBrains Mono, monospace", fontSize: "11px" },
      x: { label: sweep.variable, domain: [sweep.min, sweep.max], grid: false },
      y: { label: "Lead time (days)", domain: [0, ltMax] },
      marks: [
        Plot.areaY(points, { x: "x", y1: "lt_lo", y2: "lt_hi", fill: "var(--series-2)", fillOpacity: 0.15, curve: "monotone-x" }),
        Plot.lineY(points, { x: "x", y: "lt_days", stroke: "var(--series-2)", strokeWidth: 2.5, curve: "monotone-x" }),
        Plot.dot(points, { x: "x", y: "lt_days", fill: "var(--series-2)", r: 3 }),
        Plot.text(points.slice(-1), { x: "x", y: "lt_days", text: () => "Lead Time", dx: 8, dy: -6, fill: "var(--series-2)", textAnchor: "start", fontFamily: "Inter", fontSize: 12, fontWeight: 500 }),
      ],
    });

    const fig2 = Plot.plot({
      width: 1100,
      height: 360,
      marginLeft: 60,
      marginRight: 80,
      marginBottom: 50,
      style: { background: "transparent", color: "var(--text-soft)", fontFamily: "JetBrains Mono, monospace", fontSize: "11px", position: "absolute", top: "0", left: "0", pointerEvents: "none" },
      x: { domain: [sweep.min, sweep.max], axis: null },
      y: { axis: "right", label: "Throughput (items/day)", domain: [0, tpMax] },
      marks: [
        Plot.areaY(points, { x: "x", y1: "tp_lo", y2: "tp_hi", fill: "var(--series-1)", fillOpacity: 0.15, curve: "monotone-x" }),
        Plot.lineY(points, { x: "x", y: "throughput", stroke: "var(--series-1)", strokeWidth: 2.5, curve: "monotone-x" }),
        Plot.dot(points, { x: "x", y: "throughput", fill: "var(--series-1)", r: 3 }),
        Plot.text(points.slice(-1), { x: "x", y: "throughput", text: () => "Throughput", dx: 8, dy: -6, fill: "var(--series-1)", textAnchor: "start", fontFamily: "Inter", fontSize: 12, fontWeight: 500 }),
      ],
    });

    const wrap = document.createElement("div");
    wrap.style.position = "relative";
    wrap.appendChild(fig);
    wrap.appendChild(fig2);

    if (snapshot.total_runs >= totalRunsExpected * 0.5 && points.length >= 3) {
      const minLead = points.reduce((acc, p) => (p.lt_days < acc.lt_days ? p : acc), points[0]!);
      const maxThroughput = points.reduce((acc, p) => (p.throughput > acc.throughput ? p : acc), points[0]!);

      // Plot's defaults: marginTop=20, marginBottom=50 here, so the plot area is y=20..310 (height 290).
      const PLOT_TOP = 20;
      const PLOT_BOTTOM = 360 - 50;
      const PLOT_H = PLOT_BOTTOM - PLOT_TOP;
      const yForLead = (lt: number) => PLOT_TOP + (1 - lt / ltMax) * PLOT_H;
      const yForThroughput = (tp: number) => PLOT_TOP + (1 - tp / tpMax) * PLOT_H;

      const ann = document.createElementNS(SVG_NS, "svg");
      ann.setAttribute("style", "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;");
      ann.setAttribute("viewBox", "0 0 1100 360");
      const xFor = (v: number) => ((v - sweep.min) / (sweep.max - sweep.min)) * 980 + 60;

      // Shortest lead time annotation — placed just above the data point.
      // If the point is near the top of the chart, flip it below to keep the label visible.
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

      // Highest throughput annotation — placed just above its data point.
      const tpY = yForThroughput(maxThroughput.throughput);
      const tpLabelY = tpY < 50 ? tpY + 22 : tpY - 12;
      // If the two labels are close in (x, y), nudge the throughput label down to avoid collision.
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
      tpLabel.textContent = `highest throughput ≈ ${maxThroughput.x.toFixed(0)}`;
      ann.appendChild(tpLabel);
      wrap.appendChild(ann);
    }

    host.appendChild(wrap);
    return () => { while (host.firstChild) host.removeChild(host.firstChild); };
  }, [snapshot, sweep, productive_hours_per_day, totalRunsExpected]);

  if (!sweep) {
    return <div className="card-loading">No sweep variable selected. Set one in Build → Monte Carlo to see the U-curve.</div>;
  }
  if (!snapshot || snapshot.total_runs === 0) {
    return <div className="card-loading">Waiting for first runs…</div>;
  }
  return <div ref={ref} />;
}
