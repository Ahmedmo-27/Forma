import { describe, it, expect } from "vitest";
import {
    userHasAllLocations,
    resolveAllowedLocationIds,
    userCanAccessLocation,
    memberLocationFilter,
    mergeLocationIntoFilter,
} from "../utils/locationScope";

describe("locationScope helpers", () => {
    it("treats Owner as all-locations regardless of flags", () => {
        expect(userHasAllLocations({ role: "Owner" })).toBe(true);
        expect(resolveAllowedLocationIds({ role: "Owner", allowedLocationIds: [] }, {})).toBeNull();
    });

    it("respects canAccessAllLocations for GM", () => {
        const gm = { role: "General Manager", canAccessAllLocations: true, allowedLocationIds: [] };
        expect(userHasAllLocations(gm)).toBe(true);
        expect(resolveAllowedLocationIds(gm, {})).toBeNull();
    });

    it("uses personal allowedLocationIds before role defaults", () => {
        const user = {
            role: "Receptionist",
            canAccessAllLocations: false,
            allowedLocationIds: ["aaaaaaaaaaaaaaaaaaaaaaaa"],
        };
        const tenant = {
            roleLocationAccess: {
                Receptionist: ["bbbbbbbbbbbbbbbbbbbbbbbb"],
            },
        };
        expect(resolveAllowedLocationIds(user, tenant)).toEqual(["aaaaaaaaaaaaaaaaaaaaaaaa"]);
        expect(userCanAccessLocation(user, tenant, "aaaaaaaaaaaaaaaaaaaaaaaa")).toBe(true);
        expect(userCanAccessLocation(user, tenant, "bbbbbbbbbbbbbbbbbbbbbbbb")).toBe(false);
    });

    it("falls back to roleLocationAccess when personal list is empty", () => {
        const user = { role: "Sales", canAccessAllLocations: false, allowedLocationIds: [] };
        const tenant = {
            roleLocationAccess: {
                Sales: ["cccccccccccccccccccccccc"],
            },
        };
        expect(resolveAllowedLocationIds(user, tenant)).toEqual(["cccccccccccccccccccccccc"]);
    });

    it("returns empty grants when nothing is configured", () => {
        const user = { role: "Coach", canAccessAllLocations: false, allowedLocationIds: [] };
        expect(resolveAllowedLocationIds(user, {})).toEqual([]);
    });

    it("builds member location filters for one / subset / none", () => {
        const one = memberLocationFilter({
            mode: "one",
            locationId: "dddddddddddddddddddddddd",
        });
        expect(String(one.locationId)).toBe("dddddddddddddddddddddddd");

        const subset = memberLocationFilter({
            mode: "subset",
            locationIds: ["eeeeeeeeeeeeeeeeeeeeeeee", "ffffffffffffffffffffffff"],
        });
        expect(subset.locationId.$in).toHaveLength(2);

        const none = memberLocationFilter({ mode: "none" });
        expect(none.locationId.$in).toEqual([]);

        const open = memberLocationFilter({ mode: "unrestricted" });
        expect(open).toEqual({});
    });

    it("merges location filter into an existing member filter", () => {
        const merged = mergeLocationIntoFilter(
            { status: "active" },
            { mode: "one", locationId: "dddddddddddddddddddddddd" }
        );
        expect(merged.status).toBe("active");
        expect(String(merged.locationId)).toBe("dddddddddddddddddddddddd");
    });
});

describe("plan multi_branches feature", () => {
    it("is on gold and platinum seeds only", async () => {
        const { DEFAULT_PLANS } = await import("../scripts/seedPlans");
        const byKey = Object.fromEntries(DEFAULT_PLANS.map((p) => [p.key, p]));
        expect(byKey.basic.features).not.toContain("multi_branches");
        expect(byKey.gold.features).toContain("multi_branches");
        expect(byKey.platinum.features).toContain("multi_branches");
        expect(byKey.gold.limits.maxBranches).toBe(2);
        expect(byKey.platinum.limits.maxBranches).toBe(10);
    });
});
