import { describe, expect, it } from "vitest";
import { ACCESS_CATALOG, getFeature } from "../../config/accessCatalog.js";
import { AREA_KEYS, CHECKLIST_ROLES, FEATURE_AREA } from "../../config/roleAccess.js";
import { memberListDecision, resolveEffectiveKeys, roleDefaults } from "../../utils/accessControl.js";
import { CATALOG_KEYS, EXPECTED_KEYS, GYM_ROLES, MEMBER_LIST } from "./expectedAccess.js";
import { checklist, expectAllowed, expectDenied, staff } from "./helpers.js";

const EXCLUSIVE = ["settings", "change_role", "access_control"];

describe("Gym role feature matrix", () => {
    it("names every catalog key, in catalog order", () => {
        expect(ACCESS_CATALOG.map((feature) => feature.key)).toEqual(CATALOG_KEYS);
        for (const role of GYM_ROLES) {
            for (const key of EXPECTED_KEYS[role]) {
                expect(CATALOG_KEYS, `${role} lists unknown key ${key}`).toContain(key);
            }
        }
    });

    it("gives each role exactly its frozen feature keys", () => {
        for (const role of GYM_ROLES) {
            const actual = [...resolveEffectiveKeys(staff(role))].sort();
            const expected = [...EXPECTED_KEYS[role]].sort();
            expect(actual, role).toEqual(expected);
            for (const key of CATALOG_KEYS) {
                expect(actual.includes(key), `${role} ${key}`).toBe(expected.includes(key));
            }
        }
    });

    it("scopes the member directory per role", () => {
        for (const role of GYM_ROLES) {
            expect(memberListDecision(staff(role)), role).toBe(MEMBER_LIST[role]);
        }
    });

    it("refuses exclusive features granted to a role that does not have them by default", () => {
        for (const key of EXCLUSIVE) {
            const feature = getFeature(key);
            expect(feature?.exclusive, key).toBe(true);
            for (const role of GYM_ROLES) {
                if (feature.defaultRoles.includes(role)) continue;
                const user = staff(role, { featureAccess: { grants: [key], revokes: [] } });
                expect(resolveEffectiveKeys(user).has(key), `${role} grant ${key}`).toBe(false);
            }
        }
    });

    it("drops every feature in an area the checklist removes", () => {
        const featuresByArea = new Map();
        for (const [featureKey, area] of Object.entries(FEATURE_AREA)) {
            if (!featuresByArea.has(area)) featuresByArea.set(area, []);
            featuresByArea.get(area).push(featureKey);
        }

        for (const role of CHECKLIST_ROLES) {
            const defaults = roleDefaults(role);
            expect(defaults.length, role).toBeGreaterThan(0);
            for (const area of defaults) {
                const kept = defaults.filter((key) => key !== area);
                const user = staff(role);
                const options = checklist(role, kept);
                for (const featureKey of featuresByArea.get(area) || []) {
                    expectDenied(featureKey, [role], user, options);
                }
                const keptFeature = (featuresByArea.get(kept[0]) || [])[0];
                if (keptFeature) expectAllowed(keptFeature, [role], user, options);
            }
        }
    });

    it("keeps owner settings when the checklist is empty, and never gives them to a general manager", () => {
        expectAllowed("settings", ["Owner"], staff("Owner"), checklist("Owner", []));
        expectDenied("settings", ["Owner"], staff("General Manager"), checklist("General Manager", []));
        expectDenied(
            "settings",
            ["Owner"],
            staff("General Manager"),
            checklist("General Manager", [...AREA_KEYS])
        );
    });
});
