import type { ExperimentConfig, Item, Worker } from "./types.js";
import { columnHasCapacity, workerCanPull } from "./board.js";

export type WorkerAction =
  | { kind: "work_on"; itemId: number }
  | { kind: "pull_from_ready"; itemId: number }
  | { kind: "pull_validation"; itemId: number }
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
  const myUnblocked = myItems.filter((it) => it.state === "in_column" && (it.column === "in_progress" || it.column === "validation"));
  const myBlocked = myItems.filter((it) => it.state === "blocked");

  if (myUnblocked.length > 0) {
    const picked = pickItemRoundRobin(myUnblocked, worker.last_chosen_item_id);
    return { kind: "work_on", itemId: picked.id };
  }

  if (myItems.length > 0 && myBlocked.length === myItems.length) {
    return resolveBlockingResponse(args);
  }

  if (canPullFromReady(args)) {
    const readyItem = items.find((it) => it.column === "ready");
    if (readyItem) return { kind: "pull_from_ready", itemId: readyItem.id };
  }

  const validationCandidate = items.find(
    (it) => it.column === "validation" && it.author_worker_id !== worker.id && it.current_worker_id === null,
  );
  if (validationCandidate) return { kind: "pull_validation", itemId: validationCandidate.id };

  return { kind: "idle" };
}

function pickItemRoundRobin(unblocked: Item[], lastChosenItemId: number | null): Item {
  if (unblocked.length === 1 || lastChosenItemId === null) return unblocked[0]!;
  const candidates = unblocked.filter((it) => it.id !== lastChosenItemId);
  if (candidates.length === 0) return unblocked[0]!;
  return candidates[0]!;
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
        if (readyItem) return { kind: "pull_from_ready", itemId: readyItem.id };
      }
      return { kind: "idle" };
    case "help_validate": {
      const candidate = items.find(
        (it) => it.column === "validation" && it.author_worker_id !== worker.id && it.current_worker_id === null,
      );
      if (candidate) return { kind: "pull_validation", itemId: candidate.id };
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
