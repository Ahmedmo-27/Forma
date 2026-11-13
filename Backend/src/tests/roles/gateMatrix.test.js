import { describe, expect, it } from "vitest";
import { allowAnyFeature } from "../../middleware/accessMiddleware.js";
import { authorizeRoles } from "../../middleware/authMiddleware.js";
import { GYM_ROLES } from "./expectedAccess.js";
import { gmAreaBypass, staff } from "./helpers.js";
import { loadRouteCalls } from "./routeScan.js";

function respond() {
    let status = null;
    let body = null;
    let passed = false;
    const res = {
        status(code) {
            status = code;
            return this;
        },
        json(payload) {
            body = payload;
            return this;
        },
    };
    return {
        res,
        finish: () => {
            passed = true;
        },
        result: () => ({ passed, status, body }),
    };
}

function runAny(call, user) {
    const gate = respond();
    allowAnyFeature(call.features, ...call.roles)(
        { user, tenant: null, planFeatures: null },
        gate.res,
        gate.finish
    );
    return gate.result();
}

function runAuthorize(call, role) {
    const gate = respond();
    authorizeRoles(...call.roles)(
        { user: { role, id: "staff-1" }, originalUrl: "/staff" },
        gate.res,
        gate.finish
    );
    return gate.result();
}

function anyAllowed(call, role) {
    return call.features.some((feature) => call.roles.includes(role) || gmAreaBypass(role, feature));
}

describe("allowAnyFeature and authorizeRoles", () => {
    const calls = loadRouteCalls();
    const anyCalls = calls.filter((call) => call.kind === "allowAnyFeature");
    const roleCalls = calls.filter((call) => call.kind === "authorizeRoles");

    it("parses every remaining role gate", () => {
        expect(anyCalls.length).toBeGreaterThan(5);
        expect(roleCalls.length).toBeGreaterThan(5);
        const features = anyCalls.flatMap((call) => call.features);
        expect(features).toContain("check_in");
        expect(features).toContain("request_assignment");
        expect(roleCalls.some((call) => call.file === "notificationRoutes.js")).toBe(true);
        expect(roleCalls.some((call) => call.file === "memberRoutes.js")).toBe(true);
    });

    it("allows any listed feature, including a general manager area, and denies the rest", () => {
        for (const call of anyCalls) {
            for (const role of GYM_ROLES) {
                const result = runAny(call, staff(role));
                const allowed = anyAllowed(call, role);
                expect(result.passed, `${call.where} ${role}`).toBe(allowed);
                if (!allowed) expect(result.status, `${call.where} ${role}`).toBe(403);
            }
        }
    });

    it("rejects a missing user on allowAnyFeature", () => {
        const result = runAny(anyCalls[0], null);
        expect(result.passed).toBe(false);
        expect(result.status).toBe(401);
    });

    it("lets a general manager through request creates in the sales area, and denies a receptionist", () => {
        const creates = anyCalls.filter((call) => call.features.includes("request_assignment"));
        expect(creates.map((call) => call.file).sort()).toEqual(["coachRequestRoutes.js", "salesRequestRoutes.js"]);
        for (const call of creates) {
            expect(runAny(call, staff("General Manager")).passed, call.where).toBe(true);
            const desk = runAny(call, staff("Receptionist"));
            expect(desk.passed, call.where).toBe(false);
            expect(desk.status).toBe(403);
        }
    });

    it("uses the exact authorizeRoles list and does not grant a general manager an area bypass", () => {
        for (const call of roleCalls) {
            for (const role of GYM_ROLES) {
                const result = runAuthorize(call, role);
                const allowed = call.roles.includes(role);
                expect(result.passed, `${call.where} ${role}`).toBe(allowed);
                if (!allowed) expect(result.status, `${call.where} ${role}`).toBe(403);
            }
        }
    });
});
