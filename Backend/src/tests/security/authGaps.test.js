/**
 * Remaining Gap automations: forgot-password enumeration, platform lockout,
 * refresh revoke, limiter config contracts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { forgotPassword } from "../../controllers/passwordSetupController";
import { login as platformLogin, refreshToken } from "../../controllers/platformAuthController";
import User from "../../models/User";
import PlatformUser from "../../models/PlatformUser";
import * as passwordUtils from "../../utils/passwordUtils";
import { PLATFORM_ISSUER } from "../../middleware/platformAuth";

const loginLimiter = require("../../middleware/loginLimiter");
const { LIMITS, WINDOW_MS } = loginLimiter;
const platformRateLimit = require("../../middleware/platformRateLimit");

function mockRes() {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
    };
}

describe("Security gaps: forgot-password enumeration", () => {
    const GENERIC = "If an account exists for that email, a reset link has been sent.";

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("returns the same message when no user exists", async () => {
        vi.spyOn(User, "find").mockResolvedValue([]);
        const res = mockRes();
        await forgotPassword({ body: { email: "nobody@example.com" } }, res);
        expect(res.json).toHaveBeenCalledWith({ message: GENERIC });
        expect(res.status).not.toHaveBeenCalledWith(404);
    });

    it("returns the same message when a user exists (mail may be skipped)", async () => {
        const user = {
            _id: new mongoose.Types.ObjectId(),
            email: "owner@forma-showcase.test",
            name: "Owner",
            tenantId: new mongoose.Types.ObjectId(),
        };
        vi.spyOn(User, "find").mockResolvedValue([user]);
        const passwordSetup = require("../../services/passwordSetupService");
        vi.spyOn(passwordSetup, "issueToken").mockRejectedValue(new Error("mail/skip"));
        const res = mockRes();
        await forgotPassword({ body: { email: user.email } }, res);
        expect(res.json).toHaveBeenCalledWith({ message: GENERIC });
    });
});

describe("Security gaps: rate limiter contracts", () => {
    it("login limiter allows at most 10 attempts / 15 minutes", () => {
        expect(LIMITS.login).toBe(10);
        expect(WINDOW_MS).toBe(15 * 60 * 1000);
        expect(typeof loginLimiter).toBe("function");
    });

    it("forgot-password limiter allows at most 5 attempts / 15 minutes", () => {
        expect(LIMITS.forgotPassword).toBe(5);
        expect(typeof loginLimiter.forgotPasswordLimiter).toBe("function");
    });

    it("setup-password limiter allows at most 10 attempts / 15 minutes", () => {
        expect(LIMITS.setupPassword).toBe(10);
        expect(typeof loginLimiter.setupPasswordLimiter).toBe("function");
    });

    it("platform auth limiter is configured", () => {
        expect(platformRateLimit.PLATFORM_AUTH_LIMIT).toBe(15);
        expect(platformRateLimit.PLATFORM_AUTH_WINDOW_MS).toBe(15 * 60 * 1000);
        expect(typeof platformRateLimit.platformAuthLimiter).toBe("function");
    });
});

describe("Security gaps: platform lockout + refresh revoke", () => {
    const platformSecret = "gap_platform_secret";

    beforeEach(() => {
        vi.restoreAllMocks();
        process.env.PLATFORM_JWT_SECRET = platformSecret;
        process.env.NODE_ENV = "test";
    });

    it("locks platform account after 5 failed logins", async () => {
        const user = {
            _id: new mongoose.Types.ObjectId(),
            email: "locked@forma.test",
            name: "Locked",
            role: "support",
            status: "active",
            password: "hash",
            failedLoginCount: 4,
            lockedUntil: null,
            tokenVersion: 0,
            save: vi.fn().mockResolvedValue(true),
        };
        vi.spyOn(PlatformUser, "findOne").mockResolvedValue(user);
        vi.spyOn(passwordUtils, "verifyPassword").mockResolvedValue({ match: false });
        vi.spyOn(passwordUtils, "normalizeEmail").mockImplementation((e) => String(e).toLowerCase());

        const res = mockRes();
        await platformLogin(
            { body: { email: user.email, password: "wrong" }, requestId: "gap-lock" },
            res
        );

        expect(user.failedLoginCount).toBe(5);
        expect(user.lockedUntil).toBeInstanceOf(Date);
        expect(user.save).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
    });

    it("rejects refresh when tokenVersion was bumped (session revoke)", async () => {
        const userId = new mongoose.Types.ObjectId();
        const rawRefresh = jwt.sign(
            { id: userId.toString(), version: 0 },
            platformSecret,
            { audience: "leap-platform-refresh", issuer: PLATFORM_ISSUER, expiresIn: "7d" }
        );
        vi.spyOn(PlatformUser, "findById").mockResolvedValue({
            _id: userId,
            status: "active",
            tokenVersion: 2,
            email: "revoked@forma.test",
            name: "Revoked",
            role: "support",
        });

        const res = mockRes();
        await refreshToken({ body: { refreshToken: rawRefresh } }, res);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringMatching(/revoked|sign in/i) })
        );
    });
});
