import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

const Tenant = require("../models/Tenant");
const Plan = require("../models/Plan");
const PlanPrice = require("../models/PlanPrice");
const BillingEvent = require("../models/BillingEvent");
const AuditLog = require("../models/AuditLog");
const { getEffectiveFeatures } = require("../models/Tenant");
const { enforceSubscriptionStatus } = require("../middleware/tenantStatus");
const { processTenantExpiryCycles } = require("../services/billing/tenantLifecycleService");
const billingService = require("../services/billing/billingService");
const { runWithTenant, runAsPlatform } = require("../context/tenantContext");
const { publicSignupSchema } = require("../validation/schemas");

describe("Phase 6: Lifetime Billing Test Suite", () => {
    const tenantId = new mongoose.Types.ObjectId().toString();
    const actorId = new mongoose.Types.ObjectId().toString();

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(mongoose, "startSession").mockResolvedValue({
            startTransaction: vi.fn(),
            commitTransaction: vi.fn(),
            abortTransaction: vi.fn(),
            endSession: vi.fn(),
        });
    });

    describe("1. Lifetime Tenant Never Expires (Time Travel Simulation)", () => {
        it("allows mutation and query access 10 years in future past trial and currentPeriodEnd", async () => {
            const pastDate = new Date("2024-01-01T00:00:00Z");
            const futureDate = new Date("2036-01-01T00:00:00Z"); // 10+ years in future

            const req = {
                method: "POST",
                user: { tenantId, id: actorId, role: "Owner" },
                tenant: {
                    _id: new mongoose.Types.ObjectId(tenantId),
                    status: "active",
                    trialEndsAt: pastDate, // Expired trial date
                    currentPeriodEnd: pastDate, // Expired period end date
                    billing: {
                        cycle: "lifetime",
                        lifetime: {
                            purchasedAt: pastDate,
                            entitlementPolicy: "follow_tier",
                        },
                    },
                },
            };

            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };
            const next = vi.fn();

            // Simulate execution at futureDate
            vi.setSystemTime(futureDate);

            await enforceSubscriptionStatus(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();

            vi.useRealTimers();
        });

        it("still respects suspended state if lifetime tenant is revoked or suspended for abuse", async () => {
            const req = {
                method: "POST",
                user: { tenantId, id: actorId, role: "Owner" },
                tenant: {
                    _id: new mongoose.Types.ObjectId(tenantId),
                    status: "suspended", // Revoked / suspended
                    billing: {
                        cycle: "lifetime",
                        lifetime: {
                            revokedAt: new Date(),
                            revokeReason: "Chargeback received",
                        },
                    },
                },
            };

            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };
            const next = vi.fn();

            await enforceSubscriptionStatus(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                code: "TENANT_SUSPENDED",
            }));
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe("2. Cron / Webhook Expiry Regression Safeguard", () => {
        it("explicitly skips lifetime tenants in expiry/downgrade jobs", async () => {
            const mockUpdateMany = vi.spyOn(Tenant, "updateMany").mockResolvedValue({ modifiedCount: 3 });

            const testNow = new Date("2026-11-05T00:00:00Z");
            const result = await processTenantExpiryCycles(testNow);

            expect(mockUpdateMany).toHaveBeenCalledTimes(2);

            // Both queries MUST filter out lifetime cycle: "billing.cycle": { $ne: "lifetime" }
            const query1 = mockUpdateMany.mock.calls[0][0];
            const query2 = mockUpdateMany.mock.calls[1][0];

            expect(query1["billing.cycle"]).toEqual({ $ne: "lifetime" });
            expect(query2["billing.cycle"]).toEqual({ $ne: "lifetime" });
            expect(result.expiredTrials).toBe(3);
        });
    });

    describe("3. Entitlement Policy: follow_tier vs snapshot", () => {
        it("follow_tier automatically inherits newly added tier features", () => {
            // Plan evolves: product team adds new feature 'business_intelligence'
            const evolvingPlan = {
                key: "gold",
                features: ["members", "checkin", "packages", "whatsapp", "business_intelligence"],
            };

            const tenantFollow = {
                billing: {
                    cycle: "lifetime",
                    lifetime: {
                        entitlementPolicy: "follow_tier",
                        featureSnapshot: ["members", "checkin", "packages"], // Old snapshot ignored
                    },
                },
                featureOverrides: { add: [], remove: [] },
            };

            const effective = getEffectiveFeatures(tenantFollow, evolvingPlan);
            expect(effective).toContain("business_intelligence");
            expect(effective).toContain("whatsapp");
        });

        it("snapshot freezes features at purchase time and does not inherit new tier features", () => {
            const evolvingPlan = {
                key: "gold",
                features: ["members", "checkin", "packages", "whatsapp", "business_intelligence"],
            };

            const tenantSnapshot = {
                billing: {
                    cycle: "lifetime",
                    lifetime: {
                        entitlementPolicy: "snapshot",
                        featureSnapshot: ["members", "checkin", "packages"], // Frozen snapshot
                    },
                },
                featureOverrides: { add: [], remove: [] },
            };

            const effective = getEffectiveFeatures(tenantSnapshot, evolvingPlan);
            expect(effective).toContain("members");
            expect(effective).toContain("checkin");
            expect(effective).toContain("packages");
            expect(effective).not.toContain("whatsapp");
            expect(effective).not.toContain("business_intelligence");
        });

        it("snapshot still respects manual featureOverrides (add & remove)", () => {
            const plan = { key: "gold", features: ["members", "checkin"] };
            const tenant = {
                billing: {
                    cycle: "lifetime",
                    lifetime: {
                        entitlementPolicy: "snapshot",
                        featureSnapshot: ["members", "checkin"],
                    },
                },
                featureOverrides: {
                    add: ["whatsapp"],
                    remove: ["checkin"],
                },
            };

            const effective = getEffectiveFeatures(tenant, plan);
            expect(effective).toContain("members");
            expect(effective).toContain("whatsapp");
            expect(effective).not.toContain("checkin");
        });
    });

    describe("4. Upgrade Math, Downgrade Prevention & Idempotency", () => {
        it("rejects new lifetime upgrades (sales disabled)", async () => {
            await expect(
                billingService.upgradeLifetime({
                    tenantId,
                    targetPlanKey: "gold",
                    paymentRef: "UPGRADE-REF-1",
                    actorId: new mongoose.Types.ObjectId(actorId),
                })
            ).rejects.toMatchObject({ code: "LIFETIME_DISABLED" });
        });

        it.skip("calculates exact price difference between higher tier and previously credited amount", async () => {
            const basicPrice = 500;
            const goldPrice = 1300;
            const expectedDiff = goldPrice - basicPrice; // 800

            const tenant = {
                _id: new mongoose.Types.ObjectId(tenantId),
                planId: { key: "basic" },
                billing: {
                    cycle: "lifetime",
                    lifetime: {
                        amountPaid: basicPrice,
                        entitlementPolicy: "follow_tier",
                    },
                },
            };

            vi.spyOn(Tenant, "findById").mockReturnValue({
                populate: vi.fn().mockResolvedValue(tenant),
            });

            vi.spyOn(Plan, "findOne").mockResolvedValue({
                _id: new mongoose.Types.ObjectId(),
                key: "gold",
                name: "Gold Plan",
            });
            vi.spyOn(PlanPrice, "findOne").mockResolvedValue({
                _id: new mongoose.Types.ObjectId(),
                amount: goldPrice,
                currency: "USD",
                maxLifetimeSeats: null,
            });
            vi.spyOn(billingService, "resolveActivePlanPrice").mockResolvedValue({
                plan: { _id: new mongoose.Types.ObjectId(), key: "gold", name: "Gold Plan" },
                planPrice: { _id: new mongoose.Types.ObjectId(), amount: goldPrice, currency: "USD", maxLifetimeSeats: null },
            });

            vi.spyOn(PlanPrice, "findOneAndUpdate").mockResolvedValue({ _id: new mongoose.Types.ObjectId() });
            vi.spyOn(Tenant, "findByIdAndUpdate").mockReturnValue({
                populate: vi.fn().mockResolvedValue({ ...tenant, planId: { key: "gold" } }),
            });
            vi.spyOn(BillingEvent, "create").mockResolvedValue([{ _id: new mongoose.Types.ObjectId(), amount: expectedDiff }]);
            vi.spyOn(AuditLog, "create").mockResolvedValue({});

            const res = await billingService.upgradeLifetime({
                tenantId,
                targetPlanKey: "gold",
                paymentRef: "UPGRADE-REF-1",
                actorId: new mongoose.Types.ObjectId(actorId),
            });

            expect(res.amountDifference).toBe(expectedDiff);
        });

        it("strictly rejects downgrade from Gold to Basic (sales disabled before tier check)", async () => {
            await expect(
                billingService.upgradeLifetime({
                    tenantId,
                    targetPlanKey: "basic",
                    actorId: new mongoose.Types.ObjectId(actorId),
                })
            ).rejects.toMatchObject({ code: "LIFETIME_DISABLED" });
        });

        it("payment confirmation rejects new lifetime purchases", async () => {
            await expect(
                billingService.confirmLifetimePurchase({
                    tenantId,
                    planKey: "basic",
                    paymentRef: "PAY-12345",
                    actorId: new mongoose.Types.ObjectId(actorId),
                })
            ).rejects.toMatchObject({ code: "LIFETIME_DISABLED" });
        });
    });

    describe("5. Seat Cap & Race Condition Protection", () => {
        it("new lifetime purchases are disabled regardless of seat availability", async () => {
            await expect(
                billingService.confirmLifetimePurchase({
                    tenantId,
                    planKey: "platinum",
                    paymentRef: "LAST-SEAT-FAIL",
                    actorId: new mongoose.Types.ObjectId(actorId),
                })
            ).rejects.toMatchObject({ code: "LIFETIME_DISABLED" });
        });
    });

    describe("6. Revocation: Suspended State, Audit & Ledger", () => {
        it("suspends tenant, sets grace period, and creates revoke BillingEvent and AuditLog", async () => {
            const tenant = {
                _id: new mongoose.Types.ObjectId(tenantId),
                planId: { key: "gold" },
                billing: { lifetime: { currency: "USD" } },
            };

            vi.spyOn(Tenant, "findById").mockReturnValue({
                populate: vi.fn().mockResolvedValue(tenant),
            });

            const updateSpy = vi.spyOn(Tenant, "findByIdAndUpdate").mockReturnValue({
                populate: vi.fn().mockResolvedValue({ ...tenant, status: "suspended" }),
            });

            const eventSpy = vi.spyOn(BillingEvent, "create").mockResolvedValue([{ _id: new mongoose.Types.ObjectId() }]);
            const auditSpy = vi.spyOn(AuditLog, "create").mockResolvedValue({});

            const res = await billingService.revokeLifetime({
                tenantId,
                reason: "Chargeback dispute lost",
                actorId: new mongoose.Types.ObjectId(actorId),
                refundAmount: 1300,
                allowGracePeriodDays: 14,
            });

            expect(res.tenant.status).toBe("suspended");
            expect(updateSpy).toHaveBeenCalledWith(
                tenantId,
                expect.objectContaining({
                    $set: expect.objectContaining({
                        status: "suspended",
                        "billing.lifetime.revokeReason": "Chargeback dispute lost",
                    }),
                }),
                expect.anything()
            );

            expect(eventSpy).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        type: "refund",
                        amount: 1300,
                    }),
                ]),
                expect.anything()
            );

            expect(auditSpy).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        action: "lifetime_revoked",
                    }),
                ]),
                expect.anything()
            );
        });
    });

    describe("7. Client Tampering Safeguards", () => {
        it("public signup schema rejects lifetime billing cycle", () => {
            const withLifetime = {
                name: "Test Gym",
                slug: "test-gym",
                ownerName: "Owner",
                ownerEmail: "owner@test.com",
                planKey: "basic",
                cycle: "lifetime",
            };
            expect(publicSignupSchema.safeParse(withLifetime).success).toBe(false);

            const recurring = { ...withLifetime, cycle: "yearly" };
            expect(publicSignupSchema.safeParse(recurring).success).toBe(true);
        });
    });

    describe("8. Immutable Ledger Guard (BillingEvent pre-hooks)", () => {
        it("rejects update or deletion on BillingEvent collection", () => {
            const schema = BillingEvent.schema;
            // Verify pre hooks exist for updateOne, deleteOne, etc.
            const updateOneHooks = schema.s.hooks._pres.get("updateOne") || [];
            expect(updateOneHooks.length).toBeGreaterThan(0);

            const deleteOneHooks = schema.s.hooks._pres.get("deleteOne") || [];
            expect(deleteOneHooks.length).toBeGreaterThan(0);
        });
    });
});
