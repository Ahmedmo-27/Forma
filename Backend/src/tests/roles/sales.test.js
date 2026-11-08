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

const rep = () => staff("Sales");

describe("Sales", () => {
    it("defaults to the pipeline, call center, comments, and reports", () => {
        expectKeys("Sales", [
            "check_in",
            "member_profile",
            "sales_dashboard",
            "sales_members",
            "my_call_center",
            "comments",
            "request_assignment",
            "request_takeover",
            "whatsapp_send",
            "view_phones",
            "reports",
        ]);
        expectAreas("Sales", ["checkin", "members", "sales", "whatsapp", "reports"]);
        expectList("Sales", "scoped");
    });

    it("can open the sales home, personal call center, and check-in", () => {
        const user = rep();
        expectAllowed("sales_dashboard", ["Sales", "Sales Manager", "Owner"], user);
        expectAllowed("my_call_center", ["Sales"], user);
        expectAllowed("comments", ["Owner", "Sales", "Sales Manager", "Coach", "Coach Manager"], user);
        expectAllowed("check_in", ["Receptionist", "Owner", "Sales Manager", "Sales"], user);
        expectAllowed("sales_members", ["Sales", "Sales Manager", "Owner"], user);
    });

    it("cannot refund, edit packages, or open gym settings", () => {
        const user = rep();
        expectDenied("refunds", ["Owner", "Accountant"], user);
        expectDenied("packages", ["Owner", "Sales Manager"], user);
        expectDenied("settings", ["Owner"], user);
        expectDenied("change_role", ["Owner", "General Manager", "Sales Manager"], user);
        expectDenied("transfer", ["Sales Manager", "Owner"], user);
    });

    it("cannot open the call center after the owner removes sales", () => {
        expectDenied(
            "my_call_center",
            ["Sales"],
            rep(),
            checklist("Sales", ["checkin", "members", "reports"])
        );
    });
});
