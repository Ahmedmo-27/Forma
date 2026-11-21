import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import Tenant from "../models/Tenant";
import User from "../models/User";
import Location from "../models/Location";
import Member from "../models/Member";
import TenantUsage from "../models/TenantUsage";
import AuditLog from "../models/AuditLog";
import {
    listTenantLocations,
    createTenantLocation,
    deleteTenantLocation,
} from "../controllers/platformLocationController";
import {
    createTenantStaff,
    deleteTenantStaff,
    updateTenantStaff,
} from "../controllers/platformStaffAccessController";
const identityUniqueness = require("../utils/identityUniqueness");
const passwordUtils = require("../utils/passwordUtils");
const passwordSetup = require("../services/passwordSetupService");

vi.mock("../middleware/authContextCache", () => ({
    invalidateAuthContext: vi.fn(),
}));

vi.mock("../services/mailer", () => ({
    sendInvite: vi.fn(async () => undefined),
    sendPasswordReset: vi.fn(async () => undefined),
}));

const sequence = require("../utils/sequence");

describe("Platform locations and staff management", () => {
    const adminUser = {
        id: new mongoose.Types.ObjectId().toString(),
        email: "superadmin@forma.app",
        name: "Platform Super Admin",
        role: "super_admin",
    };

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

    function mockRes() {
        return { status: vi.fn().mockReturnThis(), json: vi.fn() };
    }

    function tenantDoc(overrides = {}) {
        return {
            _id: new mongoose.Types.ObjectId(),
            name: "Test Gym",
            slug: "test-gym",
            ownerUserId: null,
            planId: {
                features: ["members", "multi_branches"],
                limits: { maxMembers: 500, maxStaff: 5, maxBranches: 2 },
            },
            featureOverrides: {},
            limitOverrides: {},
            billing: {},
            roleAccess: {},
            ...overrides,
        };
    }

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(TenantUsage, "findOneAndUpdate").mockResolvedValue({});
        vi.spyOn(sequence, "nextSequence").mockResolvedValue(2);
    });

    describe("Platform locations", () => {
        it("lists locations with overQuota false when under limit", async () => {
            const tenant = tenantDoc();
            const loc = {
                _id: new mongoose.Types.ObjectId(),
                name: "Main",
                locationId: "LOC-001",
                branch_location: "",
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            vi.spyOn(Tenant, "findById").mockImplementation(() => queryResult(tenant));
            vi.spyOn(Location, "find").mockImplementation(() => queryResult([loc]));

            const res = mockRes();
            await listTenantLocations({ params: { id: tenant._id.toString() }, platformUser: adminUser }, res);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                overQuota: false,
                quotaWarning: null,
                quota: expect.objectContaining({ current: 1, max: 2, multiBranchesEnabled: true }),
                locations: expect.arrayContaining([
                    expect.objectContaining({ name: "Main", locationId: "LOC-001" }),
                ]),
            }));
        });

        it("creates a branch past maxBranches and returns overQuota warning", async () => {
            const tenant = tenantDoc({
                planId: {
                    features: ["members", "multi_branches"],
                    limits: { maxMembers: 500, maxStaff: 5, maxBranches: 1 },
                },
            });
            const created = {
                _id: new mongoose.Types.ObjectId(),
                name: "Nasr City",
                locationId: "LOC-002",
                branch_location: "https://maps.example/1",
            };

            vi.spyOn(Tenant, "findById").mockImplementation(() => queryResult(tenant));
            vi.spyOn(Location, "create").mockResolvedValue(created);
            vi.spyOn(Location, "countDocuments").mockResolvedValue(2);
            const audit = vi.spyOn(AuditLog, "create").mockResolvedValue({});

            const res = mockRes();
            await createTenantLocation({
                params: { id: tenant._id.toString() },
                body: { name: "Nasr City", branch_location: "https://maps.example/1" },
                platformUser: adminUser,
            }, res);

            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                message: "Location created",
                overQuota: true,
                quotaWarning: expect.stringContaining("over its allowed branch quota (2/1)"),
                quota: expect.objectContaining({ current: 2, max: 1 }),
                location: expect.objectContaining({ name: "Nasr City", locationId: "LOC-002" }),
            }));
            expect(audit).toHaveBeenCalledWith(expect.objectContaining({
                action: "platform_location_created",
                meta: expect.objectContaining({ overQuota: true }),
            }));
        });

        it("creates a second branch without multi_branches and still returns overQuota", async () => {
            const tenant = tenantDoc({
                planId: {
                    features: ["members"],
                    limits: { maxMembers: 500, maxStaff: 5, maxBranches: 1 },
                },
            });
            const created = {
                _id: new mongoose.Types.ObjectId(),
                name: "Branch 2",
                locationId: "LOC-002",
                branch_location: "",
            };

            vi.spyOn(Tenant, "findById").mockImplementation(() => queryResult(tenant));
            vi.spyOn(Location, "create").mockResolvedValue(created);
            vi.spyOn(Location, "countDocuments").mockResolvedValue(2);
            vi.spyOn(AuditLog, "create").mockResolvedValue({});

            const res = mockRes();
            await createTenantLocation({
                params: { id: tenant._id.toString() },
                body: { name: "Branch 2" },
                platformUser: adminUser,
            }, res);

            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                overQuota: true,
                quotaWarning: expect.stringMatching(/over its allowed branch quota/),
                quota: expect.objectContaining({ multiBranchesEnabled: false }),
            }));
        });

        it("refuses to delete the last location", async () => {
            const tenant = tenantDoc();
            const locId = new mongoose.Types.ObjectId();
            const location = {
                _id: locId,
                name: "Main",
                locationId: "LOC-001",
            };

            vi.spyOn(Tenant, "findById").mockImplementation(() => queryResult(tenant));
            vi.spyOn(Location, "findById").mockResolvedValue(location);
            vi.spyOn(Location, "countDocuments").mockResolvedValue(1);

            const res = mockRes();
            await deleteTenantLocation({
                params: { id: tenant._id.toString(), locationId: locId.toString() },
                platformUser: adminUser,
            }, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "LAST_LOCATION" }));
        });

        it("refuses to delete a location that still has members", async () => {
            const tenant = tenantDoc();
            const locId = new mongoose.Types.ObjectId();
            const location = {
                _id: locId,
                name: "Branch B",
                locationId: "LOC-002",
            };

            vi.spyOn(Tenant, "findById").mockImplementation(() => queryResult(tenant));
            vi.spyOn(Location, "findById").mockResolvedValue(location);
            vi.spyOn(Location, "countDocuments").mockResolvedValue(2);
            vi.spyOn(Member, "countDocuments").mockResolvedValue(3);

            const res = mockRes();
            await deleteTenantLocation({
                params: { id: tenant._id.toString(), locationId: locId.toString() },
                platformUser: adminUser,
            }, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                code: "LOCATION_HAS_MEMBERS",
                memberCount: 3,
            }));
        });
    });

    describe("Platform staff create / delete / location grants", () => {
        function staffDoc(overrides = {}) {
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
                allowedLocationIds: [],
                canAccessAllLocations: false,
                markModified: vi.fn(),
                save: vi.fn().mockResolvedValue(true),
                ...overrides,
            };
        }

        it("creates staff with password and returns overStaffQuota when over seats", async () => {
            const tenant = tenantDoc({
                planId: {
                    features: ["members"],
                    limits: { maxMembers: 500, maxStaff: 1, maxBranches: 1 },
                },
            });
            const created = staffDoc({
                name: "New Rep",
                email: "rep@gym.com",
                username: "newrep",
                role: "Sales",
                tenantId: tenant._id,
                canAccessAllLocations: true,
            });

            vi.spyOn(Tenant, "findById").mockImplementation(() => queryResult(tenant));
            vi.spyOn(identityUniqueness, "assertEmailAvailable").mockResolvedValue("rep@gym.com");
            vi.spyOn(identityUniqueness, "assertPhoneAvailable").mockResolvedValue("201000000001");
            vi.spyOn(passwordUtils, "normalizeEmail").mockReturnValue("rep@gym.com");
            vi.spyOn(passwordUtils, "hashPassword").mockResolvedValue("hashed");
            vi.spyOn(User, "create").mockResolvedValue(created);
            vi.spyOn(User, "findOne").mockImplementation(() => queryResult(null));
            User.collection = {
                countDocuments: vi.fn().mockResolvedValue(2),
            };
            const audit = vi.spyOn(AuditLog, "create").mockResolvedValue({});

            const res = mockRes();
            await createTenantStaff({
                params: { id: tenant._id.toString() },
                body: {
                    name: "New Rep",
                    email: "rep@gym.com",
                    mobile_number: "01000000001",
                    role: "Sales",
                    password: "Password1!",
                    canAccessAllLocations: true,
                },
                platformUser: adminUser,
            }, res);

            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                message: "Staff created",
                overStaffQuota: true,
                staffQuotaWarning: expect.stringContaining("over its allowed staff quota (2/1)"),
                user: expect.objectContaining({ email: "rep@gym.com", role: "Sales" }),
            }));
            expect(audit).toHaveBeenCalledWith(expect.objectContaining({
                action: "platform_staff_created",
            }));
        });

        it("updates staff branch grants", async () => {
            const tenant = tenantDoc();
            const locId = new mongoose.Types.ObjectId();
            const coach = staffDoc({
                name: "Coach",
                role: "Coach",
                tenantId: tenant._id,
                canAccessAllLocations: false,
                allowedLocationIds: [],
            });

            vi.spyOn(Tenant, "findById").mockImplementation(() => queryResult(tenant));
            vi.spyOn(User, "findOne").mockImplementation(() => queryResult(coach));
            vi.spyOn(Location, "find").mockImplementation(() => queryResult([{ _id: locId }]));
            const audit = vi.spyOn(AuditLog, "create").mockResolvedValue({});

            const res = mockRes();
            await updateTenantStaff({
                params: { id: tenant._id.toString(), userId: coach._id.toString() },
                body: {
                    canAccessAllLocations: false,
                    allowedLocationIds: [locId.toString()],
                },
                platformUser: adminUser,
            }, res);

            expect(coach.allowedLocationIds.map(String)).toEqual([String(locId)]);
            expect(coach.canAccessAllLocations).toBe(false);
            expect(coach.save).toHaveBeenCalled();
            expect(audit).toHaveBeenCalledWith(expect.objectContaining({
                action: "platform_staff_updated",
                meta: expect.objectContaining({
                    changes: expect.objectContaining({
                        locationAccess: expect.objectContaining({
                            canAccessAllLocations: false,
                        }),
                    }),
                }),
            }));
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                message: "Staff updated",
                user: expect.objectContaining({
                    allowedLocationIds: [String(locId)],
                    canAccessAllLocations: false,
                }),
            }));
        });

        it("deletes staff and refuses to delete the primary owner", async () => {
            const tenantId = new mongoose.Types.ObjectId();
            const owner = staffDoc({
                name: "Owner",
                email: "owner@gym.com",
                role: "Owner",
                tenantId,
            });
            const coach = staffDoc({
                name: "Coach",
                email: "coach@gym.com",
                role: "Coach",
                tenantId,
            });

            vi.spyOn(Tenant, "findById").mockImplementation(() => (
                queryResult({
                    _id: tenantId,
                    ownerUserId: owner._id,
                    slug: "test-gym",
                    planId: { features: [], limits: { maxStaff: 10 } },
                    featureOverrides: {},
                    limitOverrides: {},
                    billing: {},
                })
            ));
            vi.spyOn(User, "findOne").mockImplementation((query) => {
                if (String(query._id) === String(owner._id)) return queryResult(owner);
                if (String(query._id) === String(coach._id)) return queryResult(coach);
                return queryResult(null);
            });
            vi.spyOn(User, "deleteOne").mockResolvedValue({ deletedCount: 1 });
            vi.spyOn(passwordSetup, "revokeUnusedTokens").mockResolvedValue(undefined);
            User.collection = { countDocuments: vi.fn().mockResolvedValue(1) };
            vi.spyOn(AuditLog, "create").mockResolvedValue({});

            const ownerRes = mockRes();
            await deleteTenantStaff({
                params: { id: tenantId.toString(), userId: owner._id.toString() },
                platformUser: adminUser,
            }, ownerRes);
            expect(ownerRes.status).toHaveBeenCalledWith(400);
            expect(ownerRes.json).toHaveBeenCalledWith(expect.objectContaining({
                message: expect.stringContaining("primary owner"),
            }));
            expect(User.deleteOne).not.toHaveBeenCalled();

            const coachRes = mockRes();
            await deleteTenantStaff({
                params: { id: tenantId.toString(), userId: coach._id.toString() },
                platformUser: adminUser,
            }, coachRes);
            expect(User.deleteOne).toHaveBeenCalledWith({ _id: coach._id, tenantId });
            expect(coachRes.json).toHaveBeenCalledWith(expect.objectContaining({
                message: "Staff deleted",
            }));
        });
    });
});
