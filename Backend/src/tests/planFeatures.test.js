import { describe, expect, it } from "vitest";
import { DEFAULT_PLANS } from "../scripts/seedPlans";

function plan(key) {
    return DEFAULT_PLANS.find((entry) => entry.key === key);
}

function features(key) {
    return plan(key).features;
}

describe("plan features for analytics", () => {
    it("keeps funnels on Gold and the executive reports on Platinum", () => {
        expect(features("basic")).not.toContain("funnels");
        expect(features("basic")).not.toContain("accounting");
        expect(features("basic")).not.toContain("exec_analytics");

        expect(features("gold")).toEqual(expect.arrayContaining(["accounting", "funnels", "multi_branches"]));
        expect(features("gold")).not.toContain("exec_analytics");
        expect(features("gold")).not.toContain("business_intelligence");
        expect(features("basic")).not.toContain("multi_branches");

        expect(features("platinum")).toEqual(expect.arrayContaining([
            "accounting",
            "funnels",
            "exec_analytics",
            "business_intelligence",
            "multi_branches",
        ]));
    });

    it("keeps General Manager off Basic unless a gym is granted the role", () => {
        expect(plan("basic").allowedRoles).not.toContain("General Manager");
        expect(plan("basic").allowedRoles).toEqual(expect.arrayContaining([
            "Owner",
            "Receptionist",
            "Coach",
            "Head Coach",
        ]));
        expect(plan("gold").allowedRoles).toContain("General Manager");
        expect(plan("platinum").allowedRoles).toContain("General Manager");
        expect(plan("gold").allowedRoles).toEqual(expect.arrayContaining([
            "Accountant",
            "Sales",
            "Sales Manager",
        ]));
        expect(plan("basic").allowedRoles).not.toEqual(expect.arrayContaining([
            "Accountant",
            "Sales",
            "Sales Manager",
        ]));
    });
});
