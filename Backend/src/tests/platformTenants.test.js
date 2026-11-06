import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import Tenant from "../models/Tenant";
import Plan from "../models/Plan";
import User from "../models/User";
import AuditLog from "../models/AuditLog";
import BillingEvent from "../models/BillingEvent";
import TenantNote from "../models/TenantNote";
import {
    onboardTenant,
    updateTenantLifecycle,
    bulkTenantActions,
} from "../controllers/platformTenantController";
import mailer from "../services/mailer";
import PasswordSetupToken from "../models/PasswordSetupToken";

describe("Phase 2: Platform Subscriber (Tenant) Management", () => {
    const adminUser = {
        id: new mongoose.Types.ObjectId().toString(),
        email: "superadmin@leapplatform.com",
        name: "Platform Super Admin",
        role: "super_admin",
    };

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe("Safe Tenant Onboarding", () => {
        it("rejects onboarding when slug is a reserved keyword (e.g. 'api', 'platform')", async () => {
            const req = {
                body: {
                    name: "API Gym",
                    slug: "api",
                    ownerName: "Coach John",
                    ownerEmail: "john@gym.com",
                },
                platformUser: adminUser,
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await onboardTenant(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining("reserved") })
            );
        });

        it("rejects invalid slug formats containing spaces or special characters", async () => {
            const req = {
                body: {
                    name: "Invalid Slug Gym",
                    slug: "invalid gym slug!",
                    ownerName: "Coach John",
                    ownerEmail: "john@gym.com",
                },
                platformUser: adminUser,
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await onboardTenant(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining("alphanumeric") })
            );
        });

        it("successfully onboards tenant, creates owner with one-time invite link and audits action", async () => {
            const mockPlan = {
                _id: new mongoose.Types.ObjectId(),
                key: "basic",
                name: "Basic Plan",
            };
            const mockTenant = {
                _id: new mongoose.Types.ObjectId(),
                name: "Cairo Crossfit",
                slug: "cairo-crossfit",
                status: "trial",
                billing: { cycle: "monthly" },
                save: vi.fn().mockResolvedValue(true),
            };
            const mockOwner = {
                _id: new mongoose.Types.ObjectId(),
                name: "Ahmed Coach",
                email: "ahmed@crossfit.com",
            };

            vi.spyOn(Tenant, "findOne").mockResolvedValue(null);
            vi.spyOn(Plan, "findOne").mockResolvedValue(mockPlan);
            vi.spyOn(User, "findOne").mockResolvedValue(null);
            vi.spyOn(Tenant, "create").mockResolvedValue(mockTenant);
            vi.spyOn(User, "create").mockResolvedValue(mockOwner);
            vi.spyOn(AuditLog, "create").mockResolvedValue({});
            vi.spyOn(PasswordSetupToken, "updateMany").mockResolvedValue({});
            vi.spyOn(PasswordSetupToken, "create").mockResolvedValue({});
            vi.spyOn(mailer, "sendInvite").mockResolvedValue({ skipped: true });

            const req = {
                body: {
                    name: "Cairo Crossfit",
                    slug: "cairo-crossfit",
                    ownerName: "Ahmed Coach",
                    ownerEmail: "ahmed@crossfit.com",
                    planKey: "basic",
                },
                platformUser: adminUser,
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await onboardTenant(req, res);

            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: "Tenant onboarded successfully",
                    invite: expect.objectContaining({
                        inviteToken: expect.any(String),
                        inviteUrl: expect.stringContaining("/auth/setup-password?token="),
                    }),
                })
            );

            expect(AuditLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: "tenant_status_updated",
                    actor: adminUser.id,
                })
            );
            expect(PasswordSetupToken.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: mockOwner._id,
                    tenantId: mockTenant._id,
                    email: mockOwner.email,
                    purpose: "invite",
                    tokenHash: expect.any(String),
                })
            );
            const stored = PasswordSetupToken.create.mock.calls[0][0];
            expect(stored.tokenHash).not.toBe(res.json.mock.calls[0][0].invite.inviteToken);
        });
    });

    describe("Lifecycle Actions & Mandatory Reason Audit", () => {
        it("strictly rejects lifecycle update if mandatory reason is missing", async () => {
            const req = {
                params: { id: new mongoose.Types.ObjectId().toString() },
                body: { action: "suspend" }, // missing reason!
                platformUser: adminUser,
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await updateTenantLifecycle(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining("Mandatory 'reason' field is required") })
            );
        });

        it("suspends tenant and writes append-only AuditLog with before/after state", async () => {
            const tenantId = new mongoose.Types.ObjectId();
            const mockTenant = {
                _id: tenantId,
                name: "Nile Gym",
                slug: "nile-gym",
                status: "active",
                billing: { cycle: "monthly" },
                save: vi.fn().mockResolvedValue(true),
            };

            vi.spyOn(Tenant, "findById").mockReturnValue({
                populate: vi.fn().mockResolvedValue(mockTenant),
            });
            vi.spyOn(AuditLog, "create").mockResolvedValue({});

            const req = {
                params: { id: tenantId.toString() },
                body: {
                    action: "suspend",
                    reason: "Billing overdue by 30 days",
                },
                platformUser: adminUser,
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await updateTenantLifecycle(req, res);

            expect(mockTenant.status).toBe("suspended");
            expect(mockTenant.save).toHaveBeenCalled();
            expect(AuditLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    tenantId,
                    action: "tenant_status_updated",
                    meta: expect.objectContaining({
                        lifecycleAction: "suspend",
                        reason: "Billing overdue by 30 days",
                        beforeState: expect.objectContaining({ status: "active" }),
                        afterState: expect.objectContaining({ status: "suspended" }),
                    }),
                })
            );
        });

        it("changes slug and saves previous slug into slugHistory", async () => {
            const tenantId = new mongoose.Types.ObjectId();
            const mockTenant = {
                _id: tenantId,
                name: "Old Slug Gym",
                slug: "old-slug",
                slugHistory: [],
                save: vi.fn().mockResolvedValue(true),
            };

            vi.spyOn(Tenant, "findById").mockReturnValue({
                populate: vi.fn().mockResolvedValue(mockTenant),
            });
            vi.spyOn(Tenant, "findOne").mockResolvedValue(null);
            vi.spyOn(AuditLog, "create").mockResolvedValue({});

            const req = {
                params: { id: tenantId.toString() },
                body: {
                    action: "change_slug",
                    newSlug: "new-brand-slug",
                    reason: "Rebranding gym name",
                },
                platformUser: adminUser,
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await updateTenantLifecycle(req, res);

            expect(mockTenant.slug).toBe("new-brand-slug");
            expect(mockTenant.slugHistory).toHaveLength(1);
            expect(mockTenant.slugHistory[0].slug).toBe("old-slug");
        });
    });

    describe("Bulk Actions on Filtered Selections", () => {
        it("rejects batch execution exceeding maximum cap of 100 tenants", async () => {
            const excessIds = Array.from({ length: 105 }, () => new mongoose.Types.ObjectId().toString());
            const req = {
                body: {
                    action: "extend_trial",
                    tenantIds: excessIds,
                    previewOnly: false,
                    reason: "Promotional campaign",
                },
                platformUser: adminUser,
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await bulkTenantActions(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining("Batch size exceeds maximum limit") })
            );
        });

        it("supports dry-run preview without mutating records", async () => {
            const tenantIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
            vi.spyOn(Tenant, "find").mockReturnValue({
                select: vi.fn().mockResolvedValue([
                    { _id: tenantIds[0], name: "Gym 1", status: "trial" },
                    { _id: tenantIds[1], name: "Gym 2", status: "trial" },
                ]),
            });

            const req = {
                body: {
                    action: "extend_trial",
                    tenantIds: tenantIds.map((id) => id.toString()),
                    previewOnly: true,
                    payload: { days: 7 },
                },
                platformUser: adminUser,
            };
            const res = {
                json: vi.fn(),
            };

            await bulkTenantActions(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    tenantCount: 2,
                    action: "extend_trial",
                    proposedChanges: { days: 7 },
                })
            );
        });
    });
});
