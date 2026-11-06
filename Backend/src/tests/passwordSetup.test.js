import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import PasswordSetupToken from "../models/PasswordSetupToken";
import User from "../models/User";
import { setupPassword } from "../controllers/passwordSetupController";
import passwordSetup from "../services/passwordSetupService";

describe("password setup tokens", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("stores a hash of the invite token, not the raw token", async () => {
        const create = vi.spyOn(PasswordSetupToken, "create").mockResolvedValue({});
        vi.spyOn(PasswordSetupToken, "updateMany").mockResolvedValue({});

        const issued = await passwordSetup.issueToken({
            userId: new mongoose.Types.ObjectId(),
            tenantId: new mongoose.Types.ObjectId(),
            email: "owner@gym.com",
            purpose: "invite",
            hours: 72,
        });

        expect(issued.token).toHaveLength(64);
        const stored = create.mock.calls[0][0];
        expect(stored.tokenHash).toBe(passwordSetup.hashToken(issued.token));
        expect(stored.tokenHash).not.toBe(issued.token);
        expect(stored.purpose).toBe("invite");
    });

    it("sets the password once and rejects a second use", async () => {
        const user = {
            _id: new mongoose.Types.ObjectId(),
            password: "old-hash",
            save: vi.fn().mockResolvedValue(true),
        };
        const record = {
            userId: user._id,
            usedAt: null,
            expiresAt: new Date(Date.now() + 60_000),
            save: vi.fn().mockResolvedValue(true),
        };

        vi.spyOn(PasswordSetupToken, "findOne").mockResolvedValue(record);
        vi.spyOn(User, "findById").mockResolvedValue(user);

        const req = { body: { token: "b".repeat(64), password: "NewPassword1" } };
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        await setupPassword(req, res);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining("Password set") })
        );
        expect(user.save).toHaveBeenCalled();
        expect(record.usedAt).toBeInstanceOf(Date);

        const res2 = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        await setupPassword(req, res2);
        expect(res2.status).toHaveBeenCalledWith(400);
    });

    it("rejects an expired token", async () => {
        vi.spyOn(PasswordSetupToken, "findOne").mockResolvedValue({
            usedAt: null,
            expiresAt: new Date(Date.now() - 1000),
            save: vi.fn(),
        });

        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        await setupPassword(
            { body: { token: "c".repeat(64), password: "NewPassword1" } },
            res
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining("expired") })
        );
    });
});
