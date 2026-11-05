import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import { protectPlatform, PLATFORM_AUDIENCE, PLATFORM_ISSUER } from "../middleware/platformAuth";
import { protect } from "../middleware/authMiddleware";
import {
    generateTotpSecret,
    generateTotpCode,
    verifyTotpCode,
    generateRecoveryCodes,
    verifyRecoveryCode,
} from "../utils/totp";
import {
    ROLES,
    PERMISSIONS,
    hasPermission,
    getPermissionsForRole,
} from "../config/platformPermissions";
import { requirePlatformPermission } from "../middleware/platformRbac";

describe("Phase 1: Platform Identity, Security & RBAC", () => {
    const platformSecret = "test_platform_secret_123";
    const tenantSecret = "test_tenant_secret_456";

    beforeEach(() => {
        process.env.PLATFORM_JWT_SECRET = platformSecret;
        process.env.JWT_SECRET = tenantSecret;
        process.env.TENANT_SECRET_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    });

    describe("Audience & Cross-Domain Token Separation", () => {
        it("rejects a tenant token presented to platform protect middleware", async () => {
            const tenantToken = jwt.sign(
                { id: "tenant-user-1", tenantId: "t-1", role: "Owner" },
                tenantSecret
            );

            const req = {
                headers: { authorization: `Bearer ${tenantToken}` },
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };
            const next = vi.fn();

            await protectPlatform(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining("Invalid or expired") })
            );
        });

        it("rejects a platform token presented to tenant protect middleware", async () => {
            const platformToken = jwt.sign(
                { id: "platform-admin-1", role: "super_admin" },
                platformSecret,
                { audience: PLATFORM_AUDIENCE, issuer: PLATFORM_ISSUER }
            );

            const req = {
                headers: { authorization: `Bearer ${platformToken}` },
                originalUrl: "/api/members",
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };
            const next = vi.fn();

            await protect(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(401);
        });
    });

    describe("TOTP MFA Engine & Recovery Codes", () => {
        it("generates a valid 6-digit TOTP code and validates it within time window", () => {
            const secret = generateTotpSecret();
            expect(secret).toBeDefined();
            expect(secret.length).toBeGreaterThan(16);

            const code = generateTotpCode(secret);
            expect(code).toMatch(/^\d{6}$/);

            const isValid = verifyTotpCode(secret, code);
            expect(isValid).toBe(true);

            // Rejects invalid code
            const isInvalid = verifyTotpCode(secret, "999999");
            expect(isInvalid).toBe(false);
        });

        it("allows drift tolerance of ±1 step (30s)", () => {
            const secret = generateTotpSecret();
            const now = Date.now();
            const pastCode = generateTotpCode(secret, now - 30000); // 30s ago
            const futureCode = generateTotpCode(secret, now + 30000); // 30s in future
            const tooOldCode = generateTotpCode(secret, now - 90000); // 90s ago

            expect(verifyTotpCode(secret, pastCode, 1, now)).toBe(true);
            expect(verifyTotpCode(secret, futureCode, 1, now)).toBe(true);
            expect(verifyTotpCode(secret, tooOldCode, 1, now)).toBe(false);
        });

        it("generates and validates hashed backup recovery codes", async () => {
            const { plainCodes, hashedCodes } = await generateRecoveryCodes(4);
            expect(plainCodes).toHaveLength(4);
            expect(hashedCodes).toHaveLength(4);

            // First code matches index 0
            const index = await verifyRecoveryCode(plainCodes[0], hashedCodes);
            expect(index).toBe(0);

            // Invalid code returns -1
            const badIndex = await verifyRecoveryCode("INVALID-CODE", hashedCodes);
            expect(badIndex).toBe(-1);
        });
    });

    describe("Role-Based Access Control (RBAC) Permission Matrix", () => {
        it("grants super_admin access to all permissions", () => {
            Object.values(PERMISSIONS).forEach((perm) => {
                expect(hasPermission(ROLES.SUPER_ADMIN, perm)).toBe(true);
            });
        });

        it("enforces billing role permissions strictly", () => {
            expect(hasPermission(ROLES.BILLING, PERMISSIONS.BILLING_PAYMENTS)).toBe(true);
            expect(hasPermission(ROLES.BILLING, PERMISSIONS.BILLING_REFUNDS)).toBe(true);
            expect(hasPermission(ROLES.BILLING, PERMISSIONS.BILLING_LEDGER)).toBe(true);

            // Billing CANNOT manage platform users or purge tenants
            expect(hasPermission(ROLES.BILLING, PERMISSIONS.PLATFORM_USERS_MANAGE)).toBe(false);
            expect(hasPermission(ROLES.BILLING, PERMISSIONS.TENANTS_PURGE)).toBe(false);
            expect(hasPermission(ROLES.BILLING, PERMISSIONS.SUPPORT_IMPERSONATE_WRITE)).toBe(false);
        });

        it("enforces support role permissions strictly", () => {
            expect(hasPermission(ROLES.SUPPORT, PERMISSIONS.TENANTS_READ)).toBe(true);
            expect(hasPermission(ROLES.SUPPORT, PERMISSIONS.SUPPORT_IMPERSONATE_READ)).toBe(true);
            expect(hasPermission(ROLES.SUPPORT, PERMISSIONS.SUPPORT_EXPORT_DATA)).toBe(true);

            // Support CANNOT issue refunds or purge tenants
            expect(hasPermission(ROLES.SUPPORT, PERMISSIONS.BILLING_REFUNDS)).toBe(false);
            expect(hasPermission(ROLES.SUPPORT, PERMISSIONS.TENANTS_PURGE)).toBe(false);
            expect(hasPermission(ROLES.SUPPORT, PERMISSIONS.SUPPORT_IMPERSONATE_WRITE)).toBe(false);
        });

        it("enforces analyst role permissions strictly", () => {
            expect(hasPermission(ROLES.ANALYST, PERMISSIONS.ANALYTICS_VIEW)).toBe(true);
            expect(hasPermission(ROLES.ANALYST, PERMISSIONS.BILLING_LEDGER)).toBe(true);

            // Analyst CANNOT impersonate or modify tenants
            expect(hasPermission(ROLES.ANALYST, PERMISSIONS.SUPPORT_IMPERSONATE_READ)).toBe(false);
            expect(hasPermission(ROLES.ANALYST, PERMISSIONS.TENANTS_WRITE)).toBe(false);
            expect(hasPermission(ROLES.ANALYST, PERMISSIONS.PLATFORM_USERS_MANAGE)).toBe(false);
        });

        it("middleware blocks unauthorized role with 403", () => {
            const req = {
                platformUser: { id: "u-1", email: "support@leap.com", role: "support" },
                originalUrl: "/api/platform/billing/refunds",
                method: "POST",
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };
            const next = vi.fn();

            const middleware = requirePlatformPermission(PERMISSIONS.BILLING_REFUNDS);
            middleware(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining("insufficient platform permissions") })
            );
        });

        it("middleware allows authorized role to pass through", () => {
            const req = {
                platformUser: { id: "u-2", email: "billing@leap.com", role: "billing" },
                originalUrl: "/api/platform/billing/refunds",
                method: "POST",
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };
            const next = vi.fn();

            const middleware = requirePlatformPermission(PERMISSIONS.BILLING_REFUNDS);
            middleware(req, res, next);

            expect(next).toHaveBeenCalled();
        });
    });
});
