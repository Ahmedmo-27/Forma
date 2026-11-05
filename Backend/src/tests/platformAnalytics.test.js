import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import Tenant from "../models/Tenant";
import Plan from "../models/Plan";
import PlanPrice from "../models/PlanPrice";
import BillingEvent from "../models/BillingEvent";
import PlatformMetricSnapshot from "../models/PlatformMetricSnapshot";
import Member from "../models/Member";
import User from "../models/User";
import { computeDailySnapshot } from "../services/platformAnalyticsService";

describe("Phase 5: Business Analytics & Snapshots", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(PlatformMetricSnapshot, "findOneAndUpdate").mockImplementation((_query, update) => {
            return Promise.resolve(update.$set);
        });
        vi.spyOn(PlanPrice, "find").mockReturnValue({
            populate: vi.fn().mockResolvedValue([]),
        });
    });

    describe("Financial Metric Computation (MRR, ARR, Lifetime)", () => {
        it("calculates exact MRR from recurring subscriptions and strictly excludes lifetime revenue", async () => {
            const mockTenants = [
                // 1. Monthly active gym ($500/mo) -> MRR: 500
                {
                    _id: new mongoose.Types.ObjectId(),
                    status: "active",
                    billing: { cycle: "monthly" },
                    planId: { key: "basic", priceMonthly: 500, priceYearly: 5000 },
                    updatedAt: new Date(),
                },
                // 2. Yearly active gym ($1200/yr) -> MRR: 1200 / 12 = 100
                {
                    _id: new mongoose.Types.ObjectId(),
                    status: "active",
                    billing: { cycle: "yearly" },
                    planId: { key: "gold", priceMonthly: 120, priceYearly: 1200 },
                    updatedAt: new Date(),
                },
                // 3. Lifetime active gym ($1500 one-time) -> MUST contribute $0 to MRR!
                {
                    _id: new mongoose.Types.ObjectId(),
                    status: "active",
                    billing: { cycle: "lifetime", lifetime: { amountPaid: 1500 } },
                    planId: { key: "platinum", priceMonthly: 200, priceYearly: 2000 },
                    updatedAt: new Date(),
                },
                // 4. Suspended monthly gym ($300/mo) -> MUST contribute $0 to MRR
                {
                    _id: new mongoose.Types.ObjectId(),
                    status: "suspended",
                    billing: { cycle: "monthly" },
                    planId: { key: "basic", priceMonthly: 300, priceYearly: 3000 },
                    updatedAt: new Date(),
                },
            ];

            const mockLedgerEvents = [
                { type: "purchase", cycle: "monthly", amount: 500 },
                { type: "purchase", cycle: "yearly", amount: 1200 },
                { type: "purchase", cycle: "lifetime", amount: 1500 },
                { type: "refund", cycle: "monthly", amount: 100 },
            ];

            vi.spyOn(Tenant, "find").mockReturnValue({
                populate: vi.fn().mockResolvedValue(mockTenants),
            });
            vi.spyOn(BillingEvent, "find").mockResolvedValue(mockLedgerEvents);
            vi.spyOn(Member.collection, "countDocuments").mockResolvedValue(50);
            vi.spyOn(User.collection, "countDocuments").mockResolvedValue(3);

            const testDate = new Date("2026-11-05T00:00:00Z");
            const snapshot = await computeDailySnapshot(testDate);

            // MRR = 500 (monthly) + 100 (yearly/12) = 600
            expect(snapshot.revenue.mrr).toBe(600);
            // ARR = 600 * 12 = 7200
            expect(snapshot.revenue.arr).toBe(7200);

            // One-time lifetime capital collected = 1500
            expect(snapshot.revenue.lifetimeRevenueTotal).toBe(1500);

            // Total gross collected = 500 + 1200 + 1500 = 3200
            expect(snapshot.revenue.totalCollected).toBe(3200);

            // Total refunds = 100
            expect(snapshot.revenue.refundsTotal).toBe(100);

            // Net revenue = 3200 - 100 = 3100
            expect(snapshot.revenue.netRevenue).toBe(3100);
        });

        it("detects inactive churn risks and capacity upsell candidates", async () => {
            const oldDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000); // 20 days ago

            const mockTenants = [
                // Inactive gym (> 14 days)
                {
                    _id: new mongoose.Types.ObjectId(),
                    status: "active",
                    billing: { cycle: "monthly" },
                    planId: { key: "basic", priceMonthly: 500, limits: { maxMembers: 100 } },
                    lastActivityAt: oldDate,
                },
                // Upsell candidate (member count >= 80% limit)
                {
                    _id: new mongoose.Types.ObjectId(),
                    status: "active",
                    billing: { cycle: "monthly" },
                    planId: { key: "basic", priceMonthly: 500, limits: { maxMembers: 100 } },
                    lastActivityAt: new Date(),
                },
            ];

            vi.spyOn(Tenant, "find").mockReturnValue({
                populate: vi.fn().mockResolvedValue(mockTenants),
            });
            vi.spyOn(BillingEvent, "find").mockResolvedValue([]);

            // First tenant has 10 members, second tenant has 90 members (out of 100 max)
            vi.spyOn(Member.collection, "countDocuments")
                .mockResolvedValueOnce(10)
                .mockResolvedValueOnce(90);
            vi.spyOn(User.collection, "countDocuments").mockResolvedValue(2);

            const snapshot = await computeDailySnapshot(new Date());

            expect(snapshot.health.churnRisks).toBe(1);
            expect(snapshot.health.upsellCandidates).toBe(1);
        });
    });
});
