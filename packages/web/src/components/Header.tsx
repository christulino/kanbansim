import { NavLink } from "react-router-dom";
import { ThemeToggle } from "./ThemeToggle.js";

export function Header() {
  return (
    <header className="topbar">
      <div className="brand">
        <NavLink to="/" className="brand-mark">KanbanSim</NavLink>
        <span className="brand-tag">Flow Lab · v0.1</span>
      </div>
      <nav className="primary">
        <NavLink to="/build" className={({ isActive }) => (isActive ? "active" : "")}>Build</NavLink>
        <NavLink to="/run" className={({ isActive }) => (isActive ? "active" : "")}>Run</NavLink>
        <NavLink to="/results" className={({ isActive }) => (isActive ? "active" : "")}>Results</NavLink>
        <NavLink to="/learn" className={({ isActive }) => (isActive ? "active" : "")}>Learn</NavLink>
      </nav>
      <div className="header-right">
        <ThemeToggle />
      </div>
    </header>
  );
}
