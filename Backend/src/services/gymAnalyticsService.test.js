import { describe, expect, it } from "vitest";
import {
    buildChurn,
    buildCohorts,
    buildForecast,
    buildFunnel,
    bucketAttendance,
    buildNarrative,
} from "./gymAnalyticsService";

const NOW = new Date(2026, 10, 7, 12, 0, 0);

function sub(start, end, extra = {}) {
    return { startDate: start, endDate: end, pricePaid: 1000, ...extra };
}

describe("gymAnalyticsService", () => {
    it("treats a renewal inside 7 days as continuous and a later return as churn plus reactivation", () => {
        const renewed = {
            name: "Renewed",
            subscriptions: [
                sub(new Date(2026, 8, 1), new Date(2026, 9, 20)),
                sub(new Date(2026, 9, 23), new Date(2026, 10, 30)),
            ],
        };
        const lapsed = {
            name: "Lapsed",
            subscriptions: [
                sub(new Date(2026, 8, 1), new Date(2026, 9, 20)),
                sub(new Date(2026, 10, 10), new Date(2026, 11, 10)),
            ],
        };

        const report = buildChurn([renewed, lapsed], NOW, 12);
        const october = report.months.find((row) => row.month === "2026-10");
        const november = report.months.find((row) => row.month === "2026-11");

        expect(october.coveredAtStart).toBe(2);
        expect(october.churned).toBe(1);
        expect(october.churnRate).toBeCloseTo(0.5);
        expect(october.reactivated).toBe(0);
        expect(november.reactivated).toBe(1);
        expect(november.churned).toBe(0);
    });

    it("keeps a member with an open freeze retained past the unextended subscription end", () => {
        const frozen = {
            name: "Frozen",
            subscriptions: [sub(new Date(2026, 8, 1), new Date(2026, 9, 20))],
            freeze: [{
                startDate: new Date(2026, 9, 20),
                endDate: new Date(2026, 10, 30, 23, 59, 59),
                endedBy: null,
            }],
        };
        const lapsed = {
            ...frozen,
            name: "Lapsed",
            freeze: [],
        };

        const withFreeze = buildChurn([frozen], NOW, 12);
        const withoutFreeze = buildChurn([lapsed], NOW, 12);
        const octoberFrozen = withFreeze.months.find((row) => row.month === "2026-10");
        const octoberLapsed = withoutFreeze.months.find((row) => row.month === "2026-10");

        expect(octoberLapsed.churned).toBe(1);
        expect(octoberFrozen.churned).toBe(0);
        expect(withFreeze.atRisk.map((row) => row.name)).toContain("Frozen");
    });

    it("excludes guests from retention cohorts", () => {
        const guest = { name: "Guest", status: "guest", subscriptions: [] };
        const member = {
            name: "Member",
            subscriptions: [sub(new Date(2026, 9, 15), new Date(2026, 11, 15))],
        };

        const report = buildCohorts([guest, member], NOW, 12);
        const sizes = report.cohorts.reduce((sum, row) => sum + row.size, 0);
        const october = report.cohorts.find((row) => row.cohort === "2026-10");

        expect(sizes).toBe(1);
        expect(october.size).toBe(1);
        expect(october.retention[0]).toBe(1);
    });

    it("subtracts refunds from forecast revenue and leaves the current month out of the average", () => {
        const members = [{
            subscriptions: [{
                startDate: new Date(2026, 7, 15),
                endDate: new Date(2026, 8, 15),
                pricePaid: 1000,
                refundAmount: 250,
            }],
        }];

        const report = buildForecast(members, NOW);
        const august = report.actuals.find((row) => row.month === "2026-08");
        const november = report.actuals.find((row) => row.month === "2026-11");

        expect(august.revenue).toBe(750);
        expect(november.partial).toBe(true);
        expect(november.revenue).toBe(0);
        expect(report.trailingAverage).toBe(250);
        expect(report.forecast).toHaveLength(3);
        expect(report.forecast.every((row) => row.revenue === 250)).toBe(true);
        expect(report.method).toBe("trailing_3_month_average");
    });

    it("excludes data-entry leads unless includeImported is set, and still counts their revenue", () => {
        const members = [
            { source: "Walk in", createdAt: new Date(2026, 10, 2), subscriptions: [] },
            { source: "data entry", createdAt: new Date(2026, 10, 3), subscriptions: [] },
            {
                source: "Social media",
                createdAt: new Date(2026, 10, 4),
                subscriptions: [sub(new Date(2026, 10, 4), new Date(2026, 11, 4))],
            },
            {
                source: "Walk in",
                createdAt: new Date(2025, 0, 1),
                subscriptions: [{
                    startDate: new Date(2026, 10, 5),
                    endDate: new Date(2026, 11, 5),
                    pricePaid: 500,
                }],
            },
            {
                source: "data entry",
                createdAt: new Date(2025, 0, 2),
                subscriptions: [{
                    startDate: new Date(2026, 10, 5),
                    endDate: new Date(2026, 11, 5),
                    pricePaid: 100,
                }],
            },
        ];
        const range = { from: new Date(2026, 10, 1), to: new Date(2026, 10, 7, 12) };

        const hidden = buildFunnel(members, { ...range, includeImported: false });
        const shown = buildFunnel(members, { ...range, includeImported: true });
        const imported = hidden.bySource.find((row) => row.source === "data entry");

        expect(hidden.stages.find((stage) => stage.key === "created").count).toBe(2);
        expect(hidden.stages.find((stage) => stage.key === "converted").count).toBe(1);
        expect(hidden.stages.find((stage) => stage.key === "stillGuest").count).toBe(1);
        expect(shown.stages.find((stage) => stage.key === "created").count).toBe(3);
        expect(imported.leads).toBe(0);
        expect(imported.revenue).toBe(100);
        expect(hidden.bySource.find((row) => row.source === "Walk in").revenue).toBe(500);
    });

    it("buckets check-ins by local weekday and hour and keeps empty cells", () => {
        const report = bucketAttendance(
            [new Date(2026, 10, 4, 18, 30), new Date(2026, 10, 8, 9, 0)],
            { from: new Date(2026, 10, 1), to: new Date(2026, 10, 7) },
        );
        const wednesdayEvening = report.grid.find((cell) => cell.dow === 3 && cell.hour === 18);
        const empty = report.grid.find((cell) => cell.dow === 0 && cell.hour === 0);

        expect(report.grid).toHaveLength(168);
        expect(wednesdayEvening.count).toBe(1);
        expect(empty.count).toBe(0);
        expect(report.days.find((day) => day.date === "2026-11-04").count).toBe(1);
        expect(report.days.find((day) => day.date === "2026-11-01").count).toBe(0);
        expect(report.totalCheckIns).toBe(1);
    });

    it("writes the executive narrative from churn direction and the forecast", () => {
        const text = buildNarrative({
            churnRate: 0.04,
            previousChurnRate: 0.05,
            revenueThisMonth: 1000,
            trailingAverage: 800,
            forecastNextMonth: 800,
        });

        expect(text).toContain("Churn this month is 4.0%, down from 5.0% last month.");
        expect(text).toContain("EGP 1,000");
        expect(text).toContain("three-month average of EGP 800");
        expect(text).toContain("Next month is forecast at EGP 800.");
    });
});
