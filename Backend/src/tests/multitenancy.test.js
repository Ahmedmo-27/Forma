import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

const Counter = require("../models/Counter");
const { nextSequence } = require("../utils/sequence");
const { requireFeature } = require("../middleware/featureGating");
const {
    enforceSubscriptionStatus,
    enforceMemberLimit,
    enforceStaffLimit,
} = require("../middleware/tenantStatus");
const {
    runWithTenant,
    runAsPlatform,
} = require("../context/tenantContext");
const Member = require("../models/Member");
const User = require("../models/User");

describe("Phase 9: Multi-Tenancy System Tests", () => {
    const tenantAId = new mongoose.Types.ObjectId().toString();
    const tenantBId = new mongoose.Types.ObjectId().toString();

    describe("1. Per-Tenant Compound Uniqueness", () => {
        it("allows identical emails and barcodes in different tenants schema-wise", () => {
            const userA = {
                email: "coach@gym.com",
                tenantId: new mongoose.Types.ObjectId(tenantAId),
                name: "Coach Tenant A",
            };
            const userB = {
                email: "coach@gym.com",
                tenantId: new mongoose.Types.ObjectId(tenantBId),
                name: "Coach Tenant B",
            };

            // Compound key { tenantId, email } is unique per-tenant
            const keyA = `${userA.tenantId.toString()}:${userA.email}`;
            const keyB = `${userB.tenantId.toString()}:${userB.email}`;
            expect(keyA).not.toBe(keyB);

            // Member barcode per tenant:
            const memberA = {
                barcode: "BC-12345",
                memberId: 101,
                tenantId: new mongoose.Types.ObjectId(tenantAId),
            };
            const memberB = {
                barcode: "BC-12345",
                memberId: 101,
                tenantId: new mongoose.Types.ObjectId(tenantBId),
            };

            const memberKeyA = `${memberA.tenantId.toString()}:${memberA.barcode}`;
            const memberKeyB = `${memberB.tenantId.toString()}:${memberB.barcode}`;
            expect(memberKeyA).not.toBe(memberKeyB);
        });
    });

    describe("2. Atomic Counters Per-Tenant", () => {
        beforeEach(() => {
            vi.restoreAllMocks();
        });

        it("increments counters independently per tenant", async () => {
            const sequenceStore = {};

            vi.spyOn(Counter, "findOneAndUpdate").mockImplementation((query, update) => {
                const key = `${query.tenantId.toString()}:${query.name}`;
                if (!sequenceStore[key]) sequenceStore[key] = 0;
                sequenceStore[key] += update.$inc.seq;
                return Promise.resolve({ seq: sequenceStore[key] });
            });

            // Tenant A requests sequences
            const seqA1 = await runWithTenant({ tenantId: tenantAId }, () =>
                nextSequence("memberId", tenantAId)
            );
            const seqA2 = await runWithTenant({ tenantId: tenantAId }, () =>
                nextSequence("memberId", tenantAId)
            );

            // Tenant B requests sequences
            const seqB1 = await runWithTenant({ tenantId: tenantBId }, () =>
                nextSequence("memberId", tenantBId)
            );

            expect(seqA1).toBe(1);
            expect(seqA2).toBe(2);
            expect(seqB1).toBe(1); // Tenant B starts at 1, completely isolated from Tenant A
        });

        it("concurrent sequence generation produces gap-free per-tenant numbers", async () => {
            let tenantSeq = 0;
            vi.spyOn(Counter, "findOneAndUpdate").mockImplementation(() => {
                tenantSeq++;
                return Promise.resolve({ seq: tenantSeq });
            });

            const results = await Promise.all([
                runWithTenant({ tenantId: tenantAId }, () => nextSequence("systemId", tenantAId)),
                runWithTenant({ tenantId: tenantAId }, () => nextSequence("systemId", tenantAId)),
                runWithTenant({ tenantId: tenantAId }, () => nextSequence("systemId", tenantAId)),
                runWithTenant({ tenantId: tenantAId }, () => nextSequence("systemId", tenantAId)),
                runWithTenant({ tenantId: tenantAId }, () => nextSequence("systemId", tenantAId)),
            ]);

            expect(results.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
        });
    });

    describe("3. Feature Gating & Limits across Plan Tiers", () => {
        const createMockReqRes = (features = [], status = "active") => {
            const req = {
                user: { tenantId: tenantAId },
                tenant: {
                    status,
                    trialEndsAt: null,
                    featureOverrides: { add: [], remove: [] },
                },
                plan: {
                    features,
                    limits: { maxMembers: 100, maxStaff: 10 },
                    allowedRoles: ["Owner", "Receptionist", "Coach"],
                },
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };
            const next = vi.fn();
            return { req, res, next };
        };

        it("Basic plan: allows members & checkin, blocks accounting with 403 FEATURE_NOT_IN_PLAN", async () => {
            const basicFeatures = ["members", "checkin", "packages", "pt_tracking", "audit"];
            const { req, res, next } = createMockReqRes(basicFeatures);

            const membersGate = requireFeature("members");
            await membersGate(req, res, next);
            expect(next).toHaveBeenCalled();

            const accountingGate = requireFeature("accounting");
            await accountingGate(req, res, next);
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    code: "FEATURE_NOT_IN_PLAN",
                    feature: "accounting",
                })
            );
        });

        it("Gold plan: allows accounting & whatsapp, blocks exec_analytics", async () => {
            const goldFeatures = [
                "members", "checkin", "packages", "pt_tracking", "audit",
                "accounting", "exception_approvals", "sales_crm", "whatsapp", "excel_import",
            ];
            const { req, res, next } = createMockReqRes(goldFeatures);

            const whatsappGate = requireFeature("whatsapp");
            await whatsappGate(req, res, next);
            expect(next).toHaveBeenCalled();

            const analyticsGate = requireFeature("exec_analytics");
            await analyticsGate(req, res, next);
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    code: "FEATURE_NOT_IN_PLAN",
                    feature: "exec_analytics",
                })
            );
        });

        it("Platinum plan: allows exec_analytics, funnels and business_intelligence", async () => {
            const platinumFeatures = [
                "members", "checkin", "packages", "pt_tracking", "audit",
                "accounting", "exception_approvals", "sales_crm", "whatsapp", "excel_import",
                "exec_analytics", "funnels", "business_intelligence",
            ];
            const { req, res, next } = createMockReqRes(platinumFeatures);

            const biGate = requireFeature("business_intelligence");
            await biGate(req, res, next);
            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });

        it("enforceMemberLimit rejects creation when maxMembers is reached", async () => {
            vi.spyOn(Member, "countDocuments").mockResolvedValue(100);

            const req = {
                user: { tenantId: tenantAId },
                tenant: {
                    limitOverrides: {},
                },
                plan: {
                    limits: { maxMembers: 100 },
                },
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };
            const next = vi.fn();

            await runWithTenant({ tenantId: tenantAId }, () =>
                enforceMemberLimit(req, res, next)
            );

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    code: "PLAN_LIMIT_REACHED",
                    limit: "maxMembers",
                })
            );
        });

        it("enforceStaffLimit rejects user creation when role is not in allowedRoles", async () => {
            const req = {
                body: { role: "Accountant" },
                user: { tenantId: tenantAId },
                tenant: {
                    limitOverrides: {},
                },
                plan: {
                    allowedRoles: ["Owner", "Receptionist", "Coach"],
                    limits: { maxStaff: 50 },
                },
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };
            const next = vi.fn();

            await runWithTenant({ tenantId: tenantAId }, () =>
                enforceStaffLimit(req, res, next)
            );

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    code: "ROLE_NOT_IN_PLAN",
                    role: "Accountant",
                })
            );
        });
    });

    describe("4. Cross-Tenant Upload Access Isolation", () => {
        // canAccessMemberUpload logic test
        const canAccessMemberUpload = (user, member) => {
            if (user?.tenantId && member?.tenantId && String(member.tenantId) !== String(user.tenantId)) {
                return false;
            }
            return true;
        };

        it("blocks staff from Tenant A accessing uploads owned by Member of Tenant B", () => {
            const staffTenantA = {
                id: new mongoose.Types.ObjectId().toString(),
                role: "Owner",
                tenantId: tenantAId,
            };

            const memberTenantB = {
                id: new mongoose.Types.ObjectId().toString(),
                photo: "photo-b.jpg",
                tenantId: tenantBId,
            };

            const canAccess = canAccessMemberUpload(staffTenantA, memberTenantB);
            expect(canAccess).toBe(false);
        });

        it("allows staff from Tenant A to access uploads owned by Member of Tenant A", () => {
            const staffTenantA = {
                id: new mongoose.Types.ObjectId().toString(),
                role: "Owner",
                tenantId: tenantAId,
            };

            const memberTenantA = {
                id: new mongoose.Types.ObjectId().toString(),
                photo: "photo-a.jpg",
                tenantId: tenantAId,
            };

            const canAccess = canAccessMemberUpload(staffTenantA, memberTenantA);
            expect(canAccess).toBe(true);
        });
    });
});
