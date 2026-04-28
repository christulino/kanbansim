import { describe, it, expect } from "vitest";
import { effectiveWorkHours } from "../src/multitasking.js";

describe("multitasking math", () => {
  it("returns 1 hour with no switch and no juggling", () => {
    const eff = effectiveWorkHours({
      tickHours: 1, switchedThisTick: false, switchCostMinutes: 15, activeItemCount: 1, pacePenalty: 0.05,
    });
    expect(eff).toBe(1);
  });

  it("subtracts switch cost when switchedThisTick is true", () => {
    const eff = effectiveWorkHours({
      tickHours: 1, switchedThisTick: true, switchCostMinutes: 15, activeItemCount: 1, pacePenalty: 0,
    });
    expect(eff).toBeCloseTo(0.75);
  });

  it("applies pace penalty when juggling many items", () => {
    const eff = effectiveWorkHours({
      tickHours: 1, switchedThisTick: false, switchCostMinutes: 15, activeItemCount: 5, pacePenalty: 0.05,
    });
    expect(eff).toBeCloseTo(0.8);
  });

  it("combines switch cost and pace penalty", () => {
    const eff = effectiveWorkHours({
      tickHours: 1, switchedThisTick: true, switchCostMinutes: 15, activeItemCount: 5, pacePenalty: 0.05,
    });
    expect(eff).toBeCloseTo(0.6);
  });

  it("floors pace_factor at 0.1 to prevent pathological negatives", () => {
    const eff = effectiveWorkHours({
      tickHours: 1, switchedThisTick: false, switchCostMinutes: 15, activeItemCount: 100, pacePenalty: 0.05,
    });
    expect(eff).toBeCloseTo(0.1);
  });
});
