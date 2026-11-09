import { describe, it, expect, vi, beforeEach } from "vitest";
import Notification from "../models/Notification.js";
import Task from "../models/Task.js";
import Member from "../models/Member.js";
import { notifyMemberAssigned, notifyTaskAssigned } from "../utils/notificationService.js";
import { completeMemberTask, getAssignedHistory, getAssignedTasks, getCreatedTasks } from "../controllers/taskController.js";

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

describe("Task Controller and Completion Workflow", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("marks member task as completed, records timestamp, and appends to member userlog", async () => {
        const mockTask = {
            _id: "task-100",
            assignedTo: "user-sales-1",
            status: "pending",
            completedCount: 0,
            members: [
                {
                    _id: "item-1",
                    member: "m-55",
                    name: "John Doe",
                    status: "pending",
                    completedAt: null,
                    completedBy: null,
                },
                {
                    _id: "item-2",
                    member: "m-56",
                    name: "Jane Doe",
                    status: "pending",
                    completedAt: null,
                    completedBy: null,
                },
            ],
            save: vi.fn().mockResolvedValue(true),
        };

        const mockMember = {
            _id: "m-55",
            name: "John Doe",
            userlog: [],
            save: vi.fn().mockResolvedValue(true),
        };

        vi.spyOn(Task, "findById").mockResolvedValue(mockTask);
        vi.spyOn(Member, "findById").mockResolvedValue(mockMember);

        const req = {
            params: { taskId: "task-100", memberId: "item-1" },
            user: { id: "user-sales-1", name: "Sales Rep Ali", role: "Sales" },
        };
        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn(),
        };

        await completeMemberTask(req, res);

        expect(mockTask.members[0].status).toBe("completed");
        expect(mockTask.members[0].completedAt).toBeInstanceOf(Date);
        expect(mockTask.members[0].completedBy).toBe("user-sales-1");
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
});
