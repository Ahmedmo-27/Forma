import { describe, it, expect } from "vitest";
import {
    canChangeUserRole,
    roleChoicesFor,
    assignableRolesFor,
    ASSIGNABLE_ROLES,
} from "./roles.js";

describe("Frontend Role Hierarchy Utilities (roles.js)", () => {
    describe("ASSIGNABLE_ROLES & assignableRolesFor", () => {
        it("strictly defines assignable roles per hierarchy", () => {
            expect(ASSIGNABLE_ROLES.Owner).not.toContain("Owner");
            expect(ASSIGNABLE_ROLES["General Manager"]).not.toContain("Owner");
            expect(ASSIGNABLE_ROLES["General Manager"]).not.toContain("General Manager");
            expect(ASSIGNABLE_ROLES["Sales Manager"]).toEqual(["Sales", "Receptionist"]);
            expect(ASSIGNABLE_ROLES["Head Coach"]).toEqual(["Coach"]);
        });
    });

    describe("canChangeUserRole", () => {
        it("forbids changing the role of an Owner for all actors", () => {
            expect(canChangeUserRole("Owner", "Owner")).toBe(false);
            expect(canChangeUserRole("General Manager", "Owner")).toBe(false);
            expect(canChangeUserRole("Sales Manager", "Owner")).toBe(false);
            expect(canChangeUserRole("Head Coach", "Owner")).toBe(false);
            expect(canChangeUserRole("Sales", "Owner")).toBe(false);
        });

        it("forbids General Manager from changing another General Manager", () => {
            expect(canChangeUserRole("General Manager", "General Manager")).toBe(false);
            expect(canChangeUserRole("Sales Manager", "General Manager")).toBe(false);
            expect(canChangeUserRole("Owner", "General Manager")).toBe(true);
        });

        it("restricts Sales Manager to changing only Sales and Receptionist", () => {
            expect(canChangeUserRole("Sales Manager", "Sales")).toBe(true);
            expect(canChangeUserRole("Sales Manager", "Receptionist")).toBe(true);
            expect(canChangeUserRole("Sales Manager", "Coach")).toBe(false);
            expect(canChangeUserRole("Sales Manager", "Head Coach")).toBe(false);
            expect(canChangeUserRole("Sales Manager", "Accountant")).toBe(false);
        });

        it("restricts Head Coach to changing only Coach", () => {
            expect(canChangeUserRole("Head Coach", "Coach")).toBe(true);
            expect(canChangeUserRole("Head Coach", "Sales")).toBe(false);
            expect(canChangeUserRole("Head Coach", "Receptionist")).toBe(false);
            expect(canChangeUserRole("Head Coach", "Head Coach")).toBe(false);
        });

        it("forbids regular staff without assignable roles from changing roles", () => {
            expect(canChangeUserRole("Sales", "Sales")).toBe(false);
            expect(canChangeUserRole("Coach", "Coach")).toBe(false);
            expect(canChangeUserRole("Receptionist", "Sales")).toBe(false);
            expect(canChangeUserRole("Accountant", "Sales")).toBe(false);
        });
    });

    describe("roleChoicesFor", () => {
        it("never includes Owner in role choices for any role", () => {
            expect(roleChoicesFor("Sales Manager", "Owner")).toEqual(["Sales", "Receptionist"]);
            expect(roleChoicesFor("General Manager", "Owner")).not.toContain("Owner");
            expect(roleChoicesFor("Owner", "Owner")).not.toContain("Owner");
        });

        it("provides only team roles for Sales Manager", () => {
            expect(roleChoicesFor("Sales Manager", "Sales")).toEqual(["Sales", "Receptionist"]);
            expect(roleChoicesFor("Sales Manager", "Receptionist")).toEqual(["Sales", "Receptionist"]);
        });

        it("provides only coach roles for Head Coach", () => {
            expect(roleChoicesFor("Head Coach", "Coach")).toEqual(["Coach"]);
        });

        it("allows delegated Sales Manager with staff access to assign all non-owner staff roles", () => {
            const delegatedSm = { role: "Sales Manager", accessOverrides: { add: ["staff"] } };
            expect(canChangeUserRole(delegatedSm, "Coach")).toBe(true);
            expect(canChangeUserRole(delegatedSm, "Accountant")).toBe(true);
            expect(canChangeUserRole(delegatedSm, "Owner")).toBe(false);
            expect(canChangeUserRole(delegatedSm, "General Manager")).toBe(false);

            const choices = roleChoicesFor(delegatedSm, "Coach");
            expect(choices).toContain("Coach");
            expect(choices).toContain("Sales");
            expect(choices).toContain("Accountant");
            expect(choices).not.toContain("Owner");
        });
    });
});
