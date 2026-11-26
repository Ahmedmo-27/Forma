import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import Member from "../models/Member";
import Location from "../models/Location";
import { updateMember } from "../controllers/memberController";

describe("updateMember edit_member_profile access", () => {
    const locationA = new mongoose.Types.ObjectId();
    const locationB = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId().toString();

    function makeMember(overrides = {}) {
        return {
            _id: new mongoose.Types.ObjectId(),
            systemId: 42,
            name: "Nour Mahmoud",
            phones: "01000000000",
            phoneKey: "01000000000",
            gender: "female",
            birthdate: null,
            source: "Walk in",
            locationId: locationA,
            locationIds: [locationA],
            userlog: [],
            toObject() {
                return { ...this };
            },
            save: vi.fn().mockResolvedValue(true),
            ...overrides,
        };
    }

    function makeReqRes({ role, body, grants = [], revokes = [] }) {
        const req = {
            params: { memberId: "42" },
            body,
            user: {
                id: new mongoose.Types.ObjectId().toString(),
                tenantId,
                role,
                featureAccess: { grants, revokes },
                abilities: {},
            },
        };
        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        };
        return { req, res };
    }

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(Member, "findOne").mockReturnValue({
            populate: vi.fn().mockResolvedValue(makeMember()),
        });
        vi.spyOn(Location, "findById").mockReturnValue({
            select: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue({ _id: locationB }),
            }),
        });
    });

    it("lets Sales change home branch without edit_member_profile", async () => {
        const { req, res } = makeReqRes({
            role: "Sales",
            body: { locationId: String(locationB) },
        });

        await updateMember(req, res);

        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({ message: "Member updated" });
        const member = await Member.findOne().populate();
        expect(member.save).toHaveBeenCalled();
        expect(String(member.locationId)).toBe(String(locationB));
        expect(member.name).toBe("Nour Mahmoud");
    });

    it("blocks Sales from changing personal fields without the ability", async () => {
        const { req, res } = makeReqRes({
            role: "Sales",
            body: { name: "New Name", gender: "male" },
        });

        await updateMember(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ message: "Not allowed to edit member profile" });
    });

    it("blocks Receptionist from any update without the ability", async () => {
        const { req, res } = makeReqRes({
            role: "Receptionist",
            body: { locationId: String(locationB) },
        });

        await updateMember(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ message: "Not allowed to edit member profile" });
    });

    it("lets Sales with a grant update personal details", async () => {
        const member = makeMember();
        Member.findOne.mockReturnValue({
            populate: vi.fn().mockResolvedValue(member),
        });
        const { req, res } = makeReqRes({
            role: "Sales",
            grants: ["edit_member_profile"],
            body: {
                name: "Updated Name",
                gender: "male",
                birthdate: null,
                source: "referral",
            },
        });

        await updateMember(req, res);

        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({ message: "Member updated" });
        expect(member.name).toBe("Updated Name");
        expect(member.gender).toBe("male");
        expect(member.source).toBe("referral");
        expect(member.save).toHaveBeenCalled();
    });

    it("lets Sales Manager update personal details by default", async () => {
        const member = makeMember();
        Member.findOne.mockReturnValue({
            populate: vi.fn().mockResolvedValue(member),
        });
        const { req, res } = makeReqRes({
            role: "Sales Manager",
            body: {
                name: "Manager Edit",
                gender: "female",
                birthdate: null,
                source: "Walk in",
            },
        });

        await updateMember(req, res);

        expect(res.status).not.toHaveBeenCalled();
        expect(member.name).toBe("Manager Edit");
        expect(member.save).toHaveBeenCalled();
    });
});
