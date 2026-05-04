import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { runPool, type PoolHandle } from "../src/orchestrator/pool.js";
import type { ExperimentConfig, RunResult } from "@kanbansim/engine";
import type { WorkerEvent, WorkerJob } from "../src/orchestrator/messages.js";

const dummyConfig: ExperimentConfig = {
  team: { size: 5, productive_hours_per_day: 6 },
  work: { arrival_rate_per_day: 4, effort_dist: { mu: 8, sigma: 3.5, skewness: 1.2 }, block_probability_per_day: 0.04, block_duration_dist: { mu: 4, sigma: 2, skewness: 0.5 } },
  board: { wip_limit: 5 },
  simulation: { sim_days: 130, tick_size_hours: 1 },
};

function fakeResult(throughput: number): RunResult {
  return {
    config: dummyConfig, seed: 1n, completed_items: [],
    cfd: [{ tick: 0, counts: { backlog: 0, in_progress: 0, done: 0 } }],
    time_accounting: [{ worker_id: 1, hours_working: 1, hours_switching: 0, hours_blocked: 0, hours_idle: 0 }],
    summary: { throughput_per_day: throughput, median_lead_time_hours: 1, p85_lead_time_hours: 1, p95_lead_time_hours: 1, max_lead_time_hours: 1, items_completed: 0, items_arrived: 0 },
  };
}

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((e: MessageEvent<WorkerEvent>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  terminated = false;
  constructor(public url: URL | string, public opts?: WorkerOptions) {
    FakeWorker.instances.push(this);
  }
  postMessage(msg: WorkerJob) {
    if (this.terminated) return;
    queueMicrotask(() => {
      if (this.terminated || msg.type !== "run-batch") return;
      for (const job of msg.jobs) {
        this.onmessage?.({ data: { type: "result", sweep_value: job.sweep_value, result: fakeResult(2 + job.sweep_value * 0.1) } } as MessageEvent<WorkerEvent>);
      }
      this.onmessage?.({ data: { type: "batch-done" } } as MessageEvent<WorkerEvent>);
    });
  }
  terminate() { this.terminated = true; }
}

beforeEach(() => { FakeWorker.instances = []; (globalThis as unknown as { Worker: typeof FakeWorker }).Worker = FakeWorker; });
afterEach(() => { delete (globalThis as unknown as { Worker?: typeof FakeWorker }).Worker; });

describe("runPool", () => {
  it("runs all jobs and resolves when complete", async () => {
    const jobs = [
      { sweep_value: 1, config: dummyConfig, seed: "1" },
      { sweep_value: 2, config: dummyConfig, seed: "2" },
      { sweep_value: 3, config: dummyConfig, seed: "3" },
    ];
    const handle: PoolHandle = runPool({ jobs, workerCount: 2 });
    const final = await handle.done;
    expect(final.cells.size).toBe(3);
    expect(final.total_runs).toBe(3);
  });

  it("emits throttled progress callbacks during the run", async () => {
    const onProgress = vi.fn();
    const jobs = Array.from({ length: 50 }, (_, i) => ({ sweep_value: 1, config: dummyConfig, seed: String(i + 1) }));
    const handle = runPool({ jobs, workerCount: 4, onProgress, throttleMs: 10 });
    await handle.done;
    expect(onProgress.mock.calls.length).toBeGreaterThan(0);
    const last = onProgress.mock.calls[onProgress.mock.calls.length - 1]![0];
    expect(last.total_runs).toBe(50);
  });

  it("cancel() rejects with a 'cancelled' marker and terminates all workers", async () => {
    const jobs = Array.from({ length: 10 }, (_, i) => ({ sweep_value: 1, config: dummyConfig, seed: String(i + 1) }));
    const handle = runPool({ jobs, workerCount: 3 });
    handle.cancel();
    await expect(handle.done).rejects.toMatchObject({ cancelled: true });
    for (const w of FakeWorker.instances) expect(w.terminated).toBe(true);
  });

  it("partitions jobs evenly across workers", async () => {
    const postSpy = vi.fn();
    class CountedWorker extends FakeWorker {
      override postMessage(msg: WorkerJob) { postSpy(msg.jobs.length); super.postMessage(msg); }
    }
    (globalThis as unknown as { Worker: typeof FakeWorker }).Worker = CountedWorker;
    const jobs = Array.from({ length: 10 }, (_, i) => ({ sweep_value: 1, config: dummyConfig, seed: String(i + 1) }));
    const handle = runPool({ jobs, workerCount: 4 });
    await handle.done;
    const sizes = postSpy.mock.calls.map((c) => c[0]).sort((a, b) => a - b);
    expect(sizes).toEqual([2, 2, 3, 3]);
  });
});
