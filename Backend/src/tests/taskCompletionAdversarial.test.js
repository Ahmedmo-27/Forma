import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import Task from "../models/Task.js";
import Member from "../models/Member.js";
import { completeMemberTask } from "../controllers/taskController.js";

function createMockRes() {
    const res = {
        statusCode: 200,
        data: null,
        status: vi.fn(function (code) {
            res.statusCode = code;
            return res;
        }),
        json: vi.fn(function (payload) {
            res.data = payload;
            return res;
        }),
    };
    return res;
}

function createRealMemberDoc(overrides = {}) {
    const doc = new Member({
        _id: overrides._id || new mongoose.Types.ObjectId(),
        tenantId: overrides.tenantId || new mongoose.Types.ObjectId(),
        name: overrides.name || "Adversarial Test Member",
        phones: overrides.phones || "01099998888",
        createdBy: overrides.createdBy || new mongoose.Types.ObjectId(),
    });

    doc.save = vi.fn().mockImplementation(async function () {
        const err = this.validateSync();
        if (err) throw err;
        return this;
    });

    return doc;
}

function createMockTaskDoc(itemsCount = 2, assignedTo = new mongoose.Types.ObjectId(), options = {}) {
    const members = [];
    for (let i = 0; i < itemsCount; i++) {
        members.push({
            _id: new mongoose.Types.ObjectId(),
            member: new mongoose.Types.ObjectId(),
            name: `Test Member ${i + 1}`,
            status: "pending",
            completedAt: null,
            completedBy: null,
        });
    }

    const task = {
        _id: new mongoose.Types.ObjectId(),
        assignedTo,
        status: options.status || "pending",
        completedCount: options.completedCount || 0,
        members,
        save: vi.fn().mockResolvedValue(true),
    };

    return task;
}

