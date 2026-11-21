import { describe, expect, it } from "vitest";
import { EXPECTED_KEYS, GYM_ROLES } from "../../../Backend/src/tests/roles/expectedAccess.js";
import { bottomNavFor, visibleNavItems } from "./tenantNav.js";

const on = () => true;
const off = () => false;

const NAV_PATHS = {
    Owner: ["/owner/dashboard", "/members", "/tasks", "/checkin", "/inbox", "/maintenance", "/retail/pos", "/reports", "/management", "/sales/callcenter", "/owner/access", "/analytics", "/contacts", "/owner/settings"],
    "General Manager": ["/owner/dashboard", "/members", "/tasks", "/checkin", "/inbox", "/maintenance", "/retail/pos", "/reports", "/management", "/sales/callcenter", "/owner/access", "/analytics", "/contacts"],
    "Sales Manager": ["/sales/dashboard", "/members", "/tasks", "/checkin", "/inbox", "/reports", "/management", "/sales/callcenter", "/analytics", "/owner/access", "/contacts"],
    Sales: ["/sales/dashboard", "/sales/members", "/tasks", "/checkin", "/inbox", "/reports", "/sales/my-callcenter", "/contacts"],
    "Head Coach": ["/coach/dashboard", "/coach/members", "/tasks", "/coach/checkin", "/coach/attendance", "/reports", "/management", "/contacts"],
    Coach: ["/coach/dashboard", "/coach/members", "/tasks", "/coach/checkin", "/coach/my-transfers", "/contacts"],
    Receptionist: ["/checkin", "/members", "/maintenance", "/retail/pos", "/contacts"],
    Accountant: ["/accounting/dashboard", "/members", "/tasks", "/accounting/contract-history", "/sales/targets", "/accounting/package-requests", "/retail/reports", "/analytics", "/contacts", "/reports"],
};

const BOTTOM = {
    Owner: ["/owner/dashboard", "/members", "/checkin", "/tasks"],
    "General Manager": ["/owner/dashboard", "/members", "/checkin", "/tasks"],
    "Sales Manager": ["/sales/dashboard", "/members", "/checkin", "/tasks"],
    Sales: ["/sales/dashboard", "/sales/members", "/checkin", "/sales/my-callcenter"],
    "Head Coach": ["/coach/dashboard", "/coach/members", "/coach/checkin", "/tasks"],
    Coach: ["/coach/dashboard", "/coach/members", "/coach/checkin", "/tasks"],
    Receptionist: ["/checkin", "/members", "/contacts"],
    Accountant: ["/accounting/dashboard", "/members", "/checkin", "/accounting/contract-history"],
};

function user(role, extra = {}) {
    return { role, access: EXPECTED_KEYS[role], ...extra };
}

