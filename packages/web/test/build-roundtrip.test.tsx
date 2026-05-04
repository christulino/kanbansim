import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Build } from "../src/pages/Build.js";
import { encodeExperiment, type ExperimentState } from "../src/state/urlCodec.js";

const state: ExperimentState = {
  name: "Custom Test",
  config: {
    team: { size: 7, productive_hours_per_day: 6 },
    work: { arrival_rate_per_day: 4, effort_dist: { mu: 8, sigma: 3.5, skewness: 1.2 }, block_probability_per_day: 0.04, block_duration_dist: { mu: 4, sigma: 2, skewness: 0.5 } },
    board: { wip_limit: 5 },
    simulation: { sim_days: 130, tick_size_hours: 1 },
  },
  sweep: { variable: "board.wip_limit", min: 1, max: 15, step: 1 },
  randomized: [],
  master_seed: "1",
  runs: 1000,
};

describe("Build deep link", () => {
  it("decodes ?e=<state> from the URL search and pre-fills inputs", async () => {
    const encoded = encodeExperiment(state);
    render(
      <MemoryRouter initialEntries={[`/build?e=${encoded}`]}>
        <Build />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByDisplayValue("7")).toBeInTheDocument());
  });
});
