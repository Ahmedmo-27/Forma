import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
const {
    membershipShape,
    seedMembershipsFromFields,
    resolveMembership,
    hasActiveMembership,
    withMembershipContext,
    upsertMembership,
    transferHomeTenant,
    staffScopeFilter,
} = require("./staffMembership");

describe("staffMembership", () => {
    const tenantA = new mongoose.Types.ObjectId();
    const tenantB = new mongoose.Types.ObjectId();

    it("seeds a home membership from legacy fields", () => {
        const seeded = seedMembershipsFromFields({
            tenantId: tenantA,
            role: "Sales",
            canAccessAllLocations: false,
            allowedLocationIds: [],
        });
        expect(seeded).toHaveLength(1);
        expect(String(seeded[0].tenantId)).toBe(String(tenantA));
        expect(seeded[0].role).toBe("Sales");
    });

    it("resolves legacy users without memberships array", () => {
        const user = { tenantId: tenantA, role: "Owner", canAccessAllLocations: true };
        expect(resolveMembership(user, tenantA)).toMatchObject({ role: "Owner", legacy: true });
        expect(hasActiveMembership(user, tenantB)).toBe(false);
    });

    it("overlays role from membership for a secondary gym", () => {
        const user = {
            _id: new mongoose.Types.ObjectId(),
            tenantId: tenantA,
            role: "Owner",
            canAccessAllLocations: true,
            allowedLocationIds: [],
            memberships: [
                membershipShape({ tenantId: tenantA, role: "Owner", canAccessAllLocations: true }),
                membershipShape({ tenantId: tenantB, role: "Receptionist", canAccessAllLocations: false }),
            ],
        };
        const view = withMembershipContext(user, tenantB);
        expect(view.role).toBe("Receptionist");
        expect(view.canAccessAllLocations).toBe(false);
    });

    it("upserts a second membership without dropping the home one", () => {
        const user = {
            tenantId: tenantA,
            role: "Coach",
            canAccessAllLocations: false,
            allowedLocationIds: [],
            memberships: [],
            markModified() {},
        };
        upsertMembership(user, { tenantId: tenantA, role: "Coach" });
        upsertMembership(user, { tenantId: tenantB, role: "Sales" });
        expect(user.memberships).toHaveLength(2);
        expect(user.role).toBe("Coach");
        expect(resolveMembership(user, tenantB).role).toBe("Sales");
    });

    it("transferHomeTenant replaces memberships and home tenantId", () => {
        const user = {
            tenantId: tenantA,
            role: "Coach",
            memberships: [
                membershipShape({ tenantId: tenantA, role: "Coach" }),
                membershipShape({ tenantId: tenantB, role: "Sales" }),
            ],
            markModified() {},
        };
        transferHomeTenant(user, { tenantId: tenantB, role: "Receptionist", canAccessAllLocations: true });
        expect(String(user.tenantId)).toBe(String(tenantB));
        expect(user.role).toBe("Receptionist");
        expect(user.memberships).toHaveLength(1);
    });

    it("staffScopeFilter matches home or active membership", () => {
        const filter = staffScopeFilter(tenantB, { role: "Sales" });
        expect(filter.$and).toHaveLength(2);
        expect(filter.$and[1].$or).toHaveLength(2);
    });
});
