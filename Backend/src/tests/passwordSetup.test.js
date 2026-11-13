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

    it("consumes only an unused unexpired token", async () => {
        const update = vi.spyOn(PasswordSetupToken, "findOneAndUpdate").mockResolvedValue(null);
        const token = "a".repeat(64);

        await passwordSetup.consumeToken(token);

        const filter = update.mock.calls[0][0];
        expect(filter.tokenHash).toBe(passwordSetup.hashToken(token));
        expect(filter.usedAt).toBeNull();
        expect(filter.expiresAt.$gt).toBeInstanceOf(Date);
        expect(await passwordSetup.consumeToken("")).toBeNull();
    });

    it("sets the password once, revokes leftover links, and rejects a second use", async () => {
        const user = {
            _id: new mongoose.Types.ObjectId(),
            password: "old-hash",
            tokenVersion: 0,
            tenantId: new mongoose.Types.ObjectId(),
            save: vi.fn().mockResolvedValue(true),
        };
        const record = {
            _id: new mongoose.Types.ObjectId(),
            userId: user._id,
            usedAt: new Date(),
            expiresAt: new Date(Date.now() + 60_000),
        };
        const consume = vi.spyOn(PasswordSetupToken, "findOneAndUpdate")
            .mockResolvedValueOnce(record)
            .mockResolvedValueOnce(null);
        const revoke = vi.spyOn(PasswordSetupToken, "updateMany").mockResolvedValue({});
        vi.spyOn(User, "findById").mockResolvedValue(user);

        const req = { body: { token: "b".repeat(64), password: "NewPassword1" } };
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        await setupPassword(req, res);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining("Password set") })
        );
        expect(user.save).toHaveBeenCalled();
        expect(user.tokenVersion).toBe(1);
        expect(consume).toHaveBeenCalledTimes(1);
        expect(revoke).toHaveBeenCalledWith(
            { userId: user._id, usedAt: null },
            { $set: { usedAt: expect.any(Date) } }
        );

        const res2 = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        await setupPassword(req, res2);
        expect(res2.status).toHaveBeenCalledWith(400);
        expect(user.save).toHaveBeenCalledTimes(1);
    });

    it("releases the token when saving the password fails", async () => {
        const record = {
            _id: new mongoose.Types.ObjectId(),
            userId: new mongoose.Types.ObjectId(),
            usedAt: new Date(),
        };
        vi.spyOn(PasswordSetupToken, "findOneAndUpdate").mockResolvedValue(record);
        const release = vi.spyOn(PasswordSetupToken, "updateOne").mockResolvedValue({});
        vi.spyOn(User, "findById").mockResolvedValue({
            _id: record.userId,
            password: "old-hash",
            tokenVersion: 2,
            save: vi.fn().mockRejectedValue(new Error("db down")),
        });

        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        await setupPassword(
            { body: { token: "d".repeat(64), password: "NewPassword1" } },
            res
        );

        expect(res.status).toHaveBeenCalledWith(500);
        expect(release).toHaveBeenCalledWith(
            { _id: record._id },
            { $set: { usedAt: null } }
        );
    });

    it("rejects an expired or already used token", async () => {
        vi.spyOn(PasswordSetupToken, "findOneAndUpdate").mockResolvedValue(null);

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
