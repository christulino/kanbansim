/// <reference lib="WebWorker" />
import { runSimulation } from "@kanbansim/engine";
import type { WorkerEvent, WorkerJob } from "./messages.js";

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (e: MessageEvent<WorkerJob>) => {
  const msg = e.data;
  if (msg.type !== "run-batch") return;
  try {
    for (const job of msg.jobs) {
      const seed = BigInt(job.seed);
      const result = runSimulation(job.config, seed);
      const event: WorkerEvent = { type: "result", sweep_value: job.sweep_value, result };
      self.postMessage(event);
    }
    const done: WorkerEvent = { type: "batch-done" };
    self.postMessage(done);
  } catch (err) {
    const errEvent: WorkerEvent = { type: "error", message: err instanceof Error ? err.message : String(err) };
    self.postMessage(errEvent);
  }
};

export {};
