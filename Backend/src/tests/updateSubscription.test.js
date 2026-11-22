import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRequire } from "module";
import mongoose from "mongoose";

const require = createRequire(import.meta.url);
const Member = require("../models/Member");
const User = require("../models/User");
const ContractSignature = require("../models/ContractSignature");
const AuditLog = require("../models/AuditLog");
const { runWithTenant } = require("../context/tenantContext");
const { updateSubscriptionSchema } = require("../validation/schemas");
const { updateSubscription } = require("../controllers/memberController");

const tenantId = new mongoose.Types.ObjectId();
const owner = {
    id: new mongoose.Types.ObjectId().toString(),
    name: "Owner",
    role: "Owner",
    tenantId: String(tenantId),
};

function mockRes() {
    return { status: vi.fn().mockReturnThis(), json: vi.fn() };
}

function openSubscription(overrides = {}) {
    const subId = new mongoose.Types.ObjectId();
    return {
        _id: subId,
        subscriptionId: 501,
        package: new mongoose.Types.ObjectId(),
        packageSnapshot: {
            name: "Gold 3 Months",
            activityType: "gym",
            duration: "3 months",
            price: 3000,
            freezeLimitDays: 10,
            invitationLimit: 2,
            renewalDiscountPercent: 10,
            description: null,
            hasException: false,
            free_pt_sessions: 0,
            locationScope: "all",
            eligibleLocationIds: [],
        },
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-04-01"),
        pricePaid: 3000,
        discountPercent: 0,
        refundAmount: 0,
        refunded: false,
        cancelled: false,
        subscriptionStatus: "active",
        ...overrides,
        _id: overrides._id || subId,
    };
}

function memberWithSub(subOverrides = {}, memberOverrides = {}) {
    const sub = openSubscription(subOverrides);
    const member = {
        _id: new mongoose.Types.ObjectId(),
        name: "Omar Adel",
        systemId: 1042,
        memberId: 77,
        freezeDaysUsed: 0,
        invitationsUsed: 0,
        subscriptions: [sub],
        userlog: [],
        markModified: vi.fn(),
        save: vi.fn().mockResolvedValue(undefined),
        ...memberOverrides,
        subscriptions: memberOverrides.subscriptions || [sub],
    };
    vi.spyOn(Member, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(member),
    });
    return { member, sub };
}

const inTenant = (fn) => runWithTenant({ tenantId: String(tenantId) }, fn);

describe("updateSubscriptionSchema", () => {
    it("requires at least one field", () => {
        expect(updateSubscriptionSchema.safeParse({}).success).toBe(false);
    });

    it("accepts a partial freeze limit update", () => {
        const result = updateSubscriptionSchema.safeParse({ freezeLimitDays: 15 });
        expect(result.success).toBe(true);
        expect(result.data.freezeLimitDays).toBe(15);
    });

    it("accepts zero pricePaid on edit", () => {
        const result = updateSubscriptionSchema.safeParse({ pricePaid: 0 });
        expect(result.success).toBe(true);
    });
});

