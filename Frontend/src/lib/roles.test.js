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

        it("hides roles the plan does not include, while keeping the person's current role", () => {
            const basic = ["Owner", "Receptionist", "Coach", "Head Coach"];
            const choices = roleChoicesFor("Owner", "Receptionist", basic);
            expect(choices).not.toContain("General Manager");
            expect(choices).not.toContain("Accountant");
            expect(choices).not.toContain("Sales");
            expect(choices).toEqual(expect.arrayContaining(["Receptionist", "Coach", "Head Coach"]));

            const currentManager = roleChoicesFor("Owner", "General Manager", basic);
            expect(currentManager[0]).toBe("General Manager");
            expect(currentManager).not.toContain("Accountant");

            const granted = roleChoicesFor("Owner", "Receptionist", [...basic, "General Manager"]);
            expect(granted).toContain("General Manager");
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

const GYM_ROLES = ["Owner", "General Manager", "Sales Manager", "Sales", "Head Coach", "Coach", "Receptionist", "Accountant"];
const GM_TARGETS = ["Sales Manager", "Sales", "Head Coach", "Coach", "Receptionist", "Accountant"];

function expectedCanChange(actorRole, targetRole) {
    if (targetRole === "Owner") return false;
    if (actorRole === "Owner") return true;
    if (actorRole === "General Manager") return targetRole !== "General Manager";
    if (actorRole === "Sales Manager") return targetRole === "Sales" || targetRole === "Receptionist";
    if (actorRole === "Head Coach") return targetRole === "Coach";
    return false;
}

describe("Frontend role matrix", () => {
    it("matches canChangeUserRole for every actor and target", () => {
        for (const actorRole of GYM_ROLES) {
            for (const targetRole of GYM_ROLES) {
                expect(canChangeUserRole(actorRole, targetRole), `${actorRole} → ${targetRole}`).toBe(
                    expectedCanChange(actorRole, targetRole)
                );
            }
        }
    });

    it("offers only the actor's assignable roles, keeping a current role they may still change", () => {
        expect(roleChoicesFor("Owner", "Sales")).toEqual([
            "General Manager",
            "Sales Manager",
            "Sales",
            "Head Coach",
            "Coach",
            "Receptionist",
            "Accountant",
        ]);
        expect(roleChoicesFor("General Manager", "Coach")).toEqual([
            "Sales Manager",
            "Sales",
            "Head Coach",
            "Coach",
            "Receptionist",
            "Accountant",
        ]);
        expect(roleChoicesFor("Sales Manager", "Sales")).toEqual(["Sales", "Receptionist"]);
        expect(roleChoicesFor("Head Coach", "Coach")).toEqual(["Coach"]);
        expect(roleChoicesFor("Sales", "Sales")).toEqual([]);
        expect(roleChoicesFor("Coach", "Coach")).toEqual([]);
        expect(roleChoicesFor("Receptionist", "Receptionist")).toEqual([]);
        expect(roleChoicesFor("Accountant", "Accountant")).toEqual([]);
        expect(roleChoicesFor("Owner", "Owner")).not.toContain("Owner");
    });

    it("lets delegated staff change the same targets as a general manager", () => {
        for (const actorRole of ["Sales", "Coach", "Receptionist", "Accountant", "Sales Manager", "Head Coach"]) {
            const actor = { role: actorRole, accessOverrides: { add: ["staff"] } };
            for (const targetRole of GYM_ROLES) {
                const allowed = GM_TARGETS.includes(targetRole);
                expect(canChangeUserRole(actor, targetRole), `${actorRole} → ${targetRole}`).toBe(allowed);
            }
            const choices = roleChoicesFor(actor, "Coach");
            expect(choices).toEqual(GM_TARGETS);
        }
    });
});

