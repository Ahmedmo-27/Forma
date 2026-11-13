import { describe, it, expect } from "vitest";
import {
    canAssignRole,
    canEditTarget,
    directoryRolesFor,
    editableRolesFor,
} from "../utils/accessControl.js";

const blankUser = (role, id = `${role.toLowerCase()}-1`) => ({
    _id: id,
    id,
    role,
    abilities: {},
    featureAccess: { grants: [], revokes: [] },
});

describe("Role Hierarchy Enforcement (Backend)", () => {
    const owner = blankUser("Owner", "owner-1");
    const gm = blankUser("General Manager", "gm-1");
    const salesManager = blankUser("Sales Manager", "sm-1");
    const coachManager = blankUser("Head Coach", "cm-1");
    const sales = blankUser("Sales", "sales-1");
    const receptionist = blankUser("Receptionist", "rec-1");
    const coach = blankUser("Coach", "coach-1");
    const accountant = blankUser("Accountant", "acc-1");

    describe("Directory & Editable Roles", () => {
        it("restricts Sales Manager lookup to their own team only (Sales, Receptionist)", () => {
            const smRoles = directoryRolesFor("Sales Manager");
            expect(smRoles).toEqual(["Sales", "Receptionist"]);
            expect(smRoles).not.toContain("Owner");
            expect(smRoles).not.toContain("General Manager");
            expect(smRoles).not.toContain("Head Coach");
            expect(smRoles).not.toContain("Coach");
            expect(smRoles).not.toContain("Accountant");
        });

        it("restricts Head Coach lookup to their own team only (Coach)", () => {
            const cmRoles = directoryRolesFor("Head Coach");
            expect(cmRoles).toEqual(["Coach"]);
            expect(cmRoles).not.toContain("Owner");
            expect(cmRoles).not.toContain("General Manager");
            expect(cmRoles).not.toContain("Sales Manager");
            expect(cmRoles).not.toContain("Sales");
        });

        it("allows General Manager to lookup everyone below GM", () => {
            const gmRoles = directoryRolesFor("General Manager");
            expect(gmRoles).toContain("Sales Manager");
            expect(gmRoles).toContain("Head Coach");
            expect(gmRoles).toContain("Accountant");
            expect(gmRoles).toContain("Sales");
            expect(gmRoles).toContain("Coach");
            expect(gmRoles).toContain("Receptionist");
            expect(gmRoles).not.toContain("Owner");
            expect(gmRoles).not.toContain("General Manager");
        });

        it("allows Owner to lookup all staff roles", () => {
            const ownerRoles = directoryRolesFor("Owner");
            expect(ownerRoles).toContain("General Manager");
            expect(ownerRoles).toContain("Sales Manager");
            expect(ownerRoles).toContain("Head Coach");
        });
    });

    describe("Feature Access Target Editing (canEditTarget)", () => {
        it("blocks Sales Manager from editing Owner, GM, Head Coach, Coach, Accountant", () => {
            expect(canEditTarget(salesManager, owner)).toBe(false);
            expect(canEditTarget(salesManager, gm)).toBe(false);
            expect(canEditTarget(salesManager, coachManager)).toBe(false);
            expect(canEditTarget(salesManager, coach)).toBe(false);
            expect(canEditTarget(salesManager, accountant)).toBe(false);
            expect(canEditTarget(salesManager, sales)).toBe(true);
            expect(canEditTarget(salesManager, receptionist)).toBe(true);
        });

        it("blocks Head Coach from editing Owner, GM, Sales Manager, Sales, Receptionist, Accountant", () => {
            expect(canEditTarget(coachManager, owner)).toBe(false);
            expect(canEditTarget(coachManager, gm)).toBe(false);
            expect(canEditTarget(coachManager, salesManager)).toBe(false);
            expect(canEditTarget(coachManager, sales)).toBe(false);
            expect(canEditTarget(coachManager, receptionist)).toBe(false);
            expect(canEditTarget(coachManager, accountant)).toBe(false);
            expect(canEditTarget(coachManager, coach)).toBe(true);
        });

        it("blocks General Manager from editing Owner or another General Manager", () => {
            expect(canEditTarget(gm, owner)).toBe(false);
            expect(canEditTarget(gm, blankUser("General Manager", "gm-2"))).toBe(false);
            expect(canEditTarget(gm, salesManager)).toBe(true);
            expect(canEditTarget(gm, coachManager)).toBe(true);
            expect(canEditTarget(gm, sales)).toBe(true);
            expect(canEditTarget(gm, coach)).toBe(true);
        });

        it("blocks self-editing for everyone", () => {
            expect(canEditTarget(owner, owner)).toBe(false);
            expect(canEditTarget(salesManager, salesManager)).toBe(false);
            expect(canEditTarget(gm, gm)).toBe(false);
        });
    });

    describe("Role Assignment (canAssignRole)", () => {
        it("completely forbids changing the role of an Owner", () => {
            expect(canAssignRole(owner, owner, "General Manager").ok).toBe(false);
            expect(canAssignRole(blankUser("Owner", "owner-2"), owner, "Sales").ok).toBe(false);
            expect(canAssignRole(gm, owner, "Sales").ok).toBe(false);
            expect(canAssignRole(salesManager, owner, "Sales").ok).toBe(false);
            expect(canAssignRole(coachManager, owner, "Coach").ok).toBe(false);
        });

        it("completely forbids assigning the Owner role to anyone", () => {
            expect(canAssignRole(owner, gm, "Owner").ok).toBe(false);
            expect(canAssignRole(gm, sales, "Owner").ok).toBe(false);
            expect(canAssignRole(salesManager, sales, "Owner").ok).toBe(false);
            expect(canAssignRole(coachManager, coach, "Owner").ok).toBe(false);
        });

        it("restricts Sales Manager to assigning only within their team (Sales <-> Receptionist)", () => {
            expect(canAssignRole(salesManager, sales, "Receptionist").ok).toBe(true);
            expect(canAssignRole(salesManager, receptionist, "Sales").ok).toBe(true);
            expect(canAssignRole(salesManager, sales, "Coach").ok).toBe(false);
            expect(canAssignRole(salesManager, sales, "Head Coach").ok).toBe(false);
            expect(canAssignRole(salesManager, sales, "Sales Manager").ok).toBe(false);
            expect(canAssignRole(salesManager, sales, "Accountant").ok).toBe(false);
            expect(canAssignRole(salesManager, coach, "Sales").ok).toBe(false);
            expect(canAssignRole(salesManager, gm, "Sales").ok).toBe(false);
        });

        it("restricts Head Coach to assigning only within their team", () => {
            expect(canAssignRole(coachManager, coach, "Coach").ok).toBe(true);
            expect(canAssignRole(coachManager, sales, "Coach").ok).toBe(false);
            expect(canAssignRole(coachManager, coach, "Sales").ok).toBe(false);
            expect(canAssignRole(coachManager, coach, "Head Coach").ok).toBe(false);
            expect(canAssignRole(coachManager, coach, "Owner").ok).toBe(false);
        });

        it("allows General Manager to assign staff below GM, but never Owner or GM", () => {
            expect(canAssignRole(gm, sales, "Coach").ok).toBe(true);
            expect(canAssignRole(gm, sales, "Accountant").ok).toBe(true);
            expect(canAssignRole(gm, sales, "Sales Manager").ok).toBe(true);
            expect(canAssignRole(gm, sales, "Head Coach").ok).toBe(true);
            expect(canAssignRole(gm, gm, "Sales").ok).toBe(false);
            expect(canAssignRole(gm, owner, "Sales").ok).toBe(false);
            expect(canAssignRole(gm, sales, "General Manager").ok).toBe(false);
            expect(canAssignRole(gm, sales, "Owner").ok).toBe(false);
        });
    });
});
