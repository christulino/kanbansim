import { ParameterInput } from "../../components/ParameterInput.js";
import type { ExperimentState } from "../../state/urlCodec.js";

type Props = {
  state: ExperimentState;
  update: (path: string, value: number | null) => void;
  toggleRandomize: (path: string, defaults: { mu: number; sigma: number; skewness: number }) => void;
};

export function WorkTab({ state, update, toggleRandomize }: Props) {
  const w = state.config.work;
  const isRandomized = (path: string) => state.randomized.some((r) => r.path === path);
  return (
    <section className="tab-panel" role="tabpanel">
      <h2>Work Items</h2>
      <p className="help">How items arrive and how big they are. Effort defaults to log-normal — positive, right-skewed, like real cycle times.</p>
      <ParameterInput label="Arrival rate" path="work.arrival_rate_per_day" value={w.arrival_rate_per_day} step={0.1} min={0.1} unit="/day" randomizable randomized={isRandomized("work.arrival_rate_per_day")} onChange={(v) => update("work.arrival_rate_per_day", v)} onToggleRandomize={() => toggleRandomize("work.arrival_rate_per_day", { mu: w.arrival_rate_per_day, sigma: 1, skewness: 0 })} />
      <ParameterInput label="Effort μ" path="work.effort_dist.mu" value={w.effort_dist.mu} step={0.5} min={0.5} unit="hrs" onChange={(v) => update("work.effort_dist.mu", v)} />
      <ParameterInput label="Effort σ" path="work.effort_dist.sigma" value={w.effort_dist.sigma} step={0.25} min={0} unit="hrs" randomizable randomized={isRandomized("work.effort_dist.sigma")} onChange={(v) => update("work.effort_dist.sigma", v)} onToggleRandomize={() => toggleRandomize("work.effort_dist.sigma", { mu: w.effort_dist.sigma, sigma: 1, skewness: 0 })} />
      <ParameterInput label="Effort skew" path="work.effort_dist.skewness" value={w.effort_dist.skewness} step={0.1} onChange={(v) => update("work.effort_dist.skewness", v)} />
      <ParameterInput label="Block probability" path="work.block_probability_per_day" value={w.block_probability_per_day} step={0.005} min={0} max={1} unit="/day" onChange={(v) => update("work.block_probability_per_day", v)} />
    </section>
  );
}
