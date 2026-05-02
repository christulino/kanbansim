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
      <p className="help">Three columns: Backlog → In Progress → Done. Workers fill available WIP slots eagerly. "—" means unlimited.</p>
      <ParameterInput label="WIP Limit" path="board.wip_limit" value={b.wip_limit} step={1} min={1} onChange={(v) => update("board.wip_limit", Math.max(1, Math.round(v)))} />
    </section>
  );
}