describe("Tenant navigation", () => {
    it("shows the frozen sidebar and the first four bottom tabs for each role", () => {
        for (const role of GYM_ROLES) {
            const paths = visibleNavItems(user(role), on).map((item) => item.to);
            expect(paths, role).toEqual(NAV_PATHS[role]);
            expect(bottomNavFor(role).map((item) => item.to), role).toEqual(BOTTOM[role]);
            expect(bottomNavFor(role).length).toBeLessThanOrEqual(4);
        }
    });

    it("hides plan-gated items when the gym does not have the feature", () => {
        const without = (...keys) => (feature) => !keys.includes(feature);

        const manager = visibleNavItems(user("Sales Manager"), without("sales_crm")).map((item) => item.to);
        expect(manager).not.toContain("/sales/dashboard");
        expect(manager).not.toContain("/sales/callcenter");
        expect(manager).toContain("/members");

        // Default: out-of-plan modules stay hidden even for Owner (empty allow-list).
        const reportless = visibleNavItems(
            user("Owner"),
            without("reports_basic", "exec_analytics", "funnels", "business_intelligence"),
        );
        expect(reportless.map((item) => item.to)).not.toContain("/reports");
        expect(reportless.map((item) => item.to)).toContain("/owner/settings");

        // Allow-listed out-of-plan feature shows as locked for Owner.
        const reportPreview = visibleNavItems(
            user("Owner"),
            without("reports_basic", "exec_analytics", "funnels", "business_intelligence"),
            ["reports_basic"],
        );
        expect(reportPreview.find((item) => item.to === "/reports")?.locked).toBe(true);

        // Roles without trial-request access hide missing plan modules even if allow-listed.
        const salesReportless = visibleNavItems(
            user("Sales"),
            without("reports_basic", "exec_analytics", "funnels", "business_intelligence"),
            ["reports_basic"],
        ).map((item) => item.to);
        expect(salesReportless).not.toContain("/reports");

        const noMembers = visibleNavItems(user("Sales Manager"), without("members")).map((item) => item.to);
        expect(noMembers).not.toContain("/members");
        expect(noMembers).not.toContain("/analytics");

        const receptionist = visibleNavItems(user("Receptionist"), off).map((item) => item.to);
        expect(receptionist).toEqual([]);

        const ownerOff = visibleNavItems(user("Owner"), off);
        // Dashboard and settings have no plan feature; other Owner tabs stay hidden by default.
        expect(ownerOff.map((item) => item.to)).toContain("/owner/dashboard");
        expect(ownerOff.map((item) => item.to)).toContain("/owner/settings");
        expect(ownerOff.map((item) => item.to)).not.toContain("/members");
    });

    it("hides the new module pages when their feature is removed", () => {
        const gated = {
            retail: { path: "/retail/pos", role: "Receptionist" },
            maintenance: { path: "/maintenance", role: "Receptionist" },
            tasks: { path: "/tasks", role: "Sales Manager" },
            contacts: { path: "/contacts", role: "Sales Manager" },
            access_control: { path: "/owner/access", role: "Sales Manager" },
        };
        for (const [feature, { path, role }] of Object.entries(gated)) {
            // Without allow-list, Owner also hides locked modules.
            const ownerPaths = visibleNavItems(user("Owner"), (key) => key !== feature).map((item) => item.to);
            expect(ownerPaths, `owner ${feature}`).not.toContain(path);

            // With allow-list, Owner sees a locked preview.
            const ownerItem = visibleNavItems(
                user("Owner"),
                (key) => key !== feature,
                [feature],
            ).find((item) => item.to === path);
            expect(ownerItem?.locked, `owner preview ${feature}`).toBe(true);

            const paths = visibleNavItems(user(role), (key) => key !== feature, [feature]).map((item) => item.to);
            expect(paths, feature).not.toContain(path);
        }
    });

    it("filters bottom tabs by plan feature and lets later tabs move up", () => {
        // Default: Owner hides locked Tasks so the bottom bar only keeps unlocked tabs.
        const ownerTabs = bottomNavFor("Owner", user("Owner"), (feature) => feature !== "tasks");
        expect(ownerTabs.map((item) => item.to)).toEqual(["/owner/dashboard", "/members", "/checkin"]);

        // Allow-listed Tasks stays as a locked bottom tab.
        const ownerPreview = bottomNavFor(
            "Owner",
            user("Owner"),
            (feature) => feature !== "tasks",
            ["tasks"],
        );
        expect(ownerPreview.map((item) => item.to)).toEqual(["/owner/dashboard", "/members", "/checkin", "/tasks"]);
        expect(ownerPreview.find((item) => item.to === "/tasks")?.locked).toBe(true);

        const managerTabs = bottomNavFor("Sales Manager", user("Sales Manager"), (feature) => feature !== "tasks");
        expect(managerTabs.map((item) => item.to)).toEqual(["/sales/dashboard", "/members", "/checkin"]);

        const none = bottomNavFor("Receptionist", user("Receptionist"), off);
        expect(none).toEqual([]);
    });

    it("filters nav extras by the plan feature of their page", () => {
        const paths = visibleNavItems(user("Receptionist", {
            navExtras: [{ to: "/retail/sales", label: "Retail Sales", key: "retail_pos" }],
        }), (feature) => feature !== "retail").map((item) => item.to);
        expect(paths).not.toContain("/retail/sales");
    });
    it("appends nav extras that are not already shown", () => {
        const paths = visibleNavItems(user("Receptionist", {
            navExtras: [{ to: "/custom", label: "Custom", key: "members" }],
        }), on).map((item) => item.to);
        expect(paths).toContain("/custom");
    });

    it("does not duplicate tabs when non-default extras reuse existing labels or access paths", () => {
        const items = visibleNavItems(user("Sales Manager", {
            navExtras: [
                { to: "/coach/dashboard", label: "Dashboard", key: "coach_dashboard" },
                { to: "/coach/members", label: "Members", key: "coach_members" },
                { to: "/coach/checkin", label: "Check In", key: "coach_checkin" },
                { to: "/sales/my-callcenter", label: "Call Center", key: "my_call_center" },
                { to: "/management/access", label: "Access", key: "access_control" },
                { to: "/coach/my-transfers", label: "Transfers", key: "my_transfers" },
                { to: "/coach/transfer", label: "Transfers", key: "coach_transfer" },
                { to: "/coach/attendance", label: "Attendance", key: "coach_attendance" },
            ],
        }), on);
        const labels = items.map((item) => item.label);
        const paths = items.map((item) => item.to);

        expect(labels.filter((label) => label === "Dashboard")).toHaveLength(1);
        expect(labels.filter((label) => label === "Members")).toHaveLength(1);
        expect(labels.filter((label) => label === "Check In")).toHaveLength(1);
        expect(labels.filter((label) => label === "Call Center")).toHaveLength(1);
        expect(labels.filter((label) => label === "Access")).toHaveLength(1);
        expect(labels.filter((label) => label === "Transfers")).toHaveLength(1);
        expect(paths).toContain("/sales/dashboard");
        expect(paths).not.toContain("/coach/dashboard");
        expect(paths).not.toContain("/management/access");
        expect(paths).toContain("/coach/my-transfers");
        expect(paths).not.toContain("/coach/transfer");
        expect(paths).toContain("/coach/attendance");
        expect(new Set(labels).size).toBe(labels.length);
    });
});
