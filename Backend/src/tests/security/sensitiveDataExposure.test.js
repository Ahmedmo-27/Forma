/**
 * Phase 3 — Sensitive fields must not appear in API-facing serializers / logs.
 */
import { describe, it, expect } from "vitest";
import { formatUserResponse } from "../../utils/userAbilities";
import { sanitizeForLog } from "../../utils/sanitizeLog";
import fs from "fs";
import path from "path";

describe("Security Phase 3: sensitive data exposure", () => {
    it("formatUserResponse never includes password or tokenVersion", () => {
        const user = {
            _id: "u1",
            name: "Staff",
            email: "staff@test.com",
            username: "staff",
            role: "Receptionist",
            password: "$2a$10$supersecret",
            tokenVersion: 7,
            featureAccess: { grants: [], revokes: [] },
            accessOverrides: { add: [], remove: [] },
            abilities: {},
            canAccessAllLocations: true,
            allowedLocationIds: [],
        };
        const json = formatUserResponse(user, { includeAccess: true });
        expect(json.password).toBeUndefined();
        expect(json.tokenVersion).toBeUndefined();
        expect(JSON.stringify(json)).not.toMatch(/\$2a\$/);
    });

    it("sanitizeLog redacts tokens and passwords", () => {
        const sanitized = sanitizeForLog({
            password: "secret",
            refreshToken: "r.t.x",
            token: "a.b.c",
            ok: true,
        });
        expect(sanitized.password).toBe("[REDACTED]");
        expect(sanitized.refreshToken).toBe("[REDACTED]");
        expect(sanitized.token).toBe("[REDACTED]");
        expect(sanitized.ok).toBe(true);
    });

    it("User model queries in auth middleware select away password", () => {
        const src = fs.readFileSync(
            path.resolve(__dirname, "../../middleware/authMiddleware.js"),
            "utf8"
        );
        expect(src).toMatch(/\.select\("-password"\)/);
    });

    it("platform auth middleware selects away password", () => {
        const src = fs.readFileSync(
            path.resolve(__dirname, "../../middleware/platformAuth.js"),
            "utf8"
        );
        expect(src).toMatch(/\.select\("-password"\)/);
    });
});
