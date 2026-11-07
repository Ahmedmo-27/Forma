import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const Insight = require("../../models/Insight");
const { actualFor, refreshInsights, weekKey } = require("./snapshotJob");

function day(localDate, metrics, extra = {}) {
    return {
        localDate,
        metrics,
        samples: { firstNoteHours: [], renewalPiasters: [] },
        segments: {},
        hours: [],
        ...extra,
    };
}

describe("bi snapshot job", () => {
    it("names the ISO week used to keep a dismissed insight from returning", () => {
        expect(weekKey("2026-04-01")).toBe("2026-W14");
        expect(weekKey("2026-01-01")).toBe("2026-W01");
    });

    it("reads a goal's actual value from the days inside its window", () => {
        const days = [
            day("2026-03-31", { coveredMembers: 99, churnEvents: 9, membershipSalesPiasters: 500 }),
            day("2026-04-01", { coveredMembers: 10, churnEvents: 1, membershipSalesPiasters: 2500, termsEnded: 4, termsRenewed: 2 }),
            day("2026-04-02", { coveredMembers: 10, churnEvents: 1, membershipSalesPiasters: 1500 }),
        ];
        const window = { startDate: "2026-04-01", deadline: "2026-04-02" };

        expect(actualFor({ ...window, metricKey: "membershipSalesPiasters" }, days)).toBe(4000);
        expect(actualFor({ ...window, metricKey: "churnRate" }, days)).toBe(0.2);
        expect(actualFor({ ...window, metricKey: "renewalRate" }, days)).toBeNull();
    });

    it("does not create the insight again when that rule already exists for the week", async () => {
        const findOne = vi.spyOn(Insight, "findOne").mockResolvedValue({ status: "dismissed" });
        const create = vi.spyOn(Insight, "create").mockResolvedValue({});
        const focus = day("2026-04-01", {}, {
            lists: { atRisk: Array.from({ length: 8 }, () => ({ quiet: true, expiring: true })) },
        });

        const drafts = await refreshInsights([focus]);

        expect(drafts.map((row) => row.ruleKey)).toEqual(["renewals_quiet"]);
        expect(findOne).toHaveBeenCalledWith({ ruleKey: "renewals_quiet", weekKey: "2026-W14" });
        expect(create).not.toHaveBeenCalled();
        findOne.mockRestore();
        create.mockRestore();
    });
});
