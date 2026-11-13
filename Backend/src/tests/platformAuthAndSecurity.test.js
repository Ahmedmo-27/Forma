import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import { protectPlatform, PLATFORM_AUDIENCE, PLATFORM_ISSUER } from "../middleware/platformAuth";
import { protect } from "../middleware/authMiddleware";
import {
    ROLES,
    PERMISSIONS,
    hasPermission,
} from "../config/platformPermissions";
import { requirePlatformPermission } from "../middleware/platformRbac";
import { login } from "../controllers/platformAuthController";
import PlatformUser from "../models/PlatformUser";
import * as passwordUtils from "../utils/passwordUtils";

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
                platformUser: { id: "u-1", email: "support@forma.app", role: "support" },
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
                platformUser: { id: "u-2", email: "billing@forma.app", role: "billing" },
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

    describe("Platform Login", () => {
        it("issues access and refresh tokens on successful password login", async () => {
            const hashedPassword = await passwordUtils.hashPassword("password123");
            const fakeUser = {
                _id: "user-super-1",
                name: "Super Admin",
                email: "admin@platform.com",
                password: hashedPassword,
                role: "super_admin",
                status: "active",
                failedLoginCount: 1,
                lockedUntil: null,
                tokenVersion: 0,
                save: vi.fn().mockResolvedValue(true),
            };

            vi.spyOn(PlatformUser, "findOne").mockResolvedValue(fakeUser);

            const req = {
                body: {
                    email: "admin@platform.com",
                    password: "password123",
                },
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await login(req, res);

            expect(fakeUser.failedLoginCount).toBe(0);
            expect(fakeUser.save).toHaveBeenCalled();

            const jsonArg = res.json.mock.calls[0][0];
            expect(jsonArg.token).toEqual(expect.any(String));
            expect(jsonArg.refreshToken).toEqual(expect.any(String));
            expect(jsonArg.user).toEqual(
                expect.objectContaining({
                    email: "admin@platform.com",
                    role: "super_admin",
                })
            );
            expect(jsonArg.mfaRequired).toBeUndefined();
            expect(jsonArg.mfaSetupRequired).toBeUndefined();
            expect(jsonArg.tempToken).toBeUndefined();
        });
    });
});
