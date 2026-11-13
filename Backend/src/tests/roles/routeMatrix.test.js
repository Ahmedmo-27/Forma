import { describe, expect, it } from "vitest";
import { AREA_KEYS } from "../../config/roleAccess.js";
import { GYM_ROLES } from "./expectedAccess.js";
import { decide, gmAreaBypass } from "./helpers.js";
import { loadRouteCalls } from "./routeScan.js";

function roleOnAllowList(call, role) {
    return call.roles.includes(role) || call.features.some((feature) => gmAreaBypass(role, feature));
}

describe("Route allowRoles matrix", () => {
    const calls = loadRouteCalls().filter((call) => call.kind === "allowRoles");

    it("parses every allowRoles call in the route files", () => {
        expect(calls.length).toBeGreaterThan(70);
        const features = new Set(calls.map((call) => call.feature));
        expect(features.has("settings")).toBe(true);
        expect(features.has("refunds")).toBe(true);
        expect(AREA_KEYS.length).toBeGreaterThan(0);
    });

    it("allows a role on the list, lets a general manager through an open area, and denies everyone else", () => {
        for (const call of calls) {
            for (const role of GYM_ROLES) {
                const result = decide(call.feature, call.roles, { role, featureAccess: { grants: [], revokes: [] }, abilities: {} });
                const allowed = roleOnAllowList(call, role);
                expect(result.passed, `${call.where} ${role}`).toBe(allowed);
                if (!allowed) expect(result.status, `${call.where} ${role}`).toBe(403);
            }
        }
    });

    it("rejects a missing user with 401", () => {
        const call = calls[0];
        const result = decide(call.feature, call.roles, null);
        expect(result.passed).toBe(false);
        expect(result.status).toBe(401);
    });
});
