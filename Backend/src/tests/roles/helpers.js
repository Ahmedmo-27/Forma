import { expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { allowRoles } from "../../middleware/accessMiddleware.js";
import { memberListDecision, resolveEffectiveKeys, roleDefaults } from "../../utils/accessControl.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function staff(role, extra = {}) {
    return {
        role,
        featureAccess: { grants: [], revokes: [] },
        abilities: {},
        ...extra,
    };
}

export function decide(featureKey, routeRoles, user, { tenant } = {}) {
    let status = null;
    let body = null;
    let passed = false;
    const req = { user, tenant: tenant || null, planFeatures: null };
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
    allowRoles(featureKey, ...routeRoles)(req, res, () => {
        passed = true;
    });
    return { passed, status, body };
}

export function expectAllowed(featureKey, routeRoles, user, options) {
    const result = decide(featureKey, routeRoles, user, options);
    expect(result.passed, JSON.stringify(result.body)).toBe(true);
}

export function expectDenied(featureKey, routeRoles, user, options) {
    const result = decide(featureKey, routeRoles, user, options);
    expect(result.passed).toBe(false);
    expect(result.status).toBe(403);
}

export function expectKeys(role, expected) {
    const keys = [...resolveEffectiveKeys(staff(role))].sort();
    expect(keys).toEqual([...expected].sort());
}

export function expectAreas(role, expected) {
    expect(roleDefaults(role)).toEqual(expected);
}

export function expectList(role, decision) {
    expect(memberListDecision(staff(role))).toBe(decision);
}

export function readSource(...parts) {
    return fs.readFileSync(path.join(root, ...parts), "utf8");
}

/**
 * Saved checklist with one area removed. Legacy roles then follow the checklist.
 */
export function checklist(role, areas) {
    return { tenant: { roleAccess: { [role]: areas } } };
}
