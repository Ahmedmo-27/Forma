import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import Tenant from "../models/Tenant";
import Plan from "../models/Plan";
import User from "../models/User";
import PlatformUser from "../models/PlatformUser";
import Member from "../models/Member";
import AuditLog from "../models/AuditLog";
import BillingEvent from "../models/BillingEvent";
import TenantNote from "../models/TenantNote";
import {
    onboardTenant,
    updateTenantLifecycle,
    updateTenantName,
    bulkTenantActions,
} from "../controllers/platformTenantController";
import {
    listTenantStaff,
    getTenantStaffAccess,
    updateTenantStaff,
    updateTenantStaffAccess,
} from "../controllers/platformStaffAccessController";
import mailer from "../services/mailer";
import PasswordSetupToken from "../models/PasswordSetupToken";
const identityUniqueness = require("../utils/identityUniqueness");
const passwordUtils = require("../utils/passwordUtils");

vi.mock("../middleware/authContextCache", () => ({
    invalidateAuthContext: vi.fn(),
}));
vi.mock("../services/passwordSetupService", () => ({
    revokeUnusedTokens: vi.fn(async () => undefined),
}));

describe("Phase 2: Platform Subscriber (Tenant) Management", () => {
    const adminUser = {
        id: new mongoose.Types.ObjectId().toString(),
        email: "superadmin@forma.app",
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
            vi.spyOn(PlatformUser, "findOne").mockResolvedValue(null);
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
                    tenantId: mockTenant._id,
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

        it("still returns 201 + invite when AuditLog.create fails (QA F01)", async () => {
            const mockPlan = {
                _id: new mongoose.Types.ObjectId(),
                key: "gold",
                name: "Gold Plan",
            };
            const mockTenant = {
                _id: new mongoose.Types.ObjectId(),
                name: "Audit Fail Gym",
                slug: "audit-fail-gym",
                status: "trial",
                billing: { cycle: "monthly" },
                save: vi.fn().mockResolvedValue(true),
            };
            const mockOwner = {
                _id: new mongoose.Types.ObjectId(),
                name: "Owner",
                email: "owner@auditfail.com",
            };

            vi.spyOn(Tenant, "findOne").mockResolvedValue(null);
            vi.spyOn(Plan, "findOne").mockResolvedValue(mockPlan);
            vi.spyOn(User, "findOne").mockResolvedValue(null);
            vi.spyOn(PlatformUser, "findOne").mockResolvedValue(null);
            vi.spyOn(Tenant, "create").mockResolvedValue(mockTenant);
            vi.spyOn(User, "create").mockResolvedValue(mockOwner);
            vi.spyOn(AuditLog, "create").mockRejectedValue(
                new Error("AuditLog validation failed: tenantId: Path `tenantId` is required.")
            );
            vi.spyOn(PasswordSetupToken, "updateMany").mockResolvedValue({});
            vi.spyOn(PasswordSetupToken, "create").mockResolvedValue({});
            vi.spyOn(mailer, "sendInvite").mockResolvedValue({ skipped: true });

            const req = {
                body: {
                    name: "Audit Fail Gym",
                    slug: "audit-fail-gym",
                    ownerName: "Owner",
                    ownerEmail: "owner@auditfail.com",
                    planKey: "gold",
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
                    invite: expect.objectContaining({
                        inviteToken: expect.any(String),
                        inviteUrl: expect.stringContaining("/auth/setup-password?token="),
                    }),
                })
            );
        });
    });

    describe("Rename Tenant", () => {
        it("updates gym name and writes an audit log", async () => {
            const tenantId = new mongoose.Types.ObjectId();
            const mockTenant = {
                _id: tenantId,
                name: "Old Gym Name",
                isSoftDeleted: false,
                save: vi.fn().mockResolvedValue(true),
            };

            vi.spyOn(Tenant, "findById").mockResolvedValue(mockTenant);
            vi.spyOn(AuditLog, "create").mockResolvedValue({});

            const req = {
                params: { id: tenantId.toString() },
                body: { name: "  New Gym Name  " },
                platformUser: adminUser,
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await updateTenantName(req, res);

            expect(mockTenant.name).toBe("New Gym Name");
            expect(mockTenant.save).toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: "Gym name updated",
                    tenant: expect.objectContaining({ name: "New Gym Name" }),
                })
            );
            expect(AuditLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    tenantId,
                    action: "tenant_status_updated",
                    meta: expect.objectContaining({
                        action: "tenant_name_updated",
                        from: "Old Gym Name",
                        to: "New Gym Name",
                    }),
                })
            );
        });

        it("rejects empty gym names", async () => {
            const req = {
                params: { id: new mongoose.Types.ObjectId().toString() },
                body: { name: "   " },
                platformUser: adminUser,
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await updateTenantName(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: "Gym name is required" })
            );
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

        it("updates featureVisibility.showOutOfPlan for out-of-plan previews", async () => {
            const tenantId = new mongoose.Types.ObjectId();
            const mockTenant = {
                _id: tenantId,
                name: "Preview Gym",
                slug: "preview-gym",
                status: "active",
                billing: { cycle: "monthly" },
                featureVisibility: { showOutOfPlan: [] },
                markModified: vi.fn(),
                save: vi.fn().mockResolvedValue(true),
            };

            vi.spyOn(Tenant, "findById").mockReturnValue({
                populate: vi.fn().mockResolvedValue(mockTenant),
            });
            vi.spyOn(AuditLog, "create").mockResolvedValue({});

            const req = {
                params: { id: tenantId.toString() },
                body: {
                    action: "change_feature_visibility",
                    reason: "Show reports preview in gym nav",
                    featureVisibility: { showOutOfPlan: ["reports_basic", "accounting"] },
                },
                platformUser: adminUser,
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await updateTenantLifecycle(req, res);

            expect(mockTenant.featureVisibility.showOutOfPlan).toEqual(["reports_basic", "accounting"]);
            expect(mockTenant.markModified).toHaveBeenCalledWith("featureVisibility");
            expect(mockTenant.save).toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    tenant: expect.objectContaining({
                        featureVisibility: { showOutOfPlan: ["reports_basic", "accounting"] },
                    }),
                })
            );
        });

        it("rejects unknown feature keys in featureVisibility", async () => {
            const tenantId = new mongoose.Types.ObjectId();
            const mockTenant = {
                _id: tenantId,
                name: "Preview Gym",
                slug: "preview-gym",
                status: "active",
                billing: { cycle: "monthly" },
                featureVisibility: { showOutOfPlan: [] },
                markModified: vi.fn(),
                save: vi.fn().mockResolvedValue(true),
            };

            vi.spyOn(Tenant, "findById").mockReturnValue({
                populate: vi.fn().mockResolvedValue(mockTenant),
            });

            const req = {
                params: { id: tenantId.toString() },
                body: {
                    action: "change_feature_visibility",
                    reason: "Bad key",
                    featureVisibility: { showOutOfPlan: ["not_a_real_feature"] },
                },
                platformUser: adminUser,
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await updateTenantLifecycle(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ code: "INVALID_FEATURE" })
            );
            expect(mockTenant.save).not.toHaveBeenCalled();
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

    describe("Platform staff access for one gym", () => {
        function queryResult(value) {
            const promise = Promise.resolve(value);
            const query = {
                select() { return query; },
                populate() { return query; },
                sort() { return query; },
                lean() { return promise; },
                then: promise.then.bind(promise),
                catch: promise.catch.bind(promise),
                finally: promise.finally.bind(promise),
            };
            return query;
        }

        function staffQueryId(query) {
            if (query?._id) return String(query._id);
            if (Array.isArray(query?.$and)) {
                const part = query.$and.find((entry) => entry?._id);
                if (part?._id) return String(part._id);
            }
            return null;
        }

        function staffQueryTenantId(query) {
            const scope = query?.$or
                || (Array.isArray(query?.$and) ? query.$and.find((entry) => entry?.$or)?.$or : null);
            if (!Array.isArray(scope)) return null;
            const direct = scope.find((entry) => entry?.tenantId)?.tenantId;
            return direct != null ? String(direct) : null;
        }

        function matchesStaffScope(user, query) {
            const tid = staffQueryTenantId(query);
            if (!tid) return false;
            if (String(user.tenantId) === tid) return true;
            return (user.memberships || []).some(
                (m) => String(m.tenantId) === tid && m.status === "active"
            );
        }

        function mockRes() {
            return { status: vi.fn().mockReturnThis(), json: vi.fn() };
        }

        function staffDoc(overrides) {
            return {
                _id: new mongoose.Types.ObjectId(),
                name: "Staff",
                email: "staff@gym.com",
                username: "staffuser",
                mobile_number: "01000000000",
                role: "Sales",
                abilities: {},
                featureAccess: { grants: [], revokes: [] },
                accessOverrides: { add: [], remove: [] },
                markModified: vi.fn(),
                save: vi.fn().mockResolvedValue(true),
                ...overrides,
            };
        }

        it("lists every role in this gym, including the owner, and skips other gyms", async () => {
            const tenantId = new mongoose.Types.ObjectId();
            const otherTenantId = new mongoose.Types.ObjectId();
            const owner = staffDoc({
                name: "Gym Owner",
                email: "owner@gym.com",
                username: "gymowner",
                role: "Owner",
                tenantId,
            });
            const coach = staffDoc({
                name: "Gym Coach",
                email: "coach@gym.com",
                username: "gymcoach",
                role: "Coach",
                tenantId,
            });
            const stranger = staffDoc({
                name: "Other Gym",
                email: "other@gym.com",
                role: "Sales",
                tenantId: otherTenantId,
            });

            vi.spyOn(Tenant, "findById").mockImplementation((id) => (
                queryResult(String(id) === String(tenantId)
                    ? { _id: tenantId, ownerUserId: owner._id }
                    : null)
            ));
            vi.spyOn(User, "find").mockImplementation((query) => queryResult(
                [owner, coach, stranger].filter((user) => matchesStaffScope(user, query))
            ));

            const res = mockRes();
            await listTenantStaff({ params: { id: tenantId.toString() }, platformUser: adminUser }, res);

            const payload = res.json.mock.calls[0][0];
            const ids = payload.users.map((user) => String(user._id));
            expect(ids).toEqual(expect.arrayContaining([String(owner._id), String(coach._id)]));
            expect(ids).not.toContain(String(stranger._id));
            expect(payload.users.find((user) => String(user._id) === String(owner._id)).isPrimaryOwner).toBe(true);
            expect(payload.users.find((user) => String(user._id) === String(coach._id)).role).toBe("Coach");
            expect(payload.users.find((user) => String(user._id) === String(coach._id)).username).toBe("gymcoach");
            expect(res.status).not.toHaveBeenCalled();
        });

        it("updates staff profile fields and writes a platform audit action", async () => {
            const tenantId = new mongoose.Types.ObjectId();
            const coach = staffDoc({
                name: "Gym Coach",
                email: "coach@gym.com",
                username: "gymcoach",
                mobile_number: "01000000001",
                role: "Coach",
                tenantId,
            });

            vi.spyOn(Tenant, "findById").mockImplementation(() => (
                queryResult({ _id: tenantId, ownerUserId: null })
            ));
            vi.spyOn(User, "findOne").mockImplementation((query) => {
                if (staffQueryId(query) === String(coach._id)) return queryResult(coach);
                return queryResult(null);
            });
            vi.spyOn(PlatformUser, "findOne").mockImplementation(() => queryResult(null));
            vi.spyOn(Member, "findOne").mockImplementation(() => queryResult(null));
            vi.spyOn(identityUniqueness, "assertEmailAvailable").mockResolvedValue("coach.new@gym.com");
            vi.spyOn(identityUniqueness, "assertUsernameAvailable").mockResolvedValue("newcoach");
            vi.spyOn(identityUniqueness, "assertPhoneAvailable").mockResolvedValue("201000000099");
            vi.spyOn(passwordUtils, "normalizeEmail").mockReturnValue("coach.new@gym.com");
            const audit = vi.spyOn(AuditLog, "create").mockResolvedValue({});

            const res = mockRes();
            await updateTenantStaff({
                params: { id: tenantId.toString(), userId: coach._id.toString() },
                body: {
                    name: "Updated Coach",
                    email: "coach.new@gym.com",
                    username: "newcoach",
                    mobile_number: "01000000099",
                    role: "Head Coach",
                },
                platformUser: adminUser,
            }, res);

            expect(coach.name).toBe("Updated Coach");
            expect(coach.email).toBe("coach.new@gym.com");
            expect(coach.username).toBe("newcoach");
            expect(coach.mobile_number).toBe("01000000099");
            expect(coach.role).toBe("Head Coach");
            expect(coach.save).toHaveBeenCalled();
            expect(audit).toHaveBeenCalledWith(expect.objectContaining({
                action: "platform_staff_updated",
                targetId: String(coach._id),
            }));
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                message: "Staff updated",
                user: expect.objectContaining({
                    name: "Updated Coach",
                    username: "newcoach",
                    role: "Head Coach",
                }),
            }));
        });

        it("blocks demoting the primary owner", async () => {
            const tenantId = new mongoose.Types.ObjectId();
            const owner = staffDoc({
                name: "Gym Owner",
                email: "owner@gym.com",
                username: "gymowner",
                role: "Owner",
                tenantId,
            });

            vi.spyOn(Tenant, "findById").mockImplementation(() => (
                queryResult({ _id: tenantId, ownerUserId: owner._id })
            ));
            vi.spyOn(User, "findOne").mockImplementation(() => queryResult(owner));

            const res = mockRes();
            await updateTenantStaff({
                params: { id: tenantId.toString(), userId: owner._id.toString() },
                body: { role: "Sales" },
                platformUser: adminUser,
            }, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                message: expect.stringContaining("primary owner"),
            }));
            expect(owner.save).not.toHaveBeenCalled();
        });

        it("saves an owner feature revoke and writes the platform audit action", async () => {
            const tenantId = new mongoose.Types.ObjectId();
            const owner = staffDoc({
                name: "Gym Owner",
                email: "owner@gym.com",
                role: "Owner",
                tenantId,
            });

            vi.spyOn(Tenant, "findById").mockImplementation(() => (
                queryResult({ _id: tenantId, ownerUserId: owner._id })
            ));
            vi.spyOn(User, "findOne").mockImplementation((query) => queryResult(
                staffQueryId(query) === String(owner._id) ? owner : null
            ));
            const audit = vi.spyOn(AuditLog, "create").mockResolvedValue({});

            const res = mockRes();
            await updateTenantStaffAccess({
                params: { id: tenantId.toString(), userId: owner._id.toString() },
                body: { features: [] },
                platformUser: adminUser,
            }, res);

            expect(owner.featureAccess.revokes).toEqual(expect.arrayContaining(["owner_dashboard", "settings"]));
            expect(owner.save).toHaveBeenCalled();
            expect(audit).toHaveBeenCalledWith(expect.objectContaining({
                tenantId,
                action: "platform_staff_access_updated",
                actor: adminUser.id,
                actorRole: "PlatformUser",
                targetType: "user",
                targetId: String(owner._id),
                meta: expect.objectContaining({
                    role: "Owner",
                    actorEmail: adminUser.email,
                    revokes: expect.arrayContaining(["owner_dashboard", "settings"]),
                }),
            }));
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Access updated" }));
        });

        it("greys out areas the gym's plan has switched off", async () => {
            const tenantId = new mongoose.Types.ObjectId();
            const receptionist = staffDoc({ role: "Receptionist", tenantId });

            const accessFor = async (planFeatures) => {
                vi.spyOn(Tenant, "findById").mockImplementation(() => (
                    queryResult({ _id: tenantId, ownerUserId: null, planId: { features: planFeatures }, billing: {}, featureOverrides: {}, roleAccess: { Receptionist: ["retail"] } })
                ));
                vi.spyOn(User, "findOne").mockImplementation(() => queryResult(receptionist));
                const res = mockRes();
                await getTenantStaffAccess({
                    params: { id: tenantId.toString(), userId: receptionist._id.toString() },
                    platformUser: adminUser,
                }, res);
                const features = res.json.mock.calls[0][0].groups.flatMap((group) => group.features);
                return features.find((feature) => feature.key === "retail_pos");
            };

            expect((await accessFor(["members", "retail"])).enabled).toBe(true);
            expect((await accessFor(["members"])).enabled).toBe(false);
        });

        it("returns 404 when the user is not in this gym", async () => {
            const tenantId = new mongoose.Types.ObjectId();
            const otherUserId = new mongoose.Types.ObjectId();

            vi.spyOn(Tenant, "findById").mockImplementation(() => (
                queryResult({ _id: tenantId, ownerUserId: null })
            ));
            vi.spyOn(User, "findOne").mockImplementation(() => queryResult(null));

            const res = mockRes();
            await getTenantStaffAccess({
                params: { id: tenantId.toString(), userId: otherUserId.toString() },
                platformUser: adminUser,
            }, res);

            expect(User.findOne).toHaveBeenCalledWith({
                $and: [
                    { _id: otherUserId.toString() },
                    {
                        $or: [
                            { tenantId },
                            {
                                memberships: {
                                    $elemMatch: {
                                        tenantId,
                                        status: "active",
                                    },
                                },
                            },
                        ],
                    },
                ],
            });
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ message: "User not found" });
        });

        it("rejects an exclusive feature granted to a role that does not have it by default", async () => {
            const tenantId = new mongoose.Types.ObjectId();
            const sales = staffDoc({ role: "Sales", tenantId });

            vi.spyOn(Tenant, "findById").mockImplementation(() => (
                queryResult({ _id: tenantId, ownerUserId: null })
            ));
            vi.spyOn(User, "findOne").mockImplementation(() => queryResult(sales));

            const res = mockRes();
            await updateTenantStaffAccess({
                params: { id: tenantId.toString(), userId: sales._id.toString() },
                body: { features: ["settings"] },
                platformUser: adminUser,
            }, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining("limited to its default role") })
            );
            expect(sales.save).not.toHaveBeenCalled();
        });
    });
});
