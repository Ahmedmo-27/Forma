import { describe, it, expect, beforeEach } from "vitest";
import {
    getAuthContext,
    setAuthContext,
    invalidateAuthContext,
    clearAuthContextCache,
} from "./authContextCache";

describe("auth context cache", () => {
    beforeEach(() => {
        clearAuthContextCache();
    });

    it("returns the same user and plan within the ttl without sharing the stored object", () => {
        setAuthContext("user-1", "tenant-1", {
            user: { id: "user-1", role: "Owner", abilities: { reports: true } },
            tenant: { status: "active", _id: "tenant-1" },
            plan: { features: ["members"] },
            tenantId: "tenant-1",
            tenantSlug: "leap",
        }, 1_000);

        const first = getAuthContext("user-1", "tenant-1", 1_000);
        first.user.role = "Sales";
        const second = getAuthContext("user-1", "tenant-1", 20_000);

        expect(second.user.role).toBe("Owner");
        expect(second.plan.features).toEqual(["members"]);
        expect(second.tenantSlug).toBe("leap");
        expect(getAuthContext("user-1", "tenant-1", 31_000)).toBeNull();
    });

    it("drops one user, one gym, or every gym", () => {
        const now = 5_000;
        setAuthContext("user-1", "tenant-1", {
            user: { id: "user-1" },
            tenant: { status: "active" },
            plan: null,
            tenantId: "tenant-1",
        }, now);
        setAuthContext("user-2", "tenant-1", {
            user: { id: "user-2" },
            tenant: { status: "active" },
            plan: null,
            tenantId: "tenant-1",
        }, now);
        setAuthContext("user-3", "tenant-2", {
            user: { id: "user-3" },
            tenant: { status: "active" },
            plan: null,
            tenantId: "tenant-2",
        }, now);

        invalidateAuthContext({ userId: "user-1" });
        expect(getAuthContext("user-1", "tenant-1", now)).toBeNull();
        expect(getAuthContext("user-2", "tenant-1", now)).not.toBeNull();

        invalidateAuthContext({ tenantId: "tenant-1" });
        expect(getAuthContext("user-2", "tenant-1", now)).toBeNull();
        expect(getAuthContext("user-3", "tenant-2", now)).not.toBeNull();

        invalidateAuthContext({ all: true });
        expect(getAuthContext("user-3", "tenant-2", now)).toBeNull();
    });
});
