import { useEffect, useState } from "react";
import { useExperiment } from "../orchestrator/useExperiment.js";
import { loadPreset } from "../state/presets.js";
import { UCurveChart } from "../charts/UCurveChart.js";
import type { ExperimentState } from "../state/urlCodec.js";

export function AmbientUCurve() {
  const exp = useExperiment();
  const [state, setState] = useState<ExperimentState | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPreset("sweet-spot").then((s) => {
      if (cancelled) return;
      const lite = { ...s, runs: 200 };
      setState(lite);
      exp.start(lite);
    }).catch(() => { /* preset fetch failed; fall through */ });
    return () => { cancelled = true; exp.cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!state) return null;

  return (
    <div className="ambient-ucurve">
      <div className="label">Ambient · live</div>
      <div style={{ aspectRatio: "16 / 6" }}>
        <UCurveChart
          snapshot={exp.snapshot}
          sweep={state.sweep}
          productive_hours_per_day={state.config.team.productive_hours_per_day}
          totalRunsExpected={exp.runsTotal}
        />
      </div>
      <div className="ambient-meta mono">
        {exp.runsCompleted.toLocaleString()} / {exp.runsTotal.toLocaleString()} runs · The Sweet Spot · live
      </div>
    </div>
  );
}
