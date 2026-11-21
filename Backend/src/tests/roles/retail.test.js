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

const desk = () => staff("Retail");

describe("Retail", () => {
    it("defaults to Bar & Shop POS only", () => {
        expectKeys("Retail", ["retail_pos"]);
        expectAreas("Retail", ["retail"]);
        expectList("Retail", "deny");
    });

    it("can open the POS and create a sale", () => {
        const user = desk();
        expectAllowed("retail_pos", ["Receptionist", "Owner", "General Manager", "Retail"], user);
    });

    it("cannot manage vendors, read revenue, or open settings by default", () => {
        const user = desk();
        expectDenied("retail_manage", ["Owner", "General Manager"], user);
        expectDenied("retail_reports", ["Accountant", "Owner", "General Manager"], user);
        expectDenied("settings", ["Owner"], user);
        expectDenied("members", ["Receptionist", "Owner", "Sales Manager", "Sales"], user);
        expectDenied("check_in", ["Receptionist", "Owner", "Sales Manager", "Sales"], user);
    });

    it("can manage vendors and read revenue after an Owner grant", () => {
        const user = staff("Retail", {
            featureAccess: { grants: ["retail_manage", "retail_reports"], revokes: [] },
        });
        expectAllowed("retail_manage", ["Owner", "General Manager"], user);
        expectAllowed("retail_reports", ["Accountant", "Owner", "General Manager"], user);
        expectAllowed("retail_pos", ["Receptionist", "Owner", "General Manager", "Retail"], user);
    });

    it("cannot use the POS after the owner removes the retail area", () => {
        expectDenied(
            "retail_pos",
            ["Receptionist", "Owner", "General Manager", "Retail"],
            desk(),
            checklist("Retail", [])
        );
    });
});
