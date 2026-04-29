import { describe, expect, it } from "vitest";
import { TOOLTIPS } from "../src/lib/tooltips.js";

const PARAM_PATHS = [
  "team.size", "team.productive_hours_per_day", "team.switch_cost_minutes", "team.pace_penalty", "team.blocking_response",
  "work.arrival_rate_per_day", "work.effort_dist.mu", "work.effort_dist.sigma", "work.effort_dist.skewness", "work.block_probability_per_day",
  "board.wip_ready", "board.wip_in_progress", "board.wip_validation",
  "monte_carlo.runs", "monte_carlo.master_seed", "monte_carlo.sweep", "monte_carlo.randomize",
];

describe("Tooltip coverage", () => {
  it("has a tooltip for every shipped parameter path", () => {
    const missing = PARAM_PATHS.filter((p) => !TOOLTIPS[p]);
    expect(missing).toEqual([]);
  });
});
