import { describe, expect, it } from "vitest";
import { localDateKey, zonedMidnightUtc } from "./time";
import { toPiasters, netPiasters } from "./money";
import {
    computeDays,
    saleFigures,
    suggestTarget,
    paceStatus,
    evaluateInsights,
    buildCohorts,
    windowRates,
} from "./metrics";

const TZ = "Africa/Cairo";
const NOW = new Date("2026-04-02T10:00:00.000Z");

function member(extra) {
    return {
        _id: extra._id || "m1",
        name: extra.name || "Nour",
        systemId: extra.systemId || 101,
        status: extra.status || "active",
        phones: extra.phones || "01011111111",
        source: extra.source || "Walk in",
        createdAt: extra.createdAt || "2026-01-01T10:00:00.000Z",
        subscriptions: extra.subscriptions || [],
        userlog: extra.userlog || [],
        notes: extra.notes || [],
        freeze: extra.freeze || [],
        pt_subscriptions: extra.pt_subscriptions || [],
        assignedSales: extra.assignedSales || null,
        PT_sessions: extra.PT_sessions || 0,
        used_PT_sessions: extra.used_PT_sessions || 0,
        PT_sessions_expDate: extra.PT_sessions_expDate || null,
    };
}

function run(members, dateKeys, focusDate) {
    return computeDays({
        members,
        dateKeys,
        timeZone: TZ,
        now: NOW,
        focusDate: focusDate || dateKeys[dateKeys.length - 1],
        pending: { total: 0, over3: 0, under1: 0, d1to3: 0 },
        targetsSumPiasters: 0,
    });
}

describe("bi money and timezone", () => {
    it("converts pounds to integer piasters and nets refunds", () => {
        expect(toPiasters(100.5)).toBe(10050);
        expect(toPiasters(20.25)).toBe(2025);
        expect(netPiasters(100.5, 20.25)).toBe(8025);
        expect(netPiasters("bad", 1)).toBe(0);
    });

    it("places Cairo midnight on the previous UTC evening", () => {
        const midnight = zonedMidnightUtc("2026-04-01", TZ);
        expect(midnight.toISOString()).toBe("2026-03-31T22:00:00.000Z");
        expect(localDateKey(new Date("2026-03-31T21:59:00.000Z"), TZ)).toBe("2026-03-31");
        expect(localDateKey(new Date("2026-03-31T22:00:00.000Z"), TZ)).toBe("2026-04-01");
        expect(localDateKey(new Date("2026-03-31T22:30:00.000Z"), TZ)).toBe("2026-04-01");
    });
});

