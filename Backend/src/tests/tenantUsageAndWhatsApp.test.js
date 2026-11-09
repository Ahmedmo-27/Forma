import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import AuditLog from "../models/AuditLog";
import Member from "../models/Member";
import User from "../models/User";
import Tenant from "../models/Tenant";
import Announcement from "../models/Announcement";
import { getMyTenant } from "../controllers/tenantController";
import { WHATSAPP_AUDIT_ACTIONS, countMonthlyWhatsAppMessages } from "../utils/whatsappTracking";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { runWithTenant } = require("../context/tenantContext");

describe("Tenant WhatsApp Usage & Limits in GET /api/tenant/me", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("accurately returns monthly WhatsApp usage and plan caps in /api/tenant/me payload", async () => {
        const tenantId = new mongoose.Types.ObjectId();
        const plan = {
            _id: new mongoose.Types.ObjectId(),
            key: "gold",
            name: "Gold Plan",
            fairUseCaps: {
                storageGb: 25,
                whatsappMessagesMonthly: 2000,
            },
            limits: {
                maxMembers: 1000,
                maxStaff: 20,
                maxBranches: 2,
            },
        };

        const mockTenant = {
            _id: tenantId,
            name: "Flame Gym",
            slug: "flame-gym",
            status: "active",
            billing: { cycle: "monthly" },
            planId: plan,
            settings: {
                locale: { timezone: "Africa/Cairo" },
            },
        };

        vi.spyOn(Tenant, "findById").mockReturnValue({
            populate: vi.fn().mockResolvedValue(mockTenant),
        });
        vi.spyOn(Member, "countDocuments").mockResolvedValue(120);
        vi.spyOn(User, "countDocuments").mockResolvedValue(5);
        vi.spyOn(AuditLog, "countDocuments").mockResolvedValue(137); // 137 WhatsApp messages this month
        vi.spyOn(Announcement, "find").mockReturnValue({
            select: vi.fn().mockResolvedValue([]),
        });

        const req = {
            user: {
                id: new mongoose.Types.ObjectId().toString(),
                role: "Owner",
                tenantId: String(tenantId),
            },
        };

        let responsePayload = null;
        let statusCode = 200;
        const res = {
            status: (code) => {
                statusCode = code;
                return res;
            },
            json: (data) => {
                responsePayload = data;
                return res;
            },
        };

        await runWithTenant({ tenantId: String(tenantId) }, async () => {
            await getMyTenant(req, res);
        });

        expect(statusCode).toBe(200);
        expect(responsePayload).toBeDefined();

        // Check limits match plan fairUseCaps, NOT hardcoded 500 or 5
        expect(responsePayload.limits.whatsappMonthlyMessages).toBe(2000);
        expect(responsePayload.limits.storageGb).toBe(25);
        expect(responsePayload.effectiveLimits).toBeDefined();
        expect(responsePayload.effectiveLimits.storageGb).toBe(25);
        expect(responsePayload.effectiveLimits.whatsappMonthlyMessages).toBe(2000);

        // Check usage reflects accurate WhatsApp count and storage
        expect(responsePayload.usage.whatsappMonthlyMessages).toBe(137);
        expect(responsePayload.usage.members).toBe(120);
        expect(responsePayload.usage.staff).toBe(5);
        expect(responsePayload.usage.storageGb).toBe(0); // Not 0.5 placeholder
    });

    it("records whatsapp_qr_sent in AuditLog schema and counts it towards monthly usage", async () => {
        const tenantId = new mongoose.Types.ObjectId();
        const userId = new mongoose.Types.ObjectId();

        const auditDoc = new AuditLog({
            action: "whatsapp_qr_sent",
            actor: userId,
            actorRole: "Owner",
            targetType: "member",
            targetId: "mem_123",
            tenantId,
            meta: { kind: "qr_checkin", code: "MEM001" },
        });

        // Validates successfully against Mongoose schema within tenant context
        await runWithTenant({ tenantId: String(tenantId) }, async () => {
            await expect(auditDoc.validate()).resolves.toBeUndefined();
        });

        // Verified that whatsapp_qr_sent is part of WHATSAPP_AUDIT_ACTIONS
        expect(WHATSAPP_AUDIT_ACTIONS).toContain(auditDoc.action);
    });

    it("accurately returns customized storage capacity allowance for lifetime subscribers in /api/tenant/me", async () => {
        const tenantId = new mongoose.Types.ObjectId();
        const mockTenant = {
            _id: tenantId,
            name: "Iron Box Lifetime",
            slug: "iron-box",
            status: "active",
            billing: {
                cycle: "lifetime",
                lifetime: {
                    fairUseLimits: {
                        storageGbLimit: 100,
                        whatsappMessagesMonthlyLimit: 5000,
                    },
                },
            },
            planId: {
                _id: new mongoose.Types.ObjectId(),
                key: "platinum",
                name: "Platinum Plan",
                fairUseCaps: { storageGb: 25, whatsappMessagesMonthly: 2000 },
                limits: { maxMembers: 500, maxStaff: 10, maxBranches: 1 },
            },
            settings: { locale: { timezone: "Africa/Cairo" } },
        };

        vi.spyOn(Tenant, "findById").mockReturnValue({
            populate: vi.fn().mockResolvedValue(mockTenant),
        });
        vi.spyOn(Member, "countDocuments").mockResolvedValue(10);
        vi.spyOn(User, "countDocuments").mockResolvedValue(2);
        vi.spyOn(AuditLog, "countDocuments").mockResolvedValue(5);
        vi.spyOn(Announcement, "find").mockReturnValue({
            select: vi.fn().mockResolvedValue([]),
        });

        const req = {
            user: {
                id: new mongoose.Types.ObjectId().toString(),
                role: "Owner",
                tenantId: String(tenantId),
            },
        };

        let responsePayload = null;
        const res = {
            status: () => res,
            json: (data) => {
                responsePayload = data;
                return res;
            },
        };

        await runWithTenant({ tenantId: String(tenantId) }, async () => {
            await getMyTenant(req, res);
        });

        expect(responsePayload.limits.storageGb).toBe(100);
        expect(responsePayload.effectiveLimits.storageGb).toBe(100);
        expect(responsePayload.limits.whatsappMonthlyMessages).toBe(5000);
        expect(responsePayload.effectiveLimits.whatsappMonthlyMessages).toBe(5000);
    });
});
