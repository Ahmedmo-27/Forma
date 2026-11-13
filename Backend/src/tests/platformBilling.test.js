import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import ManualPayment from "../models/ManualPayment";
import Invoice from "../models/Invoice";
import BillingEvent from "../models/BillingEvent";
import Tenant from "../models/Tenant";
import Plan from "../models/Plan";
import PlatformCounter from "../models/PlatformCounter";
import PlatformSetting from "../models/PlatformSetting";
import AuditLog from "../models/AuditLog";
import {
    confirmPayment,
    rejectPayment,
    processRefund,
    issueManualGrant,
    exportLedgerCsv,
} from "../controllers/platformBillingController";
import { getNextInvoiceNumber } from "../services/invoiceService";

describe("Phase 4: Billing & Payments Operations", () => {
    const adminUser = {
        id: new mongoose.Types.ObjectId().toString(),
        email: "billing@forma.app",
        name: "Platform Billing Specialist",
        role: "billing",
    };

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(PlatformSetting, "findOne").mockResolvedValue(null);
        vi.spyOn(AuditLog, "create").mockResolvedValue({});
    });

    describe("Sequential Atomic Invoice Numbers", () => {
        it("generates sequential formatted invoice numbers for the current year", async () => {
            const year = new Date().getFullYear();
            vi.spyOn(PlatformCounter, "findOneAndUpdate").mockResolvedValueOnce({ seq: 1 });
            const inv1 = await getNextInvoiceNumber();
            expect(inv1).toBe(`INV-${year}-0001`);

            vi.spyOn(PlatformCounter, "findOneAndUpdate").mockResolvedValueOnce({ seq: 42 });
            const inv2 = await getNextInvoiceNumber();
            expect(inv2).toBe(`INV-${year}-0042`);
        });
    });

    describe("Manual Payments Inbox: Confirm & Reject", () => {
        it("strictly rejects confirmation if mandatory reason is missing", async () => {
            const paymentId = new mongoose.Types.ObjectId();
            const req = {
                params: { id: paymentId.toString() },
                body: {}, // missing reason
                platformUser: adminUser,
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await confirmPayment(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining("Mandatory 'reason' required") })
            );
        });

        it("confirms manual payment, activates tenant, creates Invoice and BillingEvent", async () => {
            const tenantId = new mongoose.Types.ObjectId();
            const mockTenant = {
                _id: tenantId,
                name: "Sparta Gym",
                slug: "sparta-gym",
                status: "past_due",
                billing: { cycle: "monthly" },
                save: vi.fn().mockResolvedValue(true),
            };

            const mockPayment = {
                _id: new mongoose.Types.ObjectId(),
                paymentRef: "MANUAL-BANK-001",
                tenantId: mockTenant,
                planKey: "gold",
                cycle: "monthly",
                amount: 1500,
                currency: "EGP",
                status: "pending",
                save: vi.fn().mockResolvedValue(true),
            };

            vi.spyOn(ManualPayment, "findById").mockReturnValue({
                populate: vi.fn().mockResolvedValue(mockPayment),
            });
            vi.spyOn(BillingEvent, "create").mockResolvedValue([{ _id: new mongoose.Types.ObjectId() }]);
            vi.spyOn(Invoice, "create").mockResolvedValue({ invoiceNumber: "INV-2026-0005" });
            vi.spyOn(PlatformCounter, "findOneAndUpdate").mockResolvedValue({ seq: 5 });

            const req = {
                params: { id: mockPayment._id.toString() },
                body: { reason: "Bank transfer verified via National Bank of Egypt statement" },
                platformUser: adminUser,
            };
            const res = {
                json: vi.fn(),
                status: vi.fn().mockReturnThis(),
            };

            await confirmPayment(req, res);

            expect(mockTenant.status).toBe("active");
            expect(mockPayment.status).toBe("confirmed");
            expect(BillingEvent.create).toHaveBeenCalled();
            expect(Invoice.create).toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining("confirmed"),
                    invoiceNumber: "INV-2026-0005",
                })
            );
        });

        it("sets currentPeriodEnd for a 3-month intervalCount payment", async () => {
            const tenantId = new mongoose.Types.ObjectId();
            const mockTenant = {
                _id: tenantId,
                name: "Quarterly Gym",
                slug: "quarterly-gym",
                status: "trial",
                billing: { cycle: "monthly", intervalCount: 1 },
                save: vi.fn().mockResolvedValue(true),
            };

            const mockPayment = {
                _id: new mongoose.Types.ObjectId(),
                paymentRef: "MANUAL-BANK-Q3",
                tenantId: mockTenant,
                planKey: "gold",
                cycle: "monthly",
                intervalCount: 3,
                amount: 4000,
                currency: "EGP",
                status: "pending",
                save: vi.fn().mockResolvedValue(true),
            };

            vi.spyOn(ManualPayment, "findById").mockReturnValue({
                populate: vi.fn().mockResolvedValue(mockPayment),
            });
            vi.spyOn(BillingEvent, "create").mockResolvedValue([{ _id: new mongoose.Types.ObjectId() }]);
            vi.spyOn(Invoice, "create").mockResolvedValue({ invoiceNumber: "INV-2026-0006" });
            vi.spyOn(PlatformCounter, "findOneAndUpdate").mockResolvedValue({ seq: 6 });

            const before = Date.now();
            await confirmPayment(
                {
                    params: { id: mockPayment._id.toString() },
                    body: { reason: "Verified 3-month bank transfer" },
                    platformUser: adminUser,
                },
                { json: vi.fn(), status: vi.fn().mockReturnThis() }
            );

            expect(mockTenant.billing.intervalCount).toBe(3);
            const expectedMs = 3 * 30 * 24 * 60 * 60 * 1000;
            const delta = mockTenant.currentPeriodEnd.getTime() - before;
            expect(delta).toBeGreaterThanOrEqual(expectedMs - 5000);
            expect(delta).toBeLessThanOrEqual(expectedMs + 5000);
            expect(BillingEvent.create).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        cycle: "monthly",
                        intervalCount: 3,
                        amount: 4000,
                    }),
                ])
            );
        });

        it("sets currentPeriodEnd for a 2-year intervalCount payment", async () => {
            const tenantId = new mongoose.Types.ObjectId();
            const mockTenant = {
                _id: tenantId,
                name: "Biennial Gym",
                slug: "biennial-gym",
                status: "trial",
                billing: { cycle: "yearly", intervalCount: 1 },
                save: vi.fn().mockResolvedValue(true),
            };

            const mockPayment = {
                _id: new mongoose.Types.ObjectId(),
                paymentRef: "MANUAL-BANK-Y2",
                tenantId: mockTenant,
                planKey: "platinum",
                cycle: "yearly",
                intervalCount: 2,
                amount: 50000,
                currency: "EGP",
                status: "pending",
                save: vi.fn().mockResolvedValue(true),
            };

            vi.spyOn(ManualPayment, "findById").mockReturnValue({
                populate: vi.fn().mockResolvedValue(mockPayment),
            });
            vi.spyOn(BillingEvent, "create").mockResolvedValue([{ _id: new mongoose.Types.ObjectId() }]);
            vi.spyOn(Invoice, "create").mockResolvedValue({ invoiceNumber: "INV-2026-0007" });
            vi.spyOn(PlatformCounter, "findOneAndUpdate").mockResolvedValue({ seq: 7 });

            const before = Date.now();
            await confirmPayment(
                {
                    params: { id: mockPayment._id.toString() },
                    body: { reason: "Verified 2-year bank transfer" },
                    platformUser: adminUser,
                },
                { json: vi.fn(), status: vi.fn().mockReturnThis() }
            );

            expect(mockTenant.billing.cycle).toBe("yearly");
            expect(mockTenant.billing.intervalCount).toBe(2);
            const expectedMs = 24 * 30 * 24 * 60 * 60 * 1000;
            const delta = mockTenant.currentPeriodEnd.getTime() - before;
            expect(delta).toBeGreaterThanOrEqual(expectedMs - 5000);
            expect(delta).toBeLessThanOrEqual(expectedMs + 5000);
        });

        it("rejects payment submission with mandatory reason", async () => {
            const mockPayment = {
                _id: new mongoose.Types.ObjectId(),
                status: "pending",
                save: vi.fn().mockResolvedValue(true),
            };

            vi.spyOn(ManualPayment, "findById").mockResolvedValue(mockPayment);
            vi.spyOn(Tenant, "findById").mockReturnValue({
                select: vi.fn().mockResolvedValue(null),
            });

            const req = {
                params: { id: mockPayment._id.toString() },
                body: { reason: "Transfer receipt unreadable and bank account mismatch" },
                platformUser: adminUser,
            };
            const res = {
                json: vi.fn(),
                status: vi.fn().mockReturnThis(),
            };

            await rejectPayment(req, res);

            expect(mockPayment.status).toBe("rejected");
            expect(mockPayment.rejectReason).toBe("Transfer receipt unreadable and bank account mismatch");
            expect(mockPayment.save).toHaveBeenCalled();
        });
    });

    describe("Refunds & Manual Grants", () => {
        it("processes refund, writes append-only BillingEvent and AuditLog", async () => {
            const tenantId = new mongoose.Types.ObjectId();
            const mockTenant = {
                _id: tenantId,
                name: "Refund Gym",
                planId: { key: "gold" },
                billing: { cycle: "monthly" },
                settings: { locale: { currency: "USD" } },
            };

            vi.spyOn(Tenant, "findById").mockReturnValue({
                populate: vi.fn().mockResolvedValue(mockTenant),
            });
            vi.spyOn(BillingEvent, "create").mockResolvedValue({ _id: new mongoose.Types.ObjectId() });

            const req = {
                body: {
                    tenantId: tenantId.toString(),
                    amount: 500,
                    reason: "Duplicate charge adjustment requested by gym owner",
                },
                platformUser: adminUser,
            };
            const res = {
                json: vi.fn(),
                status: vi.fn().mockReturnThis(),
            };

            await processRefund(req, res);

            expect(BillingEvent.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "refund",
                    amount: 500,
                    meta: expect.objectContaining({
                        reason: "Duplicate charge adjustment requested by gym owner",
                    }),
                })
            );
        });

        it("issues manual grant with reason and activates subscription", async () => {
            const tenantId = new mongoose.Types.ObjectId();
            const mockTenant = {
                _id: tenantId,
                status: "trial",
                billing: {},
                save: vi.fn().mockResolvedValue(true),
            };
            const mockPlan = { _id: new mongoose.Types.ObjectId(), key: "gold" };

            vi.spyOn(Tenant, "findById").mockResolvedValue(mockTenant);
            vi.spyOn(Plan, "findOne").mockResolvedValue(mockPlan);
            vi.spyOn(BillingEvent, "create").mockResolvedValue({});

            const req = {
                body: {
                    tenantId: tenantId.toString(),
                    planKey: "gold",
                    cycle: "monthly",
                    durationMonths: 3,
                    reason: "Early beta partner partnership grant",
                },
                platformUser: adminUser,
            };
            const res = {
                json: vi.fn(),
                status: vi.fn().mockReturnThis(),
            };

            await issueManualGrant(req, res);

            expect(mockTenant.status).toBe("active");
            expect(mockTenant.save).toHaveBeenCalled();
            expect(BillingEvent.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "manual_grant",
                    meta: expect.objectContaining({
                        reason: "Early beta partner partnership grant",
                        durationMonths: 3,
                    }),
                })
            );
        });
    });

    describe("Financial Ledger CSV Export", () => {
        it("formats ledger events into proper CSV stream", async () => {
            const mockEvents = [
                {
                    _id: "evt-1",
                    createdAt: new Date("2026-11-01T10:00:00Z"),
                    tenantId: { slug: "crossfit-1", name: 'Crossfit "Elite"' },
                    type: "purchase",
                    planKey: "gold",
                    cycle: "monthly",
                    amount: 1500,
                    currency: "USD",
                    actorType: "User",
                    externalRef: "REF-001",
                    meta: { reason: "Initial subscription" },
                },
            ];

            vi.spyOn(BillingEvent, "find").mockReturnValue({
                populate: vi.fn().mockReturnValue({
                    sort: vi.fn().mockResolvedValue(mockEvents),
                }),
            });

            const req = { query: {} };
            const res = {
                setHeader: vi.fn(),
                send: vi.fn(),
            };

            await exportLedgerCsv(req, res);

            expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/csv");
            expect(res.send).toHaveBeenCalled();
            const outputCsv = res.send.mock.calls[0][0];
            expect(outputCsv).toContain("crossfit-1");
            expect(outputCsv).toContain('"Crossfit ""Elite"""');
            expect(outputCsv).toContain("purchase");
            expect(outputCsv).toContain("1500");
        });
    });
});
