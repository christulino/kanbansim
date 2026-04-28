export type EngineEvent =
  | { tick: number; kind: "arrival"; itemId: number }
  | { tick: number; kind: "unblock"; itemId: number };

export type EventQueue = {
  schedule: (event: EngineEvent) => void;
  events: EngineEvent[]; // exposed for direct iteration in tests; do not mutate externally
};

export function createEventQueue(): EventQueue {
  const events: EngineEvent[] = [];
  return {
    events,
    schedule(e) {
      events.push(e);
      events.sort((a, b) => a.tick - b.tick);
    },
  };
}

export function popDueEvents(q: EventQueue, currentTick: number): EngineEvent[] {
  const due: EngineEvent[] = [];
  while (q.events.length > 0 && q.events[0]!.tick <= currentTick) {
    due.push(q.events.shift()!);
  }
  return due;
}
