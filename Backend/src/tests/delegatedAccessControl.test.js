import { describe, it, expect } from "vitest";
import {
    canEditTarget,
    canEditFeature,
    directoryRolesFor,
    canAssignRole,
    diffConfirmedFeatures,
    resolveEffectiveKeys,
    groupFeaturesFor,
} from "../utils/accessControl";
import { getFeature } from "../config/accessCatalog";

describe("Delegated Staff Access Control", () => {
    const owner = { id: "owner-1", role: "Owner" };
    const gm = { id: "gm-1", role: "General Manager", areas: ["sales", "coaching", "accounting", "staff"] };
    const standardSm = { id: "sm-1", role: "Sales Manager" };
    const delegatedSm = {
        id: "sm-2",
        role: "Sales Manager",
        hasStaffAccess: true,
        areas: ["sales", "coaching", "accounting", "packages", "whatsapp", "reports", "staff"],
    };

    const coach = { id: "coach-1", role: "Coach" };
    const accountant = { id: "acc-1", role: "Accountant" };
    const sales = { id: "sales-1", role: "Sales" };
    const coachManager = { id: "cm-1", role: "Coach Manager" };

    describe("canEditTarget", () => {
        it("standard Sales Manager can only edit Sales and Receptionist", () => {
            expect(canEditTarget(standardSm, sales)).toBe(true);
            expect(canEditTarget(standardSm, coach)).toBe(false);
            expect(canEditTarget(standardSm, accountant)).toBe(false);
            expect(canEditTarget(standardSm, coachManager)).toBe(false);
            expect(canEditTarget(standardSm, owner)).toBe(false);
            expect(canEditTarget(standardSm, standardSm)).toBe(false);
        });

        it("delegated Sales Manager with staff access can edit all non-owner staff below GM", () => {
            expect(canEditTarget(delegatedSm, sales)).toBe(true);
            expect(canEditTarget(delegatedSm, coach)).toBe(true);
            expect(canEditTarget(delegatedSm, accountant)).toBe(true);
            expect(canEditTarget(delegatedSm, coachManager)).toBe(true);
            expect(canEditTarget(delegatedSm, owner)).toBe(false);
            expect(canEditTarget(delegatedSm, delegatedSm)).toBe(false);
        });
    });

    describe("canEditFeature", () => {
        const pkgFeature = getFeature("packages");
        const waFeature = getFeature("whatsapp_templates");
        const targetFeature = getFeature("targets");
        const settingsFeature = getFeature("settings");
        const coachSessionFeature = getFeature("coach_checkin");
        const salesCallCenterFeature = getFeature("my_call_center");

        it("standard Sales Manager cannot edit features outside sales domain", () => {
            expect(canEditFeature(standardSm, salesCallCenterFeature)).toBe(true);
            expect(canEditFeature(standardSm, coachSessionFeature)).toBe(false);
            expect(canEditFeature(standardSm, settingsFeature)).toBe(false);
        });

        it("delegated Sales Manager can edit features in their effective areas", () => {
            expect(canEditFeature(delegatedSm, salesCallCenterFeature)).toBe(true);
            expect(canEditFeature(delegatedSm, pkgFeature)).toBe(true);
            expect(canEditFeature(delegatedSm, waFeature)).toBe(true);
            expect(canEditFeature(delegatedSm, targetFeature)).toBe(true);
            expect(canEditFeature(delegatedSm, coachSessionFeature)).toBe(true);
            // Settings is always owner-only
            expect(canEditFeature(delegatedSm, settingsFeature)).toBe(false);
        });
    });

    describe("directoryRolesFor", () => {
        it("returns only sales team for standard Sales Manager", () => {
            expect(directoryRolesFor(standardSm)).toEqual(["Sales", "Receptionist"]);
        });

        it("returns all staff roles for delegated Sales Manager", () => {
            expect(directoryRolesFor(delegatedSm)).toEqual([
                "Receptionist", "Coach", "Coach Manager", "Accountant", "Sales", "Sales Manager"
            ]);
        });
    });

    describe("canAssignRole", () => {
        it("standard Sales Manager cannot assign outside their team", () => {
            expect(canAssignRole(standardSm, sales, "Receptionist").ok).toBe(true);
            expect(canAssignRole(standardSm, sales, "Coach").ok).toBe(false);
            expect(canAssignRole(standardSm, coach, "Sales").ok).toBe(false);
        });

        it("delegated Sales Manager can assign roles across staff below GM/Owner", () => {
            expect(canAssignRole(delegatedSm, coach, "Sales").ok).toBe(true);
            expect(canAssignRole(delegatedSm, sales, "Accountant").ok).toBe(true);
            expect(canAssignRole(delegatedSm, coach, "Owner").ok).toBe(false);
            expect(canAssignRole(delegatedSm, owner, "Sales").ok).toBe(false);
            expect(canAssignRole(delegatedSm, delegatedSm, "Sales").ok).toBe(false);
        });
    });

    describe("diffConfirmedFeatures with delegated actor", () => {
        it("allows delegated Sales Manager to grant coaching and packages to coach target", () => {
            const target = {
                _id: "coach-1",
                role: "Coach",
                featureAccess: { grants: [], revokes: [] },
            };
            const requested = ["coach_dashboard", "coach_members", "packages", "whatsapp_templates"];
            const diff = diffConfirmedFeatures(delegatedSm, target, requested);
            expect(diff.error).toBeUndefined();
            expect(diff.grants).toContain("packages");
            expect(diff.grants).toContain("whatsapp_templates");
        });
    });
});
