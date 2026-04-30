import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useConfigurator } from "../src/state/useConfigurator.js";
import type { ExperimentState } from "../src/state/urlCodec.js";

const initial: ExperimentState = {
  name: "Custom",
  config: {
    team: { size: 5, productive_hours_per_day: 6, switch_cost_minutes: 15, worker_pick_policy: "round_robin", blocking_response: "start_new" },
    work: { arrival_rate_per_day: 4, effort_dist: { mu: 8, sigma: 3.5, skewness: 1.2 }, validation_effort: { kind: "fraction", fraction: 0.3 }, block_probability_per_day: 0.04, block_duration_dist: { mu: 4, sigma: 2, skewness: 0.5 } },
    board: { wip_in_progress: 5, wip_validation: 3 },
    simulation: { sim_days: 130, tick_size_hours: 1 },
  },
  sweep: { variable: "board.wip_in_progress", min: 1, max: 15, step: 1 },
  randomized: [],
  master_seed: "1",
  runs: 1000,
};

describe("useConfigurator", () => {
  it("update() applies a new value at a dotted path", () => {
    const { result } = renderHook(() => useConfigurator(initial));
    act(() => { result.current.update("team.size", 8); });
    expect(result.current.state.config.team.size).toBe(8);
  });
  it("toggleRandomize adds and removes a randomized var", () => {
    const { result } = renderHook(() => useConfigurator(initial));
    act(() => { result.current.toggleRandomize("work.effort_dist.sigma", { mu: 3.5, sigma: 1, skewness: 0 }); });
    expect(result.current.state.randomized.length).toBe(1);
    act(() => { result.current.toggleRandomize("work.effort_dist.sigma", { mu: 3.5, sigma: 1, skewness: 0 }); });
    expect(result.current.state.randomized.length).toBe(0);
  });
  it("setSweep replaces the sweep variable", () => {
    const { result } = renderHook(() => useConfigurator(initial));
    act(() => { result.current.setSweep({ variable: "team.size", min: 2, max: 10, step: 1 }); });
    expect(result.current.state.sweep?.variable).toBe("team.size");
  });
});
