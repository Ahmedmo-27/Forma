/**
 * Phase 3 — Business-logic abuse spot checks (refunds, quotas, plan gates, past_due).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import Member from "../../models/Member";
import { refund } from "../../controllers/memberController";
import {
    enforceMemberLimit,
    enforceSubscriptionStatus,
} from "../../middleware/tenantStatus";
import { requireFeature } from "../../middleware/featureGating";
import AuditLog from "../../models/AuditLog";
import { runWithTenant } from "../../context/tenantContext";

describe("Security Phase 3: business logic abuse", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(AuditLog, "create").mockResolvedValue({});
    });

    it("rejects refund replay that would exceed max refundable", async () => {
        const memberId = new mongoose.Types.ObjectId().toString();
        const mockMember = {
            _id: memberId,
            status: "active",
            isMember: true,
            subscriptions: [{ pricePaid: 500, refundAmount: 500 }],
            save: vi.fn().mockResolvedValue(true),
        };
        vi.spyOn(Member, "findById").mockResolvedValue(mockMember);

        const req = {
            body: { memberID: memberId, refund_amount: 1, reason: "replay" },
            user: { id: "owner1" },
            tenant: { settings: { locale: { currency: "EGP" } } },
        };
        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn(),
        };

        await refund(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(mockMember.save).not.toHaveBeenCalled();
    });

    it("enforces member quota server-side when at cap", async () => {
        const tenantId = new mongoose.Types.ObjectId().toString();
        vi.spyOn(Member, "countDocuments").mockResolvedValue(100);

        const req = {
            user: { tenantId },
            tenant: {
                status: "active",
                planId: { limits: { maxMembers: 100 } },
                limitOverrides: {},
            },
            plan: { limits: { maxMembers: 100 }, features: ["members"] },
        };
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        const next = vi.fn();

        await runWithTenant({ tenantId }, () => enforceMemberLimit(req, res, next));

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it("blocks mutations when subscription is past_due", async () => {
        const req = {
            method: "POST",
            user: { tenantId: new mongoose.Types.ObjectId().toString() },
            tenant: { status: "past_due", billing: { cycle: "monthly" } },
            plan: { features: ["members"] },
            requestId: "pd-1",
        };
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        const next = vi.fn();

        await enforceSubscriptionStatus(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: "SUBSCRIPTION_PAST_DUE" })
        );
    });

    it("blocks accounting feature on basic feature set", async () => {
        const req = {
            user: { tenantId: "t1" },
            tenant: { status: "active", featureOverrides: { add: [], remove: [] } },
            plan: { features: ["members", "checkin"], allowedRoles: ["Owner"] },
        };
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        const next = vi.fn();
        await requireFeature("accounting")(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });
});
