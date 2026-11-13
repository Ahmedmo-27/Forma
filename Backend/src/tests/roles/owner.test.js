import { describe, it, expect } from "vitest";
import { AREA_KEYS } from "../../config/roleAccess.js";
import {
    checklist,
    expectAllowed,
    expectAreas,
    expectDenied,
    expectKeys,
    expectList,
    readSource,
    staff,
} from "./helpers.js";

const owner = () => staff("Owner");

describe("Owner", () => {
    it("defaults to every owner area, including settings and role changes", () => {
        expectKeys("Owner", [
            "check_in",
            "members",
            "member_profile",
            "sales_dashboard",
            "sales_members",
            "management",
            "sales_team",
            "staff",
            "transfer",
            "packages",
            "manager_call_center",
            "import_members",
            "targets",
            "approve_requests",
            "whatsapp_templates",
            "reports",
            "accounting_dashboard",
            "contracts",
            "package_approvals",
            "refunds",
            "coach_transfer",
            "owner_dashboard",
            "teams_overview",
            "settings",
            "change_role",
            "access_control",
        ]);
        expectAreas("Owner", [...AREA_KEYS]);
        expectList("Owner", "all");
    });

    it("can open settings, change roles, refund, transfer, and manage packages", () => {
        const user = owner();
        expectAllowed("settings", ["Owner"], user);
        expectAllowed("change_role", ["Owner", "General Manager", "Sales Manager"], user);
        expectAllowed("refunds", ["Owner", "Accountant"], user);
        expectAllowed("transfer", ["Sales Manager", "Owner"], user);
        expectAllowed("packages", ["Owner", "Sales Manager"], user);
        expectAllowed("teams_overview", ["Owner"], user);
        expectAllowed("check_in", ["Receptionist", "Owner", "Sales Manager", "Sales"], user);
    });

    it("can set sales targets and block a member", () => {
        const users = readSource("routes", "userRoutes.js");
        const members = readSource("routes", "membersRoutes.js");
        const userController = readSource("controllers", "userController.js");
        expect(users).toContain('allowRoles("targets", "Sales Manager", "Owner", "Accountant")');
        expect(userController).toContain('const targetEditors = ["Sales Manager", "Owner", "Accountant", "General Manager"]');
        expect(members).toContain('allowRoles("management", "Owner", "Sales Manager", "Head Coach", "General Manager")');
        expectAllowed("targets", ["Sales Manager", "Owner", "Accountant"], owner());
        expectAllowed("management", ["Owner", "Sales Manager", "Head Coach", "General Manager"], owner());
    });

    it("cannot check in a personal-training session or open a rep call queue", () => {
        const user = owner();
        expectDenied("coach_checkin", ["Coach", "Head Coach"], user);
        expectDenied("my_call_center", ["Sales"], user);
    });

    it("keeps gym settings when a checklist tries to clear them", () => {
        expectAllowed("settings", ["Owner"], owner(), checklist("Owner", []));
    });
});
