export const TOOLTIPS: Record<string, string> = {
  "team.size": "Number of generalist workers on the team. Each can perform any role; peer review prevents self-validation.",
  "team.productive_hours_per_day": "Hours per workday spent on simulated work. The default 6 reflects realistic ratio of meetings/admin to focus time.",
  "team.switch_cost_minutes": "Minutes lost when transitioning between items. Per day, a worker pays (N-1) × switch_cost in overhead, where N is items being progressed. The only multitasking tax in the model.",
  "team.blocking_response": "What a worker does when all their items are blocked: wait, start a new one, help validate someone else's, or swarm the blocker.",

  "work.arrival_rate_per_day": "Mean items arriving per working day, sampled from a Poisson process.",
  "work.effort_dist.mu": "Median item effort in hours. Real cycle times are right-skewed; this is the distribution's location parameter.",
  "work.effort_dist.sigma": "Spread of effort in hours. Higher = more variability — short stories mixed with epics.",
  "work.effort_dist.skewness": "Right-skew of the effort distribution. Positive values reflect realistic 'long tail' effort.",
  "work.block_probability_per_day": "Per active item, the chance per day it becomes blocked on something external (review, dependency, environment).",

  "board.wip_ready": "Maximum items in Ready. Unlimited (—) means no Ready cap.",
  "board.wip_in_progress": "Maximum items In Progress. Lower this to test the WIP-limit hypothesis.",
  "board.wip_validation": "Maximum items in Validation. The classic QA-bottleneck lever.",

  "monte_carlo.runs": "Number of independent runs at every sweep value. More runs = tighter confidence bands.",
  "monte_carlo.master_seed": "Master seed for reproducibility. Same seed + same config = bit-identical results.",
  "monte_carlo.sweep": "The variable to sweep across the experiment. Each step gets `runs` runs; results aggregate per cell.",
  "monte_carlo.randomize": "When on, this parameter is sampled per-run from a (μ, σ, skewness) triplet instead of held fixed.",
};
