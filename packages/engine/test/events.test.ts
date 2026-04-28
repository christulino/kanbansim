import { describe, it, expect } from "vitest";
import { createEventQueue, popDueEvents } from "../src/events.js";

describe("event queue", () => {
  it("returns events whose tick is <= current tick, in time order", () => {
    const q = createEventQueue();
    q.schedule({ tick: 5, kind: "arrival", itemId: 1 });
    q.schedule({ tick: 3, kind: "unblock", itemId: 2 });
    q.schedule({ tick: 10, kind: "arrival", itemId: 3 });
    const due = popDueEvents(q, 5);
    expect(due.map((e) => e.tick)).toEqual([3, 5]);
  });

  it("leaves future events in the queue", () => {
    const q = createEventQueue();
    q.schedule({ tick: 5, kind: "arrival", itemId: 1 });
    q.schedule({ tick: 10, kind: "arrival", itemId: 3 });
    popDueEvents(q, 5);
    const remaining = popDueEvents(q, 100);
    expect(remaining.map((e) => e.tick)).toEqual([10]);
  });
});
