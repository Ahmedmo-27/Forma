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
            "my_transfers",
            "coach_notes",
        ]);
        expectAreas("Coach", ["members", "sales", "coaching"]);
        expectList("Coach", "scoped");
    });

    it("can check in a session and write coach notes", () => {
        const user = coach();
        expectAllowed("coach_checkin", ["Coach", "Coach Manager"], user);
        expectAllowed("coach_notes", ["Coach", "Coach Manager"], user);
        expectAllowed("my_transfers", ["Coach", "Coach Manager"], user);
        expectAllowed("coach_members", ["Coach", "Coach Manager"], user);
        expectAllowed("member_profile", ["Receptionist", "Owner", "Sales", "Sales Manager", "Coach", "Coach Manager", "Accountant"], user);
    });

    it("cannot edit packages, refund, or move members between coaches", () => {
        const user = coach();
        expectDenied("packages", ["Owner", "Sales Manager"], user);
        expectDenied("refunds", ["Owner", "Accountant"], user);
        expectDenied("coach_transfer", ["Coach Manager", "Owner"], user);
        expectDenied("settings", ["Owner"], user);
        expectDenied("staff", ["Sales Manager", "Owner", "Coach Manager"], user);
    });

    it("cannot check in a session after the owner removes coaching", () => {
        expectDenied(
            "coach_checkin",
            ["Coach", "Coach Manager"],
            coach(),
            checklist("Coach", ["members"])
        );
    });
});
