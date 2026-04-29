export type TabId = "team" | "work" | "board" | "monte-carlo";

const LABELS: Record<TabId, string> = {
  team: "Team",
  work: "Work",
  board: "Board",
  "monte-carlo": "Monte Carlo",
};

export function TabBar({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  return (
    <div className="tab-bar" role="tablist">
      {(Object.keys(LABELS) as TabId[]).map((id) => (
        <button
          key={id}
          role="tab"
          aria-selected={active === id}
          className={active === id ? "active" : ""}
          onClick={() => onChange(id)}
          type="button"
        >
          {LABELS[id]}
        </button>
      ))}
    </div>
  );
}
