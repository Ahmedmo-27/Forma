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

const books = () => staff("Accountant");

describe("Accountant", () => {
    it("defaults to the ledger, contracts, refunds, and package approvals", () => {
        expectKeys("Accountant", [
            "members",
            "member_profile",
            "sales_team",
            "targets",
            "whatsapp_templates",
            "accounting_dashboard",
            "contracts",
            "package_approvals",
            "refunds",
        ]);
        expectAreas("Accountant", ["members", "sales", "whatsapp", "accounting", "exception_approvals"]);
        expectList("Accountant", "all");
    });

    it("can refund, approve package exceptions, and read contracts", () => {
        const user = books();
        expectAllowed("refunds", ["Owner", "Accountant"], user);
        expectAllowed("package_approvals", ["Accountant", "Owner"], user);
        expectAllowed("contracts", ["Accountant", "Owner", "Sales Manager"], user);
        expectAllowed("accounting_dashboard", ["Accountant", "Owner"], user);
        expectAllowed("targets", ["Sales Manager", "Owner", "Accountant"], user);
        expectAllowed("sales_team", ["Sales Manager", "Owner", "Accountant"], user);
    });

    it("cannot change roles, edit packages, or open gym settings", () => {
        const user = books();
        expectDenied("change_role", ["Owner", "General Manager", "Sales Manager"], user);
        expectDenied("packages", ["Owner", "Sales Manager"], user);
        expectDenied("settings", ["Owner"], user);
        expectDenied("check_in", ["Receptionist", "Owner", "Sales Manager", "Sales"], user);
    });

    it("cannot refund after the owner removes accounting", () => {
        expectDenied(
            "refunds",
            ["Owner", "Accountant"],
            books(),
            checklist("Accountant", ["members"])
        );
    });
});
