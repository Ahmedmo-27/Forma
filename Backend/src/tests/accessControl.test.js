import { describe, it, expect } from "vitest";
import {
    resolveEffectiveKeys,
    hasAccess,
    isRevoked,
    hasExplicitGrant,
    diffConfirmedFeatures,
    canEditTarget,
} from "../utils/accessControl";

describe("access control resolver", () => {
    it("gives a sales rep their role defaults", () => {
        const keys = resolveEffectiveKeys({ role: "Sales", abilities: {}, featureAccess: { grants: [], revokes: [] } });
        expect(keys.has("sales_dashboard")).toBe(true);
        expect(keys.has("comments")).toBe(true);
        expect(keys.has("view_phones")).toBe(true);
        expect(keys.has("accounting_dashboard")).toBe(false);
        expect(keys.has("settings")).toBe(false);
    });

    it("treats a legacy ability turned off as a revoke when no overrides are stored", () => {
        const user = {
            role: "Sales",
            canViewPhones: false,
            abilities: { canCommentOnMembers: false, canRequestAssignment: true },
            featureAccess: { grants: [], revokes: [] },
        };
        expect(hasAccess(user, "comments")).toBe(false);
        expect(hasAccess(user, "view_phones")).toBe(false);
        expect(hasAccess(user, "request_assignment")).toBe(true);
        expect(isRevoked(user, "comments")).toBe(true);
    });

    it("adds grants and removes revokes from the role default", () => {
        const user = {
            role: "Receptionist",
            featureAccess: { grants: ["sales_dashboard"], revokes: ["check_in"] },
        };
        expect(hasAccess(user, "sales_dashboard")).toBe(true);
        expect(hasExplicitGrant(user, "sales_dashboard")).toBe(true);
        expect(hasAccess(user, "check_in")).toBe(false);
        expect(isRevoked(user, "check_in")).toBe(true);
        expect(hasAccess(user, "members")).toBe(true);
    });

    it("refuses an exclusive feature outside its default roles", () => {
        const user = {
            role: "Sales",
            featureAccess: { grants: ["settings", "change_role"], revokes: [] },
        };
        expect(hasAccess(user, "settings")).toBe(false);
        expect(hasExplicitGrant(user, "settings")).toBe(false);
    });

    it("lets the owner change any non-exclusive feature and blocks managers outside their team", () => {
        const owner = { id: "owner-1", role: "Owner" };
        const sales = { _id: "sales-1", role: "Sales" };
        const coach = { _id: "coach-1", role: "Coach" };
        expect(canEditTarget(owner, sales)).toBe(true);
        expect(canEditTarget(owner, owner)).toBe(false);
        expect(canEditTarget({ id: "sm-1", role: "Sales Manager" }, sales)).toBe(true);
        expect(canEditTarget({ id: "sm-1", role: "Sales Manager" }, coach)).toBe(false);
        expect(canEditTarget({ id: "cm-1", role: "Coach Manager" }, coach)).toBe(true);
        expect(canEditTarget({ id: "cm-1", role: "Coach Manager" }, sales)).toBe(false);
    });

    it("stores only the difference and ignores features outside the actor domain", () => {
        const actor = { id: "sm-1", role: "Sales Manager" };
        const target = {
            _id: "sales-1",
            role: "Sales",
            abilities: {},
            canViewPhones: true,
            featureAccess: { grants: [], revokes: [] },
        };
        const requested = ["sales_dashboard", "sales_members", "my_call_center", "request_assignment", "request_takeover", "whatsapp_send", "view_phones", "accounting_dashboard"];
        const diff = diffConfirmedFeatures(actor, target, requested);
        expect(diff.error).toBeUndefined();
        expect(diff.grants).not.toContain("accounting_dashboard");
        expect(diff.revokes).toContain("comments");
        expect(diff.revokes).not.toContain("sales_dashboard");
    });

    it("rejects granting a role-only feature", () => {
        const actor = { id: "owner-1", role: "Owner" };
        const target = { _id: "sales-1", role: "Sales", featureAccess: { grants: [], revokes: [] } };
        const diff = diffConfirmedFeatures(actor, target, ["settings", "sales_dashboard"]);
        expect(diff.error).toMatch(/limited to its default role/i);
    });
});
