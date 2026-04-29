import { HashRouter, Route, Routes } from "react-router-dom";
import { Landing } from "./pages/Landing.js";
import { Build } from "./pages/Build.js";
import { RunResults } from "./pages/RunResults.js";
import { Learn } from "./pages/Learn.js";

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/build" element={<Build />} />
        <Route path="/run" element={<RunResults />} />
        <Route path="/results" element={<RunResults />} />
        <Route path="/learn" element={<Learn />} />
        <Route path="*" element={<Landing />} />
      </Routes>
    </HashRouter>
  );
}
