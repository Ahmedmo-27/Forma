import { describe, expect, it } from "vitest";
import { ACCESS_CATALOG } from "../../config/accessCatalog.js";
import { resolveEffectiveKeys } from "../../utils/accessControl.js";
import { GYM_ROLES } from "./expectedAccess.js";
import { checklist, expectAllowed, expectDenied, staff } from "./helpers.js";

describe("Feature grants and revokes", () => {
    it("grants a missing non-exclusive feature and refuses an exclusive one", () => {
        for (const feature of ACCESS_CATALOG) {
            for (const role of GYM_ROLES) {
                if (resolveEffectiveKeys(staff(role)).has(feature.key)) continue;
                const user = staff(role, { featureAccess: { grants: [feature.key], revokes: [] } });
                const granted = resolveEffectiveKeys(user).has(feature.key);
                if (feature.exclusive) {
                    expect(granted, `${role} ${feature.key}`).toBe(false);
                    expectDenied(feature.key, ["Owner"], user);
                } else {
                    expect(granted, `${role} ${feature.key}`).toBe(true);
                    expectAllowed(feature.key, ["Owner"], user);
                }
            }
        }
    });

    it("revokes a default feature before the general manager area bypass", () => {
        for (const feature of ACCESS_CATALOG) {
            for (const role of GYM_ROLES) {
                if (!resolveEffectiveKeys(staff(role)).has(feature.key)) continue;
                const user = staff(role, { featureAccess: { grants: [], revokes: [feature.key] } });
                expect(resolveEffectiveKeys(user).has(feature.key), `${role} ${feature.key}`).toBe(false);
                expectDenied(feature.key, [role], user);
            }
        }
    });

    it("does not let a grant reopen an area the checklist removed", () => {
        const user = staff("Receptionist", { featureAccess: { grants: ["refunds"], revokes: [] } });
        expect(resolveEffectiveKeys(user).has("refunds")).toBe(true);
        expectDenied("refunds", ["Receptionist", "Owner", "Accountant"], user, checklist("Receptionist", []));
    });
});
