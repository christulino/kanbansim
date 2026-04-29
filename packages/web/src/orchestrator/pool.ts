import { createAggregator, type AggregatorSnapshot } from "./aggregator.js";
import { createThrottle } from "../lib/throttle.js";
import type { ExperimentConfig } from "@kanbansim/engine";
import type { WorkerEvent, WorkerJob } from "./messages.js";

export type PoolJob = { sweep_value: number; config: ExperimentConfig; seed: string };

export type PoolOptions = {
  jobs: PoolJob[];
  workerCount: number;
  onProgress?: (snap: AggregatorSnapshot) => void;
  throttleMs?: number;
  workerFactory?: () => Worker;
};

export type PoolHandle = {
  done: Promise<AggregatorSnapshot>;
  cancel: () => void;
};

export type CancelledError = { cancelled: true };

const DEFAULT_THROTTLE_MS = 50;

export function runPool(opts: PoolOptions): PoolHandle {
  const { jobs, workerCount } = opts;
  const throttleMs = opts.throttleMs ?? DEFAULT_THROTTLE_MS;
  const aggregator = createAggregator();
  const factory = opts.workerFactory ?? defaultWorkerFactory;

  const throttled = createThrottle<AggregatorSnapshot>((snap) => {
    opts.onProgress?.(snap);
  }, throttleMs);

  let cancelled = false;
  let resolve!: (snap: AggregatorSnapshot) => void;
  let reject!: (err: CancelledError) => void;
  const done = new Promise<AggregatorSnapshot>((res, rej) => { resolve = res; reject = rej; });

  const partitions = partition(jobs, Math.max(1, Math.min(workerCount, jobs.length || 1)));
  const workers: Worker[] = [];
  let pendingBatches = partitions.length;

  function finishIfDone(): void {
    if (cancelled) return;
    if (pendingBatches === 0) {
      throttled.flush();
      for (const w of workers) w.terminate();
      resolve(aggregator.snapshot());
    }
  }

  for (const part of partitions) {
    const worker = factory();
    workers.push(worker);
    worker.onmessage = (e: MessageEvent<WorkerEvent>) => {
      if (cancelled) return;
      const msg = e.data;
      if (msg.type === "result") {
        aggregator.ingest({ sweep_value: msg.sweep_value, result: msg.result });
        throttled.call(aggregator.snapshot());
      } else if (msg.type === "batch-done") {
        pendingBatches--;
        finishIfDone();
      } else if (msg.type === "error") {
        cancelled = true;
        throttled.cancel();
        for (const w of workers) w.terminate();
        reject({ cancelled: true });
      }
    };
    const job: WorkerJob = { type: "run-batch", jobs: part };
    worker.postMessage(job);
  }

  function cancel(): void {
    if (cancelled) return;
    cancelled = true;
    throttled.cancel();
    for (const w of workers) w.terminate();
    reject({ cancelled: true });
  }

  return { done, cancel };
}

function defaultWorkerFactory(): Worker {
  return new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
}

function partition<T>(items: T[], n: number): T[][] {
  if (n <= 0) return [items];
  const out: T[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < items.length; i++) out[i % n]!.push(items[i]!);
  return out;
}
