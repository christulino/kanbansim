import { describe, it, expect } from "vitest";
import { computeTickAllocation } from "../src/multitasking.js";

describe("computeTickAllocation", () => {
  it("with one unblocked item, full tick goes to that item (no switching)", () => {
    const r = computeTickAllocation({
      tickHours: 1,
      productiveHoursPerDay: 6,
      progressingCount: 1,
      switchCostHours: 0.25,
    });
    expect(r.switchOverheadHours).toBe(0);
    expect(r.usefulHours).toBe(1);
    expect(r.perItemHours).toBe(1);
  });

  it("matches the user's mental math: 3 items, 6h day, 15min switch → 5.5h useful, 1.83h/item/day", () => {
    // Per tick (6 ticks/day):
    //   daily switch overhead = 2 transitions * 0.25h = 0.5h
    //   per-tick overhead = 0.5 / 6 = 0.0833h
    //   useful per tick = 0.9167h
    //   per item per tick = 0.3056h
    // Per day:
    //   useful = 6 * 0.9167 = 5.5h
    //   per item = 5.5 / 3 = 1.833h
    const r = computeTickAllocation({
      tickHours: 1,
      productiveHoursPerDay: 6,
      progressingCount: 3,
      switchCostHours: 0.25,
    });
    expect(r.switchOverheadHours).toBeCloseTo(0.0833, 3);
    expect(r.usefulHours).toBeCloseTo(0.9167, 3);
    expect(r.perItemHours).toBeCloseTo(0.3056, 3);
    // Per-day check
    expect(r.usefulHours * 6).toBeCloseTo(5.5);
    expect(r.perItemHours * 6).toBeCloseTo(5.5 / 3);
  });

  it("scales linearly with switch cost", () => {
    const noCost = computeTickAllocation({ tickHours: 1, productiveHoursPerDay: 6, progressingCount: 3, switchCostHours: 0 });
    const fifteen = computeTickAllocation({ tickHours: 1, productiveHoursPerDay: 6, progressingCount: 3, switchCostHours: 0.25 });
    const thirty = computeTickAllocation({ tickHours: 1, productiveHoursPerDay: 6, progressingCount: 3, switchCostHours: 0.5 });
    expect(noCost.usefulHours).toBe(1);
    expect(fifteen.usefulHours).toBeCloseTo(0.9167, 3);
    expect(thirty.usefulHours).toBeCloseTo(0.8333, 3);
  });

  it("returns zero per-item when nothing is progressing", () => {
    const r = computeTickAllocation({
      tickHours: 1,
      productiveHoursPerDay: 6,
      progressingCount: 0,
      switchCostHours: 0.25,
    });
    expect(r.usefulHours).toBe(0);
    expect(r.perItemHours).toBe(0);
  });

  it("clamps useful hours to zero if switch overhead exceeds the day", () => {
    // Pathological: 100 items with 60min switch on 6h day → 99 * 1.0 = 99h overhead, way over 6.
    const r = computeTickAllocation({
      tickHours: 1,
      productiveHoursPerDay: 6,
      progressingCount: 100,
      switchCostHours: 1.0,
    });
    expect(r.usefulHours).toBe(0);
    expect(r.perItemHours).toBe(0);
  });

  it("uses tickHours, not 1, for per-tick scaling (tick != 1 hour)", () => {
    // 0.5h tick, 3 items, 15min switch, 6h day → per-tick overhead = 0.5/6 * 0.5h = 0.0417h
    const r = computeTickAllocation({
      tickHours: 0.5,
      productiveHoursPerDay: 6,
      progressingCount: 3,
      switchCostHours: 0.25,
    });
    expect(r.switchOverheadHours).toBeCloseTo(0.0417, 3);
    expect(r.usefulHours).toBeCloseTo(0.4583, 3);
  });
});
