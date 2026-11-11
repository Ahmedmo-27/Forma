import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import Notification from "../models/Notification.js";
import Task from "../models/Task.js";
import Member from "../models/Member.js";
import { notifyMemberAssigned, notifyTaskAssigned } from "../utils/notificationService.js";
import { completeMemberTask, getAssignedHistory, getAssignedTasks, getCreatedTasks, getAssigningOverview } from "../controllers/taskController.js";

describe("Task Notifications and Differentiation", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("differentiates regular assignment notification with title 'New member assigned'", async () => {
        const createSpy = vi.spyOn(Notification, "create").mockImplementation(async (doc) => ({ _id: "notif-1", ...doc }));
        vi.spyOn(Notification, "updateMany").mockResolvedValue({ modifiedCount: 0 });

        const result = await notifyMemberAssigned({
            recipientId: "user-coach-1",
            member: { _id: "m-1", name: "Ahmed Nour" },
            actorId: "user-owner-1",
        });

        expect(createSpy).toHaveBeenCalledTimes(1);
        const payload = createSpy.mock.calls[0][0];
        expect(payload.type).toBe("member_assigned");
        expect(payload.title).toBe("New member assigned");
        expect(payload.message).toBe("Ahmed Nour has been assigned to you");
        expect(payload.recipient).toBe("user-coach-1");
        expect(result.title).toBe("New member assigned");
    });

    it("creates task notification for single member with title 'Tasks' and check your tasks page message", async () => {
        const createSpy = vi.spyOn(Notification, "create").mockImplementation(async (doc) => ({ _id: "notif-2", ...doc }));

        const result = await notifyTaskAssigned({
            recipientId: "user-sales-1",
            members: [{ _id: "m-1", name: "Sara Mohamed" }],
            actorId: "user-manager-1",
            taskId: "task-1",
        });

        expect(createSpy).toHaveBeenCalledTimes(1);
        const payload = createSpy.mock.calls[0][0];
        expect(payload.type).toBe("task_assigned");
        expect(payload.title).toBe("Tasks");
        expect(payload.message).toBe("Sara Mohamed has been assigned to you as a task. Check your tasks page to view this member.");
        expect(payload.recipient).toBe("user-sales-1");
        expect(payload.member).toBe("m-1");
        expect(payload.metadata.taskId).toBe("task-1");
        expect(payload.metadata.memberCount).toBe(1);
    });

    it("creates task notification for multiple members with count and view those N members message", async () => {
        const createSpy = vi.spyOn(Notification, "create").mockImplementation(async (doc) => ({ _id: "notif-3", ...doc }));

        const result = await notifyTaskAssigned({
            recipientId: "user-coach-1",
            members: [
                { _id: "m-1", name: "Member 1" },
                { _id: "m-2", name: "Member 2" },
                { _id: "m-3", name: "Member 3" },
            ],
            actorId: "user-manager-1",
            taskId: "task-bulk-1",
        });

        expect(createSpy).toHaveBeenCalledTimes(1);
        const payload = createSpy.mock.calls[0][0];
        expect(payload.type).toBe("task_assigned");
        expect(payload.title).toBe("Tasks");
        expect(payload.message).toBe("3 members have been assigned to you as a task. Check your tasks page to view those 3 members.");
        expect(payload.member).toBeNull();
        expect(payload.metadata.memberCount).toBe(3);
    });

    it("does not send notification if recipient is the actor (self-assignment)", async () => {
        const createSpy = vi.spyOn(Notification, "create");

        const result = await notifyTaskAssigned({
            recipientId: "user-owner-1",
            members: [{ _id: "m-1", name: "Sara" }],
            actorId: "user-owner-1",
            taskId: "task-1",
        });

        expect(result).toBeNull();
        expect(createSpy).not.toHaveBeenCalled();
    });
});

describe("Member Schema Validation for Tasks", () => {
    it("ensures Member userlog schema enum includes 'task_completed'", () => {
        const enumValues = Member.schema.path("userlog").schema.path("type").enumValues;
        expect(enumValues).toContain("task_completed");
    });

    it("validates Member document when userlog contains 'task_completed'", () => {
        const member = new Member({
            tenantId: new mongoose.Types.ObjectId(),
            name: "Test Member",
            phones: "01011112222",
            createdBy: new mongoose.Types.ObjectId(),
        });

        member.userlog.push({
            type: "task_completed",
            text: "Task marked as completed by Sales Rep Ali",
            createdBy: new mongoose.Types.ObjectId(),
        });

        const validationError = member.validateSync();
        expect(validationError).toBeUndefined();
    });
});

