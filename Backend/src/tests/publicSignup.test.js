import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import Plan from "../models/Plan";
import PlanPrice from "../models/PlanPrice";
import Tenant from "../models/Tenant";
import User from "../models/User";
import PlatformUser from "../models/PlatformUser";
import AuditLog from "../models/AuditLog";
import ManualPayment from "../models/ManualPayment";
import PasswordSetupToken from "../models/PasswordSetupToken";
import mailer from "../services/mailer";
import * as paymentAdapter from "../services/billing/paymentAdapter";
import * as tenantContext from "../context/tenantContext";
import { listPublicPlans, publicSignup } from "../controllers/publicController";

const publicSiteService = require("../services/publicSiteService");

describe("Public plans + signup", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        // Keep real ALS (runAsPlatform / runWithTenant) so tenantPlugin models work.
        // Spy the same CJS export object the controller requires.
        vi.spyOn(publicSiteService, "getPublicSiteSetting").mockResolvedValue({
            published: true,
            message: "",
        });
    });

    function mockRes() {
        return {
            status: vi.fn().mockReturnThis(),
            json: vi.fn(),
        };
    }

    it("lists only public active plans with active prices", async () => {
        const planId = new mongoose.Types.ObjectId();
        const leanPlans = vi.fn().mockResolvedValue([
            {
                _id: planId,
                key: "basic",
                name: "Basic",
                description: "Starter",
                features: ["members"],
                limits: { maxMembers: 500 },
                fairUseCaps: {},
                sortOrder: 1,
            },
        ]);
        const leanPrices = vi.fn().mockResolvedValue([
            {
                _id: new mongoose.Types.ObjectId(),
                planId,
                cycle: "monthly",
                intervalCount: 3,
                amount: 4000,
                validFrom: new Date(Date.now() - 1000),
                validUntil: null,
                maxLifetimeSeats: null,
                soldLifetimeSeats: 0,
            },
        ]);

        vi.spyOn(Plan, "find").mockReturnValue({
            select: vi.fn().mockReturnValue({
                sort: vi.fn().mockReturnValue({ lean: leanPlans }),
            }),
        });
        vi.spyOn(PlanPrice, "find").mockReturnValue({
            select: vi.fn().mockReturnValue({ lean: leanPrices }),
        });

        const res = mockRes();
        await listPublicPlans({}, res);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                currency: "EGP",
                plans: [expect.objectContaining({ key: "basic", name: "Basic" })],
                prices: [
                    expect.objectContaining({
                        planKey: "basic",
                        cycle: "monthly",
                        intervalCount: 3,
                        amount: 4000,
                    }),
                ],
            })
        );
    });

    it("rejects reserved slugs on public signup", async () => {
        const res = mockRes();
        await publicSignup(
            {
                body: {
                    name: "API Gym",
                    slug: "www",
                    ownerName: "Owner",
                    ownerEmail: "owner@example.com",
                    planKey: "basic",
                    cycle: "monthly",
                },
            },
            res
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining("reserved") })
        );
    });

    it("creates tenant, manual payment, and audit with tenantId", async () => {
        const planId = new mongoose.Types.ObjectId();
        const tenantId = new mongoose.Types.ObjectId();
        const ownerId = new mongoose.Types.ObjectId();
        const plan = {
            _id: planId,
            key: "basic",
            name: "Basic",
            isActive: true,
            visibility: "public",
        };
        const planPrice = {
            _id: new mongoose.Types.ObjectId(),
            amount: 1500,
            maxLifetimeSeats: null,
            soldLifetimeSeats: 0,
        };

        vi.spyOn(Plan, "findOne").mockResolvedValue(plan);
        vi.spyOn(PlanPrice, "findOne").mockResolvedValue(planPrice);
        vi.spyOn(Tenant, "findOne").mockResolvedValue(null);
        vi.spyOn(User, "findOne").mockResolvedValue(null);
        vi.spyOn(PlatformUser, "findOne").mockResolvedValue(null);
        vi.spyOn(Tenant, "create").mockResolvedValue({
            _id: tenantId,
            name: "Nile Fitness",
            slug: "nile-fitness",
            status: "trial",
            save: vi.fn().mockResolvedValue(true),
        });
        vi.spyOn(User, "create").mockResolvedValue({
            _id: ownerId,
            name: "Owner",
            email: "owner@nile.com",
        });
        vi.spyOn(PasswordSetupToken, "updateMany").mockResolvedValue({});
        vi.spyOn(PasswordSetupToken, "create").mockResolvedValue({});
        vi.spyOn(mailer, "sendInvite").mockResolvedValue({ skipped: true });
        const initiatePayment = vi.fn().mockResolvedValue({
            paymentRef: "MANUAL-1",
            paymentMethod: "manual_transfer",
            status: "pending",
            amount: 1500,
            currency: "EGP",
            instructions: {
                bankName: "Test Bank",
                accountName: "Forma",
                iban: "EG00",
                referenceCode: "MANUAL-1",
                notice: "Include ref",
            },
        });
        vi.spyOn(paymentAdapter, "getPaymentAdapter").mockReturnValue({ initiatePayment });
        vi.spyOn(ManualPayment, "create").mockResolvedValue({});
        vi.spyOn(AuditLog, "create").mockResolvedValue({});

        const res = mockRes();
        await publicSignup(
            {
                body: {
                    name: "Nile Fitness",
                    slug: "nile-fitness",
                    ownerName: "Owner",
                    ownerEmail: "owner@nile.com",
                    planKey: "basic",
                    cycle: "monthly",
                    trialDays: 14,
                },
            },
            res
        );

        expect(res.status).toHaveBeenCalledWith(201);
        expect(ManualPayment.create).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId,
                planKey: "basic",
                cycle: "monthly",
                intervalCount: 1,
                amount: 1500,
                status: "pending",
                paymentRef: expect.stringMatching(/^MANUAL-/),
            })
        );
        expect(AuditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId,
                meta: expect.objectContaining({ source: "public_signup" }),
            })
        );
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                tenant: expect.objectContaining({ slug: "nile-fitness" }),
                payment: expect.objectContaining({
                    paymentRef: expect.stringMatching(/^MANUAL-/),
                    instructions: expect.objectContaining({
                        referenceCode: expect.any(String),
                    }),
                }),
            })
        );
    }, 15000);

    it("resolves a multi-month price and persists intervalCount on signup", async () => {
        const planId = new mongoose.Types.ObjectId();
        const tenantId = new mongoose.Types.ObjectId();
        const ownerId = new mongoose.Types.ObjectId();
        const plan = {
            _id: planId,
            key: "gold",
            name: "Gold",
            isActive: true,
            visibility: "public",
        };
        const planPrice = {
            _id: new mongoose.Types.ObjectId(),
            amount: 4000,
            intervalCount: 3,
            cycle: "monthly",
            maxLifetimeSeats: null,
            soldLifetimeSeats: 0,
        };

        vi.spyOn(Plan, "findOne").mockResolvedValue(plan);
        vi.spyOn(PlanPrice, "findOne").mockResolvedValue(planPrice);
        vi.spyOn(Tenant, "findOne").mockResolvedValue(null);
        vi.spyOn(User, "findOne").mockResolvedValue(null);
        vi.spyOn(PlatformUser, "findOne").mockResolvedValue(null);
        vi.spyOn(Tenant, "create").mockResolvedValue({
            _id: tenantId,
            name: "Quarter Gym",
            slug: "quarter-gym",
            status: "trial",
            save: vi.fn().mockResolvedValue(true),
        });
        vi.spyOn(User, "create").mockResolvedValue({
            _id: ownerId,
            name: "Owner",
            email: "owner@quarter.com",
        });
        vi.spyOn(PasswordSetupToken, "updateMany").mockResolvedValue({});
        vi.spyOn(PasswordSetupToken, "create").mockResolvedValue({});
        vi.spyOn(mailer, "sendInvite").mockResolvedValue({ skipped: true });
        vi.spyOn(paymentAdapter, "getPaymentAdapter").mockReturnValue({
            initiatePayment: vi.fn().mockResolvedValue({
                paymentRef: "MANUAL-Q3",
                paymentMethod: "manual_transfer",
                status: "pending",
                amount: 4000,
                currency: "EGP",
                instructions: { referenceCode: "MANUAL-Q3" },
            }),
        });
        vi.spyOn(ManualPayment, "create").mockResolvedValue({});
        vi.spyOn(AuditLog, "create").mockResolvedValue({});

        const res = mockRes();
        await publicSignup(
            {
                body: {
                    name: "Quarter Gym",
                    slug: "quarter-gym",
                    ownerName: "Owner",
                    ownerEmail: "owner@quarter.com",
                    planKey: "gold",
                    cycle: "monthly",
                    intervalCount: 3,
                },
            },
            res
        );

        expect(PlanPrice.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                planId,
                cycle: "monthly",
                isActive: true,
            })
        );
        expect(Tenant.create).toHaveBeenCalledWith(
            expect.objectContaining({
                billing: expect.objectContaining({ cycle: "monthly", intervalCount: 3 }),
            })
        );
        expect(ManualPayment.create).toHaveBeenCalledWith(
            expect.objectContaining({
                cycle: "monthly",
                intervalCount: 3,
                amount: 4000,
            })
        );
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                payment: expect.objectContaining({ cycle: "monthly", intervalCount: 3, amount: 4000 }),
            })
        );
    }, 15000);
});
