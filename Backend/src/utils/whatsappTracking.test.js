import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import AuditLog from "../models/AuditLog";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { runWithTenant, runAsPlatform } = require("../context/tenantContext");
import {
    WHATSAPP_AUDIT_ACTIONS,
    startOfMonth,
    getMonthlyWhatsAppLimit,
    countMonthlyWhatsAppMessages,
    assertMonthlyAllowance,
    incrementCachedAllowance,
    clearAllowanceCache,
} from "./whatsappTracking";

describe("WhatsApp Tracking & Monthly Logging Suite", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        clearAllowanceCache();
    });

    describe("WHATSAPP_AUDIT_ACTIONS & AuditLog enum", () => {
        it("defines the complete set of tracked WhatsApp actions", () => {
            expect(WHATSAPP_AUDIT_ACTIONS).toEqual([
                "whatsapp_template_sent",
                "whatsapp_message_sent",
                "whatsapp_qr_sent",
            ]);
            expect(Object.isFrozen(WHATSAPP_AUDIT_ACTIONS)).toBe(true);
        });

        it("ensures AuditLog action schema accepts all WhatsApp actions including QR check-in", () => {
            const enumValues = AuditLog.schema.path("action").enumValues;
            for (const action of WHATSAPP_AUDIT_ACTIONS) {
                expect(enumValues).toContain(action);
            }
        });
    });

    describe("startOfMonth timezone calculation", () => {
        it("calculates start of month for Africa/Cairo timezone without throwing", () => {
            const cairoMonthStart = startOfMonth("Africa/Cairo");
            expect(cairoMonthStart).toBeInstanceOf(Date);
            expect(cairoMonthStart.getTime()).toBeLessThanOrEqual(Date.now());
        });

        it("falls back gracefully when timezone is null or invalid", () => {
            const fallbackStart = startOfMonth(null);
            expect(fallbackStart).toBeInstanceOf(Date);
            expect(fallbackStart.getTime()).toBeLessThanOrEqual(Date.now());

            const invalidStart = startOfMonth("Invalid/Timezone_Name");
            expect(invalidStart).toBeInstanceOf(Date);
            expect(invalidStart.getTime()).toBeLessThanOrEqual(Date.now());
        });
    });

    describe("getMonthlyWhatsAppLimit", () => {
        it("resolves lifetime fair use limits when billing cycle is lifetime", () => {
            const lifetimeTenant = {
                billing: {
                    cycle: "lifetime",
                    lifetime: {
                        fairUseLimits: {
                            whatsappMessagesMonthlyLimit: 5000,
                        },
                    },
                },
            };
            expect(getMonthlyWhatsAppLimit(lifetimeTenant)).toBe(5000);
        });

        it("defaults lifetime to 2000 if fairUseLimits is omitted", () => {
            const lifetimeTenant = {
                billing: {
                    cycle: "lifetime",
                },
            };
            expect(getMonthlyWhatsAppLimit(lifetimeTenant)).toBe(2000);
        });

        it("resolves plan fairUseCaps for non-lifetime tenants", () => {
            const tenant = {
                billing: { cycle: "monthly" },
                planId: {
                    fairUseCaps: {
                        whatsappMessagesMonthly: 3500,
                    },
                },
            };
            expect(getMonthlyWhatsAppLimit(tenant)).toBe(3500);
        });

        it("resolves from req.plan when tenant.planId is not populated", () => {
            const tenant = {
                billing: { cycle: "monthly" },
                planId: new mongoose.Types.ObjectId(),
            };
            const plan = {
                fairUseCaps: {
                    whatsappMessagesMonthly: 2500,
                },
            };
            expect(getMonthlyWhatsAppLimit(tenant, plan)).toBe(2500);
        });

        it("defaults to 2000 when no plan fairUseCaps is present (never 500)", () => {
            const tenant = { billing: { cycle: "monthly" } };
            expect(getMonthlyWhatsAppLimit(tenant, null)).toBe(2000);
        });
    });

    describe("countMonthlyWhatsAppMessages", () => {
        it("queries AuditLog for all three WhatsApp actions since start of month", async () => {
            const tenantId = new mongoose.Types.ObjectId();
            const spy = vi.spyOn(AuditLog, "countDocuments").mockResolvedValue(42);

            const result = await runWithTenant({ tenantId: String(tenantId) }, async () => {
                return await countMonthlyWhatsAppMessages(String(tenantId), "Africa/Cairo");
            });

            expect(result).toBe(42);
            expect(spy).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: { $in: WHATSAPP_AUDIT_ACTIONS },
                    createdAt: expect.objectContaining({ $gte: expect.any(Date) }),
                })
            );
        });

        it("includes tenantId in filter when in platform context", async () => {
            const tenantId = new mongoose.Types.ObjectId();
            const spy = vi.spyOn(AuditLog, "countDocuments").mockResolvedValue(15);

            const result = await runAsPlatform(async () => {
                return await countMonthlyWhatsAppMessages(String(tenantId), "Africa/Cairo");
            });

            expect(result).toBe(15);
            expect(spy).toHaveBeenCalledWith(
                expect.objectContaining({
                    tenantId: String(tenantId),
                    action: { $in: WHATSAPP_AUDIT_ACTIONS },
                    createdAt: expect.objectContaining({ $gte: expect.any(Date) }),
                })
            );
        });
    });

    describe("assertMonthlyAllowance and rate-limiting", () => {
        it("permits message when used is strictly less than monthly limit", async () => {
            const tenantId = new mongoose.Types.ObjectId();
            vi.spyOn(AuditLog, "countDocuments").mockResolvedValue(100);

            const req = {
                tenant: {
                    _id: tenantId,
                    billing: { cycle: "monthly" },
                    planId: { fairUseCaps: { whatsappMessagesMonthly: 2000 } },
                },
                user: { tenantId: String(tenantId) },
            };

            await expect(
                runWithTenant({ tenantId: String(tenantId) }, async () => {
                    await assertMonthlyAllowance(req);
                })
            ).resolves.not.toThrow();
        });

        it("throws RATE_LIMITED (429) when monthly WhatsApp quota is reached or exceeded", async () => {
            const tenantId = new mongoose.Types.ObjectId();
            vi.spyOn(AuditLog, "countDocuments").mockResolvedValue(2000);

            const req = {
                tenant: {
                    _id: tenantId,
                    billing: { cycle: "monthly" },
                    planId: { fairUseCaps: { whatsappMessagesMonthly: 2000 } },
                },
                user: { tenantId: String(tenantId) },
            };

            await expect(
                runWithTenant({ tenantId: String(tenantId) }, async () => {
                    await assertMonthlyAllowance(req);
                })
            ).rejects.toMatchObject({
                code: "RATE_LIMITED",
                status: 429,
                message: "This gym has reached its monthly WhatsApp message limit.",
            });
        });

        it("caches usage and increments synchronously via incrementCachedAllowance", async () => {
            const tenantId = new mongoose.Types.ObjectId();
            const spy = vi.spyOn(AuditLog, "countDocuments").mockResolvedValue(1999);

            const req = {
                tenant: {
                    _id: tenantId,
                    billing: { cycle: "monthly" },
                    planId: { fairUseCaps: { whatsappMessagesMonthly: 2000 } },
                },
                user: { tenantId: String(tenantId) },
            };

            await runWithTenant({ tenantId: String(tenantId) }, async () => {
                // First call: hits DB (used = 1999) -> permitted
                await assertMonthlyAllowance(req);
                expect(spy).toHaveBeenCalledTimes(1);

                // Increment in-memory cache after sending
                incrementCachedAllowance(String(tenantId));

                // Second call: hits cache (used = 2000 >= 2000) -> blocked without DB call
                await expect(assertMonthlyAllowance(req)).rejects.toMatchObject({
                    code: "RATE_LIMITED",
                    status: 429,
                });
                expect(spy).toHaveBeenCalledTimes(1);
            });
        });
    });
});
