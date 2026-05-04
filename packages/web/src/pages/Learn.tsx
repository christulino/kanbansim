export function Learn() {
  return (
    <main data-surface="default" className="learn-page">
      <h1>Kanban concepts, briefly</h1>

      <p>Kanban is a system for visualizing work, limiting work-in-progress, and managing flow. KanbanSim lets you experiment with the second of those — WIP limits — under realistic conditions.</p>

      <h2>Little's Law</h2>
      <p>For any stable system in equilibrium, the average number of items in the system equals the average arrival rate times the average lead time:</p>
      <div className="formula">average WIP = throughput × lead time</div>
      <p>Lower the WIP and either throughput goes up or lead time goes down — usually both. But there's a floor: at very low WIP your team can be <em>starved</em>, sitting idle when their items are blocked. So there's a sweet spot.</p>

      <h2>What's in a "run"</h2>
      <p>One run simulates 6 working months of a virtual team. Items arrive, get pulled into In Progress, occasionally block on external dependencies (decisions, reviews, third-party delays — modelled as 1–2 day waits), and complete. Every numeric output is averaged across hundreds or thousands of independent runs of the same configuration.</p>

      <h2>Monte Carlo simulation</h2>
      <p>
        A single run is noisy. Depending on how random draws fall, a team simulated for 130 days might
        complete 80 items or 110 items — and both outcomes are plausible under the same configuration.
        That variance is real; it reflects genuine uncertainty in delivery.
      </p>
      <p>
        Monte Carlo simulation runs the same experiment hundreds or thousands of times, each with a
        different random seed, accumulating a <em>distribution</em> of outcomes instead of a single
        result. The line in the U-curve is the median across all runs at that WIP value. The shaded band
        is the 5th–95th percentile — the range that covers 90% of outcomes. A wide band means the result
        is genuinely unpredictable; a narrow band means it's consistent.
      </p>
      <p>
        The simulator uses a seeded pseudo-random number generator, so results are fully reproducible:
        the same master seed and configuration always produce bit-identical output. You can share a result
        URL and anyone who runs it will get the same numbers.
      </p>

      <h2>Multitasking tax</h2>
      <p>
        When a worker juggles K concurrent items, their effective productivity follows a hyperbolic decay
        derived from Weinberg's empirical observations (<em>Quality Software Management</em>, 1992):
      </p>
      <div className="formula">useful time = 4 / (K + 3)</div>
      <p>
        At K=1 the worker operates at full capacity. At K=2 they retain 80% — the first concurrent item
        costs 20% to context-switching overhead. At K=5 only half their day produces forward progress.
        Beyond that, each additional item cuts from an ever-smaller remainder, asymptotically approaching
        zero — no matter how many items are in flight, some fraction of useful work always remains, but
        it becomes vanishingly small.
      </p>
      <p>
        The <em>Time Accounting</em> chart makes this visible: the orange "switching" band grows as WIP
        climbs past one item per person.
      </p>

      <h2>The U-curve</h2>
      <p>Sweep your WIP limit from 1 to 15 and lead time draws a U: a starved team at one end, an overloaded team at the other, and a comfortable middle. The middle isn't a single number — it's a band, broader than most teams assume. That's permission to lower WIP without precision-tuning it.</p>

      <h2>Reading the charts</h2>
      <ul>
        <li><strong>Hero U-curve</strong> — lead time and throughput against the swept variable. Bands are the 5th–95th percentile across runs.</li>
        <li><strong>Board Load</strong> — average items in each column at each sweep value. Tall Backlog = team is starved. Tall In Progress = work is piling up.</li>
        <li><strong>Lead-time histogram</strong> — every completed item across all runs at the optimal cell. Right-skewed; the tail is the truth.</li>
        <li><strong>Time accounting</strong> — where worker hours actually go. The contrast between optimal and overloaded is the multitasking tax made visible.</li>
      </ul>

      <h2>Simulation model</h2>
      <p>
        KanbanSim is open source (MIT license). If you want to modify or extend the model, here is exactly
        what it does.
      </p>

      <h3>Board and columns</h3>
      <p>
        Three columns: <strong>Backlog → In Progress → Done</strong>. The WIP limit caps the total number
        of items In Progress at any time. There is no separate validation or review stage — work flows
        directly to Done when effort is complete.
      </p>

      <h3>Worker behaviour (eager pull)</h3>
      <p>
        Workers are generalists and eager: at every hourly tick, if In Progress count is below the WIP
        limit and arrived backlog items exist, the simulator fills the gap. Items are pulled in
        arrival-time order (oldest first). The worker with the fewest currently assigned items receives
        each new item; lowest ID breaks ties. Workers never refuse an open slot.
      </p>

      <h3>Productivity model</h3>
      <p>
        A worker assigned K unblocked items retains <code>4 / (K + 3)</code> of their productive
        capacity per day (Weinberg, 1992). All K items receive equal progress each tick. Blocked items
        are excluded from K and receive no progress. The remainder of each tick is charged to
        "switching" overhead in the time accounting.
      </p>

      <h3>Arrival process</h3>
      <p>
        Items arrive via a Poisson process. Each simulated day, the number of arrivals is drawn
        from Poisson(arrival_rate_per_day). Item effort is drawn from a log-normal distribution
        (parameterised by μ, σ, and skewness). All arrivals are pre-sampled at simulation start
        and scheduled as events; they become pullable when their scheduled tick is reached.
      </p>

      <h3>Blocking</h3>
      <p>
        Each tick, each In Progress item has an independent chance of becoming blocked, proportional
        to <code>block_probability_per_day / productive_hours_per_day</code>. Block duration is drawn
        from a log-normal distribution (default μ = 12 hours ≈ 2 working days). While blocked, an item
        sits idle and its worker is not penalised — they continue on their other assigned items. A worker
        whose every item is blocked shows as "blocked" in time accounting until one unblocks.
      </p>

      <h3>Time resolution and reproducibility</h3>
      <p>
        The simulation runs in 1-hour ticks. One simulated day = productive_hours_per_day ticks (default
        6). The random number generator is a 64-bit Linear Congruential Generator seeded per run from the
        master seed, sweep cell index, and run index. The same seed always produces bit-identical results.
      </p>
    </main>
  );
}
