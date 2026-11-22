import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import {
    memberLinkedLocationIds,
    memberHasLocation,
    applyMemberLocations,
    memberLinkedToLocationsClause,
} from "./memberLocations";

describe("memberLocations helpers", () => {
    const branchA = new mongoose.Types.ObjectId();
    const branchB = new mongoose.Types.ObjectId();

    it("collects primary and linked branch ids", () => {
        expect(memberLinkedLocationIds({
            locationId: branchA,
            locationIds: [branchB, branchA],
        }).sort()).toEqual([String(branchA), String(branchB)].sort());
    });

    it("detects whether a member is linked to a branch", () => {
        const member = { locationId: branchA, locationIds: [branchA] };
        expect(memberHasLocation(member, branchA)).toBe(true);
        expect(memberHasLocation(member, branchB)).toBe(false);
        expect(memberHasLocation({ locationId: branchA, locationIds: [branchA, branchB] }, branchB)).toBe(true);
    });

    it("adds a branch without dropping the primary", () => {
        const member = { locationId: branchA, locationIds: [branchA] };
        applyMemberLocations(member, { addLocationId: branchB });
        expect(String(member.locationId)).toBe(String(branchA));
        expect(member.locationIds.map(String).sort()).toEqual([String(branchA), String(branchB)].sort());
    });

    it("sets primary and keeps it inside locationIds", () => {
        const member = { locationId: null, locationIds: [] };
        applyMemberLocations(member, { primaryLocationId: branchA });
        expect(String(member.locationId)).toBe(String(branchA));
        expect(member.locationIds.map(String)).toEqual([String(branchA)]);
    });

    it("builds an $or clause for linked locations", () => {
        const clause = memberLinkedToLocationsClause([branchA]);
        expect(clause.$or).toHaveLength(2);
        expect(String(clause.$or[0].locationId)).toBe(String(branchA));
        expect(String(clause.$or[1].locationIds)).toBe(String(branchA));
    });
});
