import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const snapshotJob = require("../services/bi/snapshotJob");
const platformAnalytics = require("../services/platformAnalyticsService");
const { runAnalyticsJobs } = require("./scheduledTasks");

describe("analytics schedule", () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("rebuilds gym snapshots every hour and the platform rollup only at 00:00 UTC", () => {
        const gyms = vi.spyOn(snapshotJob, "runDueBiSnapshots").mockResolvedValue(2);
        const platform = vi.spyOn(platformAnalytics, "computeDailySnapshot").mockResolvedValue({});

        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-06-15T13:00:00.000Z"));
        runAnalyticsJobs();
        expect(gyms).toHaveBeenCalledTimes(1);
        expect(platform).not.toHaveBeenCalled();

        vi.setSystemTime(new Date("2026-06-16T00:10:00.000Z"));
        runAnalyticsJobs();
        expect(gyms).toHaveBeenCalledTimes(2);
        expect(platform).toHaveBeenCalledTimes(1);
    });
});