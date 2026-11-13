import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLES, getPermissionsForRole } from "../../../../../Backend/src/config/platformPermissions.js";
import { canPlatform } from "./permissions.js";

const ROLES_UNDER_TEST = [ROLES.SUPER_ADMIN, ROLES.BILLING, ROLES.SUPPORT, ROLES.ANALYST];

describe("Platform permission helper", () => {
    it("allows super_admin with an empty permission list", () => {
        const user = { role: "super_admin", permissions: [] };
        for (const permission of Object.values(PERMISSIONS)) {
            expect(canPlatform(user, permission), permission).toBe(true);
        }
    });

    it("follows the permission payload for every console role", () => {
        for (const role of ROLES_UNDER_TEST) {
            const permissions = getPermissionsForRole(role);
            const user = { role, permissions };
            for (const permission of Object.values(PERMISSIONS)) {
                const allowed = role === ROLES.SUPER_ADMIN || permissions.includes(permission);
                expect(canPlatform(user, permission), `${role} ${permission}`).toBe(allowed);
            }
        }
    });

    it("denies a missing user and honors a wildcard list", () => {
        expect(canPlatform(null, PERMISSIONS.TENANTS_PURGE)).toBe(false);
        expect(canPlatform({ role: "billing", permissions: ["*"] }, PERMISSIONS.TENANTS_PURGE)).toBe(true);
        expect(canPlatform({ role: "billing", permissions: [] }, PERMISSIONS.TENANTS_READ)).toBe(false);
    });
});
