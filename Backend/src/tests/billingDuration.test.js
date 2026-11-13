import { describe, it, expect } from "vitest";
import {
    normalizeIntervalCount,
    periodMonths,
    formatDurationLabel,
    durationKey,
} from "../services/billing/billingDuration";

describe("billingDuration helpers", () => {
    it("normalizes invalid interval counts to 1", () => {
        expect(normalizeIntervalCount(undefined)).toBe(1);
        expect(normalizeIntervalCount(0)).toBe(1);
        expect(normalizeIntervalCount(-3)).toBe(1);
        expect(normalizeIntervalCount(3.9)).toBe(3);
        expect(normalizeIntervalCount("6")).toBe(6);
    });

    it("computes period months for month and year units", () => {
        expect(periodMonths("monthly", 1)).toBe(1);
        expect(periodMonths("monthly", 3)).toBe(3);
        expect(periodMonths("yearly", 1)).toBe(12);
        expect(periodMonths("yearly", 2)).toBe(24);
        expect(periodMonths("lifetime", 1)).toBeNull();
    });

    it("formats human-readable duration labels", () => {
        expect(formatDurationLabel("monthly", 1)).toBe("1 month");
        expect(formatDurationLabel("monthly", 3)).toBe("3 months");
        expect(formatDurationLabel("yearly", 1)).toBe("1 year");
        expect(formatDurationLabel("yearly", 2)).toBe("2 years");
        expect(formatDurationLabel("lifetime")).toBe("Lifetime");
    });

    it("builds stable duration keys", () => {
        expect(durationKey("monthly", 3)).toBe("monthly:3");
        expect(durationKey("yearly", 2)).toBe("yearly:2");
    });
});
