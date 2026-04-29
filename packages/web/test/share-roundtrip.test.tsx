import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RunResults } from "../src/pages/RunResults.js";
import { encodeExperiment, type ExperimentState } from "../src/state/urlCodec.js";

class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  postMessage() {}
  terminate() {}
  addEventListener() {}
  removeEventListener() {}
}

beforeEach(() => { vi.stubGlobal("Worker", FakeWorker); });

const state: ExperimentState = {
  name: "Shared Run",
  config: {
    team: { size: 5, productive_hours_per_day: 6, switch_cost_minutes: 15, pace_penalty: 0.05, worker_pick_policy: "round_robin", blocking_response: "start_new" },
    work: { arrival_rate_per_day: 4, effort_dist: { mu: 8, sigma: 3.5, skewness: 1.2 }, validation_effort: { kind: "fraction", fraction: 0.3 }, block_probability_per_day: 0.04, block_duration_dist: { mu: 4, sigma: 2, skewness: 0.5 } },
    board: { wip_ready: null, wip_in_progress: 5, wip_validation: 3 },
    simulation: { sim_days: 130, tick_size_hours: 1 },
  },
  sweep: null,
  randomized: [],
  master_seed: "42",
  runs: 1,
};

describe("Share URL round-trip", () => {
  it("loads experiment name and seed from URL on /results", async () => {
    const encoded = encodeExperiment(state);
    render(
      <MemoryRouter initialEntries={[`/results?e=${encoded}`]}>
        <RunResults />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText("Shared Run")).toBeInTheDocument());
    await waitFor(() => expect(screen.getAllByText("42").length).toBeGreaterThan(0));
  });
});
