import type { ExperimentConfig, Item, Worker } from "./types.js";
import { columnHasCapacity, workerCanPull } from "./board.js";

export type WorkerAction =
  | {
      kind: "parallel_work";
      progressItemIds: number[];      // unblocked items that get progress this tick
      pullFromReady?: number;          // optional: id of a Ready item to pull into in_progress
      pullValidation?: number;         // optional: id of a peer Validation item to grab
    }
  | { kind: "swarm_unblock"; itemId: number }
  | { kind: "idle" };

export function decideWorkerAction(args: {
  worker: Worker;
  allWorkers: Worker[];
  items: Item[];
  config: ExperimentConfig;
  currentTick: number;
}): WorkerAction {
  const { worker, items } = args;

  const myItems = items.filter((it) => worker.active_item_ids.includes(it.id));
  const myUnblocked = myItems.filter(
    (it) => it.state === "in_column" && (it.column === "in_progress" || it.column === "validation"),
  );
  const myBlocked = myItems.filter((it) => it.state === "blocked");
  const allMineBlocked = myItems.length > 0 && myBlocked.length === myItems.length;

  // Case A: I have unblocked items I can progress.
  if (myUnblocked.length > 0) {
    const progressIds = myUnblocked.map((it) => it.id);
    // Optionally pull from Ready (one item this tick) if room and policy allows.
    if (canPullFromReady(args)) {
      const readyItem = items.find((it) => it.column === "ready");
      if (readyItem) {
        return {
          kind: "parallel_work",
          progressItemIds: [...progressIds, readyItem.id],
          pullFromReady: readyItem.id,
        };
      }
    }
    return { kind: "parallel_work", progressItemIds: progressIds };
  }

  // Case B: All my items are blocked (or I have none) — apply blocking_response.
  if (allMineBlocked) {
    return resolveBlockingResponse(args);
  }

  // Case C: I have no items at all. Try to pull from Ready, then Validation.
  if (myItems.length === 0) {
    if (canPullFromReady(args)) {
      const readyItem = items.find((it) => it.column === "ready");
      if (readyItem) {
        return {
          kind: "parallel_work",
          progressItemIds: [readyItem.id],
          pullFromReady: readyItem.id,
        };
      }
    }
    const validationCandidate = findValidationCandidate(items, worker.id);
    if (validationCandidate) {
      return {
        kind: "parallel_work",
        progressItemIds: [validationCandidate.id],
        pullValidation: validationCandidate.id,
      };
    }
  }

  return { kind: "idle" };
}

function findValidationCandidate(items: Item[], workerId: number): Item | undefined {
  return items.find(
    (it) => it.column === "validation" && it.author_worker_id !== workerId && it.current_worker_id === null,
  );
}

function canPullFromReady(args: {
  worker: Worker;
  allWorkers: Worker[];
  items: Item[];
  config: ExperimentConfig;
}): boolean {
  const { worker, allWorkers, items, config } = args;
  if (!items.some((it) => it.column === "ready")) return false;
  if (!columnHasCapacity(items, "in_progress", config.board.wip_in_progress)) return false;
  return workerCanPull(allWorkers, worker.id);
}

function resolveBlockingResponse(args: {
  worker: Worker;
  allWorkers: Worker[];
  items: Item[];
  config: ExperimentConfig;
  currentTick: number;
}): WorkerAction {
  const { worker, items, config } = args;
  switch (config.team.blocking_response) {
    case "wait":
      return { kind: "idle" };
    case "start_new":
      if (canPullFromReady(args)) {
        const readyItem = items.find((it) => it.column === "ready");
        if (readyItem) {
          return {
            kind: "parallel_work",
            progressItemIds: [readyItem.id],
            pullFromReady: readyItem.id,
          };
        }
      }
      return { kind: "idle" };
    case "help_validate": {
      const candidate = findValidationCandidate(items, worker.id);
      if (candidate) {
        return {
          kind: "parallel_work",
          progressItemIds: [candidate.id],
          pullValidation: candidate.id,
        };
      }
      return { kind: "idle" };
    }
    case "swarm_unblock": {
      const elseBlocked = items.find((it) => it.state === "blocked" && !worker.active_item_ids.includes(it.id));
      if (elseBlocked) return { kind: "swarm_unblock", itemId: elseBlocked.id };
      return { kind: "idle" };
    }
    default:
      return { kind: "idle" };
  }
}
