import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import Tenant from "../models/Tenant";
import User from "../models/User";
import Member from "../models/Member";
import Package from "../models/Package";
import WhatsAppTemplate from "../models/WhatsAppTemplate";
import TenantNote from "../models/TenantNote";
import CoachRepRequest from "../models/CoachRepRequest";
import SalesRepRequest from "../models/SalesRepRequest";
import PackageExceptionRequest from "../models/PackageExceptionRequest";
import ProfileView from "../models/ProfileView";
import BillingEvent from "../models/BillingEvent";
import AuditLog from "../models/AuditLog";
import storageService from "../services/storageService";
import {
    createImpersonationSession,
    purgeTenant,
    exportTenantData,
} from "../controllers/platformSupportController";
import { protect } from "../middleware/authMiddleware";

describe("Phase 6: Support, Impersonation & Operations Tools", () => {
    const superAdmin = {
        id: new mongoose.Types.ObjectId().toString(),
        email: "superadmin@leapplatform.com",
        name: "Super Admin",
        role: "super_admin",
    };

    const supportUser = {
        id: new mongoose.Types.ObjectId().toString(),
        email: "support@leapplatform.com",
        name: "Support Specialist",
        role: "support",
    };

    beforeEach(() => {
        vi.restoreAllMocks();
        process.env.JWT_SECRET = "tenant_test_jwt_secret";
        vi.spyOn(AuditLog, "create").mockResolvedValue({});
    });

    describe("Impersonation Security & Read-Only Enforcement", () => {
        it("restricts read-write impersonation strictly to super_admins and requires reason", async () => {
            const req = {
                body: {
                    tenantId: new mongoose.Types.ObjectId().toString(),
                    mode: "read_write",
                    reason: "Fixing corrupted contract",
                },
                platformUser: supportUser, // Not a super_admin!
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await createImpersonationSession(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining("strictly restricted to platform super_admins") })
            );
        });

        it("issues a read-only impersonation token for support role", async () => {
            const tenantId = new mongoose.Types.ObjectId();
            const mockTenant = {
                _id: tenantId,
                name: "Alpha Gym",
                slug: "alpha-gym",
            };
            const mockUser = {
                _id: new mongoose.Types.ObjectId(),
                name: "Gym Owner",
                role: "Owner",
            };

            vi.spyOn(Tenant, "findById").mockResolvedValue(mockTenant);
            vi.spyOn(User, "findOne").mockResolvedValue(mockUser);

            const req = {
                body: {
                    tenantId: tenantId.toString(),
                    mode: "read_only",
                },
                platformUser: supportUser,
            };
            const res = {
                json: vi.fn(),
                status: vi.fn().mockReturnThis(),
            };

            await createImpersonationSession(req, res);

            expect(res.json).toHaveBeenCalled();
            const callData = res.json.mock.calls[0][0];
            expect(callData.token).toBeDefined();

            // Decode and verify token claims
            const decoded = jwt.verify(callData.token, process.env.JWT_SECRET);
            expect(decoded.isImpersonation).toBe(true);
            expect(decoded.readOnly).toBe(true);
            expect(decoded.impersonatedBy).toBe(supportUser.id);
        });

        it("strictly blocks mutating HTTP operations during read-only impersonation", async () => {
            const token = jwt.sign(
                {
                    id: "user-1",
                    tenantId: "t-1",
                    isImpersonation: true,
                    readOnly: true,
                    impersonatedBy: "admin-1",
                },
                process.env.JWT_SECRET
            );

            const mockUser = { _id: "user-1", role: "Owner", name: "Gym Owner", email: "owner@gym.com" };
            vi.spyOn(User, "findById").mockReturnValue({
                select: vi.fn().mockResolvedValue(mockUser),
            });
            vi.spyOn(Tenant, "findById").mockResolvedValue({ status: "active", slug: "gym-1" });

            const req = {
                headers: { authorization: `Bearer ${token}` },
                method: "POST", // Mutating action!
                originalUrl: "/api/members",
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };
            const next = vi.fn();

            await protect(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    code: "IMPERSONATION_READ_ONLY",
                })
            );
        });
    });

    describe("Hard Purge Verification & Slug Confirmation", () => {
        it("rejects purge if typed slug confirmation does not match", async () => {
            const tenantId = new mongoose.Types.ObjectId();
            const mockTenant = {
                _id: tenantId,
                name: "Purge Gym",
                slug: "target-gym-slug",
            };

            vi.spyOn(Tenant, "findById").mockResolvedValue(mockTenant);

            const req = {
                params: { id: tenantId.toString() },
                body: {
                    slugConfirmation: "wrong-slug",
                    reason: "Customer cancelled contract",
                },
                platformUser: superAdmin,
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await purgeTenant(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining("Slug confirmation mismatch") })
            );
        });

        it("purges all collections, cleans disk files, and writes surviving tombstone audit record", async () => {
            const tenantId = new mongoose.Types.ObjectId();
            const mockTenant = {
                _id: tenantId,
                name: "Purge Gym",
                slug: "target-gym-slug",
            };

            vi.spyOn(Tenant, "findById").mockResolvedValue(mockTenant);
            vi.spyOn(Member, "deleteMany").mockResolvedValue({ deletedCount: 15 });
            vi.spyOn(User, "deleteMany").mockResolvedValue({ deletedCount: 2 });
            vi.spyOn(Package, "deleteMany").mockResolvedValue({ deletedCount: 3 });
            vi.spyOn(WhatsAppTemplate, "deleteMany").mockResolvedValue({ deletedCount: 1 });
            vi.spyOn(TenantNote, "deleteMany").mockResolvedValue({ deletedCount: 1 });
            vi.spyOn(CoachRepRequest, "deleteMany").mockResolvedValue({ deletedCount: 0 });
            vi.spyOn(SalesRepRequest, "deleteMany").mockResolvedValue({ deletedCount: 0 });
            vi.spyOn(PackageExceptionRequest, "deleteMany").mockResolvedValue({ deletedCount: 0 });
            vi.spyOn(ProfileView, "deleteMany").mockResolvedValue({ deletedCount: 0 });
            vi.spyOn(Tenant, "findByIdAndDelete").mockResolvedValue(mockTenant);
            vi.spyOn(storageService, "getTenantDir").mockReturnValue("nonexistent-dir-for-test");

            const req = {
                params: { id: tenantId.toString() },
                body: {
                    slugConfirmation: "target-gym-slug",
                    reason: "GDPR right to be forgotten request confirmed by owner",
                },
                platformUser: superAdmin,
            };
            const res = {
                json: vi.fn(),
                status: vi.fn().mockReturnThis(),
            };

            await purgeTenant(req, res);

            expect(Member.deleteMany).toHaveBeenCalledWith({ tenantId });
            expect(User.deleteMany).toHaveBeenCalledWith({ tenantId });
            expect(Tenant.findByIdAndDelete).toHaveBeenCalledWith(tenantId);

            // Tombstone audit must have tenantId = null so it survives
            expect(AuditLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    tenantId: null,
                    meta: expect.objectContaining({
                        action: "tenant_purged",
                        purgedSlug: "target-gym-slug",
                        reason: "GDPR right to be forgotten request confirmed by owner",
                    }),
                })
            );
        });
    });

    describe("Tenant Data Export", () => {
        it("exports tenant JSON data without exposing plaintext secrets", async () => {
            const tenantId = new mongoose.Types.ObjectId();
            const mockTenant = {
                _id: tenantId,
                name: "Export Gym",
                slug: "export-gym",
                settings: { branding: {} },
            };

            vi.spyOn(Tenant, "findById").mockReturnValue({
                select: vi.fn().mockResolvedValue(mockTenant),
            });
            vi.spyOn(Member, "find").mockReturnValue({
                select: vi.fn().mockResolvedValue([{ name: "John Doe" }]),
            });
            vi.spyOn(User, "find").mockReturnValue({
                select: vi.fn().mockResolvedValue([{ name: "Staff 1", email: "staff@gym.com" }]),
            });
            vi.spyOn(Package, "find").mockResolvedValue([{ name: "Monthly Standard" }]);
            vi.spyOn(TenantNote, "find").mockResolvedValue([]);
            vi.spyOn(BillingEvent, "find").mockResolvedValue([]);
            vi.spyOn(AuditLog, "find").mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
            });

            const req = {
                params: { id: tenantId.toString() },
                platformUser: supportUser,
            };
            const res = {
                setHeader: vi.fn(),
                send: vi.fn(),
            };

            await exportTenantData(req, res);

            expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/json");
            expect(res.send).toHaveBeenCalled();
            const exportedJson = JSON.parse(res.send.mock.calls[0][0]);
            expect(exportedJson.tenant.slug).toBe("export-gym");
            expect(exportedJson.members).toHaveLength(1);
        });
    });
});
