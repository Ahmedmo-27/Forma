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

const coach = () => staff("Coach");

describe("Coach", () => {
    it("defaults to sessions, assigned members, and coach notes", () => {
        expectKeys("Coach", [
            "member_profile",
            "request_assignment",
            "request_takeover",
            "coach_dashboard",
            "coach_members",
            "coach_checkin",
            "assign_pt",
            "my_transfers",
            "coach_notes",
        ]);
        expectAreas("Coach", ["members", "sales", "coaching"]);
        expectList("Coach", "scoped");
    });

    it("can check in a session and write coach notes", () => {
        const user = coach();
        expectAllowed("coach_checkin", ["Coach", "Head Coach"], user);
        expectAllowed("assign_pt", ["Coach", "Head Coach"], user);
        expectAllowed("coach_notes", ["Coach", "Head Coach"], user);
        expectAllowed("my_transfers", ["Coach", "Head Coach"], user);
        expectAllowed("coach_members", ["Coach", "Head Coach"], user);
        expectAllowed("member_profile", ["Receptionist", "Owner", "Sales", "Sales Manager", "Coach", "Head Coach", "Accountant"], user);
    });

    it("cannot edit packages, refund, or move members between coaches", () => {
        const user = coach();
        expectDenied("packages", ["Owner", "Sales Manager"], user);
        expectDenied("refunds", ["Owner", "Accountant"], user);
        expectDenied("coach_transfer", ["Head Coach", "Owner"], user);
        expectDenied("settings", ["Owner"], user);
        expectDenied("staff", ["Sales Manager", "Owner", "Head Coach"], user);
    });

    it("cannot check in a session after the owner removes coaching", () => {
        expectDenied(
            "coach_checkin",
            ["Coach", "Head Coach"],
            coach(),
            checklist("Coach", ["members"])
        );
    });
});
