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

const lead = () => staff("Coach Manager");

describe("Coach Manager", () => {
    it("defaults to the coach team, staff, and transfers", () => {
        expectKeys("Coach Manager", [
            "members",
            "member_profile",
            "management",
            "whatsapp_templates",
            "reports",
            "coach_dashboard",
            "coach_members",
            "coach_checkin",
            "my_transfers",
            "coach_notes",
            "coach_team",
            "coach_staff",
            "coach_transfer",
            "coach_targets",
            "access_control",
        ]);
        expectAreas("Coach Manager", ["members", "whatsapp", "reports", "coaching", "staff"]);
        expectList("Coach Manager", "scoped");
    });

    it("can transfer coaches, open a member by id, and manage coach staff", () => {
        const members = readSource("routes", "membersRoutes.js");
        const pages = readSource("..", "..", "Frontend", "src", "App.jsx");
        expect(members).toContain(
            'allowRoles("member_profile", "Receptionist", "Owner", "Sales", "Sales Manager", "Coach", "Coach Manager", "Accountant", "General Manager")'
        );
        expect(pages).toContain(
            "roles={['Receptionist', 'Owner', 'Sales', 'Sales Manager', 'Coach', 'Coach Manager', 'Accountant', 'General Manager']} access=\"member_profile\""
        );
        const user = lead();
        expectAllowed(
            "member_profile",
            ["Receptionist", "Owner", "Sales", "Sales Manager", "Coach", "Coach Manager", "Accountant", "General Manager"],
            user
        );
        expectAllowed("coach_transfer", ["Coach Manager", "Owner"], user);
        expectAllowed("coach_team", ["Coach Manager"], user);
        expectAllowed("coach_staff", ["Coach Manager"], user);
        expectAllowed("coach_targets", ["Coach Manager"], user);
        expectAllowed("whatsapp_templates", ["Owner", "Sales Manager", "Accountant", "Coach Manager"], user);
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
            ["Coach Manager", "Owner"],
            lead(),
            checklist("Coach Manager", ["members", "staff"])
        );
    });
});
