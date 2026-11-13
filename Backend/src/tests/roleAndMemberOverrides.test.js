import { describe, it, expect } from "vitest";
import {
    resolveEffectiveKeys,
    diffConfirmedFeatures,
    navExtrasFor,
    memberListDecision,
    roleDefaults,
} from "../utils/accessControl";

describe("Role and Member Overrides (Dynamic Additions & Revocations)", () => {
    describe("Role gaining outside area", () => {
        it("gives a Sales rep accounting features when accounting area is added to Sales roleAccess", () => {
            const user = {
                id: "sales-1",
                role: "Sales",
                featureAccess: { grants: [], revokes: [] },
                accessOverrides: { add: [], remove: [] },
            };
            const context = {
                roleAccess: {
                    Sales: ["sales", "accounting"],
                },
                planFeatures: ["sales_crm", "accounting"],
            };

            const keys = resolveEffectiveKeys(user, context);
            // Default sales features are present
            expect(keys.has("sales_dashboard")).toBe(true);
            // Accounting features are expanded
            expect(keys.has("accounting_dashboard")).toBe(true);
            expect(keys.has("contracts")).toBe(true);
            expect(keys.has("targets")).toBe(true);
            expect(keys.has("refunds")).toBe(true);

            // navExtras should include accounting_dashboard and contracts because they have nav
            const extras = navExtrasFor(user, context);
            const extraKeys = extras.map((item) => item.key);
            expect(extraKeys).toContain("accounting_dashboard");
            expect(extraKeys).toContain("contracts");
        });

        it("allows revoking an individual feature from a granted area", () => {
            const actor = { id: "owner-1", role: "Owner" };
            const user = {
                id: "sales-1",
                role: "Sales",
                featureAccess: { grants: [], revokes: [] },
                accessOverrides: { add: [], remove: [] },
            };
            const context = {
                roleAccess: {
                    Sales: ["sales", "accounting"],
                },
                planFeatures: ["sales_crm", "accounting"],
            };

            // Target has all default sales features + accounting features, EXCEPT user wants refunds OFF
            const defaults = [...resolveEffectiveKeys(user, context)];
            const requestedWithoutRefunds = defaults.filter((k) => k !== "refunds");

            const diff = diffConfirmedFeatures(actor, user, requestedWithoutRefunds, context);
            expect(diff.error).toBeUndefined();
            // refunds must be stored in revokes
            expect(diff.revokes).toContain("refunds");

            // Apply the revokes to user
            user.featureAccess = { grants: diff.grants, revokes: diff.revokes };
            const updatedKeys = resolveEffectiveKeys(user, context);
            expect(updatedKeys.has("accounting_dashboard")).toBe(true);
            expect(updatedKeys.has("refunds")).toBe(false);
        });
    });

    describe("Role losing default area", () => {
        it("removes check_in features from Receptionist when checkin area is removed in roleAccess", () => {
            const receptionist = {
                id: "rec-1",
                role: "Receptionist",
                featureAccess: { grants: [], revokes: [] },
                accessOverrides: { add: [], remove: [] },
            };
            // Receptionist default areas include checkin and members. We remove checkin.
            const context = {
                roleAccess: {
                    Receptionist: ["members"],
                },
                planFeatures: null,
            };

            const keys = resolveEffectiveKeys(receptionist, context);
            expect(keys.has("members")).toBe(true);
            expect(keys.has("check_in")).toBe(false);
        });

        it("allows granting a feature back to an individual member when role lost the area", () => {
            const actor = { id: "owner-1", role: "Owner" };
            const receptionist = {
                id: "rec-1",
                role: "Receptionist",
                featureAccess: { grants: [], revokes: [] },
                accessOverrides: { add: [], remove: [] },
            };
            const context = {
                roleAccess: {
                    Receptionist: ["members"],
                },
                planFeatures: null,
            };

            // Admin requests members + check_in for this specific person
            const requested = ["members", "member_profile", "check_in"];
            const diff = diffConfirmedFeatures(actor, receptionist, requested, context);
            expect(diff.error).toBeUndefined();
            expect(diff.grants).toContain("check_in");

            // Apply grant
            receptionist.featureAccess = { grants: diff.grants, revokes: diff.revokes };
            const updatedKeys = resolveEffectiveKeys(receptionist, context);
            expect(updatedKeys.has("check_in")).toBe(true);
            expect(updatedKeys.has("members")).toBe(true);
        });
    });

    describe("memberListDecision with role and user overrides", () => {
        it("denies access to members list when members area is removed from role", () => {
            const receptionist = {
                id: "rec-1",
                role: "Receptionist",
                featureAccess: { grants: [], revokes: [] },
            };
            const context = {
                roleAccess: {
                    Receptionist: ["checkin"], // members removed
                },
            };
            expect(memberListDecision(receptionist, context)).toBe("deny");
        });

        it("scopes member list for Sales rep with default sales area", () => {
            const sales = {
                id: "sales-1",
                role: "Sales",
                featureAccess: { grants: [], revokes: [] },
            };
            const context = {
                roleAccess: {
                    Sales: ["sales", "members"],
                },
            };
            expect(memberListDecision(sales, context)).toBe("scoped");
        });

        it("allows full member list access to Sales rep when explicitly granted members", () => {
            const sales = {
                id: "sales-1",
                role: "Sales",
                featureAccess: { grants: ["members"], revokes: [] },
            };
            expect(memberListDecision(sales)).toBe("all");
        });
    });
});
