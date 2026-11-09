import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import Member from "../models/Member.js";
import User from "../models/User.js";
import PackageExceptionRequest from "../models/PackageExceptionRequest.js";
import { refund } from "../controllers/memberController.js";
import { updateExceptionStatus } from "../controllers/packageExceptionController.js";
import { loginUser, getTeamsPage } from "../controllers/userController.js";
import bcrypt from "bcryptjs";

describe("Tenant-Side Audit Fixes", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
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
                    },
                ],
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
                    { pricePaid: 1000, refundAmount: 0 },
                    { pricePaid: 1500, refundAmount: 0 },
                ],
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
            expect(mockMember.status).toBe("active");
            expect(mockMember.isMember).toBe(true);
            expect(mockMember.subscriptions[1].refundAmount).toBe(1500);
            expect(mockMember.save).toHaveBeenCalled();
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
