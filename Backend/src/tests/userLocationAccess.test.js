import { describe, it, expect } from "vitest";
import {
    applyLocationAccessToUser,
    defaultLocationFieldsForRole,
} from "../utils/userLocationAccess";

describe("userLocationAccess", () => {
    it("defaults GM to all locations and staff to inherit", () => {
        expect(defaultLocationFieldsForRole("General Manager")).toEqual({
            canAccessAllLocations: true,
            allowedLocationIds: [],
        });
        expect(defaultLocationFieldsForRole("Sales")).toEqual({
            canAccessAllLocations: false,
            allowedLocationIds: [],
        });
    });

    it("rejects location grants from non Owner/GM", async () => {
        const user = { role: "Sales", allowedLocationIds: [], canAccessAllLocations: false, markModified() {} };
        const result = await applyLocationAccessToUser(
            { role: "Sales Manager" },
            user,
            { canAccessAllLocations: true }
        );
        expect(result.status).toBe(403);
    });

    it("sets all-locations when canAccessAllLocations is true", async () => {
        const user = { role: "Sales", allowedLocationIds: ["x"], canAccessAllLocations: false, markModified() {} };
        const result = await applyLocationAccessToUser(
            { role: "Owner" },
            user,
            { canAccessAllLocations: true }
        );
        expect(result.error).toBeUndefined();
        expect(user.canAccessAllLocations).toBe(true);
        expect(user.allowedLocationIds).toEqual([]);
        expect(result.canAccessAllLocations).toBe(true);
    });

    it("requires branches when option is set", async () => {
        const user = { role: "Coach", allowedLocationIds: [], canAccessAllLocations: false, markModified() {} };
        const result = await applyLocationAccessToUser(
            { role: "Owner" },
            user,
            { canAccessAllLocations: false, allowedLocationIds: [] },
            { requireBranches: true }
        );
        expect(result.status).toBe(400);
        expect(result.error).toMatch(/at least one branch/i);
    });
});

