import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

const User = require("../models/User");
const Member = require("../models/Member");
const PlatformUser = require("../models/PlatformUser");
const {
    normalizePhone,
    phoneCandidates,
    assertEmailAvailable,
    assertPhoneAvailable,
} = require("./identityUniqueness");

describe("global identity uniqueness", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("treats local and country-code phone formats as the same number", () => {
        expect(normalizePhone("01012345678")).toBe("201012345678");
        expect(normalizePhone("+20 101 234 5678")).toBe("201012345678");
        expect(phoneCandidates("01012345678")).toEqual(expect.arrayContaining([
            "01012345678",
            "201012345678",
        ]));
    });

    it("rejects an email already used by a gym user or a platform user", async () => {
        vi.spyOn(User, "findOne").mockResolvedValueOnce({ _id: new mongoose.Types.ObjectId() });
        await expect(assertEmailAvailable("Owner@Gym.com")).rejects.toMatchObject({
            statusCode: 409,
            field: "email",
        });

        vi.spyOn(User, "findOne").mockResolvedValueOnce(null);
        vi.spyOn(PlatformUser, "findOne").mockResolvedValueOnce({ _id: new mongoose.Types.ObjectId() });
        await expect(assertEmailAvailable("admin@forma.app")).rejects.toMatchObject({
            statusCode: 409,
            field: "email",
        });
    });

    it("rejects a phone already used by a member in any gym", async () => {
        vi.spyOn(User, "findOne").mockResolvedValueOnce(null);
        vi.spyOn(Member, "findOne").mockResolvedValueOnce({ _id: new mongoose.Types.ObjectId() });
        await expect(assertPhoneAvailable("01012345678")).rejects.toMatchObject({
            statusCode: 409,
            field: "phone",
        });
        expect(Member.findOne).toHaveBeenCalledWith(expect.objectContaining({
            $or: expect.any(Array),
        }));
    });

    it("accepts a phone that belongs to the user being edited", async () => {
        const userId = new mongoose.Types.ObjectId();
        vi.spyOn(User, "findOne").mockResolvedValueOnce(null);
        vi.spyOn(Member, "findOne").mockResolvedValueOnce(null);
        await expect(assertPhoneAvailable("01012345678", { excludeUserId: userId })).resolves.toBe("201012345678");
        expect(User.findOne).toHaveBeenCalledWith(expect.objectContaining({
            _id: { $ne: userId },
        }));
    });
});
