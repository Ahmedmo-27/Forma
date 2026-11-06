import { describe, it } from "vitest";
import {
    checklist,
    expectAllowed,
    expectAreas,
    expectDenied,
    expectKeys,
    expectList,
    staff,
} from "./helpers.js";

const manager = () => staff("Sales Manager");

describe("Sales Manager", () => {
    it("defaults to the sales team, staff, transfers, and packages", () => {
        expectKeys("Sales Manager", [
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
            "contracts",
            "access_control",
        ]);
        expectAreas("Sales Manager", [
            "checkin",
            "members",
            "sales",
            "whatsapp",
            "packages",
            "excel_import",
            "accounting",
            "reports",
            "staff",
        ]);
        expectList("Sales Manager", "scoped");
    });

    it("can transfer members, edit packages, and approve requests", () => {
        const user = manager();
        expectAllowed("transfer", ["Sales Manager", "Owner"], user);
        expectAllowed("packages", ["Owner", "Sales Manager"], user);
        expectAllowed("approve_requests", ["Sales Manager", "Owner"], user);
        expectAllowed("staff", ["Sales Manager", "Owner", "Coach Manager"], user);
        expectAllowed("targets", ["Sales Manager", "Owner", "Accountant"], user);
        expectAllowed("manager_call_center", ["Sales Manager", "Owner"], user);
        expectAllowed("import_members", ["Sales Manager", "Owner"], user);
    });

    it("cannot refund, change roles, or open coach transfers", () => {
        const user = manager();
        expectDenied("refunds", ["Owner", "Accountant"], user);
        expectDenied("change_role", ["Owner"], user);
        expectDenied("settings", ["Owner"], user);
        expectDenied("coach_transfer", ["Coach Manager", "Owner"], user);
    });

    it("cannot transfer members after the owner removes sales tools", () => {
        expectDenied(
            "transfer",
            ["Sales Manager", "Owner"],
            manager(),
            checklist("Sales Manager", ["members", "checkin"])
        );
    });
});