describe("Adversarial Empirical Verification: completeMemberTask", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("Scenario 1 (Happy Path): sales rep marks pending item complete; userlog and task update cleanly", async () => {
        const salesUserId = new mongoose.Types.ObjectId();
        const task = createMockTaskDoc(2, salesUserId);
        const targetItem = task.members[0];

        const realMember = createRealMemberDoc({ _id: targetItem.member });

        vi.spyOn(Task, "findById").mockResolvedValue(task);
        vi.spyOn(Member, "findById").mockResolvedValue(realMember);

        const req = {
            params: {
                taskId: task._id.toString(),
                memberId: targetItem._id.toString(),
            },
            user: {
                id: salesUserId,
                name: "Sara Sales",
                role: "Sales",
            },
        };
        const res = createMockRes();

        await completeMemberTask(req, res);

        // Verify HTTP 200
        expect(res.statusCode).toBe(200);
        expect(res.data.message).toBe("Member task marked as completed");
        expect(res.data.completedItem._id).toEqual(targetItem._id);

        // Verify task item properties
        expect(targetItem.status).toBe("completed");
        expect(targetItem.completedAt).toBeInstanceOf(Date);
        expect(targetItem.completedBy).toEqual(salesUserId);

        // Verify task aggregates
        expect(task.completedCount).toBe(1);
        expect(task.status).toBe("in_progress");
        expect(task.save).toHaveBeenCalledTimes(1);

        // Verify member userlog audit trail
        expect(realMember.userlog.length).toBe(1);
        expect(realMember.userlog[0].type).toBe("task_completed");
        expect(realMember.userlog[0].text).toContain("Task marked as completed by Sara Sales (Sales) on");
        expect(realMember.userlog[0].createdBy).toEqual(salesUserId);
        expect(realMember.save).toHaveBeenCalledTimes(1);

        // Ensure real Mongoose validation succeeds without error
        const valError = realMember.validateSync();
        expect(valError).toBeUndefined();
    });

    it("Scenario 2 (All items completed): marks the final pending item, transitioning task to 'completed'", async () => {
        const salesUserId = new mongoose.Types.ObjectId();
        const task = createMockTaskDoc(2, salesUserId);

        // Pre-complete item 0
        task.members[0].status = "completed";
        task.members[0].completedAt = new Date();
        task.members[0].completedBy = salesUserId;
        task.completedCount = 1;
        task.status = "in_progress";

        const targetItem = task.members[1];
        const realMember = createRealMemberDoc({ _id: targetItem.member });

        vi.spyOn(Task, "findById").mockResolvedValue(task);
        vi.spyOn(Member, "findById").mockResolvedValue(realMember);

        const req = {
            params: {
                taskId: task._id.toString(),
                memberId: targetItem._id.toString(),
            },
            user: {
                id: salesUserId,
                name: "Sara Sales",
                role: "Sales",
            },
        };
        const res = createMockRes();

        await completeMemberTask(req, res);

        expect(res.statusCode).toBe(200);
        expect(task.completedCount).toBe(2);
        expect(task.status).toBe("completed");
        expect(targetItem.status).toBe("completed");
        expect(realMember.userlog[0].type).toBe("task_completed");
        expect(realMember.validateSync()).toBeUndefined();
    });

    it("Scenario 3 (Single item task): completes only item, transitioning directly to 'completed'", async () => {
        const salesUserId = new mongoose.Types.ObjectId();
        const task = createMockTaskDoc(1, salesUserId);
        const targetItem = task.members[0];
        const realMember = createRealMemberDoc({ _id: targetItem.member });

        vi.spyOn(Task, "findById").mockResolvedValue(task);
        vi.spyOn(Member, "findById").mockResolvedValue(realMember);

        const req = {
            params: {
                taskId: task._id.toString(),
                memberId: targetItem._id.toString(),
            },
            user: {
                id: salesUserId,
                name: "Sara Sales",
                role: "Sales",
            },
        };
        const res = createMockRes();

        await completeMemberTask(req, res);

        expect(res.statusCode).toBe(200);
        expect(task.completedCount).toBe(1);
        expect(task.status).toBe("completed");
        expect(realMember.userlog.length).toBe(1);
    });

    it("Scenario 4 (Missing memberDoc): Member.findById returns null; completes gracefully without crashing", async () => {
        const salesUserId = new mongoose.Types.ObjectId();
        const task = createMockTaskDoc(1, salesUserId);
        const targetItem = task.members[0];

        vi.spyOn(Task, "findById").mockResolvedValue(task);
        // Simulate member deleted or missing in DB
        vi.spyOn(Member, "findById").mockResolvedValue(null);

        const req = {
            params: {
                taskId: task._id.toString(),
                memberId: targetItem._id.toString(),
            },
            user: {
                id: salesUserId,
                name: "Sara Sales",
                role: "Sales",
            },
        };
        const res = createMockRes();

        await completeMemberTask(req, res);

        // Must NOT crash or return 500
        expect(res.statusCode).toBe(200);
        expect(res.data.message).toBe("Member task marked as completed");
        expect(targetItem.status).toBe("completed");
        expect(task.completedCount).toBe(1);
        expect(task.status).toBe("completed");
        expect(task.save).toHaveBeenCalledTimes(1);
    });

    it("Scenario 5 (Missing Task): Task.findById returns null; returns 404 Task not found", async () => {
        vi.spyOn(Task, "findById").mockResolvedValue(null);

        const req = {
            params: {
                taskId: new mongoose.Types.ObjectId().toString(),
                memberId: new mongoose.Types.ObjectId().toString(),
            },
            user: {
                id: new mongoose.Types.ObjectId(),
                name: "Sara Sales",
                role: "Sales",
            },
        };
        const res = createMockRes();

        await completeMemberTask(req, res);

        expect(res.statusCode).toBe(404);
        expect(res.data.message).toBe("Task not found");
    });

    it("Scenario 6 (Item not in task): memberId does not match any item._id or item.member; returns 404", async () => {
        const salesUserId = new mongoose.Types.ObjectId();
        const task = createMockTaskDoc(2, salesUserId);

        vi.spyOn(Task, "findById").mockResolvedValue(task);

        const req = {
            params: {
                taskId: task._id.toString(),
                memberId: new mongoose.Types.ObjectId().toString(), // not in task
            },
            user: {
                id: salesUserId,
                name: "Sara Sales",
                role: "Sales",
            },
        };
        const res = createMockRes();

        await completeMemberTask(req, res);

        expect(res.statusCode).toBe(404);
        expect(res.data.message).toBe("Member not found in this task");
    });

    it("Scenario 7 (Param lookup by member ref): finds item using item.member rather than item._id", async () => {
        const salesUserId = new mongoose.Types.ObjectId();
        const task = createMockTaskDoc(2, salesUserId);
        const targetItem = task.members[0];
        const realMember = createRealMemberDoc({ _id: targetItem.member });

        vi.spyOn(Task, "findById").mockResolvedValue(task);
        vi.spyOn(Member, "findById").mockResolvedValue(realMember);

        const req = {
            params: {
                taskId: task._id.toString(),
                memberId: targetItem.member.toString(), // Using member reference ObjectId string!
            },
            user: {
                id: salesUserId,
                name: "Sara Sales",
                role: "Sales",
            },
        };
        const res = createMockRes();

        await completeMemberTask(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.data.message).toBe("Member task marked as completed");
        expect(targetItem.status).toBe("completed");
        expect(realMember.userlog.length).toBe(1);
    });

    it("Scenario 8 (Unauthorized user): unassigned sales rep receives 403 Forbidden", async () => {
        const assignedSalesId = new mongoose.Types.ObjectId();
        const intruderSalesId = new mongoose.Types.ObjectId();
        const task = createMockTaskDoc(2, assignedSalesId);

        vi.spyOn(Task, "findById").mockResolvedValue(task);

        const req = {
            params: {
                taskId: task._id.toString(),
                memberId: task.members[0]._id.toString(),
            },
            user: {
                id: intruderSalesId,
                name: "Intruder Sales",
                role: "Sales", // not assignee, not manager
            },
        };
        const res = createMockRes();

        await completeMemberTask(req, res);

        expect(res.statusCode).toBe(403);
        expect(res.data.message).toBe("Not authorized to update this task");
    });

    it("Scenario 9 (Manager override): Sales Manager can complete task even if not assignee", async () => {
        const assignedSalesId = new mongoose.Types.ObjectId();
        const managerId = new mongoose.Types.ObjectId();
        const task = createMockTaskDoc(2, assignedSalesId);
        const targetItem = task.members[0];
        const realMember = createRealMemberDoc({ _id: targetItem.member });

        vi.spyOn(Task, "findById").mockResolvedValue(task);
        vi.spyOn(Member, "findById").mockResolvedValue(realMember);

        const req = {
            params: {
                taskId: task._id.toString(),
                memberId: targetItem._id.toString(),
            },
            user: {
                id: managerId,
                name: "Boss Manager",
                role: "Sales Manager",
            },
        };
        const res = createMockRes();

        await completeMemberTask(req, res);

        expect(res.statusCode).toBe(200);
        expect(targetItem.status).toBe("completed");
        expect(targetItem.completedBy).toEqual(managerId);
        expect(realMember.userlog[0].text).toContain("Boss Manager (Sales Manager)");
    });

    it("Scenario 10 (Sequential completions): completing item 1 then item 2 produces isolated audit logs and updates status accurately", async () => {
        const salesUserId = new mongoose.Types.ObjectId();
        const task = createMockTaskDoc(2, salesUserId);

        const item1 = task.members[0];
        const item2 = task.members[1];

        const memberDoc1 = createRealMemberDoc({ _id: item1.member, name: "Member Alpha" });
        const memberDoc2 = createRealMemberDoc({ _id: item2.member, name: "Member Beta" });

        vi.spyOn(Task, "findById").mockResolvedValue(task);
        vi.spyOn(Member, "findById").mockImplementation(async (id) => {
            if (id.toString() === item1.member.toString()) return memberDoc1;
            if (id.toString() === item2.member.toString()) return memberDoc2;
            return null;
        });

        // Step 1: Complete item 1
        const req1 = {
            params: { taskId: task._id.toString(), memberId: item1._id.toString() },
            user: { id: salesUserId, name: "Sara Sales", role: "Sales" },
        };
        const res1 = createMockRes();
        await completeMemberTask(req1, res1);

        expect(res1.statusCode).toBe(200);
        expect(item1.status).toBe("completed");
        expect(item2.status).toBe("pending");
        expect(task.completedCount).toBe(1);
        expect(task.status).toBe("in_progress");
        expect(memberDoc1.userlog.length).toBe(1);
        expect(memberDoc2.userlog.length).toBe(0);
        expect(memberDoc1.validateSync()).toBeUndefined();

        // Step 2: Complete item 2
        const req2 = {
            params: { taskId: task._id.toString(), memberId: item2._id.toString() },
            user: { id: salesUserId, name: "Sara Sales", role: "Sales" },
        };
        const res2 = createMockRes();
        await completeMemberTask(req2, res2);

        expect(res2.statusCode).toBe(200);
        expect(item1.status).toBe("completed");
        expect(item2.status).toBe("completed");
        expect(task.completedCount).toBe(2);
        expect(task.status).toBe("completed");
        expect(memberDoc1.userlog.length).toBe(1);
        expect(memberDoc2.userlog.length).toBe(1);
        expect(memberDoc2.validateSync()).toBeUndefined();
    });

    it("Scenario 11 (Idempotent re-completion): re-marking an already completed item does not over-increment completedCount", async () => {
        const salesUserId = new mongoose.Types.ObjectId();
        const task = createMockTaskDoc(2, salesUserId);
        const item1 = task.members[0];
        const memberDoc1 = createRealMemberDoc({ _id: item1.member });

        vi.spyOn(Task, "findById").mockResolvedValue(task);
        vi.spyOn(Member, "findById").mockResolvedValue(memberDoc1);

        // Completion 1
        const req1 = {
            params: { taskId: task._id.toString(), memberId: item1._id.toString() },
            user: { id: salesUserId, name: "Sara Sales", role: "Sales" },
        };
        const res1 = createMockRes();
        await completeMemberTask(req1, res1);

        expect(task.completedCount).toBe(1);
        expect(task.status).toBe("in_progress");

        // Completion 2 on same item
        const req2 = {
            params: { taskId: task._id.toString(), memberId: item1._id.toString() },
            user: { id: salesUserId, name: "Sara Sales", role: "Sales" },
        };
        const res2 = createMockRes();
        await completeMemberTask(req2, res2);

        expect(res2.statusCode).toBe(200);
        // completedCount must stay 1, NOT increment to 2
        expect(task.completedCount).toBe(1);
        expect(task.status).toBe("in_progress");
        expect(memberDoc1.userlog.length).toBe(2);
        expect(memberDoc1.validateSync()).toBeUndefined();
    });

    it("Scenario 12 (Task item without member reference): item.member is null; completes without error", async () => {
        const salesUserId = new mongoose.Types.ObjectId();
        const task = createMockTaskDoc(1, salesUserId);
        task.members[0].member = null; // No member reference
        const targetItem = task.members[0];

        const findMemberSpy = vi.spyOn(Member, "findById");
        vi.spyOn(Task, "findById").mockResolvedValue(task);

        const req = {
            params: { taskId: task._id.toString(), memberId: targetItem._id.toString() },
            user: { id: salesUserId, name: "Sara Sales", role: "Sales" },
        };
        const res = createMockRes();

        await completeMemberTask(req, res);

        expect(res.statusCode).toBe(200);
        expect(targetItem.status).toBe("completed");
        expect(task.completedCount).toBe(1);
        expect(task.status).toBe("completed");
        expect(findMemberSpy).not.toHaveBeenCalled();
    });

    it("Scenario 13 (Adversarial Schema Stress Test): validates that non-enum values fail and all valid enum values pass", () => {
        const validEnums = ["check-in", "pt-session", "note", "renewal", "freeze", "assign", "task_completed", "other"];
        const schemaEnums = Member.schema.path("userlog").schema.path("type").enumValues;

        // Check exact match of schema enum
        expect(schemaEnums).toEqual(validEnums);

        // Stress test valid values
        for (const enumVal of validEnums) {
            const member = new Member({
                tenantId: new mongoose.Types.ObjectId(),
                name: "Enum Test Member",
                phones: "01000000000",
                createdBy: new mongoose.Types.ObjectId(),
                userlog: [
                    {
                        type: enumVal,
                        text: `Log for ${enumVal}`,
                        createdBy: new mongoose.Types.ObjectId(),
                    },
                ],
            });
            const err = member.validateSync();
            expect(err).toBeUndefined();
        }

        // Stress test invalid enum values
        const invalidEnums = ["task_done", "completed", "finish", "log", "TASK_COMPLETED", ""];
        for (const badVal of invalidEnums) {
            const member = new Member({
                tenantId: new mongoose.Types.ObjectId(),
                name: "Enum Test Member",
                phones: "01000000000",
                createdBy: new mongoose.Types.ObjectId(),
                userlog: [
                    {
                        type: badVal,
                        text: `Invalid ${badVal}`,
                        createdBy: new mongoose.Types.ObjectId(),
                    },
                ],
            });
            const err = member.validateSync();
            expect(err).toBeDefined();
            expect(err.errors["userlog.0.type"].message).toContain("is not a valid enum value for path `type`");
        }
    });
});
