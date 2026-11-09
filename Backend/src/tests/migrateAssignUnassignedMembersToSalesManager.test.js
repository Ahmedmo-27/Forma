import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import Tenant from "../models/Tenant.js";
import Member from "../models/Member.js";
import User from "../models/User.js";
const cacheInvalidator = require("../utils/cacheInvalidator");
import {
    migrateAssignUnassignedMembersToSalesManager,
    parseArgs,
} from "../scripts/migrateAssignUnassignedMembersToSalesManager.js";
import {
    assignOpenMembersToSalesManager,
    primarySalesManager,
} from "../utils/salesAssignment.js";

describe("migrateAssignUnassignedMembersToSalesManager", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe("CLI Argument Parsing", () => {
        it("correctly parses empty or default arguments", () => {
            const parsed = parseArgs([]);
            expect(parsed).toEqual({
                isDryRun: false,
                tenant: null,
                managerId: null,
                managerEmail: null,
                help: false,
            });
        });

        it("correctly parses flags and key-value options", () => {
            const argv = [
                "--dry-run",
                "--tenant=leap",
                "--managerId=6af20cc4c10cbd50fc69d969",
                "--managerEmail=sales.manager@gym.com",
            ];
            const parsed = parseArgs(argv);
            expect(parsed.isDryRun).toBe(true);
            expect(parsed.tenant).toBe("leap");
            expect(parsed.managerId).toBe("6af20cc4c10cbd50fc69d969");
            expect(parsed.managerEmail).toBe("sales.manager@gym.com");
            expect(parsed.help).toBe(false);
        });

        it("detects help flags -h and --help", () => {
            expect(parseArgs(["--help"]).help).toBe(true);
            expect(parseArgs(["-h"]).help).toBe(true);
        });
    });

    describe("assignOpenMembersToSalesManager utility", () => {
        it("returns NO_SALES_MANAGER when gym has no sales manager", async () => {
            vi.spyOn(User, "findOne").mockReturnValue({
                sort: () => ({ select: vi.fn().mockResolvedValue(null) }),
            });
            vi.spyOn(Member, "countDocuments").mockResolvedValue(15);
            const updateSpy = vi.spyOn(Member, "updateMany");

            const result = await assignOpenMembersToSalesManager();

            expect(result.reason).toBe("NO_SALES_MANAGER");
            expect(result.unassignedCount).toBe(15);
            expect(result.updated).toBe(0);
            expect(updateSpy).not.toHaveBeenCalled();
        });

        it("simulates updates in dry-run mode without mutating database", async () => {
            const mockManager = {
                _id: new mongoose.Types.ObjectId(),
                name: "Karim Sales Manager",
                email: "karim@gym.com",
                role: "Sales Manager",
            };
            vi.spyOn(User, "findOne").mockReturnValue({
                sort: () => ({ select: vi.fn().mockResolvedValue(mockManager) }),
            });
            vi.spyOn(Member, "countDocuments").mockResolvedValue(10);
            const updateSpy = vi.spyOn(Member, "updateMany");

            const result = await assignOpenMembersToSalesManager({ isDryRun: true });

            expect(result.isDryRun).toBe(true);
            expect(result.managerId).toEqual(mockManager._id);
            expect(result.unassignedCount).toBe(10);
            expect(result.updated).toBe(10);
            expect(updateSpy).not.toHaveBeenCalled();
        });

        it("executes updateMany and returns count in live mode", async () => {
            const mockManager = {
                _id: new mongoose.Types.ObjectId(),
                name: "Karim Sales Manager",
                email: "karim@gym.com",
                role: "Sales Manager",
            };
            vi.spyOn(User, "findOne").mockReturnValue({
                sort: () => ({ select: vi.fn().mockResolvedValue(mockManager) }),
            });
            vi.spyOn(Member, "countDocuments").mockResolvedValue(8);
            const updateSpy = vi.spyOn(Member, "updateMany").mockResolvedValue({ modifiedCount: 8 });

            const result = await assignOpenMembersToSalesManager({ isDryRun: false });

            expect(result.isDryRun).toBe(false);
            expect(result.managerId).toEqual(mockManager._id);
            expect(result.unassignedCount).toBe(8);
            expect(result.updated).toBe(8);
            expect(updateSpy).toHaveBeenCalledWith(
                { $or: [{ assignedSales: null }, { assignedSales: { $exists: false } }] },
                { $set: { assignedSales: mockManager._id } }
            );
        });

        it("allows specifying an explicit managerId override", async () => {
            const customId = new mongoose.Types.ObjectId();
            const mockManager = {
                _id: customId,
                name: "Custom Manager",
                email: "custom@gym.com",
                role: "Sales Manager",
            };
            vi.spyOn(User, "findById").mockReturnValue({
                select: vi.fn().mockResolvedValue(mockManager),
            });
            vi.spyOn(Member, "countDocuments").mockResolvedValue(3);
            const updateSpy = vi.spyOn(Member, "updateMany").mockResolvedValue({ modifiedCount: 3 });

            const result = await assignOpenMembersToSalesManager({
                managerId: customId.toString(),
            });

            expect(result.managerId).toEqual(customId);
            expect(result.updated).toBe(3);
            expect(updateSpy).toHaveBeenCalledWith(
                expect.any(Object),
                { $set: { assignedSales: customId } }
            );
        });
    });

    describe("migrateAssignUnassignedMembersToSalesManager execution", () => {
        const tenantAId = new mongoose.Types.ObjectId();
        const tenantBId = new mongoose.Types.ObjectId();

        const mockTenants = [
            { _id: tenantAId, slug: "leap", name: "Leap Gym" },
            { _id: tenantBId, slug: "iron", name: "Iron Gym" },
        ];

        it("migrates multi-tenants live, invalidates cache, and verifies clean state", async () => {
            const managerA = {
                _id: new mongoose.Types.ObjectId(),
                name: "Sales Manager Leap",
                email: "sm.leap@gym.com",
                role: "Sales Manager",
            };

            const managerB = {
                _id: new mongoose.Types.ObjectId(),
                name: "Sales Manager Iron",
                email: "sm.iron@gym.com",
                role: "Sales Manager",
            };

            vi.spyOn(Tenant, "find").mockReturnValue({
                select: () => ({
                    sort: () => ({
                        lean: vi.fn().mockResolvedValue(mockTenants),
                    }),
                }),
            });

            // Mock User.findOne for each tenant's manager
            vi.spyOn(User, "findOne").mockImplementation((query) => {
                return {
                    sort: () => ({
                        select: vi.fn().mockImplementation(async () => {
                            // First tenant gets managerA, second gets managerB
                            return managerA;
                        }),
                    }),
                };
            });

            // Mock Member countDocuments and updateMany
            vi.spyOn(Member, "countDocuments")
                // unassigned for tenant A = 5, tenant B = 3, verification checks return 0
                .mockResolvedValueOnce(5)
                .mockResolvedValueOnce(3)
                .mockResolvedValue(0);

            const updateSpy = vi.spyOn(Member, "updateMany").mockImplementation(async (filter, update) => {
                return { modifiedCount: 5 };
            });

            const cacheSpy = vi.spyOn(cacheInvalidator, "invalidateTenantCache").mockImplementation(() => {});

            const summary = await migrateAssignUnassignedMembersToSalesManager({ isDryRun: false });

            expect(summary.totalTenants).toBe(2);
            expect(summary.migratedTenants).toBe(2);
            expect(summary.totalAssigned).toBe(10);
            expect(summary.totalUnassignedRemaining).toBe(0);
            expect(cacheSpy).toHaveBeenCalledWith(tenantAId, "members");
            expect(cacheSpy).toHaveBeenCalledWith(tenantBId, "members");
        });

        it("simulates across tenants in dry-run mode without modifying records or invalidating cache", async () => {
            const manager = {
                _id: new mongoose.Types.ObjectId(),
                name: "Sales Manager DryRun",
                email: "sm@gym.com",
                role: "Sales Manager",
            };

            vi.spyOn(Tenant, "find").mockReturnValue({
                select: () => ({
                    sort: () => ({
                        lean: vi.fn().mockResolvedValue([mockTenants[0]]),
                    }),
                }),
            });

            vi.spyOn(User, "findOne").mockReturnValue({
                sort: () => ({ select: vi.fn().mockResolvedValue(manager) }),
            });

            vi.spyOn(Member, "countDocuments").mockResolvedValue(12);
            const updateSpy = vi.spyOn(Member, "updateMany");
            const cacheSpy = vi.spyOn(cacheInvalidator, "invalidateTenantCache");

            const summary = await migrateAssignUnassignedMembersToSalesManager({ isDryRun: true });

            expect(summary.migratedTenants).toBe(1);
            expect(summary.totalAssigned).toBe(12);
            expect(updateSpy).not.toHaveBeenCalled();
            expect(cacheSpy).not.toHaveBeenCalled();
        });

        it("gracefully skips tenants lacking a Sales Manager and reports warning", async () => {
            vi.spyOn(Tenant, "find").mockReturnValue({
                select: () => ({
                    sort: () => ({
                        lean: vi.fn().mockResolvedValue([mockTenants[0]]),
                    }),
                }),
            });

            // No sales manager found
            vi.spyOn(User, "findOne").mockReturnValue({
                sort: () => ({ select: vi.fn().mockResolvedValue(null) }),
            });

            vi.spyOn(Member, "countDocuments").mockResolvedValue(7);
            const updateSpy = vi.spyOn(Member, "updateMany");

            const summary = await migrateAssignUnassignedMembersToSalesManager({ isDryRun: false });

            expect(summary.migratedTenants).toBe(0);
            expect(summary.skippedTenants).toBe(1);
            expect(summary.totalAssigned).toBe(0);
            expect(summary.totalUnassignedRemaining).toBe(7);
            expect(updateSpy).not.toHaveBeenCalled();
        });

        it("scopes migration strictly to target tenant when --tenant is passed", async () => {
            vi.spyOn(Tenant, "findOne").mockReturnValue({
                select: () => ({
                    lean: vi.fn().mockResolvedValue(mockTenants[0]),
                }),
            });

            const manager = {
                _id: new mongoose.Types.ObjectId(),
                name: "Targeted Manager",
                email: "targeted@gym.com",
                role: "Sales Manager",
            };

            vi.spyOn(User, "findOne").mockReturnValue({
                sort: () => ({ select: vi.fn().mockResolvedValue(manager) }),
            });

            vi.spyOn(Member, "countDocuments").mockResolvedValueOnce(4).mockResolvedValue(0);
            vi.spyOn(Member, "updateMany").mockResolvedValue({ modifiedCount: 4 });

            const summary = await migrateAssignUnassignedMembersToSalesManager({
                tenant: "leap",
                isDryRun: false,
            });

            expect(summary.totalTenants).toBe(1);
            expect(summary.migratedTenants).toBe(1);
            expect(summary.totalAssigned).toBe(4);
            expect(summary.details[0].tenantSlug).toBe("leap");
        });

        it("throws an error if specified target tenant is not found", async () => {
            vi.spyOn(Tenant, "findOne").mockReturnValue({
                select: () => ({
                    lean: vi.fn().mockResolvedValue(null),
                }),
            });

            await expect(
                migrateAssignUnassignedMembersToSalesManager({ tenant: "nonexistent-gym" })
            ).rejects.toThrow('Target tenant "nonexistent-gym" could not be found.');
        });
    });
});
