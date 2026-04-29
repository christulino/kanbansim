import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createThrottle } from "../src/lib/throttle.js";

describe("createThrottle", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("calls immediately on first invocation (leading edge)", () => {
    const fn = vi.fn();
    const t = createThrottle(fn, 50);
    t.call("a");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith("a");
  });

  it("coalesces rapid calls within the window into one trailing call", () => {
    const fn = vi.fn();
    const t = createThrottle(fn, 50);
    t.call("a");                 // leading
    t.call("b");                 // queued
    t.call("c");                 // overwrites b
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith("c");
  });

  it("flush() invokes any pending trailing call immediately", () => {
    const fn = vi.fn();
    const t = createThrottle(fn, 50);
    t.call("a");
    t.call("b");
    t.flush();
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith("b");
  });

  it("cancel() drops the pending trailing call", () => {
    const fn = vi.fn();
    const t = createThrottle(fn, 50);
    t.call("a");
    t.call("b");
    t.cancel();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
