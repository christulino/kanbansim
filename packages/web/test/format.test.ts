import { describe, expect, it } from "vitest";
import { formatInt, formatHoursAsDays, formatPct, formatThroughput, formatEta } from "../src/lib/format.js";

describe("format", () => {
  it("formatInt adds thousand separators", () => {
    expect(formatInt(1247)).toBe("1,247");
    expect(formatInt(10000)).toBe("10,000");
    expect(formatInt(0)).toBe("0");
  });
  it("formatHoursAsDays converts using the workday hours", () => {
    expect(formatHoursAsDays(48, 6)).toBe("8.0 d");
    expect(formatHoursAsDays(78, 6)).toBe("13.0 d");
  });
  it("formatPct rounds to whole percent", () => {
    expect(formatPct(0.713)).toBe("71%");
    expect(formatPct(0.085)).toBe("9%");
    expect(formatPct(1)).toBe("100%");
  });
  it("formatThroughput shows two decimal places", () => {
    expect(formatThroughput(2.347)).toBe("2.35 / day");
    expect(formatThroughput(0)).toBe("0.00 / day");
  });
  it("formatEta picks readable units", () => {
    expect(formatEta(0)).toBe("done");
    expect(formatEta(8)).toBe("~8 sec remaining");
    expect(formatEta(95)).toBe("~1 min 35 sec remaining");
    expect(formatEta(3600)).toBe("~1 hr 0 min remaining");
  });
});