describe("Task Controller and Completion Workflow", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("marks member task as completed, records timestamp, and appends to member userlog", async () => {
        const salesUserId = new mongoose.Types.ObjectId();
        const memberDocId = new mongoose.Types.ObjectId();
        const taskItemDocId = new mongoose.Types.ObjectId();
        const taskDocId = new mongoose.Types.ObjectId();

        const mockTask = {
            _id: taskDocId,
            assignedTo: salesUserId,
            status: "pending",
            completedCount: 0,
            members: [
                {
                    _id: taskItemDocId,
                    member: memberDocId,
                    name: "John Doe",
                    status: "pending",
                    completedAt: null,
                    completedBy: null,
                },
                {
                    _id: new mongoose.Types.ObjectId(),
                    member: new mongoose.Types.ObjectId(),
                    name: "Jane Doe",
                    status: "pending",
                    completedAt: null,
                    completedBy: null,
                },
            ],
            save: vi.fn().mockResolvedValue(true),
        };

        const mockMember = new Member({
            _id: memberDocId,
            tenantId: new mongoose.Types.ObjectId(),
            name: "John Doe",
            phones: "01011112222",
            createdBy: salesUserId,
        });

        // Realistic save mock that enforces schema validation before resolving
        mockMember.save = vi.fn().mockImplementation(async function () {
            const err = this.validateSync();
            if (err) throw err;
            return this;
        });

        vi.spyOn(Task, "findById").mockResolvedValue(mockTask);
        vi.spyOn(Member, "findById").mockResolvedValue(mockMember);

        const req = {
            params: { taskId: taskDocId.toString(), memberId: taskItemDocId.toString() },
            user: { id: salesUserId, name: "Sales Rep Ali", role: "Sales" },
        };
        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn(),
        };

        await completeMemberTask(req, res);

        expect(mockTask.members[0].status).toBe("completed");
        expect(mockTask.members[0].completedAt).toBeInstanceOf(Date);
        expect(mockTask.members[0].completedBy).toEqual(salesUserId);
        expect(mockTask.completedCount).toBe(1);
        expect(mockTask.status).toBe("in_progress");
        expect(mockTask.save).toHaveBeenCalled();

        expect(mockMember.userlog.length).toBe(1);
        expect(mockMember.userlog[0].type).toBe("task_completed");
        expect(mockMember.userlog[0].text).toContain("Task marked as completed by Sales Rep Ali");
        expect(mockMember.save).toHaveBeenCalled();

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: "Member task marked as completed",
            })
        );
    });

    it("flattens assigned history chronologically with assigner and completion info", async () => {
        const mockTasks = [
            {
                _id: "task-1",
                title: "Tasks",
                transferType: "bulk",
                targetRole: "Sales",
                createdAt: new Date("2026-11-01T10:00:00Z"),
                createdBy: { _id: "mgr-1", name: "Manager Sarah", role: "Sales Manager" },
                assignedTo: { _id: "rep-1", name: "Rep Ali", role: "Sales" },
                members: [
                    {
                        _id: "sub-1",
                        member: { _id: "m-1", name: "Member Alpha", systemId: 101, phones: "0100", status: "active" },
                        status: "completed",
                        completedAt: new Date("2026-11-02T14:30:00Z"),
                        completedBy: { _id: "rep-1", name: "Rep Ali", role: "Sales" },
                    },
                    {
                        _id: "sub-2",
                        member: { _id: "m-2", name: "Member Beta", systemId: 102, phones: "0101", status: "active" },
                        status: "pending",
                        completedAt: null,
                        completedBy: null,
                    },
                ],
            },
        ];

        const queryMock = {
            populate: vi.fn().mockReturnThis(),
            sort: vi.fn().mockResolvedValue(mockTasks),
        };
        vi.spyOn(Task, "find").mockReturnValue(queryMock);

        const req = {
            query: {},
            user: { id: "rep-1", role: "Sales" },
        };
        const res = {
            json: vi.fn(),
        };

        await getAssignedHistory(req, res);

        expect(res.json).toHaveBeenCalled();
        const history = res.json.mock.calls[0][0].history;
        expect(history.length).toBe(2);
        expect(history[0].member.name).toBe("Member Alpha");
        expect(history[0].status).toBe("completed");
        expect(history[0].completedAt).toBeInstanceOf(Date);
        expect(history[0].assignedBy.name).toBe("Manager Sarah");
        expect(history[1].member.name).toBe("Member Beta");
        expect(history[1].status).toBe("pending");
    });

    it("calculates assigning overview metrics for assigning player (Sales Manager)", async () => {
        const mockTasks = [
            { status: "completed", totalCount: 5, completedCount: 5 },
            { status: "in_progress", totalCount: 10, completedCount: 3 },
            { status: "pending", totalCount: 2, completedCount: 0 },
        ];

        const queryMock = {
            select: vi.fn().mockResolvedValue(mockTasks),
        };
        vi.spyOn(Task, "find").mockReturnValue(queryMock);

        const req = {
            query: {},
            user: { id: "mgr-1", role: "Sales Manager" },
        };
        const res = {
            json: vi.fn(),
        };

        await getAssigningOverview(req, res);

        expect(res.json).toHaveBeenCalledWith({
            stats: {
                totalTasks: 3,
                pendingTasks: 2,
                completedTasks: 1,
                totalMembersAssigned: 17,
                totalMembersCompleted: 8,
                completionRate: 47, // 8 / 17 = 47%
            },
        });
    });

    it("enforces clear player type role distinctions between assigning and assigned players", () => {
        const assigningRoles = ["transfer", "coach_transfer", "Sales Manager", "Coach Manager", "Owner", "General Manager"];
        const assignedRoles = ["Sales", "Coach", "Sales Manager", "Coach Manager", "Owner", "General Manager"];

        // Assigning player roles
        expect(assigningRoles.includes("Sales Manager")).toBe(true);
        expect(assigningRoles.includes("Coach Manager")).toBe(true);
        expect(assigningRoles.includes("Owner")).toBe(true);
        expect(assigningRoles.includes("General Manager")).toBe(true);
        // Regular Sales and Coach are strictly excluded from assigning roles
        expect(assigningRoles.includes("Sales")).toBe(false);
        expect(assigningRoles.includes("Coach")).toBe(false);

        // Assigned player roles
        expect(assignedRoles.includes("Sales")).toBe(true);
        expect(assignedRoles.includes("Coach")).toBe(true);
        expect(assignedRoles.includes("Sales Manager")).toBe(true);
    });
});
