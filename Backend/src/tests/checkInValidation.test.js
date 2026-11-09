import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import Member from "../models/Member";
import { checkInMember } from "../controllers/memberController";

describe("Check-in validation & package enforcement", () => {
    const mockUserId = new mongoose.Types.ObjectId();
    const mockTenantId = new mongoose.Types.ObjectId().toString();

    const makeReqRes = (memberId = "S100") => {
        const req = {
            params: { memberId },
            user: { id: mockUserId, tenantId: mockTenantId, role: "Receptionist" },
        };
        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        };
        return { req, res };
    };

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("rejects non-existent member with 404", async () => {
        const { req, res } = makeReqRes("S9999");

        vi.spyOn(Member, "findOneAndUpdate").mockReturnValue({
            lean: vi.fn().mockResolvedValue(null),
        });
        vi.spyOn(Member, "findOne").mockReturnValue({
            populate: vi.fn().mockResolvedValue(null),
        });

        await checkInMember(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            message: "Member not found",
        }));
    });

    it("rejects blocked member with 403", async () => {
        const { req, res } = makeReqRes("S101");

        vi.spyOn(Member, "findOneAndUpdate").mockReturnValue({
            lean: vi.fn().mockResolvedValue(null),
        });
        const blockedMember = {
            _id: new mongoose.Types.ObjectId(),
            systemId: 101,
            name: "Blocked User",
            isBlocked: true,
            status: "active",
            isMember: true,
            subscriptions: [{
                packageSnapshot: { name: "1 Month Gym" },
                endDate: new Date(Date.now() + 86400000 * 10),
            }],
        };
        vi.spyOn(Member, "findOne").mockReturnValue({
            populate: vi.fn().mockResolvedValue(blockedMember),
        });

        await checkInMember(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
            message: "Cannot check in — member is blocked",
        });
    });

    it("rejects guest with 400 and message stating member is a guest and has no package", async () => {
        const { req, res } = makeReqRes("S102");

        vi.spyOn(Member, "findOneAndUpdate").mockReturnValue({
            lean: vi.fn().mockResolvedValue(null),
        });
        const guestMember = {
            _id: new mongoose.Types.ObjectId(),
            systemId: 102,
            name: "Guest Person",
            status: "guest",
            isMember: false,
            isBlocked: false,
            subscriptions: [],
        };
        vi.spyOn(Member, "findOne").mockReturnValue({
            populate: vi.fn().mockResolvedValue(guestMember),
        });

        await checkInMember(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            message: "Cannot check in — this member is a guest and does not have a package",
        });
    });

    it("rejects member without any package / subscription with 400", async () => {
        const { req, res } = makeReqRes("S103");

        vi.spyOn(Member, "findOneAndUpdate").mockReturnValue({
            lean: vi.fn().mockResolvedValue(null),
        });
        const noPkgMember = {
            _id: new mongoose.Types.ObjectId(),
            systemId: 103,
            name: "No Package Member",
            status: "active",
            isMember: true,
            isBlocked: false,
            subscriptions: [],
        };
        vi.spyOn(Member, "findOne").mockReturnValue({
            populate: vi.fn().mockResolvedValue(noPkgMember),
        });

        await checkInMember(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            message: "Cannot check in — this member does not have a package",
        });
    });

    it("rejects member with expired package with 400", async () => {
        const { req, res } = makeReqRes("S104");

        vi.spyOn(Member, "findOneAndUpdate").mockReturnValue({
            lean: vi.fn().mockResolvedValue(null),
        });
        const expiredMember = {
            _id: new mongoose.Types.ObjectId(),
            systemId: 104,
            name: "Expired Member",
            status: "expired",
            isMember: true,
            isBlocked: false,
            subscriptions: [{
                packageSnapshot: { name: "Old Package" },
                endDate: new Date(Date.now() - 86400000 * 5),
            }],
            save: vi.fn().mockResolvedValue(true),
        };
        vi.spyOn(Member, "findOne").mockReturnValue({
            populate: vi.fn().mockResolvedValue(expiredMember),
        });

        await checkInMember(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            message: "Cannot check in — this member has an expired package",
        });
    });

    it("rejects member whose subscription endDate has passed even if status was active", async () => {
        const { req, res } = makeReqRes("S105");

        vi.spyOn(Member, "findOneAndUpdate").mockReturnValue({
            lean: vi.fn().mockResolvedValue(null),
        });
        const overdueMember = {
            _id: new mongoose.Types.ObjectId(),
            systemId: 105,
            name: "Overdue Member",
            status: "active",
            isMember: true,
            isBlocked: false,
            subscriptions: [{
                packageSnapshot: { name: "Ended Package" },
                endDate: new Date(Date.now() - 86400000), // Ended yesterday
            }],
            save: vi.fn().mockResolvedValue(true),
        };
        vi.spyOn(Member, "findOne").mockReturnValue({
            populate: vi.fn().mockResolvedValue(overdueMember),
        });

        await checkInMember(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            message: "Cannot check in — this member has an expired package",
        });
        // Verifies status was updated to expired
        expect(overdueMember.status).toBe("expired");
        expect(overdueMember.save).toHaveBeenCalled();
    });

    it("allows active member with active package to check in", async () => {
        const { req, res } = makeReqRes("S106");

        const updatedDoc = {
            _id: new mongoose.Types.ObjectId(),
            systemId: 106,
            name: "Active Member",
            status: "active",
            subscriptions: [{
                packageSnapshot: { name: "Gold Monthly" },
                endDate: new Date(Date.now() + 86400000 * 20),
            }],
        };

        vi.spyOn(Member, "findOneAndUpdate").mockReturnValue({
            lean: vi.fn().mockResolvedValue(updatedDoc),
        });

        await checkInMember(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            message: "Check-in recorded",
            status: "active",
        }));
    });

    it("unfreezes frozen member with valid package and checks them in", async () => {
        const { req, res } = makeReqRes("S107");

        vi.spyOn(Member, "findOneAndUpdate").mockReturnValue({
            lean: vi.fn().mockResolvedValue(null),
        });

        const futureEnd = new Date(Date.now() + 86400000 * 30);
        const freezeStart = new Date(Date.now() - 86400000 * 2);
        const freezeEnd = new Date(Date.now() + 86400000 * 5);

        const frozenMember = {
            _id: new mongoose.Types.ObjectId(),
            systemId: 107,
            name: "Frozen Member",
            status: "frozen",
            isMember: true,
            isBlocked: false,
            freeze: [{
                startDate: freezeStart,
                endDate: freezeEnd,
            }],
            freezeDaysUsed: 0,
            subscriptions: [{
                packageSnapshot: { name: "Standard 3M" },
                endDate: futureEnd,
            }],
            userlog: [],
            save: vi.fn().mockResolvedValue(true),
        };

        vi.spyOn(Member, "findOne").mockReturnValue({
            populate: vi.fn().mockResolvedValue(frozenMember),
        });

        await checkInMember(req, res);

        expect(frozenMember.status).toBe("active");
        expect(frozenMember.save).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            message: "Check-in recorded",
            status: "active",
        }));
    });
});
