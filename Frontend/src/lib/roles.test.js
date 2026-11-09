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
            expect(ASSIGNABLE_ROLES["Coach Manager"]).toEqual(["Coach"]);
        });
    });

    describe("canChangeUserRole", () => {
        it("forbids changing the role of an Owner for all actors", () => {
            expect(canChangeUserRole("Owner", "Owner")).toBe(false);
            expect(canChangeUserRole("General Manager", "Owner")).toBe(false);
            expect(canChangeUserRole("Sales Manager", "Owner")).toBe(false);
            expect(canChangeUserRole("Coach Manager", "Owner")).toBe(false);
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
            expect(canChangeUserRole("Sales Manager", "Coach Manager")).toBe(false);
            expect(canChangeUserRole("Sales Manager", "Accountant")).toBe(false);
        });

        it("restricts Coach Manager to changing only Coach", () => {
            expect(canChangeUserRole("Coach Manager", "Coach")).toBe(true);
            expect(canChangeUserRole("Coach Manager", "Sales")).toBe(false);
            expect(canChangeUserRole("Coach Manager", "Receptionist")).toBe(false);
            expect(canChangeUserRole("Coach Manager", "Coach Manager")).toBe(false);
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

        it("provides only coach roles for Coach Manager", () => {
            expect(roleChoicesFor("Coach Manager", "Coach")).toEqual(["Coach"]);
        });
    });
});
