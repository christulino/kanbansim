// Core type definitions for the KanbanSim engine.
// All types are JSON-serializable so configs and results cross any boundary.

export type DistributionSpec = {
  mu: number;
  sigma: number;
  skewness: number;
};

export type ExperimentConfig = {
  team: {
    size: number;
    productive_hours_per_day: number;
  };
  work: {
    arrival_rate_per_day: number;
    effort_dist: DistributionSpec;
    block_probability_per_day: number;
    block_duration_dist: DistributionSpec;
  };
  board: {
    wip_limit: number | null;
  };
  simulation: {
    sim_days: number;
    tick_size_hours: number;
  };
};

export type ColumnId = "backlog" | "in_progress" | "done";

export type ItemState = "in_column" | "blocked";

export type Item = {
  id: number;
  arrival_tick: number;
  effort_required_hours: number;
  effort_done_hours: number;
  column: ColumnId;
  arrived: boolean;
  state: ItemState;
  author_worker_id: number | null;
  current_worker_id: number | null;
  done_tick: number | null;
  blocked_until_tick: number | null;
};

export type Worker = {
  id: number;
  active_item_ids: number[];
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
    items_arrived: number;
  };
};
