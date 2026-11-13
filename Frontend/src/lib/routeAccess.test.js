import { describe, expect, it } from "vitest";
import { EXPECTED_KEYS, GYM_ROLES } from "../../../Backend/src/tests/roles/expectedAccess.js";
import { TENANT_GUARDS } from "./tenantGuards.js";
import { canEnterRoute, homePath } from "./routeAccess.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const appSource = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../App.jsx"),
    "utf8"
);

/** Paths each role can open with default feature keys. Access keys win over the role list. */
const OPEN = {
    Owner: ["/account/whatsapp", "/members", "/tasks", "/tasks/assign", "/tasks/filter", "/tasks/filter/results", "/tasks/assigned", "/members/:id", "/checkin", "/sales/dashboard", "/sales/members", "/sales/requests", "/sales/team", "/sales/team/receptionist/:id", "/sales/team/:id", "/sales/callcenter", "/sales/staff", "/sales/packages", "/sales/whatsapp-templates", "/coach/whatsapp-templates", "/sales/targets", "/sales/subscriptions", "/sales/import", "/accounting/dashboard", "/accounting/package-requests", "/accounting/contract-history", "/contacts", "/owner/dashboard", "/owner/teams", "/owner/teams/:id", "/owner/settings", "/owner/access", "/management", "/management/access", "/management/quick-transfer", "/analytics", "/reports", "/reports/executive", "/reports/churn", "/reports/forecast", "/reports/cohorts", "/reports/attendance", "/reports/funnel", "/reports/guests", "/reports/expired", "/reports/imported"],
    "General Manager": ["/account/whatsapp", "/members", "/tasks", "/tasks/assign", "/tasks/filter", "/tasks/filter/results", "/tasks/assigned", "/members/:id", "/checkin", "/sales/dashboard", "/sales/members", "/sales/requests", "/sales/team", "/sales/team/receptionist/:id", "/sales/team/:id", "/sales/callcenter", "/sales/staff", "/sales/packages", "/sales/whatsapp-templates", "/coach/whatsapp-templates", "/sales/targets", "/sales/subscriptions", "/sales/my-callcenter", "/sales/import", "/accounting/dashboard", "/accounting/package-requests", "/accounting/contract-history", "/coach/dashboard", "/coach/members", "/coach/checkin", "/coach/attendance", "/coach/staff", "/coach/targets", "/coach/team", "/coach/team/:id", "/coach/my-transfers", "/contacts", "/owner/dashboard", "/owner/teams", "/owner/teams/:id", "/owner/access", "/management", "/management/access", "/management/quick-transfer", "/analytics", "/reports", "/reports/executive", "/reports/churn", "/reports/forecast", "/reports/cohorts", "/reports/attendance", "/reports/funnel", "/reports/guests", "/reports/expired", "/reports/imported"],
    "Sales Manager": ["/account/whatsapp", "/members", "/tasks", "/tasks/assign", "/tasks/filter", "/tasks/filter/results", "/tasks/assigned", "/members/:id", "/checkin", "/sales/dashboard", "/sales/members", "/sales/requests", "/sales/team", "/sales/team/receptionist/:id", "/sales/team/:id", "/sales/callcenter", "/sales/staff", "/sales/packages", "/sales/whatsapp-templates", "/coach/whatsapp-templates", "/sales/targets", "/sales/subscriptions", "/sales/import", "/accounting/contract-history", "/contacts", "/owner/access", "/management", "/management/access", "/management/quick-transfer", "/analytics", "/reports", "/reports/executive", "/reports/churn", "/reports/forecast", "/reports/cohorts", "/reports/attendance", "/reports/funnel", "/reports/guests", "/reports/expired", "/reports/imported"],
    Sales: ["/account/whatsapp", "/tasks", "/tasks/assigned", "/members/:id", "/checkin", "/sales/dashboard", "/sales/members", "/sales/requests", "/sales/subscriptions", "/sales/my-callcenter", "/contacts", "/reports", "/reports/guests", "/reports/expired", "/reports/imported"],
    "Head Coach": ["/account/whatsapp", "/members", "/tasks", "/tasks/assign", "/tasks/filter", "/tasks/filter/results", "/tasks/assigned", "/members/:id", "/sales/whatsapp-templates", "/coach/whatsapp-templates", "/coach/dashboard", "/coach/members", "/coach/checkin", "/coach/attendance", "/coach/staff", "/coach/targets", "/coach/team", "/coach/team/:id", "/coach/my-transfers", "/contacts", "/owner/access", "/management", "/management/access", "/management/quick-transfer", "/reports", "/reports/guests", "/reports/expired", "/reports/imported"],
    Coach: ["/account/whatsapp", "/tasks", "/tasks/assigned", "/members/:id", "/sales/requests", "/coach/dashboard", "/coach/members", "/coach/checkin", "/coach/my-transfers", "/contacts"],
    Receptionist: ["/account/whatsapp", "/members", "/tasks", "/tasks/assign", "/tasks/filter", "/tasks/filter/results", "/tasks/assigned", "/members/:id", "/checkin", "/contacts"],
    Accountant: ["/account/whatsapp", "/members", "/tasks", "/tasks/assign", "/tasks/filter", "/tasks/filter/results", "/tasks/assigned", "/members/:id", "/sales/team", "/sales/team/receptionist/:id", "/sales/team/:id", "/sales/whatsapp-templates", "/coach/whatsapp-templates", "/sales/targets", "/accounting/dashboard", "/accounting/package-requests", "/accounting/contract-history", "/contacts", "/analytics", "/reports", "/reports/executive", "/reports/churn", "/reports/forecast", "/reports/cohorts", "/reports/attendance", "/reports/funnel"],
};

