import { Link } from "react-router-dom";

export function Landing() {
  return (
    <main data-surface="default" className="landing">
      <div className="landing-hero">
        <div>
          <h1>What if you <em>lowered</em> WIP?</h1>
          <p className="lead">You don't have to guess. Configure a virtual team that looks like yours, sweep your WIP limit across a range, run thousands of simulations in your browser, and look at the curve. The sweet spot will be obvious. So will the cliffs.</p>
          <p>Built for managers, team leads, and agile coaches who suspect their team is overloaded but don't know what number is right. KanbanSim turns Little's Law into a tangible thing — a U-curve you can see, share, and play with.</p>
        </div>
        <aside className="landing-hero-aside">
          <div className="label">How it works</div>
          <p>Each experiment runs the same simulated team thousands of times across a range of WIP limits. The shape of the resulting curve is what teaches you. No login, no backend — everything runs in your browser.</p>
        </aside>
      </div>

      <div className="preset-grid" id="presets">{/* PresetCards in Task 31 */}</div>

      <Link to="/build" className="build-link">Or build your own experiment →</Link>
    </main>
  );
}
