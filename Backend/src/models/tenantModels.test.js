import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import Plan from "./Plan";
import Tenant, { getEffectiveFeatures, getEffectiveLimits, getEffectiveRoles } from "./Tenant";
import { encryptSecret, decryptSecret } from "../utils/tenantCrypto";
import {
    createPlanSchema,
    createTenantSchema,
    tenantSettingsSchema,
} from "../validation/schemas";
import { resolveEffectiveKeys, effectiveAreas, canEditTarget } from "../utils/accessControl";
import { canEditRoleChecklist } from "../config/roleAccess";

describe("Phase 1: Core Models & Tenant Helpers", () => {
    describe("tenantCrypto", () => {
        it("encrypts and decrypts secrets using AES-256-GCM", () => {
            const raw = "EAABwzL_test_access_token_123456789";
            const encrypted = encryptSecret(raw);
            expect(encrypted).not.toBe(raw);
            expect(encrypted.split(":")).toHaveLength(3); // iv:tag:ciphertext

            const decrypted = decryptSecret(encrypted);
            expect(decrypted).toBe(raw);
        });

        it("returns null on tampered ciphertext", () => {
            const raw = "secret_data";
            const encrypted = encryptSecret(raw);
            const [iv, tag, cipher] = encrypted.split(":");
            const tamperedCipher = cipher.slice(0, -2) + "ff";
            const decrypted = decryptSecret(`${iv}:${tag}:${tamperedCipher}`);
            expect(decrypted).toBeNull();
        });
    });

    describe("getEffectiveFeatures", () => {
        it("combines plan features with tenant add/remove overrides", () => {
            const plan = {
                features: ["members", "checkin", "packages", "pt_tracking", "audit"],
            };
            const tenant = {
                featureOverrides: {
                    add: ["whatsapp", "excel_import"],
                    remove: ["checkin"],
                },
            };

            const effective = getEffectiveFeatures(tenant, plan);
            expect(effective).toContain("members");
            expect(effective).toContain("packages");
            expect(effective).toContain("pt_tracking");
            expect(effective).toContain("audit");
            expect(effective).toContain("whatsapp");
            expect(effective).toContain("excel_import");
            expect(effective).not.toContain("checkin");
        });

        it("works with no overrides", () => {
            const plan = { features: ["members", "checkin"] };
            const effective = getEffectiveFeatures({}, plan);
            expect(effective).toEqual(["members", "checkin"]);
        });
    });

    describe("getEffectiveRoles", () => {
        it("combines plan allowedRoles with tenant roleOverrides (add/remove)", () => {
            const plan = {
                allowedRoles: ["Owner", "Receptionist", "Coach"],
            };
            const tenant = {
                roleOverrides: {
                    add: ["Sales", "Accountant"],
                    remove: ["Coach"],
                },
            };

            const effective = getEffectiveRoles(tenant, plan);
            expect(effective).toContain("Owner");
            expect(effective).toContain("Receptionist");
            expect(effective).toContain("Sales");
            expect(effective).toContain("Accountant");
            expect(effective).not.toContain("Coach");
        });

        it("returns plan allowedRoles when no roleOverrides exist", () => {
            const plan = { allowedRoles: ["Owner", "Receptionist"] };
            const effective = getEffectiveRoles({}, plan);
            expect(effective).toEqual(["Owner", "Receptionist"]);
        });
    });

    describe("getEffectiveLimits", () => {
        it("overrides plan limits when limitOverrides are specified", () => {
            const plan = {
                limits: { maxMembers: 500, maxStaff: 10, maxBranches: 1 },
            };
            const tenant = {
                limitOverrides: { maxMembers: 1200, maxStaff: null, maxBranches: 3 },
            };

            const effective = getEffectiveLimits(tenant, plan);
            expect(effective).toEqual({
                maxMembers: 1200,
                maxStaff: 10,
                maxBranches: 3,
            });
        });
    });

    describe("Zod validation schemas", () => {
        it("validates valid plan payload", () => {
            const validPlan = {
                key: "gold",
                name: "Gold Tier",
                priceMonthly: 99,
                priceYearly: 990,
                currency: "USD",
                features: ["members", "whatsapp"],
                allowedRoles: ["Owner", "Receptionist", "Sales"],
                limits: { maxMembers: 1000, maxStaff: 15, maxBranches: 2 },
            };
            const parsed = createPlanSchema.safeParse(validPlan);
            expect(parsed.success).toBe(true);
            expect(parsed.data.currency).toBe("EGP");
        });

        it("rejects invalid plan key", () => {
            const invalid = {
                key: "diamond",
                name: "Diamond",
                priceMonthly: 199,
                priceYearly: 1990,
            };
            const parsed = createPlanSchema.safeParse(invalid);
            expect(parsed.success).toBe(false);
        });

        it("validates valid tenant payload", () => {
            const validTenant = {
                name: "Flame Factory Gym",
                slug: "flame-factory",
                planId: new mongoose.Types.ObjectId().toString(),
                settings: {
                    branding: { displayName: "Flame Factory" },
                    locale: { currency: "EGP", timezone: "Africa/Cairo" },
                    enabledActivities: ["gym", "crossfit"],
                },
            };
            const parsed = createTenantSchema.safeParse(validTenant);
            expect(parsed.success).toBe(true);
        });

        it("keeps a role on its defaults until a checklist is saved", () => {
            const user = { role: "Sales", featureAccess: { grants: [], revokes: [] }, accessOverrides: { add: [], remove: [] } };
            const keys = resolveEffectiveKeys(user, { roleAccess: {}, planFeatures: null });
            expect(keys.has("sales_dashboard")).toBe(true);
            expect(keys.has("check_in")).toBe(true);
            expect(keys.has("settings")).toBe(false);
        });

        it("replaces a role's access when a checklist is saved", () => {
            const user = { role: "Sales", featureAccess: { grants: [], revokes: [] }, accessOverrides: { add: [], remove: [] } };
            const keys = resolveEffectiveKeys(user, { roleAccess: { Sales: ["sales"] }, planFeatures: null });
            expect(keys.has("sales_dashboard")).toBe(true);
            expect(keys.has("check_in")).toBe(false);
            expect(keys.has("accounting_dashboard")).toBe(false);
        });

        it("applies per-user area add and remove on top of the role", () => {
            const user = {
                role: "Receptionist",
                featureAccess: { grants: [], revokes: [] },
                accessOverrides: { add: ["accounting"], remove: ["checkin"] },
            };
            const context = { roleAccess: {}, planFeatures: ["members", "checkin", "accounting", "packages"] };
            const keys = resolveEffectiveKeys(user, context);
            expect(keys.has("check_in")).toBe(false);
            expect(keys.has("accounting_dashboard")).toBe(true);
            expect(effectiveAreas(user, context)).toContain("accounting");
            expect(effectiveAreas(user, context)).not.toContain("checkin");
        });

        it("drops an area the gym plan does not include", () => {
            const user = { role: "General Manager", featureAccess: { grants: [], revokes: [] }, accessOverrides: { add: [], remove: [] } };
            const areas = effectiveAreas(user, { roleAccess: {}, planFeatures: ["members", "checkin"] });
            expect(areas).toContain("members");
            expect(areas).toContain("staff");
            expect(areas).not.toContain("accounting");
        });

        it("gives a general manager every area except settings, and only the owner can edit that checklist", () => {
            const keys = resolveEffectiveKeys({ role: "General Manager", featureAccess: { grants: [], revokes: [] } });
            expect(keys.has("owner_dashboard")).toBe(true);
            expect(keys.has("accounting_dashboard")).toBe(true);
            expect(keys.has("settings")).toBe(false);

            const narrowed = resolveEffectiveKeys(
                { role: "General Manager", featureAccess: { grants: [], revokes: [] }, accessOverrides: { add: [], remove: [] } },
                { roleAccess: { "General Manager": ["members", "staff"] }, planFeatures: null },
            );
            expect(narrowed.has("members")).toBe(true);
            expect(narrowed.has("accounting_dashboard")).toBe(false);
            expect(narrowed.has("settings")).toBe(false);

            expect(canEditRoleChecklist("Owner", "General Manager")).toBe(true);
            expect(canEditRoleChecklist("General Manager", "General Manager")).toBe(false);
            expect(canEditRoleChecklist("General Manager", "Sales")).toBe(true);
            expect(canEditRoleChecklist("General Manager", "Owner")).toBe(false);
            expect(canEditRoleChecklist("Sales Manager", "Sales")).toBe(true);
            expect(canEditRoleChecklist("Sales Manager", "Receptionist")).toBe(true);
            expect(canEditRoleChecklist("Sales Manager", "Accountant")).toBe(false);
            expect(canEditRoleChecklist("Sales Manager", "Coach")).toBe(false);
            expect(canEditRoleChecklist("Sales Manager", "Coach Manager")).toBe(false);
            expect(canEditRoleChecklist("Sales Manager", "Sales Manager")).toBe(false);
            expect(canEditRoleChecklist("Coach Manager", "Coach")).toBe(true);
            expect(canEditRoleChecklist("Coach Manager", "Sales")).toBe(false);
            expect(canEditTarget({ id: "gm-1", role: "General Manager" }, { _id: "gm-2", role: "General Manager" })).toBe(false);
            expect(canEditTarget({ id: "gm-1", role: "General Manager" }, { _id: "sales-1", role: "Sales" })).toBe(true);
            expect(canEditTarget({ id: "owner-1", role: "Owner" }, { _id: "gm-2", role: "General Manager" })).toBe(true);
        });

        it("rejects invalid tenant slug containing uppercase or special chars", () => {
            const invalid = {
                name: "Gym",
                slug: "Gym_123!",
                planId: new mongoose.Types.ObjectId().toString(),
            };
            const parsed = createTenantSchema.safeParse(invalid);
            expect(parsed.success).toBe(false);
        });
    });
});
