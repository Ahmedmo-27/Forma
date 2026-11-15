import { createRequire } from "module";
import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import Member from "../models/Member.js";
import AuditLog from "../models/AuditLog.js";
import { refund, transferPackage } from "../controllers/memberController.js";

const require = createRequire(import.meta.url);
const sequence = require("../utils/sequence");

function response() {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
    };
}

describe("package transfer", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(sequence, "nextMemberId").mockResolvedValue(501);
        vi.spyOn(sequence, "nextSubscriptionId").mockResolvedValue(900);
        vi.spyOn(sequence, "nextSystemId").mockResolvedValue(800);
        vi.spyOn(AuditLog, "create").mockResolvedValue({});
    });

    it("rejects a recipient who already has a member id", async () => {
        const donorId = new mongoose.Types.ObjectId();
        const recipientId = new mongoose.Types.ObjectId();
        const donor = {
            _id: donorId,
            name: "Donor",
            systemId: 100,
            status: "active",
            isMember: true,
            subscriptions: [{
                startDate: new Date("2026-01-01T00:00:00.000Z"),
                endDate: new Date("2026-12-01T00:00:00.000Z"),
                pricePaid: 3000,
                packageSnapshot: { name: "Gold" },
            }],
            save: vi.fn(),
        };
        const recipient = {
            _id: recipientId,
            name: "Already a member",
            systemId: 200,
            memberId: 200,
            status: "active",
            isMember: true,
            subscriptions: [],
            save: vi.fn(),
        };

        vi.spyOn(Member, "findById").mockResolvedValue(donor);
        vi.spyOn(Member, "findOne").mockResolvedValue(recipient);

        const res = response();
        await transferPackage({
            params: { memberId: String(donorId) },
            body: { transferFee: 150, recipientSystemId: "S200" },
            user: { id: new mongoose.Types.ObjectId(), role: "Owner", tenantId: "tenant" },
            tenant: { settings: { locale: { currency: "EGP" } } },
        }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            message: "This person already has a membership and cannot receive a transferred package",
        });
        expect(donor.save).not.toHaveBeenCalled();
        expect(recipient.save).not.toHaveBeenCalled();
    });

    it("moves the remaining dates and snapshot, closes the donor, and records the fee without changing pricePaid", async () => {
        const donorId = new mongoose.Types.ObjectId();
        const recipientId = new mongoose.Types.ObjectId();
        const packageId = new mongoose.Types.ObjectId();
        const start = new Date("2026-01-01T00:00:00.000Z");
        const end = new Date("2026-12-01T00:00:00.000Z");
        const target = {
            package: packageId,
            packageSnapshot: { name: "Gold", duration: "1 year", price: 3000 },
            startDate: start,
            endDate: new Date(end),
            pricePaid: 3000,
            discountPercent: 10,
            subscriptionStatus: "active",
        };
        const donor = {
            _id: donorId,
            name: "Donor",
            systemId: 100,
            status: "active",
            isMember: true,
            freezeDaysUsed: 4,
            invitationsUsed: 1,
            subscriptions: [target],
            userlog: [],
            save: vi.fn(async () => donor),
        };
        const recipient = {
            _id: recipientId,
            name: "Guest",
            systemId: 200,
            memberId: null,
            status: "guest",
            isMember: false,
            subscriptions: [],
            userlog: [],
            save: vi.fn(async () => recipient),
        };

        vi.spyOn(Member, "findById").mockResolvedValue(donor);
        vi.spyOn(Member, "findOne").mockResolvedValue(recipient);

        const res = response();
        await transferPackage({
            params: { memberId: String(donorId) },
            body: { transferFee: 150, recipientSystemId: "S200" },
            user: { id: new mongoose.Types.ObjectId(), role: "Accountant", tenantId: "tenant" },
            tenant: { settings: { locale: { currency: "EGP" } } },
        }, res);

        expect(res.status).toHaveBeenCalledWith(200);
        const received = recipient.subscriptions[0];
        expect(received.packageSnapshot).toMatchObject({ name: "Gold", price: 3000 });
        expect(new Date(received.startDate).toISOString()).toBe(start.toISOString());
        expect(new Date(received.endDate).toISOString()).toBe(end.toISOString());
        expect(received.pricePaid).toBe(0);
        expect(String(received.transferredFrom)).toBe(String(donorId));
        expect(recipient.memberId).toBe(501);
        expect(recipient.status).toBe("active");
        expect(recipient.freezeDaysUsed).toBe(4);
        expect(recipient.invitationsUsed).toBe(1);

        expect(target.pricePaid).toBe(3000);
        expect(target.transferFee).toBe(150);
        expect(target.cancelled).toBe(true);
        expect(target.subscriptionStatus).toBe("cancelled");
        expect(String(target.transferredTo)).toBe(String(recipientId));
        expect(target.transferredToName).toBe("Guest");
        expect(donor.status).toBe("guest");
        expect(donor.isMember).toBe(false);
        expect(donor.save).toHaveBeenCalled();
        expect(recipient.save).toHaveBeenCalled();
    });

    it("blocks a later refund of a transferred package", async () => {
        const memberId = new mongoose.Types.ObjectId().toString();
        const member = {
            _id: memberId,
            subscriptions: [{
                pricePaid: 3000,
                refundAmount: 0,
                transferredTo: new mongoose.Types.ObjectId(),
            }],
            save: vi.fn(),
        };
        vi.spyOn(Member, "findById").mockResolvedValue(member);

        const res = response();
        await refund({
            body: { memberID: memberId, refund_amount: 100 },
            user: { id: "user123" },
            tenant: { settings: { locale: { currency: "EGP" } } },
        }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            message: "This package was transferred and the member is not entitled to a refund",
        });
        expect(member.save).not.toHaveBeenCalled();
    });
});
