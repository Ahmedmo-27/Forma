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
