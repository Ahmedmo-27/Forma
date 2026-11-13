import { createRequire } from "module";
import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/User";
import Tenant from "../models/Tenant";
import PasswordSetupToken from "../models/PasswordSetupToken";
import { resetUserPassword, updateMyProfile } from "../controllers/userController";
import { protect } from "../middleware/authMiddleware";

const require = createRequire(import.meta.url);
const { clearAuthContextCache } = require("../middleware/authContextCache");

const SECRET = "test-secret-key-12345";

function jsonRes() {
    return { status: vi.fn().mockReturnThis(), json: vi.fn() };
}

describe("password reset gaps", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        clearAuthContextCache();
        process.env.JWT_SECRET = SECRET;
        vi.spyOn(PasswordSetupToken, "updateMany").mockResolvedValue({});
    });

    describe("session revocation", () => {
        const userId = new mongoose.Types.ObjectId().toString();
        const tenantId = new mongoose.Types.ObjectId().toString();

        function token(version) {
            return jwt.sign(
                { id: userId, role: "Owner", tenantId, tenantSlug: "gym", version },
                SECRET
            );
        }

        function request(version) {
            return {
                headers: { authorization: `Bearer ${token(version)}` },
                originalUrl: "/api/users/me",
                method: "GET",
            };
        }

        function mockAccount({ tokenVersion, role }) {
            vi.spyOn(User, "findById").mockReturnValue({
                select: vi.fn().mockResolvedValue({
                    _id: userId,
                    role,
                    name: "Owner",
                    email: "owner@gym.com",
                    tokenVersion,
                }),
            });
            vi.spyOn(Tenant, "findById").mockResolvedValue({ status: "active", slug: "gym", planId: null });
        }

        it("rejects a version 0 token after the password generation is 1, even from a warm cache", async () => {
            mockAccount({ tokenVersion: 1, role: "Owner" });
            const primed = jsonRes();
            await protect(request(1), primed, vi.fn());

            const res = jsonRes();
            const next = vi.fn();
            await protect(request(0), res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining("Session revoked") })
            );
        });

        it("accepts the current login token from a warm cache and from the database", async () => {
            mockAccount({ tokenVersion: 1, role: "Owner" });
            const first = jsonRes();
            const firstNext = vi.fn();
            await protect(request(1), first, firstNext);
            expect(firstNext).toHaveBeenCalled();

            const cachedRes = jsonRes();
            const cachedNext = vi.fn();
            const cachedReq = request(1);
            await protect(cachedReq, cachedRes, cachedNext);
            expect(cachedNext).toHaveBeenCalled();
            expect(cachedReq.user.role).toBe("Owner");
            expect(User.findById).toHaveBeenCalledTimes(1);

            clearAuthContextCache();
            User.findById.mockReturnValue({
                select: vi.fn().mockResolvedValue({
                    _id: userId,
                    role: "Sales",
                    name: "Rep",
                    email: "rep@gym.com",
                    tokenVersion: 0,
                }),
            });

            const dbRes = jsonRes();
            const dbNext = vi.fn();
            const dbReq = request(0);
            await protect(dbReq, dbRes, dbNext);
            expect(dbNext).toHaveBeenCalled();
            expect(dbReq.user.role).toBe("Sales");
            expect(dbReq.user.tokenVersion).toBe(0);
        });
    });

    describe("who can reset a password", () => {
        function target(role) {
            return {
                _id: new mongoose.Types.ObjectId(),
                name: "Target",
                role,
                tenantId: new mongoose.Types.ObjectId(),
                tokenVersion: 0,
                save: vi.fn().mockResolvedValue(true),
            };
        }

        async function reset(actorRole, person, newPassword = "NewPassword1") {
            vi.spyOn(User, "findById").mockResolvedValue(person);
            const res = jsonRes();
            await resetUserPassword({
                params: { id: String(person._id) },
                user: { id: "actor", role: actorRole },
                body: { newPassword },
            }, res);
            return { res, person };
        }

        it("rejects a receptionist, and a sales manager resetting a coach", async () => {
            const coach = target("Coach");
            const receptionist = await reset("Receptionist", coach);
            expect(receptionist.res.status).toHaveBeenCalledWith(403);
            expect(coach.save).not.toHaveBeenCalled();

            const blocked = await reset("Sales Manager", coach);
            expect(blocked.res.status).toHaveBeenCalledWith(403);
            expect(blocked.res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining("own team") })
            );
            expect(coach.save).not.toHaveBeenCalled();
        });

        it("lets an owner reset a coach and signs that coach out", async () => {
            const coach = target("Coach");
            const { res } = await reset("Owner", coach);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining("Password reset") })
            );
            expect(coach.tokenVersion).toBe(1);
            expect(coach.save).toHaveBeenCalled();
            expect(PasswordSetupToken.updateMany).toHaveBeenCalledWith(
                { userId: coach._id, usedAt: null },
                { $set: { usedAt: expect.any(Date) } }
            );
        });

        it("rejects a password shorter than 8 characters", async () => {
            const find = vi.spyOn(User, "findById");
            const res = jsonRes();
            await resetUserPassword({
                params: { id: new mongoose.Types.ObjectId().toString() },
                user: { id: "actor", role: "Owner" },
                body: { newPassword: "short" },
            }, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining("8") })
            );
            expect(find).not.toHaveBeenCalled();
        });
    });

    describe("changing your own password", () => {
        it("rejects a new password shorter than 8 characters before saving", async () => {
            const user = {
                _id: new mongoose.Types.ObjectId(),
                name: "Rep",
                password: "stored",
                tokenVersion: 0,
                save: vi.fn(),
            };
            vi.spyOn(User, "findById").mockResolvedValue(user);
            const res = jsonRes();

            await updateMyProfile({
                user: { id: user._id.toString() },
                body: { currentPassword: "CurrentPassword1", newPassword: "short" },
            }, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(user.save).not.toHaveBeenCalled();
            expect(PasswordSetupToken.updateMany).not.toHaveBeenCalled();
        });
    });
});
