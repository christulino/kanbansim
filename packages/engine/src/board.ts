import type { ColumnId, Item, Worker } from "./types.js";

export function columnHasCapacity(items: Item[], column: ColumnId, wipLimit: number | null): boolean {
  if (wipLimit === null) return true;
  const count = items.filter((it) => it.column === column).length;
  return count < wipLimit;
}

export function currentWorkerLoads(workers: Worker[]): Map<number, number> {
  const loads = new Map<number, number>();
  for (const w of workers) loads.set(w.id, w.active_item_ids.length);
  return loads;
}

// Pull policy: worker may pull if their load is NOT strictly the highest in the team.
// Tie for highest is OK; only the unique max cannot pull.
// Single-worker team has no peers, so the policy is vacuous and the worker always can pull.
export function workerCanPull(workers: Worker[], workerId: number): boolean {
  const myWorker = workers.find((w) => w.id === workerId);
  if (!myWorker) return false;
  if (workers.length <= 1) return true;
  const myLoad = myWorker.active_item_ids.length;
  let strictlyHigherCount = 0;
  let tiedAtMyLoadCount = 0;
  for (const w of workers) {
    const load = w.active_item_ids.length;
    if (load > myLoad) strictlyHigherCount++;
    if (load === myLoad) tiedAtMyLoadCount++;
  }
  if (strictlyHigherCount === 0 && tiedAtMyLoadCount === 1) return false;
  return true;
}
