import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import Member from "../models/Member.js";
import User from "../models/User.js";
import PackageExceptionRequest from "../models/PackageExceptionRequest.js";
import { refund, cancelPackage, refundPT_Sessions } from "../controllers/memberController.js";
import AuditLog from "../models/AuditLog.js";
import { updateExceptionStatus } from "../controllers/packageExceptionController.js";
import { loginUser, getTeamsPage } from "../controllers/userController.js";
import bcrypt from "bcryptjs";

describe("Tenant-Side Audit Fixes", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(AuditLog, "create").mockResolvedValue({});
        process.env.JWT_SECRET = "test-secret-key-12345";
    });

    describe("memberController.refund", () => {
        it("rejects over-refund when refund_amount exceeds max refundable", async () => {
            const memberId = new mongoose.Types.ObjectId().toString();
            const mockMember = {
                _id: memberId,
                status: "active",
                isMember: true,
                subscriptions: [
                    {
                        pricePaid: 1000,
                        refundAmount: 800,
                    },
                ],
                save: vi.fn().mockResolvedValue(true),
            };

            vi.spyOn(Member, "findById").mockResolvedValue(mockMember);

            const req = {
                body: { memberID: memberId, refund_amount: 300 },
                user: { id: "user123" },
                tenant: { settings: { locale: { currency: "USD" } } },
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await refund(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining("Max refundable: 200 USD"),
                })
            );
            expect(mockMember.save).not.toHaveBeenCalled();
        });

        it("revokes to guest ONLY if member is refunding their first ever package completely", async () => {
            const memberId = new mongoose.Types.ObjectId().toString();
            const mockMember = {
                _id: memberId,
                status: "active",
                isMember: true,
                subscriptions: [
                    {
                        pricePaid: 1000,
                        refundAmount: 0,
                        subscriptionStatus: "active",
                    },
                ],
                userlog: [],
                save: vi.fn().mockResolvedValue(true),
            };

            vi.spyOn(Member, "findById").mockResolvedValue(mockMember);

            const req = {
                body: { memberID: memberId, refund_amount: 1000, reason: "Dissatisfied" },
                user: { id: "user123" },
                tenant: { settings: { locale: { currency: "EGP" } } },
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await refund(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(mockMember.status).toBe("guest");
            expect(mockMember.isMember).toBe(false);
            expect(mockMember.subscriptions[0].refundAmount).toBe(1000);
            expect(mockMember.save).toHaveBeenCalled();
        });

        it("does NOT revoke to guest if member had prior subscriptions", async () => {
            const memberId = new mongoose.Types.ObjectId().toString();
            const mockMember = {
                _id: memberId,
                status: "active",
                isMember: true,
                subscriptions: [
                    { pricePaid: 1000, refundAmount: 0, subscriptionStatus: "active" },
                    { pricePaid: 1500, refundAmount: 0, subscriptionStatus: "active" },
                ],
                userlog: [],
                save: vi.fn().mockResolvedValue(true),
            };

            vi.spyOn(Member, "findById").mockResolvedValue(mockMember);

            const req = {
                body: { memberID: memberId, refund_amount: 1500 },
                user: { id: "user123" },
                tenant: { settings: { locale: { currency: "EGP" } } },
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await refund(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(mockMember.status).toBe("expired");
            expect(mockMember.isMember).toBe(true);
            expect(mockMember.subscriptions[1].refundAmount).toBe(1500);
            expect(mockMember.subscriptions[1].cancelled).toBe(true);
            expect(mockMember.subscriptions[1].subscriptionStatus).toBe("cancelled");
            expect(mockMember.save).toHaveBeenCalled();
        });

        it("rejects a non-numeric refund amount", async () => {
            const findById = vi.spyOn(Member, "findById");
            const req = {
                body: { memberID: new mongoose.Types.ObjectId().toString(), refund_amount: "abc" },
                user: { id: "user123" },
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await refund(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: "Please enter a valid refund amount" });
            expect(findById).not.toHaveBeenCalled();
        });

        it("keeps the member active when an earlier package still covers today", async () => {
            const memberId = new mongoose.Types.ObjectId().toString();
            const now = Date.now();
            const previousEnd = new Date(now + 20 * 86400000);
            const freeze = { endDate: new Date(now + 5 * 86400000), endedBy: null };
            const previous = {
                pricePaid: 1000,
                refundAmount: 0,
                startDate: new Date(now - 10 * 86400000),
                endDate: previousEnd,
                packageSnapshot: { name: "Basic" },
            };
            const upgrade = {
                pricePaid: 1500,
                refundAmount: 0,
                startDate: new Date(now - 86400000),
                endDate: new Date(now + 40 * 86400000),
                isUpgrade: true,
                packageSnapshot: { name: "Gold", free_pt_sessions: 2 },
            };
            const mockMember = {
                _id: memberId,
                status: "active",
                isMember: true,
                subscriptions: [previous, upgrade],
                freeze: [freeze],
                PT_sessions: 6,
                userlog: [],
                save: vi.fn().mockResolvedValue(true),
            };

            vi.spyOn(Member, "findById").mockResolvedValue(mockMember);

            const req = {
                body: { memberID: memberId, refund_amount: 200, reason: "Upgrade reversed" },
                user: { id: "user123", role: "Owner" },
                tenant: { settings: { locale: { currency: "EGP" } } },
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await refund(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(mockMember.status).toBe("active");
            expect(mockMember.isMember).toBe(true);
            expect(previous.endDate).toBe(previousEnd);
            expect(previous.refundAmount).toBe(0);
            expect(upgrade.refunded).toBe(true);
            expect(upgrade.cancelled).toBe(true);
            expect(upgrade.subscriptionStatus).toBe("cancelled");
            expect(mockMember.PT_sessions).toBe(4);
            expect(freeze.endedBy).toBeNull();
            expect(mockMember.userlog[0].text).toContain("200 EGP");
            expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
                action: "package_refunded",
                meta: expect.objectContaining({ refundAmount: 200, packageName: "Gold" }),
            }));
        });

        it("subtracts free PT sessions only on the first refund of the only package", async () => {
            const memberId = new mongoose.Types.ObjectId().toString();
            const mockMember = {
                _id: memberId,
                status: "active",
                isMember: true,
                subscriptions: [{
                    pricePaid: 1000,
                    refundAmount: 0,
                    packageSnapshot: { name: "Solo", free_pt_sessions: 4 },
                    startDate: new Date(Date.now() - 86400000),
                    endDate: new Date(Date.now() + 20 * 86400000),
                }],
                PT_sessions: 10,
                userlog: [],
                save: vi.fn().mockResolvedValue(true),
            };

            vi.spyOn(Member, "findById").mockResolvedValue(mockMember);

            const req = {
                body: { memberID: memberId, refund_amount: 200 },
                user: { id: "user123", role: "Accountant" },
                tenant: { settings: { locale: { currency: "EGP" } } },
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await refund(req, res);
            req.body.refund_amount = 100;
            await refund(req, res);

            expect(mockMember.status).toBe("guest");
            expect(mockMember.isMember).toBe(false);
            expect(mockMember.PT_sessions).toBe(6);
            expect(mockMember.subscriptions[0].refundAmount).toBe(300);
            expect(mockMember.userlog).toHaveLength(2);
            expect(mockMember.userlog[1].text).toContain("100 EGP");
        });

        it("rejects a refund after the package was cancelled without one", async () => {
            const memberId = new mongoose.Types.ObjectId().toString();
            const mockMember = {
                _id: memberId,
                status: "expired",
                subscriptions: [{
                    pricePaid: 1000,
                    refundAmount: 0,
                    refunded: false,
                    cancelled: true,
                    subscriptionStatus: "cancelled",
                    cancelReason: "Misconduct at the gym",
                }],
                save: vi.fn().mockResolvedValue(true),
            };

            vi.spyOn(Member, "findById").mockResolvedValue(mockMember);

            const req = {
                body: { memberID: memberId, refund_amount: 1000 },
                user: { id: "user123", role: "Owner" },
                tenant: { settings: { locale: { currency: "EGP" } } },
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await refund(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "This package was cancelled and the member is not entitled to a refund",
            });
            expect(mockMember.subscriptions[0].refundAmount).toBe(0);
            expect(mockMember.save).not.toHaveBeenCalled();
        });
    });

    describe("memberController.cancelPackage", () => {
        it("requires a reason", async () => {
            const req = {
                body: { memberID: new mongoose.Types.ObjectId().toString(), reason: "   " },
                user: { id: "user123", role: "Owner" },
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await cancelPackage(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: "A cancellation reason is required" });
        });

        it("cancels the open package, keeps the sale, and ends access", async () => {
            const memberId = new mongoose.Types.ObjectId().toString();
            const endDate = new Date(Date.now() + 20 * 86400000);
            const freeze = { endDate: new Date(Date.now() + 5 * 86400000), endedBy: null };
            const subscription = {
                pricePaid: 1000,
                refundAmount: 0,
                refunded: false,
                startDate: new Date(Date.now() - 86400000),
                endDate,
                packageSnapshot: { name: "Gold", free_pt_sessions: 3 },
            };
            const mockMember = {
                _id: memberId,
                status: "active",
                isMember: true,
                subscriptions: [subscription],
                freeze: [freeze],
                PT_sessions: 8,
                userlog: [],
                save: vi.fn().mockResolvedValue(true),
            };

            vi.spyOn(Member, "findById").mockResolvedValue(mockMember);

            const req = {
                params: { memberId },
                body: { reason: "Repeated misconduct at the gym" },
                user: { id: "user123", role: "Owner" },
                tenant: { settings: { locale: { currency: "EGP" } } },
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await cancelPackage(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(subscription.pricePaid).toBe(1000);
            expect(subscription.refundAmount).toBe(0);
            expect(subscription.refunded).toBe(false);
            expect(subscription.cancelled).toBe(true);
            expect(subscription.subscriptionStatus).toBe("cancelled");
            expect(subscription.cancelReason).toBe("Repeated misconduct at the gym");
            expect(subscription.cancelledBy).toBe("user123");
            expect(new Date(subscription.endDate).getTime()).toBeLessThanOrEqual(Date.now());
            expect(mockMember.status).toBe("guest");
            expect(mockMember.isMember).toBe(false);
            expect(mockMember.PT_sessions).toBe(5);
            expect(freeze.endedBy).toBe("user123");
            expect(mockMember.userlog[0].text).toContain("without refund");
            expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
                action: "package_cancelled",
                meta: expect.objectContaining({
                    packageName: "Gold",
                    reason: "Repeated misconduct at the gym",
                    refundAmount: 0,
                    pricePaid: 1000,
                }),
            }));
        });

        it("leaves an earlier covering package active", async () => {
            const memberId = new mongoose.Types.ObjectId().toString();
            const previousEnd = new Date(Date.now() + 20 * 86400000);
            const previous = {
                pricePaid: 800,
                refundAmount: 0,
                startDate: new Date(Date.now() - 10 * 86400000),
                endDate: previousEnd,
                packageSnapshot: { name: "Basic" },
            };
            const current = {
                pricePaid: 1500,
                refundAmount: 0,
                startDate: new Date(Date.now() - 86400000),
                endDate: new Date(Date.now() + 40 * 86400000),
                packageSnapshot: { name: "Gold" },
            };
            const mockMember = {
                _id: memberId,
                status: "active",
                isMember: true,
                subscriptions: [previous, current],
                freeze: [],
                PT_sessions: 0,
                userlog: [],
                save: vi.fn().mockResolvedValue(true),
            };

            vi.spyOn(Member, "findById").mockResolvedValue(mockMember);

            const req = {
                params: { memberId },
                body: { reason: "Caused problems at the gym" },
                user: { id: "user123", role: "Accountant" },
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await cancelPackage(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(mockMember.status).toBe("active");
            expect(previous.cancelled).toBeUndefined();
            expect(previous.endDate).toBe(previousEnd);
            expect(current.subscriptionStatus).toBe("cancelled");
            expect(current.pricePaid).toBe(1500);
            expect(current.refundAmount).toBe(0);
        });
    });

    describe("memberController.refundPT_Sessions", () => {
        it("removes pack sessions once and logs each refund", async () => {
            const memberId = new mongoose.Types.ObjectId().toString();
            const mockMember = {
                _id: memberId,
                pt_subscriptions: [{
                    pricePaid: 500,
                    sessions: 8,
                    refundAmount: 0,
                    endDate: new Date(Date.now() + 20 * 86400000),
                }],
                PT_sessions: 12,
                used_PT_sessions: 3,
                userlog: [],
                save: vi.fn().mockResolvedValue(true),
            };

            vi.spyOn(Member, "findById").mockResolvedValue(mockMember);

            const req = {
                body: { memberID: memberId, refund_amount: 100, reason: "Unused sessions" },
                user: { id: "user123", role: "Owner" },
                tenant: { settings: { locale: { currency: "EGP" } } },
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await refundPT_Sessions(req, res);
            req.body.refund_amount = 50;
            await refundPT_Sessions(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(mockMember.PT_sessions).toBe(4);
            expect(mockMember.pt_subscriptions[0].refundAmount).toBe(150);
            expect(mockMember.pt_subscriptions[0].refunded).toBe(true);
            expect(mockMember.userlog).toHaveLength(2);
            expect(mockMember.userlog[0].text).toContain("100 EGP");
            expect(mockMember.userlog[0].text).toContain("Unused sessions");
            expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
                action: "pt_refunded",
                meta: expect.objectContaining({ refundAmount: 100 }),
            }));
        });
    });

    describe("packageExceptionController 4-eyes approval", () => {
        it("blocks a non-owner proposer from self-approving their own proposed exception", async () => {
            const proposerId = new mongoose.Types.ObjectId().toString();
            const requestId = new mongoose.Types.ObjectId().toString();

            const mockRequest = {
                _id: requestId,
                status: "pending",
                proposedBy: proposerId,
            };

            vi.spyOn(PackageExceptionRequest, "findById").mockResolvedValue(mockRequest);

            const req = {
                params: { id: requestId },
                body: { status: "accepted" },
                user: { id: proposerId, role: "Accountant" },
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await updateExceptionStatus(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                message: "You cannot approve a package exception you proposed",
            });
        });

        it("allows an Owner to approve even if they proposed the exception", async () => {
            const ownerId = new mongoose.Types.ObjectId().toString();
            const requestId = new mongoose.Types.ObjectId().toString();

            const mockRequest = {
                _id: requestId,
                status: "pending",
                proposedBy: ownerId,
            };

            vi.spyOn(PackageExceptionRequest, "findById").mockResolvedValue(mockRequest);
            // findOneAndUpdate will be called during atomic approval
            vi.spyOn(PackageExceptionRequest, "findOneAndUpdate").mockResolvedValue(null);

            const req = {
                params: { id: requestId },
                body: { status: "accepted" },
                user: { id: ownerId, role: "Owner" },
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await updateExceptionStatus(req, res);

            // It passes the 4-eyes check and proceeds to findOneAndUpdate
            expect(res.status).not.toHaveBeenCalledWith(403);
        });
    });

    describe("userController.loginUser tenant isolation", () => {
        it("rejects login with 401 AUTH_NO_TENANT when user has no tenantId", async () => {
            const passwordHash = bcrypt.hashSync("Password123!", 12);
            const mockUser = {
                _id: new mongoose.Types.ObjectId(),
                email: "orphan@example.com",
                username: "orphan",
                password: passwordHash,
                status: "active",
                role: "Sales",
                tenantId: null, // no gym assigned
            };

            vi.spyOn(User, "find").mockResolvedValue([mockUser]);

            const req = {
                body: { email: "orphan@example.com", password: "Password123!" },
                id: "req1",
                ip: "127.0.0.1",
                get: vi.fn().mockReturnValue(""),
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await loginUser(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                code: "AUTH_NO_TENANT",
                message: "This account is not associated with an active gym.",
            });
        });
    });

    describe("userController.getTeamsPage role alignment", () => {
        it("allows General Manager to view teams page and categorizes team members", async () => {
            const mockUsers = [
                { _id: new mongoose.Types.ObjectId(), name: "Alice GM", role: "General Manager" },
                { _id: new mongoose.Types.ObjectId(), name: "Bob Coach", role: "Coach" },
                { _id: new mongoose.Types.ObjectId(), name: "Charlie Sales", role: "Sales" },
            ];

            vi.spyOn(User, "find").mockReturnValue({
                select: vi.fn().mockReturnValue({
                    sort: vi.fn().mockReturnValue({
                        lean: vi.fn().mockResolvedValue(mockUsers),
                    }),
                }),
            });

            const req = {
                user: { id: "gm1", role: "General Manager" },
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await getTeamsPage(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    managers: expect.arrayContaining([
                        expect.objectContaining({ name: "Alice GM", role: "General Manager" }),
                    ]),
                    coach: expect.arrayContaining([
                        expect.objectContaining({ name: "Bob Coach", role: "Coach" }),
                    ]),
                    sales: expect.arrayContaining([
                        expect.objectContaining({ name: "Charlie Sales", role: "Sales" }),
                    ]),
                    acc: [],
                    rece: [],
                })
            );
        });

        it("blocks unauthorized roles from viewing teams page", async () => {
            const req = {
                user: { id: "sales1", role: "Sales" },
            };
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            };

            await getTeamsPage(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                message: "Only the owner or general manager can view this page",
            });
        });
    });
});
