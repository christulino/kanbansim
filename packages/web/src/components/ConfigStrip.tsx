import type { ExperimentState } from "../state/urlCodec.js";

type Props = { state: ExperimentState };

const ROUND2 = (n: number) => Math.round(n * 100) / 100;

export function ConfigStrip({ state }: Props) {
  const { config, sweep, randomized } = state;
  const isSwept = (path: string) => sweep?.variable === path;
  const isRand = (path: string) => randomized.some((r) => r.path === path);

  function val(path: string, raw: string) {
    if (isSwept(path)) return <span className="swept">{`${sweep!.min} → ${sweep!.max}`}</span>;
    if (isRand(path)) return <span className="randomized">{raw}</span>;
    return raw;
  }

  return (
    <div className="config-strip">
      <div>
        <div className="group-title">Team</div>
        <dl>
          <dt>Size</dt><dd>{val("team.size", String(config.team.size))}</dd>
          <dt>Productive hrs/day</dt><dd>{val("team.productive_hours_per_day", config.team.productive_hours_per_day.toFixed(1))}</dd>
        </dl>
      </div>
      <div>
        <div className="group-title">Work Items</div>
        <dl>
          <dt>Arrival rate</dt><dd>{val("work.arrival_rate_per_day", `${config.work.arrival_rate_per_day.toFixed(1)}/day`)}</dd>
          <dt>Effort μ</dt><dd>{val("work.effort_dist.mu", `${ROUND2(config.work.effort_dist.mu)} hrs`)}</dd>
          <dt>Effort σ</dt><dd>{val("work.effort_dist.sigma", `${ROUND2(config.work.effort_dist.sigma)} hrs`)}</dd>
          <dt>Block prob.</dt><dd>{val("work.block_probability_per_day", `${config.work.block_probability_per_day.toFixed(2)}/day`)}</dd>
        </dl>
      </div>
      <div>
        <div className="group-title">Board</div>
        <dl>
          <dt>WIP Limit</dt><dd>{val("board.wip_limit", String(config.board.wip_limit ?? "—"))}</dd>
        </dl>
      </div>
      <div>
        <div className="group-title">Monte Carlo</div>
        <dl>
          <dt>Runs</dt><dd>{state.runs.toLocaleString()}</dd>
          <dt>Sweep</dt><dd>{sweep ? sweep.variable : "—"}</dd>
          <dt>Randomized</dt><dd>{randomized.length}</dd>
          <dt>Seed</dt><dd>{state.master_seed}</dd>
        </dl>
      </div>
    </div>
  );
}
