import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const Tenant = require("../models/Tenant");
const AuditLog = require("../models/AuditLog");
const Member = require("../models/Member");
const User = require("../models/User");
const TenantNote = require("../models/TenantNote");
const BillingEvent = require("../models/BillingEvent");
const { getCostInsights } = require("../controllers/platformAnalyticsController");
const { getTenantDetail, getTenants } = require("../controllers/platformTenantController");
const storageService = require("../services/storageService");

describe("Platform Storage Capacity Allowance & Telemetry", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("accurately computes storageLimitGb and flags over-cap status for standard and lifetime subscribers in getCostInsights", async () => {
        const standardTenantId = new mongoose.Types.ObjectId();
        const lifetimeTenantId = new mongoose.Types.ObjectId();

        const mockTenants = [
            {
                _id: standardTenantId,
                name: "Standard Gym",
                slug: "standard-gym",
                billing: { cycle: "monthly" },
                planId: {
                    _id: new mongoose.Types.ObjectId(),
                    key: "basic",
                    name: "Basic Plan",
                    fairUseCaps: { storageGb: 10, whatsappMessagesMonthly: 1000 },
                },
            },
            {
                _id: lifetimeTenantId,
                name: "Lifetime Gym",
                slug: "lifetime-gym",
                billing: {
                    cycle: "lifetime",
                    lifetime: {
                        fairUseLimits: {
                            storageGbLimit: 50,
                            whatsappMessagesMonthlyLimit: 3000,
                        },
                    },
                },
                planId: {
                    _id: new mongoose.Types.ObjectId(),
                    key: "platinum",
                    name: "Platinum Plan",
                    fairUseCaps: { storageGb: 25, whatsappMessagesMonthly: 2000 },
                },
            },
        ];

        vi.spyOn(Tenant, "find").mockReturnValue({
            populate: vi.fn().mockReturnValue({
                select: vi.fn().mockResolvedValue(mockTenants),
            }),
        });

        // 12 GB for standard gym (> 10 GB limit -> over cap)
        // 20 GB for lifetime gym (<= 50 GB limit -> under cap)
        vi.spyOn(storageService, "sumTenantBytes").mockImplementation(async (tenantId) => {
            if (String(tenantId) === String(standardTenantId)) {
                return 12 * 1024 * 1024 * 1024;
            }
            return 20 * 1024 * 1024 * 1024;
        });

        vi.spyOn(AuditLog, "countDocuments").mockResolvedValue(50);

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

        await getCostInsights({}, res);

        expect(statusCode).toBe(200);
        expect(responsePayload).toBeDefined();

        // Check total storage reflects both tenants
        const expectedTotalBytes = (12 + 20) * 1024 * 1024 * 1024;
        expect(responsePayload.totalStorageBytes).toBe(expectedTotalBytes);

        // Check topStorage consumers
        const standardConsumer = responsePayload.topStorage.find(
            (c) => String(c.id) === String(standardTenantId)
        );
        const lifetimeConsumer = responsePayload.topStorage.find(
            (c) => String(c.id) === String(lifetimeTenantId)
        );

        expect(standardConsumer).toBeDefined();
        expect(standardConsumer.storageLimitGb).toBe(10);
        expect(standardConsumer.isStorageOverCap).toBe(true);

        expect(lifetimeConsumer).toBeDefined();
        expect(lifetimeConsumer.storageLimitGb).toBe(50);
        expect(lifetimeConsumer.isStorageOverCap).toBe(false);

        // Overages array includes the standard consumer exceeding plan cap
        expect(responsePayload.fairUseOverages.some((c) => String(c.id) === String(standardTenantId))).toBe(true);
    });

    it("returns storageLimitGb in usage and effectiveLimits in getTenantById", async () => {
        const tenantId = new mongoose.Types.ObjectId();
        const mockTenant = {
            _id: tenantId,
            name: "Gold Gym",
            slug: "gold-gym",
            status: "active",
            billing: { cycle: "monthly" },
            planId: {
                _id: new mongoose.Types.ObjectId(),
                key: "gold",
                name: "Gold Plan",
                fairUseCaps: { storageGb: 35, whatsappMessagesMonthly: 2500 },
                limits: { maxMembers: 1000, maxStaff: 25, maxBranches: 2 },
            },
            settings: { locale: { timezone: "Africa/Cairo" } },
        };

        vi.spyOn(Tenant, "findById").mockReturnValue({
            populate: vi.fn().mockReturnValue({
                populate: vi.fn().mockResolvedValue(mockTenant),
            }),
        });

        vi.spyOn(Member.collection, "countDocuments").mockResolvedValue(200);
        vi.spyOn(User.collection, "countDocuments").mockResolvedValue(8);
        vi.spyOn(TenantNote, "find").mockReturnValue({ sort: vi.fn().mockResolvedValue([]) });
        vi.spyOn(AuditLog, "find").mockReturnValue({ sort: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) });
        vi.spyOn(BillingEvent, "find").mockReturnValue({ sort: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) });
        vi.spyOn(AuditLog, "countDocuments").mockResolvedValue(150);
        vi.spyOn(storageService, "sumTenantBytes").mockResolvedValue(5 * 1024 * 1024 * 1024);

        let responsePayload = null;
        const res = {
            status: () => res,
            json: (data) => {
                responsePayload = data;
                return res;
            },
        };

        await getTenantDetail({ params: { id: String(tenantId) } }, res);

        expect(responsePayload).toBeDefined();
        expect(responsePayload.usage.storageLimitGb).toBe(35);
        expect(responsePayload.usage.storageGb).toBe(5);
        expect(responsePayload.tenant.effectiveLimits.storageGb).toBe(35);
        expect(responsePayload.tenant.effectiveLimits.whatsappMonthlyMessages).toBe(2500);
    });

    it("returns storageLimitGb and storageGb inside summary usage in getTenants", async () => {
        const tenantId = new mongoose.Types.ObjectId();
        const mockTenant = {
            _id: tenantId,
            name: "Silver Gym",
            slug: "silver-gym",
            status: "active",
            billing: { cycle: "monthly" },
            planId: {
                _id: new mongoose.Types.ObjectId(),
                key: "silver",
                name: "Silver Plan",
                fairUseCaps: { storageGb: 40 },
                limits: { maxMembers: 750, maxStaff: 15 },
            },
        };

        vi.spyOn(Tenant, "find").mockReturnValue({
            populate: vi.fn().mockReturnValue({
                populate: vi.fn().mockReturnValue({
                    sort: vi.fn().mockReturnValue({
                        skip: vi.fn().mockReturnValue({
                            limit: vi.fn().mockResolvedValue([mockTenant]),
                        }),
                    }),
                }),
            }),
        });
        vi.spyOn(Tenant, "countDocuments").mockResolvedValue(1);
        vi.spyOn(Member.collection, "countDocuments").mockResolvedValue(50);
        vi.spyOn(User.collection, "countDocuments").mockResolvedValue(3);
        vi.spyOn(storageService, "sumTenantBytes").mockResolvedValue(2 * 1024 * 1024 * 1024);

        let responsePayload = null;
        const res = {
            status: () => res,
            json: (data) => {
                responsePayload = data;
                return res;
            },
        };

        await getTenants({ query: {} }, res);

        expect(responsePayload).toBeDefined();
        expect(responsePayload.tenants).toHaveLength(1);
        const row = responsePayload.tenants[0];
        expect(row.usage.storageLimitGb).toBe(40);
        expect(row.usage.storageGb).toBe(2);
    });
});
