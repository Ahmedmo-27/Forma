import { describe, expect, it } from "vitest";
import { EXPECTED_KEYS, GYM_ROLES } from "../../../Backend/src/tests/roles/expectedAccess.js";
import { bottomNavFor, visibleNavItems } from "./tenantNav.js";

const on = () => true;
const off = () => false;

const NAV_PATHS = {
    Owner: ["/owner/dashboard", "/members", "/tasks", "/checkin", "/maintenance", "/reports", "/management", "/sales/callcenter", "/owner/access", "/analytics", "/contacts", "/owner/settings"],
    "General Manager": ["/owner/dashboard", "/members", "/tasks", "/checkin", "/maintenance", "/reports", "/management", "/sales/callcenter", "/owner/access", "/analytics", "/contacts"],
    "Sales Manager": ["/sales/dashboard", "/members", "/tasks", "/checkin", "/reports", "/management", "/sales/callcenter", "/analytics", "/owner/access", "/contacts"],
    Sales: ["/sales/dashboard", "/sales/members", "/tasks", "/checkin", "/reports", "/sales/my-callcenter", "/contacts"],
    "Head Coach": ["/coach/dashboard", "/coach/members", "/tasks", "/coach/checkin", "/coach/attendance", "/reports", "/management", "/contacts"],
    Coach: ["/coach/dashboard", "/coach/members", "/tasks", "/coach/checkin", "/coach/my-transfers", "/contacts"],
    Receptionist: ["/checkin", "/members", "/maintenance", "/contacts"],
    Accountant: ["/accounting/dashboard", "/members", "/tasks", "/accounting/contract-history", "/sales/targets", "/accounting/package-requests", "/analytics", "/contacts", "/reports"],
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
        const manager = visibleNavItems(user("Sales Manager"), off).map((item) => item.to);
        expect(manager).not.toContain("/sales/callcenter");
        expect(manager).not.toContain("/reports");
        expect(manager).not.toContain("/analytics");
        expect(manager).toContain("/sales/dashboard");

        const books = visibleNavItems(user("Accountant"), off).map((item) => item.to);
        expect(books).toEqual(["/members", "/tasks", "/contacts"]);

        const owner = visibleNavItems(user("Owner"), off).map((item) => item.to);
        expect(owner).not.toContain("/reports");
        expect(owner).not.toContain("/sales/callcenter");
        expect(owner).not.toContain("/analytics");
        expect(owner).toContain("/owner/settings");
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
