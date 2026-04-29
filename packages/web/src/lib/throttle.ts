export type Throttled<T> = {
  call(value: T): void;
  flush(): void;
  cancel(): void;
};

export function createThrottle<T>(fn: (value: T) => void, intervalMs: number): Throttled<T> {
  let lastInvoke = 0;
  let pendingValue: { v: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function fire(value: T): void {
    lastInvoke = Date.now();
    pendingValue = null;
    if (timer !== null) { clearTimeout(timer); timer = null; }
    fn(value);
  }

  function scheduleTrailing(): void {
    if (timer !== null) return;
    const wait = Math.max(0, intervalMs - (Date.now() - lastInvoke));
    timer = setTimeout(() => {
      timer = null;
      if (pendingValue !== null) fire(pendingValue.v);
    }, wait);
  }

  return {
    call(value: T): void {
      const now = Date.now();
      if (now - lastInvoke >= intervalMs) {
        fire(value);
      } else {
        pendingValue = { v: value };
        scheduleTrailing();
      }
    },
    flush(): void {
      if (pendingValue !== null) fire(pendingValue.v);
    },
    cancel(): void {
      pendingValue = null;
      if (timer !== null) { clearTimeout(timer); timer = null; }
    },
  };
}
