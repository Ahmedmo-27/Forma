import { describe, expect, it } from "vitest";
import { formatEgp, formatMonth, formatPercent, reportError } from "./analyticsFormat";

describe("analytics report formatting", () => {
  it("formats months, money, and rates without inventing a percent", () => {
    expect(formatMonth("2026-11")).toBe("Nov 2026");
    expect(formatMonth("")).toBe("");
    expect(formatEgp(1234.6)).toBe("1,235 EGP");
    expect(formatEgp(null)).toBe("0 EGP");
    expect(formatPercent(0.041)).toBe("4.1%");
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(Number.NaN)).toBe("—");
  });

  it("reads the server message from a failed report request", () => {
    expect(reportError({ response: { data: { message: "Not enough history" } } })).toBe("Not enough history");
    expect(reportError(new Error("network"))).toBe("Could not load this report");
  });
});