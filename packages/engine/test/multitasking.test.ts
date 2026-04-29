import { describe, it, expect } from "vitest";
import { computeTickAllocation } from "../src/multitasking.js";

describe("computeTickAllocation", () => {
  it("with one unblocked item and no pulls, full tick goes to that item", () => {
    const r = computeTickAllocation({
      tickHours: 1,
      activeCarryCount: 1,
      progressingCount: 1,
      pullCostHours: 0,
      pacePenalty: 0.05,
    });
    expect(r.usefulHours).toBeCloseTo(1);
    expect(r.perItemHours).toBeCloseTo(1);
    expect(r.paceFactor).toBe(1);
  });

  it("with N=10 unblocked items, each gets a slice", () => {
    const r = computeTickAllocation({
      tickHours: 1,
      activeCarryCount: 10,
      progressingCount: 10,
      pullCostHours: 0,
      pacePenalty: 0.05,
    });
    expect(r.paceFactor).toBeCloseTo(0.55);
    expect(r.usefulHours).toBeCloseTo(0.55);
    expect(r.perItemHours).toBeCloseTo(0.055);
  });

  it("blocked items in the carry still cost pace_factor but don't get progress", () => {
    const r = computeTickAllocation({
      tickHours: 1,
      activeCarryCount: 5,
      progressingCount: 2,
      pullCostHours: 0,
      pacePenalty: 0.05,
    });
    expect(r.paceFactor).toBeCloseTo(0.8);
    expect(r.usefulHours).toBeCloseTo(0.8);
    expect(r.perItemHours).toBeCloseTo(0.4);
  });

  it("pull cost reduces useful hours one-time", () => {
    const r = computeTickAllocation({
      tickHours: 1,
      activeCarryCount: 1,
      progressingCount: 1,
      pullCostHours: 0.25,
      pacePenalty: 0.05,
    });
    expect(r.usefulHours).toBeCloseTo(0.75);
    expect(r.perItemHours).toBeCloseTo(0.75);
  });

  it("floors pace_factor at 0.1", () => {
    const r = computeTickAllocation({
      tickHours: 1,
      activeCarryCount: 100,
      progressingCount: 100,
      pullCostHours: 0,
      pacePenalty: 0.05,
    });
    expect(r.paceFactor).toBe(0.1);
    expect(r.usefulHours).toBeCloseTo(0.1);
    expect(r.perItemHours).toBeCloseTo(0.001);
  });

  it("returns zero per-item when nothing is progressing", () => {
    const r = computeTickAllocation({
      tickHours: 1,
      activeCarryCount: 3,
      progressingCount: 0,
      pullCostHours: 0,
      pacePenalty: 0.05,
    });
    expect(r.perItemHours).toBe(0);
  });

  it("never returns negative useful hours when pull cost exceeds tick", () => {
    const r = computeTickAllocation({
      tickHours: 1,
      activeCarryCount: 1,
      progressingCount: 1,
      pullCostHours: 2,
      pacePenalty: 0.05,
    });
    expect(r.usefulHours).toBe(0);
    expect(r.perItemHours).toBe(0);
  });
});
