import { describe, expect, it } from "vitest";
import { DEFAULT_PLANS } from "../scripts/seedPlans";

function features(key) {
    return DEFAULT_PLANS.find((plan) => plan.key === key).features;
}

describe("plan features for analytics", () => {
    it("keeps funnels on Gold and the executive reports on Platinum", () => {
        expect(features("basic")).not.toContain("funnels");
        expect(features("basic")).not.toContain("accounting");
        expect(features("basic")).not.toContain("exec_analytics");

        expect(features("gold")).toEqual(expect.arrayContaining(["accounting", "funnels"]));
        expect(features("gold")).not.toContain("exec_analytics");
        expect(features("gold")).not.toContain("business_intelligence");

        expect(features("platinum")).toEqual(expect.arrayContaining([
            "accounting",
            "funnels",
            "exec_analytics",
            "business_intelligence",
        ]));
    });
});
