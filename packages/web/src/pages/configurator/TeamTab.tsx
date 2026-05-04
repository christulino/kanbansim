import { ParameterInput } from "../../components/ParameterInput.js";
import type { ExperimentState } from "../../state/urlCodec.js";

type Props = {
  state: ExperimentState;
  update: (path: string, value: number | null) => void;
};

export function TeamTab({ state, update }: Props) {
  const t = state.config.team;
  return (
    <section className="tab-panel" role="tabpanel">
      <h2>Team</h2>
      <p className="help">Generalist team. Every worker can perform any task.</p>
      <ParameterInput label="Team size" path="team.size" value={t.size} step={1} min={1} onChange={(v) => update("team.size", Math.max(1, Math.round(v)))} />
      <ParameterInput label="Productive hrs/day" path="team.productive_hours_per_day" value={t.productive_hours_per_day} step={0.5} min={1} max={12} unit="hrs" onChange={(v) => update("team.productive_hours_per_day", v)} />
    </section>
  );
}
