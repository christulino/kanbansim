import { Link } from "react-router-dom";
import { PresetCard } from "../components/PresetCard.js";
import { AmbientUCurve } from "../components/AmbientUCurve.js";

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
          <AmbientUCurve />
        </aside>
      </div>

      <div className="preset-grid">
        <PresetCard id="sweet-spot" />
        <PresetCard id="qa-bottleneck" />
        <PresetCard id="multitasking-tax" />
      </div>

      <Link to="/build" className="build-link">Or build your own experiment →</Link>
    </main>
  );
}