describe("updateSubscription", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(AuditLog, "create").mockResolvedValue({});
        vi.spyOn(ContractSignature, "exists").mockResolvedValue(null);
    });

    it("updates snapshot terms and pricePaid for Owner", async () => {
        const { member, sub } = memberWithSub();
        const res = mockRes();

        await inTenant(() =>
            updateSubscription(
                {
                    params: { memberId: "1042", subscriptionId: String(sub._id) },
                    body: { freezeLimitDays: 20, pricePaid: 2800, reason: "Desk correction" },
                    user: owner,
                },
                res
            )
        );

        expect(res.status).toHaveBeenCalledWith(200);
        expect(sub.packageSnapshot.freezeLimitDays).toBe(20);
        expect(sub.packageSnapshot.hasException).toBe(true);
        expect(sub.pricePaid).toBe(2800);
        expect(member.save).toHaveBeenCalled();
        expect(member.userlog.at(-1).text).toContain("Desk correction");
        expect(AuditLog.create).toHaveBeenCalled();
    });

    it("allows Sales Manager and General Manager", async () => {
        for (const role of ["Sales Manager", "General Manager"]) {
            vi.restoreAllMocks();
            vi.spyOn(AuditLog, "create").mockResolvedValue({});
            vi.spyOn(ContractSignature, "exists").mockResolvedValue(null);
            const { sub } = memberWithSub();
            const res = mockRes();

            await inTenant(() =>
                updateSubscription(
                    {
                        params: { memberId: "1042", subscriptionId: "501" },
                        body: { invitationLimit: 5 },
                        user: { ...owner, role },
                    },
                    res
                )
            );

            expect(res.status).toHaveBeenCalledWith(200);
            expect(sub.packageSnapshot.invitationLimit).toBe(5);
        }
    });

    it("rejects edits when a contract is already signed", async () => {
        const { sub } = memberWithSub();
        vi.spyOn(ContractSignature, "exists").mockResolvedValue(true);
        const res = mockRes();

        await inTenant(() =>
            updateSubscription(
                {
                    params: { memberId: "1042", subscriptionId: String(sub._id) },
                    body: { pricePaid: 2500 },
                    user: owner,
                },
                res
            )
        );

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json.mock.calls[0][0].code).toBe("CONTRACT_ALREADY_SIGNED");
    });

    it("rejects edits on cancelled subscriptions", async () => {
        const { sub } = memberWithSub({ cancelled: true, subscriptionStatus: "cancelled" });
        const res = mockRes();

        await inTenant(() =>
            updateSubscription(
                {
                    params: { memberId: "1042", subscriptionId: String(sub._id) },
                    body: { pricePaid: 2500 },
                    user: owner,
                },
                res
            )
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].message).toMatch(/refunded|cancelled|transferred/i);
    });

    it("rejects freeze limit below days already used for a current package", async () => {
        const now = new Date();
        const start = new Date(now);
        start.setMonth(start.getMonth() - 1);
        const end = new Date(now);
        end.setMonth(end.getMonth() + 2);

        const { sub } = memberWithSub(
            { startDate: start, endDate: end },
            { freezeDaysUsed: 8 }
        );
        const res = mockRes();

        await inTenant(() =>
            updateSubscription(
                {
                    params: { memberId: "1042", subscriptionId: String(sub._id) },
                    body: { freezeLimitDays: 5 },
                    user: owner,
                },
                res
            )
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].message).toMatch(/Freeze limit/i);
    });

    it("rejects invitation slots below invitations already used", async () => {
        const now = new Date();
        const start = new Date(now);
        start.setMonth(start.getMonth() - 1);
        const end = new Date(now);
        end.setMonth(end.getMonth() + 2);

        const { sub } = memberWithSub(
            { startDate: start, endDate: end },
            { invitationsUsed: 3 }
        );
        const res = mockRes();

        await inTenant(() =>
            updateSubscription(
                {
                    params: { memberId: "1042", subscriptionId: String(sub._id) },
                    body: { invitationLimit: 1 },
                    user: owner,
                },
                res
            )
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].message).toMatch(/Invitation slots/i);
    });

    it("recomputes endDate when duration changes", async () => {
        const { sub } = memberWithSub({
            startDate: new Date("2026-01-15"),
            endDate: new Date("2026-04-15"),
        });
        const res = mockRes();

        await inTenant(() =>
            updateSubscription(
                {
                    params: { memberId: "1042", subscriptionId: String(sub._id) },
                    body: { duration: "1 month" },
                    user: owner,
                },
                res
            )
        );

        expect(res.status).toHaveBeenCalledWith(200);
        expect(sub.packageSnapshot.duration).toBe("1 month");
        expect(new Date(sub.endDate).toISOString().slice(0, 10)).toBe("2026-02-15");
    });

    it("assigns a sales person even when the contract is signed", async () => {
        const salesId = new mongoose.Types.ObjectId();
        const { sub } = memberWithSub();
        vi.spyOn(ContractSignature, "exists").mockResolvedValue(true);
        vi.spyOn(User, "findById").mockReturnValue({
            select: vi.fn().mockResolvedValue({ _id: salesId, name: "Sara Sales", role: "Sales" }),
        });
        const res = mockRes();

        await inTenant(() =>
            updateSubscription(
                {
                    params: { memberId: "1042", subscriptionId: String(sub._id) },
                    body: { salesPersonId: String(salesId) },
                    user: owner,
                },
                res
            )
        );

        expect(res.status).toHaveBeenCalledWith(200);
        expect(String(sub.salesManager)).toBe(String(salesId));
    });

    it("rejects term edits on signed contracts but still validates sales role", async () => {
        const { sub } = memberWithSub();
        vi.spyOn(ContractSignature, "exists").mockResolvedValue(true);
        const res = mockRes();

        await inTenant(() =>
            updateSubscription(
                {
                    params: { memberId: "1042", subscriptionId: String(sub._id) },
                    body: { pricePaid: 2500, salesPersonId: new mongoose.Types.ObjectId().toString() },
                    user: owner,
                },
                res
            )
        );

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json.mock.calls[0][0].code).toBe("CONTRACT_ALREADY_SIGNED");
    });
});
