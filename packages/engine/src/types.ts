// Core type definitions for the KanbanSim engine.
// All types are JSON-serializable so configs and results cross any boundary.

export type DistributionSpec = {
  mu: number;
  sigma: number;
  skewness: number;
};

export type BlockingResponse = "wait" | "start_new" | "help_validate" | "swarm_unblock";
export type WorkerPickPolicy = "round_robin" | "random" | "largest_first";
export type ValidationEffortMode =
  | { kind: "fraction"; fraction: number }
  | { kind: "distribution"; dist: DistributionSpec };

export type ExperimentConfig = {
  team: {
    size: number;
    productive_hours_per_day: number;
    switch_cost_minutes: number;
    worker_pick_policy: WorkerPickPolicy;
    blocking_response: BlockingResponse;
  };
  work: {
    arrival_rate_per_day: number;
    effort_dist: DistributionSpec;
    validation_effort: ValidationEffortMode;
    block_probability_per_day: number;
    block_duration_dist: DistributionSpec;
  };
  board: {
    wip_in_progress: number | null;
    wip_validation: number | null;
  };
  simulation: {
    sim_days: number;
    tick_size_hours: number;
  };
};

export type ColumnId = "backlog" | "in_progress" | "validation" | "done";

export type ItemState = "in_column" | "blocked";

export type Item = {
  id: number;
  arrival_tick: number;
  effort_required_hours: number;
  validation_effort_hours: number;
  effort_done_hours: number;
  column: ColumnId;
  arrived: boolean;                    // true once the arrival event has fired; pre-arrival items are hidden from charts and pull policy
  state: ItemState;
  author_worker_id: number | null;     // worker who pulled it from Backlog into In Progress
  current_worker_id: number | null;    // worker actively progressing it (may be null in Backlog/Done)
  done_tick: number | null;
  blocked_until_tick: number | null;
};

export type Worker = {
  id: number;
  active_item_ids: number[];           // items the worker is "carrying" (In Progress + Validation they took)
  last_chosen_item_id: number | null;  // for switch-cost detection across ticks
};

export type CfdSnapshot = {
  tick: number;
  counts: Record<ColumnId, number>;
};

export type WorkerTimeAccounting = {
  worker_id: number;
  hours_working: number;
  hours_switching: number;
  hours_blocked: number;
  hours_idle: number;
};

export type RunResult = {
  config: ExperimentConfig;
  seed: bigint;
  completed_items: Array<{
    id: number;
    arrival_tick: number;
    done_tick: number;
    lead_time_hours: number;
    blocked_hours: number;
    validation_started_tick: number | null;
  }>;
  cfd: CfdSnapshot[];
  time_accounting: WorkerTimeAccounting[];
  summary: {
    throughput_per_day: number;
    median_lead_time_hours: number;
    p85_lead_time_hours: number;
    p95_lead_time_hours: number;
    max_lead_time_hours: number;
    items_completed: number;
    items_arrived: number;     // total items that entered Backlog over the sim window
  };
};
