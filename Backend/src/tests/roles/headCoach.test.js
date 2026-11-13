import { describe, it, expect } from "vitest";
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

const lead = () => staff("Head Coach");

describe("Head Coach", () => {
    it("defaults to the coach team, staff, and transfers", () => {
        expectKeys("Head Coach", [
            "members",
            "member_profile",
            "management",
            "whatsapp_templates",
            "reports",
            "coach_dashboard",
            "coach_members",
            "coach_checkin",
            "assign_pt",
            "my_transfers",
            "coach_notes",
            "coach_team",
            "coach_staff",
            "coach_transfer",
            "coach_targets",
            "coach_attendance",
            "access_control",
        ]);
        expectAreas("Head Coach", ["members", "whatsapp", "reports", "coaching", "staff"]);
        expectList("Head Coach", "scoped");
    });

    it("can transfer coaches, open a member by id, and manage coach staff", () => {
        const members = readSource("routes", "membersRoutes.js");
        const pages = readSource("..", "..", "Frontend", "src", "App.jsx");
        expect(members).toContain(
            'allowRoles("member_profile", "Receptionist", "Owner", "Sales", "Sales Manager", "Coach", "Head Coach", "Accountant", "General Manager")'
        );
        expect(pages).toContain(
            "roles={['Receptionist', 'Owner', 'Sales', 'Sales Manager', 'Coach', 'Head Coach', 'Accountant', 'General Manager']} access=\"member_profile\""
        );
        const user = lead();
        expectAllowed(
            "member_profile",
            ["Receptionist", "Owner", "Sales", "Sales Manager", "Coach", "Head Coach", "Accountant", "General Manager"],
            user
        );
        expectAllowed("coach_transfer", ["Head Coach", "Owner"], user);
        expectAllowed("coach_team", ["Head Coach"], user);
        expectAllowed("coach_staff", ["Head Coach"], user);
        expectAllowed("coach_targets", ["Head Coach"], user);
        expectAllowed("coach_attendance", ["Head Coach"], user);
        expectAllowed("assign_pt", ["Coach", "Head Coach"], user);
        expectAllowed("whatsapp_templates", ["Owner", "Sales Manager", "Accountant", "Head Coach"], user);
    });

    it("cannot refund, change roles, or edit sales packages", () => {
        const user = lead();
        expectDenied("refunds", ["Owner", "Accountant"], user);
        expectDenied("change_role", ["Owner", "General Manager", "Sales Manager"], user);
        expectDenied("settings", ["Owner"], user);
        expectDenied("packages", ["Owner", "Sales Manager"], user);
    });

    it("cannot move members after the owner removes coaching", () => {
        expectDenied(
            "coach_transfer",
            ["Head Coach", "Owner"],
            lead(),
            checklist("Head Coach", ["members", "staff"])
        );
    });
});
