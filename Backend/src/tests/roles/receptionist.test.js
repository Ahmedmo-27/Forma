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

const desk = () => staff("Receptionist");

describe("Receptionist", () => {
    it("defaults to check-in, the member directory, profiles, and phone numbers", () => {
        expectKeys("Receptionist", ["check_in", "members", "member_profile", "view_phones"]);
        expectAreas("Receptionist", ["checkin", "members", "sales"]);
        expectList("Receptionist", "all");
    });

    it("can check members in and add a member", () => {
        const user = desk();
        expectAllowed("check_in", ["Receptionist", "Owner", "Sales Manager", "Sales"], user);
        expectAllowed("members", ["Receptionist", "Owner", "Sales Manager", "Sales"], user);
        expectAllowed("member_profile", ["Receptionist", "Owner", "Sales", "Sales Manager", "Coach", "Head Coach", "Accountant"], user);
    });

    it("cannot transfer coaches, refund, or open settings", () => {
        const user = desk();
        expectDenied("coach_transfer", ["Head Coach", "Owner"], user);
        expectDenied("refunds", ["Owner", "Accountant"], user);
        expectDenied("settings", ["Owner"], user);
        expectDenied("packages", ["Owner", "Sales Manager"], user);
    });

    it("cannot check in after the owner removes that area", () => {
        expectDenied(
            "check_in",
            ["Receptionist", "Owner", "Sales Manager", "Sales"],
            desk(),
            checklist("Receptionist", ["members"])
        );
    });
});
