import { describe, it, expect, vi } from "vitest";
import jwt from "jsonwebtoken";
import { PLATFORM_AUDIENCE, protectPlatform } from "../middleware/platformAuth";

describe("Phase 6: Platform Admin & Multi-Tenant Administration", () => {
    describe("Platform JWT Audience Verification", () => {
        it("rejects tokens that do not possess leap-platform-admin audience", async () => {
            const secret = "test_secret";
            process.env.JWT_SECRET = secret;

            // Standard tenant token (no platform audience)
            const token = jwt.sign({ id: "user-123", role: "Owner" }, secret);

            const req = {
                headers: { authorization: `Bearer ${token}` },
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };
            const next = vi.fn();

            await protectPlatform(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                message: "Invalid or expired platform administration token",
            });
        });

        it("validates valid platform token with correct audience", () => {
            const secret = "test_secret";
            const token = jwt.sign(
                { id: "admin-1", email: "admin@platform.com" },
                secret,
                { audience: PLATFORM_AUDIENCE }
            );

            const decoded = jwt.verify(token, secret, { audience: PLATFORM_AUDIENCE });
            expect(decoded.id).toBe("admin-1");
            expect(decoded.aud).toBe(PLATFORM_AUDIENCE);
        });
    });
});
