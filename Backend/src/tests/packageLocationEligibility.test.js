import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import {
    packageEligibleForLocation,
    packageListLocationFilter,
    normalizeLocationEligibility,
} from "../utils/packageLocationEligibility";

const locA = new mongoose.Types.ObjectId().toString();
const locB = new mongoose.Types.ObjectId().toString();
const locC = new mongoose.Types.ObjectId().toString();

describe("packageLocationEligibility", () => {
    it("treats missing/all scope as available everywhere", () => {
        expect(packageEligibleForLocation({ name: "Gold" }, locA)).toBe(true);
        expect(packageEligibleForLocation({ locationScope: "all" }, locA)).toBe(true);
        expect(packageEligibleForLocation({ locationScope: "all", eligibleLocationIds: [locA] }, locB)).toBe(true);
    });

    it("restricts branches scope to eligible ids (one or many)", () => {
        const one = { locationScope: "branches", eligibleLocationIds: [locA] };
        expect(packageEligibleForLocation(one, locA)).toBe(true);
        expect(packageEligibleForLocation(one, locB)).toBe(false);
        expect(packageEligibleForLocation(one, null)).toBe(false);

        const many = { locationScope: "branches", eligibleLocationIds: [locA, locB] };
        expect(packageEligibleForLocation(many, locA)).toBe(true);
        expect(packageEligibleForLocation(many, locB)).toBe(true);
        expect(packageEligibleForLocation(many, locC)).toBe(false);
    });

    it("rejects branches scope without ids on normalize", () => {
        const bad = normalizeLocationEligibility({ locationScope: "branches", eligibleLocationIds: [] });
        expect(bad.error).toBeTruthy();
        const ok = normalizeLocationEligibility({ locationScope: "branches", eligibleLocationIds: [locA] });
        expect(ok.error).toBeUndefined();
        expect(ok.eligibleLocationIds).toEqual([locA]);
    });

    it("lists full catalog for catalog=all and unrestricted", () => {
        expect(packageListLocationFilter({ query: { catalog: "all" }, locationScope: { mode: "one", locationId: locA } })).toEqual({});
        expect(packageListLocationFilter({ query: {}, locationScope: { mode: "unrestricted", selected: "all" } })).toEqual({});
    });

    it("filters list to all-scope or eligible branch when one selected", () => {
        const frag = packageListLocationFilter({
            query: {},
            locationScope: { mode: "one", locationId: locA, selected: locA },
        });
        expect(frag.$or).toBeTruthy();
        const branchClause = frag.$or.find((c) => c.locationScope === "branches");
        expect(branchClause.eligibleLocationIds.$in.map(String)).toContain(locA);
    });
});
