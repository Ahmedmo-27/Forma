const mongoose = require("mongoose");
const User = require("../models/User");
const Member = require("../models/Member");
const {
    assignOpenMembersToHeadCoach,
    resolveCoachAssignee,
} = require("./coachAssignment");

describe("coachAssignment", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("resolves a missing coach to the oldest head coach", async () => {
        const headCoachId = new mongoose.Types.ObjectId();
        vi.spyOn(User, "findOne").mockReturnValue({
            sort: () => ({
                select: vi.fn().mockResolvedValue({ _id: headCoachId, role: "Head Coach" }),
            }),
        });

        await expect(resolveCoachAssignee(null)).resolves.toEqual(headCoachId);
    });

    it("keeps an explicit coach id", async () => {
        const coachId = new mongoose.Types.ObjectId().toString();
        const findSpy = vi.spyOn(User, "findOne");

        await expect(resolveCoachAssignee(coachId)).resolves.toBe(coachId);
        expect(findSpy).not.toHaveBeenCalled();
    });

    it("returns NO_HEAD_COACH when the gym has no head coach", async () => {
        vi.spyOn(User, "findOne").mockReturnValue({
            sort: () => ({ select: vi.fn().mockResolvedValue(null) }),
        });
        vi.spyOn(Member, "countDocuments").mockResolvedValue(4);
        const updateSpy = vi.spyOn(Member, "updateMany");

        const result = await assignOpenMembersToHeadCoach();

        expect(result.reason).toBe("NO_HEAD_COACH");
        expect(result.unassignedCount).toBe(4);
        expect(result.updated).toBe(0);
        expect(updateSpy).not.toHaveBeenCalled();
    });

    it("assigns open members to the head coach", async () => {
        const headCoach = {
            _id: new mongoose.Types.ObjectId(),
            name: "Hana Head Coach",
            email: "hana@gym.com",
            role: "Head Coach",
        };
        vi.spyOn(User, "findOne").mockReturnValue({
            sort: () => ({ select: vi.fn().mockResolvedValue(headCoach) }),
        });
        vi.spyOn(Member, "countDocuments").mockResolvedValue(6);
        const updateSpy = vi.spyOn(Member, "updateMany").mockResolvedValue({ modifiedCount: 6 });

        const result = await assignOpenMembersToHeadCoach();

        expect(result.updated).toBe(6);
        expect(result.coachId).toEqual(headCoach._id);
        expect(updateSpy).toHaveBeenCalledWith(
            { $or: [{ current_couch: null }, { current_couch: { $exists: false } }] },
            { $set: { current_couch: headCoach._id, couch_subscription_status: "active" } }
        );
    });
});