const HOME = {
    Owner: "/owner/dashboard",
    "General Manager": "/owner/dashboard",
    "Sales Manager": "/sales/dashboard",
    Sales: "/sales/dashboard",
    "Head Coach": "/coach/dashboard",
    Coach: "/coach/dashboard",
    Receptionist: "/checkin",
    Accountant: "/accounting/dashboard",
};

function user(role) {
    return { role, access: EXPECTED_KEYS[role] };
}

describe("Tenant route guards", () => {
    it("renders every guard from the shared table", () => {
        expect(appSource).toContain("TENANT_GUARDS.map");
        const paths = TENANT_GUARDS.map((guard) => guard.path);
        expect(new Set(paths).size).toBe(paths.length);
        for (const guard of TENANT_GUARDS) {
            expect(appSource, guard.page).toContain(guard.page);
        }
    });

    it("sends a signed-out person away", () => {
        expect(canEnterRoute(null, { roles: ["Owner"], access: "settings" })).toBe(false);
        expect(homePath(null)).toBeNull();
    });

    it("opens exactly the frozen paths for each role", () => {
        for (const role of GYM_ROLES) {
            const open = TENANT_GUARDS.filter((guard) => canEnterRoute(user(role), guard)).map((guard) => guard.path);
            expect(open, role).toEqual(OPEN[role]);
            expect(homePath(user(role)), role).toBe(HOME[role]);
        }
    });

    it("keeps settings on the owner and coach tools off the owner home list", () => {
        expect(OPEN.Owner).toContain("/owner/settings");
        expect(OPEN["General Manager"]).not.toContain("/owner/settings");
        expect(OPEN.Owner).not.toContain("/coach/dashboard");
        expect(OPEN.Sales).toContain("/reports/imported");
        expect(OPEN.Coach).toContain("/sales/requests");
    });

    it("falls back when the role home is not in the access list", () => {
        expect(homePath({ role: "Owner", access: ["members"] })).toBe("/members");
        expect(homePath({
            role: "Owner",
            access: ["reports"],
            navExtras: [{ to: "/custom", label: "Custom" }],
        })).toBe("/custom");
        expect(homePath({ role: "Owner", access: [] })).toBe("/contacts");
    });
});
