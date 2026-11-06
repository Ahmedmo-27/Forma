import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import Tenant from "../models/Tenant";
import Member from "../models/Member";
import User from "../models/User";
import PlatformUser from "../models/PlatformUser";
import ManualPayment from "../models/ManualPayment";
import Announcement from "../models/Announcement";
import Coupon from "../models/Coupon";
import { getTenants } from "../controllers/platformTenantController";
import { getPlatformUsers } from "../controllers/platformUserController";
import { getPendingPayments } from "../controllers/platformBillingController";
import { getAnnouncements } from "../controllers/platformSupportController";
import { getCoupons } from "../controllers/platformPlanController";

describe("Platform APIs Server-Side Pagination", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        Member.collection = { countDocuments: vi.fn().mockResolvedValue(10) };
        User.collection = { countDocuments: vi.fn().mockResolvedValue(2) };
    });

    describe("GET /api/platform/tenants", () => {
        it("returns paginated tenants with correct metadata", async () => {
            const mockTenants = [
                {
                    _id: new mongoose.Types.ObjectId(),
                    name: "Apex Gym",
                    slug: "apex-gym",
                    status: "active",
                    billing: { cycle: "monthly" },
                    planId: { _id: new mongoose.Types.ObjectId(), key: "pro", name: "Pro", priceMonthly: 100 },
                    ownerUserId: { _id: new mongoose.Types.ObjectId(), name: "Coach Mike", email: "mike@apex.com" },
                    createdAt: new Date(),
                },
            ];

            const mockQuery = {
                populate: vi.fn().mockReturnThis(),
                sort: vi.fn().mockReturnThis(),
                skip: vi.fn().mockReturnThis(),
                limit: vi.fn().mockResolvedValue(mockTenants),
            };

            vi.spyOn(Tenant, "find").mockReturnValue(mockQuery);
            vi.spyOn(Tenant, "countDocuments").mockResolvedValue(25);

            const req = { query: { page: "2", limit: "10" } };
            const res = {
                json: vi.fn(),
                status: vi.fn().mockReturnThis(),
            };

            await getTenants(req, res);

            expect(mockQuery.skip).toHaveBeenCalledWith(10);
            expect(mockQuery.limit).toHaveBeenCalledWith(10);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    tenants: expect.any(Array),
                    pagination: expect.objectContaining({
                        page: 2,
                        limit: 10,
                        total: 25,
                        totalPages: 3,
                        hasNextPage: true,
                        hasPrevPage: true,
                    }),
                })
            );
        });
    });

    describe("GET /api/platform/users", () => {
        it("returns paginated users matching role and search filters", async () => {
            const mockUsers = [
                {
                    _id: new mongoose.Types.ObjectId(),
                    name: "Admin User",
                    email: "admin@platform.com",
                    role: "super_admin",
                    status: "active",
                },
            ];

            const mockQuery = {
                select: vi.fn().mockReturnThis(),
                sort: vi.fn().mockReturnThis(),
                skip: vi.fn().mockReturnThis(),
                limit: vi.fn().mockResolvedValue(mockUsers),
            };

            vi.spyOn(PlatformUser, "find").mockReturnValue(mockQuery);
            vi.spyOn(PlatformUser, "countDocuments").mockResolvedValue(1);

            const req = { query: { page: "1", limit: "20", role: "super_admin", search: "admin" } };
            const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };

            await getPlatformUsers(req, res);

            expect(mockQuery.skip).toHaveBeenCalledWith(0);
            expect(mockQuery.limit).toHaveBeenCalledWith(20);
            expect(res.json).toHaveBeenCalledWith({
                users: mockUsers,
                pagination: {
                    page: 1,
                    limit: 20,
                    total: 1,
                    totalPages: 1,
                    hasNextPage: false,
                    hasPrevPage: false,
                },
            });
        });
    });

    describe("GET /api/platform/billing/payments", () => {
        it("returns paginated pending payments", async () => {
            const mockPayments = [
                {
                    _id: new mongoose.Types.ObjectId(),
                    paymentRef: "PAY-1234",
                    amount: 500,
                    status: "pending",
                },
            ];

            const mockQuery = {
                populate: vi.fn().mockReturnThis(),
                sort: vi.fn().mockReturnThis(),
                skip: vi.fn().mockReturnThis(),
                limit: vi.fn().mockResolvedValue(mockPayments),
            };

            vi.spyOn(ManualPayment, "find").mockReturnValue(mockQuery);
            vi.spyOn(ManualPayment, "countDocuments").mockResolvedValue(42);

            const req = { query: { page: "3", limit: "15", status: "pending" } };
            const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };

            await getPendingPayments(req, res);

            expect(mockQuery.skip).toHaveBeenCalledWith(30);
            expect(mockQuery.limit).toHaveBeenCalledWith(15);
            expect(res.json).toHaveBeenCalledWith({
                payments: mockPayments,
                pagination: {
                    page: 3,
                    limit: 15,
                    total: 42,
                    totalPages: 3,
                    hasNextPage: false,
                    hasPrevPage: true,
                },
            });
        });
    });

    describe("GET /api/platform/announcements", () => {
        it("returns paginated announcements", async () => {
            const mockAnnouncements = [
                {
                    _id: new mongoose.Types.ObjectId(),
                    title: "Maintenance Scheduled",
                    message: "Downtime tonight",
                    type: "warning",
                    isActive: true,
                },
            ];

            const mockQuery = {
                sort: vi.fn().mockReturnThis(),
                skip: vi.fn().mockReturnThis(),
                limit: vi.fn().mockResolvedValue(mockAnnouncements),
            };

            vi.spyOn(Announcement, "find").mockReturnValue(mockQuery);
            vi.spyOn(Announcement, "countDocuments").mockResolvedValue(10);

            const req = { query: { page: "1", limit: "5", type: "warning" } };
            const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };

            await getAnnouncements(req, res);

            expect(mockQuery.skip).toHaveBeenCalledWith(0);
            expect(mockQuery.limit).toHaveBeenCalledWith(5);
            expect(res.json).toHaveBeenCalledWith({
                announcements: mockAnnouncements,
                pagination: {
                    page: 1,
                    limit: 5,
                    total: 10,
                    totalPages: 2,
                    hasNextPage: true,
                    hasPrevPage: false,
                },
            });
        });
    });

    describe("GET /api/platform/coupons", () => {
        it("returns paginated coupons", async () => {
            const mockCoupons = [
                {
                    _id: new mongoose.Types.ObjectId(),
                    code: "LAUNCH50",
                    discountValue: 50,
                    isActive: true,
                },
            ];

            const mockQuery = {
                sort: vi.fn().mockReturnThis(),
                skip: vi.fn().mockReturnThis(),
                limit: vi.fn().mockResolvedValue(mockCoupons),
            };

            vi.spyOn(Coupon, "find").mockReturnValue(mockQuery);
            vi.spyOn(Coupon, "countDocuments").mockResolvedValue(18);

            const req = { query: { page: "2", limit: "10" } };
            const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };

            await getCoupons(req, res);

            expect(mockQuery.skip).toHaveBeenCalledWith(10);
            expect(mockQuery.limit).toHaveBeenCalledWith(10);
            expect(res.json).toHaveBeenCalledWith({
                coupons: mockCoupons,
                pagination: {
                    page: 2,
                    limit: 10,
                    total: 18,
                    totalPages: 2,
                    hasNextPage: false,
                    hasPrevPage: true,
                },
            });
        });
    });
});
