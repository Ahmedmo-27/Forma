import { createRequire } from "module";
import { describe, expect, it } from "vitest";
import { EXPECTED_KEYS } from "../../../Backend/src/tests/roles/expectedAccess.js";
import { TENANT_GUARDS } from "./tenantGuards.js";
import { homePath } from "./routeAccess.js";
import { canSeeRoute, featureAllowed, featureKeys, guardForPath, routeFeatureAllowed } from "./canSeeRoute.js";

const require = createRequire(import.meta.url);
const { FEATURE_KEYS } = require("../../../Backend/src/config/featureRegistry.js");

/** Pages every gym keeps, whatever its plan: the owner's home and settings. */
const ALWAYS_ON = new Set(["/owner/dashboard", "/owner/settings"]);

const owner = { role: "Owner", access: EXPECTED_KEYS.Owner };

describe("Tenant guard feature coverage", () => {
    it("gives every route a plan feature except the owner home and settings", () => {
        const missing = TENANT_GUARDS
            .filter((guard) => !ALWAYS_ON.has(guard.path) && featureKeys(guard.feature).length === 0)
            .map((guard) => guard.path);
        expect(missing).toEqual([]);
    });

    it("only names features that exist in the backend registry", () => {
        const known = new Set(FEATURE_KEYS);
        const unknown = TENANT_GUARDS
            .flatMap((guard) => featureKeys(guard.feature))
            .filter((key) => !known.has(key));
        expect(unknown).toEqual([]);
    });

    it("keeps owner home and settings available when every feature is off", () => {
        for (const path of ALWAYS_ON) {
            expect(routeFeatureAllowed(() => false, path), path).toBe(true);
        }
    });

    it("locks each route when its feature is removed", () => {
        for (const guard of TENANT_GUARDS) {
            const keys = featureKeys(guard.feature);
            if (!keys.length) continue;
            const withoutIt = (key) => !keys.includes(key);
            expect(routeFeatureAllowed(withoutIt, guard.path), guard.path).toBe(false);
            expect(routeFeatureAllowed(() => true, guard.path), guard.path).toBe(true);
        }
    });
});

describe("guardForPath", () => {
    it("finds static and parameter routes", () => {
        expect(guardForPath("/members")?.page).toBe("Members");
        expect(guardForPath("/members/abc123")?.page).toBe("MemberProfile");
        expect(guardForPath("/sales/team/receptionist/9")?.page).toBe("ReceptionistProfile");
        expect(guardForPath("/sales/team/9?tab=x")?.page).toBe("SalesPersonProfile");
        expect(guardForPath("/retail/pos/")?.page).toBe("RetailPosPage");
        expect(guardForPath("/nope")).toBeNull();
    });
});

describe("featureAllowed", () => {
    it("treats a list as any-of and a missing feature as allowed", () => {
        const only = (...keys) => (key) => keys.includes(key);
        expect(featureAllowed(only("funnels"), ["exec_analytics", "funnels"])).toBe(true);
        expect(featureAllowed(only("members"), ["exec_analytics", "funnels"])).toBe(false);
        expect(featureAllowed(() => false, undefined)).toBe(true);
    });
});

describe("canSeeRoute", () => {
    it("combines role/access with plan features", () => {
        expect(canSeeRoute(owner, () => true, "/retail/pos")).toBe(true);
        expect(canSeeRoute(owner, (key) => key !== "retail", "/retail/pos")).toBe(false);
        expect(canSeeRoute(null, () => true, "/retail/pos")).toBe(false);
        const noAccess = { role: "Owner", access: [] };
        expect(canSeeRoute(noAccess, () => true, "/retail/pos")).toBe(false);
    });

    it("lets a hub open while any one of its modules is on", () => {
        expect(canSeeRoute(owner, (key) => key === "tasks", "/management")).toBe(true);
        expect(canSeeRoute(owner, () => false, "/management")).toBe(false);
    });
});

describe("homePath with plan features", () => {
    it("skips a home page the plan has switched off", () => {
        const receptionist = { role: "Receptionist", access: EXPECTED_KEYS.Receptionist };
        const allowed = (path) => routeFeatureAllowed((key) => key !== "checkin", path);
        expect(homePath(receptionist, allowed)).toBe("/members");
    });

    it("keeps the role home when nothing is switched off", () => {
        expect(homePath(owner, () => true)).toBe("/owner/dashboard");
    });
});
