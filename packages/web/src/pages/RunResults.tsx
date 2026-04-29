import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { decodeExperiment, encodeExperiment, type ExperimentState } from "../state/urlCodec.js";
import { useExperiment } from "../orchestrator/useExperiment.js";
import { Stamp } from "../components/Stamp.js";
import { Counter } from "../components/Counter.js";
import { ConfigStrip } from "../components/ConfigStrip.js";
import { ChartCard } from "../components/ChartCard.js";
import { ActionBar } from "../components/ActionBar.js";
import { Caption } from "../components/Caption.js";
import { downloadBlob, downloadPng, downloadSvg, snapshotToCsv, snapshotToJson } from "../lib/download.js";
import { UCurveChart } from "../charts/UCurveChart.js";
import { CfdChart } from "../charts/CfdChart.js";
import { HistogramChart } from "../charts/HistogramChart.js";
import { TimeAccountingChart } from "../charts/TimeAccountingChart.js";

export function RunResults() {
  const location = useLocation();
  const [state, setState] = useState<ExperimentState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const startedRef = useRef(false);

  const exp = useExperiment();

  useEffect(() => {
    const params = new URLSearchParams(location.search || location.hash.split("?")[1] || "");
    const e = params.get("e");
    if (!e) { setError("No experiment in URL. Visit /build to configure one."); return; }
    const decoded = decodeExperiment(e);
    if (!decoded) { setError("Could not parse experiment from URL."); return; }
    setState(decoded);
  }, [location.search, location.hash]);

  useEffect(() => {
    if (!state || startedRef.current) return;
    startedRef.current = true;
    exp.start(state);
  }, [state, exp]);

  useEffect(() => {
    if (exp.status === "complete" && location.pathname !== "/results") {
      const params = new URLSearchParams(location.search || location.hash.split("?")[1] || "");
      const e = params.get("e") ?? "";
      window.history.replaceState(null, "", `#/results?e=${e}`);
    }
  }, [exp.status, location.pathname, location.search, location.hash]);

  function handleCopyShare() {
    if (!state) return;
    const url = `${window.location.origin}${window.location.pathname}#/results?e=${encodeExperiment(state)}`;
    navigator.clipboard?.writeText(url).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1800);
    });
  }

  async function handleDownloadCharts() {
    const sections = document.querySelectorAll<HTMLElement>(".run-page .card");
    for (let i = 0; i < sections.length; i++) {
      const svg = sections[i]!.querySelector("svg");
      if (!svg) continue;
      const titleEl = sections[i]!.querySelector("h2");
      const title = (titleEl?.textContent ?? `chart-${i + 1}`).trim().toLowerCase().replace(/\s+/g, "-");
      downloadSvg(svg, `${title}.svg`);
      await downloadPng(svg, `${title}.png`);
    }
  }

  function handleDownloadRaw() {
    if (!state || !exp.snapshot) return;
    const slug = state.name.replace(/\s+/g, "-").toLowerCase();
    const csv = snapshotToCsv(exp.snapshot, state.config.team.productive_hours_per_day);
    downloadBlob(new Blob([csv], { type: "text/csv" }), `${slug}-results.csv`);
    const json = snapshotToJson(exp.snapshot, state);
    downloadBlob(new Blob([json], { type: "application/json" }), `${slug}-results.json`);
  }

  if (error) return <main data-surface="paper" className="run-page"><p>{error}</p></main>;
  if (!state) return <main data-surface="paper" className="run-page"><p>Loading…</p></main>;

  const isRunning = exp.status === "running";
  const phpd = state.config.team.productive_hours_per_day;
  const totalRunsExpected = exp.runsTotal;

  return (
    <main data-surface="paper" className="run-page">
      <div className="run-pagehead">
        <div className="titles">
          <div className="label">Experiment {exp.status === "complete" ? "Results" : "Run"}</div>
          <h1>{state.name}</h1>
        </div>
        <div className="meta">
          <Stamp status={exp.status} runsCompleted={exp.runsCompleted} runsTotal={exp.runsTotal} />
          <div><span className="key">runs</span> &nbsp;{state.runs.toLocaleString()}</div>
          <div><span className="key">simulated</span> &nbsp;{state.config.simulation.sim_days} days</div>
          <div><span className="key">seed</span> &nbsp;{state.master_seed}</div>
        </div>
      </div>

      <Counter
        runsCompleted={exp.runsCompleted}
        runsTotal={exp.runsTotal}
        workerCount={exp.workerCount}
        runsPerSec={exp.runsPerSec}
        etaSeconds={exp.etaSeconds}
        isRunning={isRunning}
      />

      {isRunning && (
        <button className="btn btn-warning cancel-btn" onClick={exp.cancel} type="button">Cancel</button>
      )}

      <ConfigStrip state={state} />

      <ChartCard label="Hero · Sweep Result" title={<>Lead Time &amp; Throughput vs. <em>{state.sweep?.variable ?? "—"}</em></>} subtitle={state.sweep ? `Bands = 5th–95th percentile across runs.` : undefined} caption={<Caption kind="ucurve" status={exp.status} />}>
        <UCurveChart snapshot={exp.snapshot} sweep={state.sweep} productive_hours_per_day={phpd} totalRunsExpected={totalRunsExpected} />
      </ChartCard>

      <ChartCard label="Single Run" title="Cumulative Flow" subtitle="A representative run at the optimal sweep value. Watch the bands stay parallel — that's stable flow." caption={<Caption kind="cfd" status={exp.status} />}>
        <CfdChart snapshot={exp.snapshot} isComplete={exp.status === "complete"} productive_hours_per_day={phpd} />
      </ChartCard>

      <ChartCard label="Distribution" title="Lead Time Distribution by Sweep Value" subtitle="Each box shows lead-time spread for one cell. Box = p25–p75 (IQR), inner line = median, whiskers = p10/p90. Watch the whiskers fan out as multitasking tax kicks in." caption={<Caption kind="histogram" status={exp.status} />}>
        <HistogramChart snapshot={exp.snapshot} sweep={state.sweep} productive_hours_per_day={phpd} />
      </ChartCard>

      <ChartCard label="Where the Hours Went" title="Time Accounting Across the Sweep" subtitle="Stacked share of worker time — Working, Switching, Blocked, Idle — across every sweep value. Watch the Working band shrink as multitasking tax grows." caption={<Caption kind="timeAccounting" status={exp.status} />}>
        <TimeAccountingChart snapshot={exp.snapshot} sweep={state.sweep} />
      </ChartCard>

      <ActionBar
        status={exp.status}
        state={state}
        onDownloadCharts={handleDownloadCharts}
        onDownloadRaw={handleDownloadRaw}
        onCopyShare={handleCopyShare}
        shareCopied={shareCopied}
      />
    </main>
  );
}
