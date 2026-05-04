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
        <li><strong>Cumulative Flow</strong> — items in each column over time, for one representative run. Parallel bands = stable flow.</li>
        <li><strong>Lead-time histogram</strong> — every completed item across all runs at the optimal cell. Right-skewed; the tail is the truth.</li>
        <li><strong>Time accounting</strong> — where worker hours actually go. The contrast between optimal and overloaded is the multitasking tax made visible.</li>
      </ul>
    </main>
  );
}
