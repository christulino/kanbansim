export const TOOLTIPS: Record<string, string> = {
  "team.size": "Number of generalist workers on the team. Every worker can perform any task.",
  "team.productive_hours_per_day": "Hours per workday spent on simulated work. The default 6 reflects a realistic ratio of meetings and admin to focus time.",

  "work.arrival_rate_per_day": "Mean items arriving per working day, sampled from a Poisson process.",
  "work.effort_dist.mu": "Mean effort in hours. Items are log-normal distributed — positive, right-skewed, like real work.",
  "work.effort_dist.sigma": "Spread of effort in hours. Higher = more variability — short stories mixed with epics.",
  "work.effort_dist.skewness": "Right-skew of the effort distribution. Positive values reflect realistic long-tail effort.",
  "work.block_probability_per_day": "Per active item, the chance per day it becomes blocked on something external (review, dependency, environment).",

  "board.wip_limit": "Maximum items In Progress across the whole team. Workers fill available slots eagerly.",

  "monte_carlo.runs": "Number of independent runs at every sweep value. More runs = tighter confidence bands.",
  "monte_carlo.master_seed": "Master seed for reproducibility. Same seed + same config = bit-identical results.",
  "monte_carlo.sweep": "The variable to sweep across the experiment. Each step gets `runs` runs; results aggregate per cell.",
  "monte_carlo.randomize": "When on, this parameter is sampled per-run from a (μ, σ, skewness) triplet instead of held fixed.",
};
