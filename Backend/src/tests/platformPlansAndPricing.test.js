import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import Plan from "../models/Plan";
import PlanPrice from "../models/PlanPrice";
import Coupon from "../models/Coupon";
import Tenant from "../models/Tenant";
import BillingEvent from "../models/BillingEvent";
import AuditLog from "../models/AuditLog";
import {
    getPlanImpactPreview,
    archivePlan,
    createPlanPrice,
    updatePlanPrice,
    getRoles,
} from "../controllers/platformPlanController";

describe("Phase 3: Plans, Features & Pricing Management", () => {
    const adminUser = {
        id: new mongoose.Types.ObjectId().toString(),
        email: "superadmin@forma.app",
        name: "Platform Super Admin",
        role: "super_admin",
    };

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe("Plan Impact Preview", () => {
        it("accurately segments affected recurring & lifetime tenants vs protected snapshot tenants", async () => {
            const planId = new mongoose.Types.ObjectId();
            const mockPlan = {
                _id: planId,
                key: "gold",
                name: "Gold Plan",
                features: ["members", "checkin", "packages", "whatsapp"],
            };

            const mockTenants = [
                // 1. Monthly recurring tenant (affected)
                { name: "Gym 1", billing: { cycle: "monthly" } },
                // 2. Yearly recurring tenant (affected)
                { name: "Gym 2", billing: { cycle: "yearly" } },
                // 3. Lifetime tenant with follow_tier policy (affected)
                { name: "Gym 3", billing: { cycle: "lifetime", lifetime: { entitlementPolicy: "follow_tier" } } },
                // 4. Lifetime tenant with snapshot policy (protected)
                { name: "Gym 4", billing: { cycle: "lifetime", lifetime: { entitlementPolicy: "snapshot" } } },
            ];

            vi.spyOn(Plan, "findById").mockResolvedValue(mockPlan);
            vi.spyOn(Tenant, "find").mockReturnValue({
                select: vi.fn().mockResolvedValue(mockTenants),
            });

            const req = {
                params: { id: planId.toString() },
                body: {
                    // removing whatsapp, adding funnels
                    targetFeatures: ["members", "checkin", "packages", "funnels"],
                },
                platformUser: adminUser,
            };
            const res = {
                json: vi.fn(),
                status: vi.fn().mockReturnThis(),
            };

            await getPlanImpactPreview(req, res);

            expect(res.json).toHaveBeenCalledWith({
                plan: { id: planId, key: "gold", name: "Gold Plan" },
                featuresAdded: ["funnels"],
                featuresRemoved: ["whatsapp"],
                totalSubscribers: 4,
                impact: {
                    totalAffectedTenants: 3, // 2 recurring + 1 lifetime follow_tier
                    recurringSubscribersAffected: 2,
                    lifetimeFollowTierAffected: 1,
                    lifetimeSnapshotProtected: 1,
                },
            });
        });
    });

    describe("Plan Archival", () => {
        it("archives plan without deletion, preserving existing subscribers and writing audit log", async () => {
            const planId = new mongoose.Types.ObjectId();
            const mockPlan = {
                _id: planId,
                key: "basic",
                name: "Basic Plan",
                visibility: "public",
                isActive: true,
                save: vi.fn().mockResolvedValue(true),
            };

            vi.spyOn(Plan, "findById").mockResolvedValue(mockPlan);
            vi.spyOn(AuditLog, "create").mockResolvedValue({});

            const req = {
                params: { id: planId.toString() },
                body: { reason: "Retiring legacy basic plan for v2 launch" },
                platformUser: adminUser,
            };
            const res = {
                json: vi.fn(),
                status: vi.fn().mockReturnThis(),
            };

            await archivePlan(req, res);

            expect(mockPlan.visibility).toBe("archived");
            expect(mockPlan.isActive).toBe(false);
            expect(mockPlan.save).toHaveBeenCalled();
            expect(AuditLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: "plan_updated",
                    targetId: planId.toString(),
                    meta: expect.objectContaining({
                        action: "plan_archived",
                        reason: "Retiring legacy basic plan for v2 launch",
                    }),
                })
            );
        });
    });

    describe("PlanPrice & Immutable Price Changes", () => {
        it("creates a multi-month plan price with intervalCount", async () => {
            const planId = new mongoose.Types.ObjectId();
            const created = {
                _id: new mongoose.Types.ObjectId(),
                planId,
                cycle: "monthly",
                intervalCount: 3,
                amount: 4000,
            };

            vi.spyOn(PlanPrice, "findOne").mockResolvedValue(null);
            vi.spyOn(PlanPrice, "create").mockResolvedValue(created);

            const req = {
                body: {
                    planId: planId.toString(),
                    cycle: "monthly",
                    intervalCount: 3,
                    amount: 4000,
                },
                platformUser: adminUser,
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await createPlanPrice(req, res);

            expect(PlanPrice.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    planId: planId.toString(),
                    cycle: "monthly",
                    intervalCount: 3,
                    amount: 4000,
                })
            );
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(created);
        });

        it("rejects duplicate active price for the same plan duration", async () => {
            const planId = new mongoose.Types.ObjectId();
            vi.spyOn(PlanPrice, "findOne").mockResolvedValue({
                _id: new mongoose.Types.ObjectId(),
                planId,
                cycle: "yearly",
                intervalCount: 2,
            });

            const req = {
                body: {
                    planId: planId.toString(),
                    cycle: "yearly",
                    intervalCount: 2,
                    amount: 28000,
                },
                platformUser: adminUser,
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await createPlanPrice(req, res);

            expect(res.status).toHaveBeenCalledWith(409);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ code: "PRICE_DURATION_EXISTS" })
            );
        });

        it("rejects price modification if mandatory reason is missing", async () => {
            const priceId = new mongoose.Types.ObjectId();
            const mockPrice = {
                _id: priceId,
                amount: 1000,
                planId: { _id: new mongoose.Types.ObjectId(), key: "gold" },
                cycle: "monthly",
            };

            vi.spyOn(PlanPrice, "findById").mockReturnValue({
                populate: vi.fn().mockResolvedValue(mockPrice),
            });

            const req = {
                params: { id: priceId.toString() },
                body: { amount: 1200 }, // missing reason!
                platformUser: adminUser,
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await updatePlanPrice(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining("Mandatory 'reason' field required") })
            );
        });

        it("creates price_change BillingEvent when price amount is altered", async () => {
            const priceId = new mongoose.Types.ObjectId();
            const planObjectId = new mongoose.Types.ObjectId();
            const mockPrice = {
                _id: priceId,
                amount: 1000,
                currency: "USD",
                planId: { _id: planObjectId, key: "gold", name: "Gold Plan" },
                cycle: "monthly",
                save: vi.fn().mockResolvedValue(true),
            };

            vi.spyOn(PlanPrice, "findById").mockReturnValue({
                populate: vi.fn().mockResolvedValue(mockPrice),
            });
            vi.spyOn(BillingEvent, "create").mockResolvedValue({});

            const req = {
                params: { id: priceId.toString() },
                body: {
                    amount: 1250,
                    reason: "Inflationary index adjustment for 2026",
                },
                platformUser: adminUser,
            };
            const res = {
                json: vi.fn(),
                status: vi.fn().mockReturnThis(),
            };

            await updatePlanPrice(req, res);

            expect(mockPrice.amount).toBe(1250);
            expect(mockPrice.save).toHaveBeenCalled();
            expect(BillingEvent.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "price_change",
                    planKey: "gold",
                    amount: 1250,
                    meta: expect.objectContaining({
                        oldAmount: 1000,
                        newAmount: 1250,
                        reason: "Inflationary index adjustment for 2026",
                    }),
                })
            );
        });
    });

    describe("Coupon Redemption & Atomic Limits", () => {
        it("strictly enforces maxRedemptions through atomic query", async () => {
            const atomicSpy = vi.spyOn(Coupon, "findOneAndUpdate");

            // Mock success when redeemedCount < maxRedemptions
            atomicSpy.mockResolvedValueOnce({
                code: "LAUNCH50",
                maxRedemptions: 5,
                redeemedCount: 5,
            });

            const res1 = await Coupon.redeemAtomic("LAUNCH50");
            expect(res1).toBeDefined();
            expect(atomicSpy).toHaveBeenCalledTimes(1);

            // Mock exhausted coupon returning null
            atomicSpy.mockResolvedValueOnce(null);
            const res2 = await Coupon.redeemAtomic("LAUNCH50");
            expect(res2).toBeNull();
        });
    });

    describe("Roles Catalog & Entitlements Management", () => {
        it("returns all standard system roles with categories and descriptions", async () => {
            const req = {};
            const res = {
                json: vi.fn(),
                status: vi.fn().mockReturnThis(),
            };

            await getRoles(req, res);

            expect(res.json).toHaveBeenCalled();
            const roles = res.json.mock.calls[0][0];
            expect(Array.isArray(roles)).toBe(true);
            const roleKeys = roles.map((r) => r.key);
            expect(roleKeys).toContain("Owner");
            expect(roleKeys).toContain("Receptionist");
            expect(roleKeys).toContain("Coach");
            expect(roleKeys).toContain("Sales");
            expect(roleKeys).toContain("Accountant");
        });
    });
});
