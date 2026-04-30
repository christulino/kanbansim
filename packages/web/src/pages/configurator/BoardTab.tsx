import { ParameterInput } from "../../components/ParameterInput.js";
import type { ExperimentState } from "../../state/urlCodec.js";

type Props = {
  state: ExperimentState;
  update: (path: string, value: number | null) => void;
};

export function BoardTab({ state, update }: Props) {
  const b = state.config.board;
  return (
    <section className="tab-panel" role="tabpanel">
      <h2>Board</h2>
      <p className="help">Four fixed columns: Backlog → In Progress → Validation → Done. Set per-column WIP limits below; Backlog is uncapped (it's the queue). "—" means unlimited.</p>
      <ParameterInput label="In Progress WIP" path="board.wip_in_progress" value={b.wip_in_progress} step={1} min={1} onChange={(v) => update("board.wip_in_progress", Math.max(1, Math.round(v)))} />
      <ParameterInput label="Validation WIP" path="board.wip_validation" value={b.wip_validation} step={1} min={1} onChange={(v) => update("board.wip_validation", Math.max(1, Math.round(v)))} />
    </section>
  );
}
