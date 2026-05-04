import { ParameterInput } from "../../components/ParameterInput.js";
import type { ExperimentState, SweepSpec } from "../../state/urlCodec.js";

type Props = {
  state: ExperimentState;
  setRuns: (runs: number) => void;
  setMasterSeed: (seed: string) => void;
  setSweep: (sweep: SweepSpec | null) => void;
};

const SWEEPABLE_PATHS: Array<{ path: string; label: string; defaults: { min: number; max: number; step: number } }> = [
  { path: "board.wip_limit", label: "WIP Limit", defaults: { min: 1, max: 50, step: 1 } },
  { path: "team.size", label: "Team size", defaults: { min: 2, max: 12, step: 1 } },
  { path: "work.arrival_rate_per_day", label: "Arrival rate", defaults: { min: 0.2, max: 5.0, step: 0.2 } },
];

export function MonteCarloTab({ state, setRuns, setMasterSeed, setSweep }: Props) {
  return (
    <section className="tab-panel" role="tabpanel">
      <h2>Monte Carlo</h2>
      <p className="help">Choose how many runs and which variable to sweep. Each sweep value gets `runs` runs; results aggregate per cell.</p>

      <ParameterInput label="Runs" path="monte_carlo.runs" value={state.runs} step={100} min={100} max={10000} onChange={(v) => setRuns(Math.max(100, Math.min(10000, Math.round(v))))} />
      <ParameterInput label="Master seed" path="monte_carlo.master_seed" value={Number(state.master_seed) || 1} step={1} min={1} onChange={(v) => setMasterSeed(String(Math.max(1, Math.round(v))))} />

      <div className="param-row">
        <label className="param-label">Sweep variable</label>
        <div className="param-control">
          <select
            className="param-input"
            style={{ width: "auto" }}
            value={state.sweep?.variable ?? ""}
            onChange={(e) => {
              const path = e.target.value;
              if (!path) { setSweep(null); return; }
              const meta = SWEEPABLE_PATHS.find((p) => p.path === path)!;
              setSweep({ variable: path, ...meta.defaults });
            }}
          >
            <option value="">— none —</option>
            {SWEEPABLE_PATHS.map((p) => <option key={p.path} value={p.path}>{p.label}</option>)}
          </select>
        </div>
      </div>
      {state.sweep && (
        <>
          <ParameterInput label="Sweep min" path="monte_carlo.sweep" value={state.sweep.min} step={1} onChange={(v) => setSweep({ ...state.sweep!, min: v })} />
          <ParameterInput label="Sweep max" path="monte_carlo.sweep" value={state.sweep.max} step={1} onChange={(v) => setSweep({ ...state.sweep!, max: v })} />
          <ParameterInput label="Sweep step" path="monte_carlo.sweep" value={state.sweep.step} step={0.1} onChange={(v) => setSweep({ ...state.sweep!, step: v })} />
        </>
      )}
    </section>
  );
}
