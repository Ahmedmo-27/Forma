import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { packageEligibleForMemberLocations } from "./packageLocationEligibility";

describe("packageEligibleForMemberLocations", () => {
    const branchA = new mongoose.Types.ObjectId();
    const branchB = new mongoose.Types.ObjectId();

    it("allows all-scope packages regardless of member locations", () => {
        expect(packageEligibleForMemberLocations(
            { locationScope: "all" },
            []
        )).toBe(true);
    });

    it("requires intersection with eligibleLocationIds for branch-scoped packages", () => {
        const pkg = {
            locationScope: "branches",
            eligibleLocationIds: [branchB],
        };
        expect(packageEligibleForMemberLocations(pkg, [branchA])).toBe(false);
        expect(packageEligibleForMemberLocations(pkg, [branchA, branchB])).toBe(true);
    });

    it("prefers the active branch when it is linked and eligible", () => {
        const pkg = {
            locationScope: "branches",
            eligibleLocationIds: [branchB],
        };
        expect(packageEligibleForMemberLocations(pkg, [branchA, branchB], branchB)).toBe(true);
        // Preferred branch not linked and no other eligible linked branch → false
        expect(packageEligibleForMemberLocations(pkg, [branchA], branchB)).toBe(false);
    });
});
