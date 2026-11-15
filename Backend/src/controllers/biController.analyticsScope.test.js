import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
    canSee,
    locationKeyFromScope,
    insightLocationClause,
    mergeBranchSnapshotDays,
} = require("./biController");

const BRANCH_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const BRANCH_B = "bbbbbbbbbbbbbbbbbbbbbbbb";

describe("analytics location binding", () => {
    it("gives the sales manager the same analytics features as the owner", () => {
        const features = [
            "members",
            "checkin",
            "pt_tracking",
            "accounting",
            "funnels",
            "exec_analytics",
            "business_intelligence",
        ];
        for (const feature of features) {
            expect(canSee("Sales Manager", feature, features)).toBe(canSee("Owner", feature, features));
        }
    });

    it("keys a single branch, a granted set, and all locations separately", () => {
        expect(locationKeyFromScope({ mode: "one", locationId: BRANCH_A })).toBe(BRANCH_A);
        expect(locationKeyFromScope({ mode: "subset", locationIds: [BRANCH_B, BRANCH_A] })).toBe(`${BRANCH_A},${BRANCH_B}`);
        expect(locationKeyFromScope({ mode: "unrestricted" })).toBe("all");
        expect(locationKeyFromScope(null)).toBe("all");
    });

    it("does not read the gym-wide insight set for a selected branch", () => {
        const one = insightLocationClause({ mode: "one", locationId: BRANCH_A });
        expect(String(one.locationId)).toBe(BRANCH_A);
        const all = insightLocationClause({ mode: "unrestricted" });
        expect(all.$or).toEqual([
            { locationId: null },
            { locationId: { $exists: false } },
        ]);
    });

    it("sums only the selected branches and keeps each member list", () => {
        const merged = mergeBranchSnapshotDays([
            {
                localDate: "2026-04-01",
                metrics: { checkIns: 2, medianHoursToNote: 10 },
                samples: { firstNoteHours: [10], renewalPiasters: [] },
                segments: { byActivity: [{ key: "gym", salesPiasters: 100 }] },
                lists: { expiring: [{ id: "m1", name: "A" }] },
                hours: [1],
                pending: { total: 1 },
                quality: {},
            },
            {
                localDate: "2026-04-01",
                metrics: { checkIns: 3, medianHoursToNote: 30 },
                samples: { firstNoteHours: [30], renewalPiasters: [] },
                segments: { byActivity: [{ key: "gym", salesPiasters: 50 }] },
                lists: { expiring: [{ id: "m2", name: "B" }] },
                hours: [4],
                pending: { total: 2 },
                quality: {},
            },
        ], 10);
        expect(merged).toHaveLength(1);
        expect(merged[0].metrics.checkIns).toBe(5);
        expect(merged[0].metrics.medianHoursToNote).toBe(20);
        expect(merged[0].segments.byActivity[0].salesPiasters).toBe(150);
        expect(merged[0].lists.expiring.map((row) => row.id)).toEqual(["m1", "m2"]);
        expect(merged[0].pending.total).toBe(3);
        expect(merged[0].hours).toEqual([5]);
    });
});
