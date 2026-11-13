import { describe, expect, it } from "vitest";
import {
    PERMISSIONS,
    ROLES,
    getPermissionsForRole,
    hasPermission,
} from "../../config/platformPermissions.js";
import { requirePlatformPermission } from "../../middleware/platformRbac.js";

/** Literal matrix. super_admin is every permission; the others are least privilege. */
const EXPECTED = {
    super_admin: Object.values(PERMISSIONS),
    billing: [
        "tenants.read",
        "tenants.notes",
        "pricing.manage",
        "billing.payments",
        "billing.invoices",
        "billing.refunds",
        "billing.grants",
        "billing.ledger",
        "analytics.view",
        "audit.view",
    ],
    support: [
        "tenants.read",
        "tenants.notes",
        "support.impersonate_read",
        "support.export_data",
        "audit.view",
    ],
    analyst: [
        "tenants.read",
        "billing.ledger",
        "analytics.view",
    ],
};

const PLATFORM_ROLES = [ROLES.SUPER_ADMIN, ROLES.BILLING, ROLES.SUPPORT, ROLES.ANALYST];

function gate(role, permission) {
    let status = null;
    let nextCalled = false;
    const req = {
        platformUser: role ? { id: "p1", email: "ops@example.com", role } : null,
        requestId: "req-matrix",
        originalUrl: "/platform/test",
        method: "GET",
    };
    const res = {
        status(code) {
            status = code;
            return this;
        },
        json() {
            return this;
        },
    };
    requirePlatformPermission(permission)(req, res, () => {
        nextCalled = true;
    });
    return { status, nextCalled };
}

describe("Platform role permission matrix", () => {
    it("matches the frozen permission list for every console role", () => {
        const all = Object.values(PERMISSIONS);
        expect([...EXPECTED.super_admin].sort()).toEqual([...all].sort());
        for (const permission of all) {
            expect(EXPECTED.super_admin).toContain(permission);
        }
        for (const role of PLATFORM_ROLES) {
            const expected = EXPECTED[role];
            expect([...getPermissionsForRole(role)].sort(), role).toEqual([...expected].sort());
            for (const permission of all) {
                expect(hasPermission(role, permission), `${role} ${permission}`).toBe(expected.includes(permission));
            }
        }
    });

    it("opens the middleware only when the role has that permission", () => {
        for (const role of PLATFORM_ROLES) {
            for (const permission of Object.values(PERMISSIONS)) {
                const result = gate(role, permission);
                const allowed = EXPECTED[role].includes(permission);
                expect(result.nextCalled, `${role} ${permission}`).toBe(allowed);
                if (!allowed) expect(result.status).toBe(403);
            }
        }
    });

    it("denies an unknown role and a missing platform user", () => {
        for (const permission of Object.values(PERMISSIONS)) {
            expect(hasPermission("intern", permission)).toBe(false);
            const unknown = gate("intern", permission);
            expect(unknown.nextCalled).toBe(false);
            expect(unknown.status).toBe(403);

            const missing = gate(null, permission);
            expect(missing.nextCalled).toBe(false);
            expect(missing.status).toBe(401);
        }
    });

});
