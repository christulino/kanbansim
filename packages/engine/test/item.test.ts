import { describe, it, expect } from "vitest";
import { createItem, isBlocked, advanceItemEffort } from "../src/item.js";

describe("item helpers", () => {
  it("creates an item in Backlog with zero effort done", () => {
    const item = createItem({ id: 1, arrival_tick: 5, effort_required_hours: 8, validation_effort_hours: 3 });
    expect(item.column).toBe("backlog");
    expect(item.effort_done_hours).toBe(0);
    expect(item.state).toBe("in_column");
    expect(item.author_worker_id).toBeNull();
  });

  it("isBlocked is false in normal state", () => {
    const item = createItem({ id: 1, arrival_tick: 0, effort_required_hours: 8, validation_effort_hours: 3 });
    expect(isBlocked(item)).toBe(false);
  });

  it("advanceItemEffort accumulates progress in In Progress", () => {
    let item = createItem({ id: 1, arrival_tick: 0, effort_required_hours: 8, validation_effort_hours: 3 });
    item = { ...item, column: "in_progress" };
    item = advanceItemEffort(item, 2.5);
    expect(item.effort_done_hours).toBeCloseTo(2.5);
  });

  it("advanceItemEffort caps at effort_required when in In Progress", () => {
    let item = createItem({ id: 1, arrival_tick: 0, effort_required_hours: 5, validation_effort_hours: 2 });
    item = { ...item, column: "in_progress" };
    item = advanceItemEffort(item, 10);
    expect(item.effort_done_hours).toBeLessThanOrEqual(5);
  });
});
