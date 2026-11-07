import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import Tenant from "../models/Tenant";
import PlanPrice from "../models/PlanPrice";
import BillingEvent from "../models/BillingEvent";
import PlatformMetricSnapshot from "../models/PlatformMetricSnapshot";
import Member from "../models/Member";
import User from "../models/User";
import AuditLog from "../models/AuditLog";
import { computeDailySnapshot, tenantHealthScore, METRIC_DEFINITIONS } from "../services/platformAnalyticsService";

const DAY = 24 * 60 * 60 * 1000;

describe("tenant health score", () => {
    const now = new Date("2026-06-15T12:00:00.000Z");

    it("gives 25 points for status, a visit inside 7 days, a member, and a staff user", () => {
        expect(tenantHealthScore({
            status: "active",
            lastActivityAt: new Date(now.getTime() - DAY),
            memberCount: 1,
            staffCount: 1,
            now,
        })).toBe(100);
        expect(tenantHealthScore({
            status: "trial",
            lastActivityAt: new Date(now.getTime() - 7 * DAY),
            memberCount: 0,
            staffCount: 0,
            now,
        })).toBe(50);
    });

    it("drops the activity points once the last request is older than 7 days", () => {
        expect(tenantHealthScore({
            status: "active",
            lastActivityAt: new Date(now.getTime() - 7 * DAY - 1),
            memberCount: 0,
            staffCount: 0,
            now,
        })).toBe(25);
        expect(tenantHealthScore({
            status: "suspended",
            lastActivityAt: null,
            memberCount: 4,
            staffCount: 2,
            now,
        })).toBe(50);
    });
});

describe("platform daily snapshot definitions", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(PlatformMetricSnapshot, "findOneAndUpdate").mockImplementation((_query, update) => {
            return Promise.resolve(update.$set);
        });
        vi.spyOn(PlanPrice, "find").mockReturnValue({
            populate: vi.fn().mockResolvedValue([]),
        });
        vi.spyOn(BillingEvent, "find").mockResolvedValue([]);
    });

    it("counts same-day logo churn, leaves NRR blank, and does not treat a silent gym as churned", async () => {
        const snapshotDate = new Date("2026-06-15T15:00:00.000Z");
        const now = Date.now();
        const tenants = [
            {
                _id: new mongoose.Types.ObjectId(),
                status: "active",
                createdAt: snapshotDate,
                billing: { cycle: "monthly" },
                planId: { key: "gold", priceMonthly: 200 },
                lastActivityAt: new Date(now - DAY),
            },
            {
                _id: new mongoose.Types.ObjectId(),
                status: "cancelled",
                createdAt: new Date("2025-01-01T00:00:00.000Z"),
                updatedAt: snapshotDate,
                billing: { cycle: "monthly" },
                planId: { key: "basic", priceMonthly: 100 },
            },
            {
                _id: new mongoose.Types.ObjectId(),
                status: "cancelled",
                createdAt: new Date("2025-01-01T00:00:00.000Z"),
                updatedAt: new Date("2026-06-14T12:00:00.000Z"),
                billing: { cycle: "monthly" },
                planId: { key: "basic", priceMonthly: 100 },
            },
            {
                _id: new mongoose.Types.ObjectId(),
                status: "active",
                createdAt: new Date("2025-01-01T00:00:00.000Z"),
                billing: { cycle: "monthly" },
                planId: { key: "basic", priceMonthly: 500 },
                lastActivityAt: new Date(now - 20 * DAY),
            },
            {
                _id: new mongoose.Types.ObjectId(),
                status: "active",
                createdAt: new Date("2025-01-01T00:00:00.000Z"),
                billing: { cycle: "lifetime", lifetime: { amountPaid: 1500 } },
                planId: { key: "platinum", priceMonthly: 6500 },
                lastActivityAt: new Date(now),
            },
        ];

        vi.spyOn(Tenant, "find").mockReturnValue({
            populate: vi.fn().mockResolvedValue(tenants),
        });
        const memberCounts = [2, 0, 1, 0, 1];
        const staffCounts = [1, 0, 0, 0, 1];
        vi.spyOn(Member.collection, "countDocuments").mockImplementation(() => Promise.resolve(memberCounts.shift()));
        vi.spyOn(User.collection, "countDocuments").mockImplementation(() => Promise.resolve(staffCounts.shift()));

        const snapshot = await computeDailySnapshot(snapshotDate);

        expect(snapshot.revenue.mrr).toBe(700);
        expect(snapshot.growth.newTenantsPeriod).toBe(1);
        expect(snapshot.growth.cancelledTenants).toBe(2);
        expect(snapshot.growth.churnedTenantsPeriod).toBe(1);
        expect(snapshot.growth.logoChurnRate).toBe(25);
        expect(snapshot.growth.netRevenueRetention).toBeNull();
        expect(snapshot.growth.nrrStatus).toBe("insufficient_history");
        expect(snapshot.health.churnRisks).toBe(1);
        expect(snapshot.health.untrackedActivity).toBe(2);
        expect(snapshot.health.averageHealthScore).toBe(50);
        expect(METRIC_DEFINITIONS.netRevenueRetention).toContain("blank");
        expect(METRIC_DEFINITIONS.logoChurnRate).toContain("same-day");
    });

    it("allows audit rows for a BI export and a platform analytics export", () => {
        expect(AuditLog.schema.path("action").enumValues).toEqual(expect.arrayContaining([
            "bi_exported",
            "platform_analytics_exported",
        ]));
    });
});
