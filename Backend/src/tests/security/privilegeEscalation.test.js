/**
 * Phase 1 — Vertical privilege escalation & mass assignment guards.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { updateMyProfile } from "../../controllers/userController";
import User from "../../models/User";
import { protect } from "../../middleware/authMiddleware";
import { protectPlatform, PLATFORM_AUDIENCE, PLATFORM_ISSUER } from "../../middleware/platformAuth";
import { requirePlatformPermission } from "../../middleware/platformRbac";
import { PERMISSIONS, hasPermission, ROLES } from "../../config/platformPermissions";
import { canAssignRole } from "../../utils/accessControl";

function mockRes() {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
    };
}

describe("Security Phase 1: mass assignment on PATCH /users/me", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        process.env.JWT_SECRET = "tenant_escalation_secret";
    });

    it("ignores role, tenantId, and tokenVersion in the body", async () => {
        const userId = new mongoose.Types.ObjectId();
        const tenantId = new mongoose.Types.ObjectId();
        const mockUser = {
            _id: userId,
            name: "Reception Desk",
            role: "Receptionist",
            tenantId,
            tokenVersion: 0,
            password: "hashed",
            save: vi.fn().mockResolvedValue(true),
            featureAccess: { grants: [], revokes: [] },
            accessOverrides: { add: [], remove: [] },
            abilities: {},
            canViewPhones: false,
            canAccessAllLocations: false,
            allowedLocationIds: [],
            email: "reception@pentest-a.test",
            toObject() {
                return { ...this };
            },
        };

        vi.spyOn(User, "findById").mockResolvedValue(mockUser);

        const req = {
            user: { id: userId.toString(), role: "Receptionist", tenantId: tenantId.toString() },
            body: {
                name: "Reception Desk",
                role: "Owner",
                tenantId: new mongoose.Types.ObjectId().toString(),
                tokenVersion: 99,
                isAdmin: true,
                featureAccess: { grants: ["*"] },
            },
            requestId: "esc-1",
        };
        const res = mockRes();

        await updateMyProfile(req, res);

        expect(mockUser.role).toBe("Receptionist");
        expect(mockUser.tokenVersion).toBe(0);
        expect(String(mockUser.tenantId)).toBe(String(tenantId));
        expect(mockUser.save).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalled();
    });
});

describe("Security Phase 1: impersonation read-only mutations", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        process.env.JWT_SECRET = "tenant_escalation_secret";
    });

    it("blocks PATCH when impersonation token is read-only", async () => {
        const userId = new mongoose.Types.ObjectId().toString();
        const tenantId = new mongoose.Types.ObjectId().toString();
        const token = jwt.sign(
            {
                id: userId,
                role: "Owner",
                tenantId,
                tenantSlug: "pentest-a",
                version: 0,
                isImpersonation: true,
                readOnly: true,
                impersonatedBy: "platform-admin-1",
            },
            process.env.JWT_SECRET
        );

        vi.spyOn(User, "findById").mockReturnValue({
            select: vi.fn().mockResolvedValue({
                _id: userId,
                role: "Owner",
                name: "Owner",
                email: "owner@pentest-a.test",
                tokenVersion: 0,
                abilities: {},
                featureAccess: { grants: [], revokes: [] },
                accessOverrides: { add: [], remove: [] },
                canViewPhones: true,
                canAccessAllLocations: true,
                allowedLocationIds: [],
                tenantId,
            }),
        });

        const Tenant = require("../../models/Tenant");
        vi.spyOn(Tenant, "findById").mockResolvedValue({
            _id: tenantId,
            slug: "pentest-a",
            status: "active",
            planId: { features: ["members"] },
        });

        const req = {
            headers: { authorization: `Bearer ${token}` },
            method: "PATCH",
            originalUrl: "/api/members/123",
        };
        const res = mockRes();
        const next = vi.fn();

        await protect(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: "IMPERSONATION_READ_ONLY" })
        );
    });
});

describe("Security Phase 1: platform privilege denials", () => {
    const platformSecret = "platform_esc_secret";

    beforeEach(() => {
        vi.restoreAllMocks();
        process.env.PLATFORM_JWT_SECRET = platformSecret;
        process.env.JWT_SECRET = "tenant_escalation_secret";
    });

    it("rejects refresh-audience tokens on protectPlatform", async () => {
        const refreshToken = jwt.sign(
            { id: new mongoose.Types.ObjectId().toString(), version: 0 },
            platformSecret,
            { audience: "leap-platform-refresh", issuer: PLATFORM_ISSUER, expiresIn: "7d" }
        );

        const req = { headers: { authorization: `Bearer ${refreshToken}` } };
        const res = mockRes();
        const next = vi.fn();

        await protectPlatform(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
    });

    it("denies billing role purge and impersonation-write permissions", () => {
        expect(hasPermission(ROLES.BILLING, PERMISSIONS.TENANTS_PURGE)).toBe(false);
        expect(hasPermission(ROLES.BILLING, PERMISSIONS.SUPPORT_IMPERSONATE_WRITE)).toBe(false);
        expect(hasPermission(ROLES.BILLING, PERMISSIONS.SUPPORT_EXPORT_DATA)).toBe(false);
    });

    it("denies support role purge and billing refunds", () => {
        expect(hasPermission(ROLES.SUPPORT, PERMISSIONS.TENANTS_PURGE)).toBe(false);
        expect(hasPermission(ROLES.SUPPORT, PERMISSIONS.BILLING_REFUNDS)).toBe(false);
        expect(hasPermission(ROLES.SUPPORT, PERMISSIONS.SUPPORT_IMPERSONATE_WRITE)).toBe(false);
    });

    it("middleware returns 403 when support hits purge permission gate", () => {
        const gate = requirePlatformPermission(PERMISSIONS.TENANTS_PURGE);
        const req = {
            platformUser: { id: "u1", role: "support", email: "support@test.com" },
            method: "POST",
            originalUrl: "/api/platform/support/tenants/x/purge",
        };
        const res = mockRes();
        const next = vi.fn();
        gate(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it("forged platform role claim with wrong secret fails verification", async () => {
        const forged = jwt.sign(
            { id: "x", role: "super_admin", version: 0 },
            "wrong-secret",
            { audience: PLATFORM_AUDIENCE, issuer: PLATFORM_ISSUER }
        );
        const req = { headers: { authorization: `Bearer ${forged}` } };
        const res = mockRes();
        const next = vi.fn();
        await protectPlatform(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
    });
});

describe("Security Phase 1: JWT claim tampering (tenant)", () => {
    it("rejects tenant JWT signed with wrong secret", async () => {
        process.env.JWT_SECRET = "real-tenant-secret";
        const forged = jwt.sign(
            { id: "u1", role: "Owner", tenantId: "t1", version: 0 },
            "attacker-secret"
        );
        const req = {
            headers: { authorization: `Bearer ${forged}` },
            originalUrl: "/api/members",
            method: "GET",
        };
        const res = mockRes();
        const next = vi.fn();
        await protect(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
    });
});

describe("Security Phase 1: vertical role assignment", () => {
    it("Sales cannot promote self or peer to Owner", () => {
        const salesId = new mongoose.Types.ObjectId();
        const peerId = new mongoose.Types.ObjectId();
        expect(canAssignRole({ _id: salesId, role: "Sales" }, { _id: salesId, role: "Sales" }, "Owner").ok).toBe(false);
        expect(canAssignRole({ _id: salesId, role: "Sales" }, { _id: peerId, role: "Sales" }, "Owner").ok).toBe(false);
    });
});