describe("bi metrics", () => {
    it("counts a check-in on the Cairo day and ignores the live catalog price", () => {
        const { days } = run([
            member({
                subscriptions: [{
                    startDate: "2026-04-01T00:00:00.000Z",
                    endDate: "2026-07-01T00:00:00.000Z",
                    pricePaid: 100.5,
                    refundAmount: 20.25,
                    package: { price: 9999 },
                    packageSnapshot: { name: "Gold", duration: "3 months", price: 150, activityType: "gym" },
                }],
                userlog: [{ type: "check-in", createdAt: "2026-03-31T22:30:00.000Z", createdBy: "staff" }],
            }),
        ], ["2026-03-31", "2026-04-01"], "2026-04-01");

        const march = days.find((day) => day.localDate === "2026-03-31");
        const april = days.find((day) => day.localDate === "2026-04-01");
        expect(march.metrics.checkIns).toBe(0);
        expect(april.metrics.checkIns).toBe(1);
        expect(april.hours[0]).toBe(1);
        expect(april.metrics.distinctVisitors).toBe(1);
        expect(april.metrics.membershipSalesPiasters).toBe(8025);
        expect(april.metrics.discountGapPiasters).toBe(15000 - 10050);
        expect(april.metrics.newJoins).toBe(1);
        expect(JSON.stringify(days)).not.toContain("01011111111");
        expect(JSON.stringify(days)).not.toContain("9999");
    });

    it("keeps a 7-day gap as a renewal and a longer gap as churn", () => {
        const end = "2026-01-31T18:00:00.000Z";
        expect(localDateKey(end, TZ)).toBe("2026-01-31");
        const renewed = member({
            _id: "a",
            systemId: 1,
            subscriptions: [
                { startDate: "2026-01-01T10:00:00.000Z", endDate: end, pricePaid: 1000, packageSnapshot: { name: "M", duration: "1 month", price: 1000, activityType: "gym" } },
                { startDate: new Date(new Date(end).getTime() + 7 * 86400000).toISOString(), endDate: "2026-03-01T18:00:00.000Z", pricePaid: 900, isRenewal: true, packageSnapshot: { name: "M", duration: "1 month", price: 1000, activityType: "gym" } },
            ],
        });
        const churned = member({
            _id: "b",
            systemId: 2,
            name: "Hana",
            phones: "01022222222",
            subscriptions: [
                { startDate: "2026-01-01T10:00:00.000Z", endDate: end, pricePaid: 1000, packageSnapshot: { name: "M", duration: "1 month", price: 1000, activityType: "gym" } },
            ],
        });
        const { days } = run([renewed, churned], ["2026-01-31"], "2026-01-31");
        expect(days[0].metrics.termsEnded).toBe(2);
        expect(days[0].metrics.termsRenewed).toBe(1);
        expect(days[0].metrics.churnEvents).toBe(1);
        expect(days[0].samples.renewalPiasters).toEqual([90000]);
    });

    it("does not credit revenue to a rep or a createdBy user", () => {
        const { days } = run([
            member({
                createdAt: "2026-04-01T08:00:00.000Z",
                assignedSales: "rep-1",
                subscriptions: [{
                    startDate: "2026-04-01T08:00:00.000Z",
                    endDate: "2026-05-01T08:00:00.000Z",
                    pricePaid: 500,
                    createdBy: "accountant-1",
                    packageSnapshot: { name: "Walk", duration: "1 month", price: 500, activityType: "gym" },
                }],
            }),
        ], ["2026-04-01"]);
        expect(days[0].segments.byAssignee).toEqual([
            expect.objectContaining({ key: "rep-1", added: 1, converted: 1, salesPiasters: 0 }),
        ]);
        expect(JSON.stringify(days[0].segments)).not.toContain("accountant-1");
        expect(days[0].segments.byActivity[0].salesPiasters).toBe(50000);
    });

    it("matches a one-day fold to the same day inside a range", () => {
        const people = [member({
            userlog: [
                { type: "check-in", createdAt: "2026-03-31T22:30:00.000Z" },
                { type: "check-in", createdAt: "2026-04-01T22:30:00.000Z" },
            ],
        })];
        const range = run(people, ["2026-04-01", "2026-04-02"]);
        const alone = run(people, ["2026-04-01"], "2026-04-01");
        const fromRange = range.days.find((day) => day.localDate === "2026-04-01");
        expect(fromRange.metrics.checkIns).toBe(alone.days[0].metrics.checkIns);
        expect(fromRange.hours).toEqual(alone.days[0].hours);
    });

    it("hides rates below 20 ended memberships and suggests targets from the baseline", () => {
        const rates = windowRates([{ metrics: { termsEnded: 4, termsRenewed: 2, peopleAdded: 4, peopleConverted: 1 }, samples: { firstNoteHours: [], renewalPiasters: [] }, segments: {} }]);
        expect(rates.renewalRate.insufficient).toBe(true);
        expect(rates.renewalRate.value).toBeNull();
        const band = suggestTarget(0.61, "rate");
        expect(band.achievable).toBeCloseTo(0.61 + Math.min(0.05, 0.39 * 0.15), 4);
        expect(suggestTarget(10, "duration").stretch).toBe(6);
    });

    it("marks pace off track when progress is far behind elapsed time", () => {
        const onTrack = paceStatus({
            baseline: 0.5,
            target: 0.6,
            actual: 0.55,
            start: "2026-01-01T00:00:00.000Z",
            deadline: "2026-04-11T00:00:00.000Z",
            now: "2026-02-20T00:00:00.000Z",
            direction: "up",
        });
        expect(onTrack.status).toBe("on_track");
        const behind = paceStatus({
            baseline: 0.5,
            target: 0.6,
            actual: 0.51,
            start: "2026-01-01T00:00:00.000Z",
            deadline: "2026-04-11T00:00:00.000Z",
            now: "2026-02-20T00:00:00.000Z",
            direction: "up",
        });
        expect(behind.status).toBe("off_track");
        expect(typeof behind.projected).toBe("string");
        const wrongWay = paceStatus({
            baseline: 0.5,
            target: 0.6,
            actual: 0.4,
            start: "2026-01-01T00:00:00.000Z",
            deadline: "2026-04-11T00:00:00.000Z",
            now: "2026-02-20T00:00:00.000Z",
            direction: "up",
        });
        expect(wrongWay.projected).toBeNull();
    });

    it("does not fire the renewal insight below eight members", () => {
        const small = evaluateInsights({
            focus: { localDate: "2026-04-01", lists: { atRisk: Array.from({ length: 7 }, () => ({ quiet: true, expiring: true })) }, metrics: {}, pending: {} },
            recentDays: [],
            priorDays: [],
        });
        expect(small.find((row) => row.ruleKey === "renewals_quiet")).toBeUndefined();
        const enough = evaluateInsights({
            focus: { localDate: "2026-04-01", lists: { atRisk: Array.from({ length: 8 }, () => ({ quiet: true, expiring: true })) }, metrics: {}, pending: {} },
            recentDays: [],
            priorDays: [],
        });
        expect(enough[0].ruleKey).toBe("renewals_quiet");
    });

    it("builds a cohort from the first subscription month", () => {
        const rows = buildCohorts([
            member({
                subscriptions: [{
                    startDate: "2026-01-15T10:00:00.000Z",
                    endDate: "2026-06-15T10:00:00.000Z",
                    pricePaid: 100,
                    packageSnapshot: { price: 100 },
                }],
            }),
        ], new Date("2026-04-02T10:00:00.000Z"), TZ, 6);
        expect(rows[0].cohort).toBe("2026-01");
        expect(rows[0].size).toBe(1);
        expect(rows[0].cells[0]).toBe(1);
        expect(rows[0].cells[1]).toBe(1);
    });

    it("keeps two gyms apart when their days are computed separately", () => {
        const left = run([member({ _id: "a", systemId: 11, name: "Gym A", phones: "01000000011" })], ["2026-04-01"]);
        const right = run([member({ _id: "b", systemId: 22, name: "Gym B", phones: "01000000022" })], ["2026-04-01"]);
        const blob = JSON.stringify(left);
        expect(blob).not.toContain("Gym B");
        expect(blob).not.toContain("22");
        expect(blob).not.toContain("01000000022");
        expect(JSON.stringify(right)).toContain("Gym B");
    });

    it("records a missing price instead of using the catalog", () => {
        expect(saleFigures({ package: { price: 999 }, refundAmount: 0 }).net).toBe(0);
        expect(saleFigures({ package: { price: 999 } }).missing).toBe(true);
        const { days } = run([
            member({
                subscriptions: [{
                    startDate: "2026-04-01T08:00:00.000Z",
                    endDate: "2026-05-01T08:00:00.000Z",
                    package: { price: 999 },
                }],
            }),
        ], ["2026-04-01"]);
        expect(days[0].metrics.membershipSalesPiasters).toBe(0);
        expect(days[0].quality.missingPrice).toBe(1);
    });
});
