import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import fc from "fast-check";
import Member from "../models/Member.js";

describe("Milestone 4 Challenger: Member userlog & task_completed Empirical Verification", () => {
    const EXPECTED_ENUMS = [
        "check-in",
        "pt-session",
        "note",
        "renewal",
        "freeze",
        "assign",
        "task_completed",
        "other",
    ];

    const createValidMember = () => {
        return new Member({
            tenantId: new mongoose.Types.ObjectId(),
            name: "Adversarial Stress Test Member",
            phones: "01099998888",
            createdBy: new mongoose.Types.ObjectId(),
        });
    };

    // =========================================================================
    // 1. Enum Contract, Immutability & Schema Introspection
    // =========================================================================
    describe("1. Schema Enum Contract & Immutability", () => {
        it("verifies logSchema.type contains exactly 8 expected enum values in order", () => {
            const enumValues = Member.schema.path("userlog").schema.path("type").enumValues;
            expect(enumValues).toBeDefined();
            expect(enumValues.length).toBe(8);
            expect(enumValues).toEqual(EXPECTED_ENUMS);
            expect(enumValues).toContain("task_completed");
        });

        it("verifies logSchema.type default is 'other'", () => {
            const defaultValue = Member.schema.path("userlog").schema.path("type").defaultValue;
            expect(defaultValue).toBe("other");
        });

        it("verifies all 8 enum values pass document validation cleanly", () => {
            for (const enumVal of EXPECTED_ENUMS) {
                const member = createValidMember();
                member.userlog.push({
                    type: enumVal,
                    text: `Log entry for enum ${enumVal}`,
                    createdBy: new mongoose.Types.ObjectId(),
                });
                const err = member.validateSync();
                expect(err).toBeUndefined();
            }
        });
    });

    // =========================================================================
    // 2. Acceptance Tests for task_completed
    // =========================================================================
    describe("2. Acceptance Tests for task_completed", () => {
        it("validates task_completed with validateSync() producing zero errors", () => {
            const member = createValidMember();
            const createdById = new mongoose.Types.ObjectId();
            const logEntry = {
                type: "task_completed",
                text: "Task marked as completed by Sales Rep Sara on 2026-11-12T01:00:00.000Z",
                createdBy: createdById,
            };

            member.userlog.push(logEntry);
            const err = member.validateSync();
            expect(err).toBeUndefined();

            const savedLog = member.userlog[0];
            expect(savedLog.type).toBe("task_completed");
            expect(savedLog.text).toBe(logEntry.text);
            expect(savedLog.createdBy.toString()).toBe(createdById.toString());
            expect(savedLog._id).toBeDefined();
        });

        it("validates task_completed with synchronous validateSync() resolving cleanly", () => {
            // Note: member.validate() triggers pre-save hooks (e.g., tenant context check)
            // which requires a live DB context. Use validateSync() for schema-only validation.
            const member = createValidMember();
            member.userlog.push({
                type: "task_completed",
                text: "Sync validation check",
                createdBy: new mongoose.Types.ObjectId(),
            });

            const err = member.validateSync();
            expect(err).toBeUndefined();
        });
    });

    // =========================================================================
    // 3. Boundary & Stress Tests
    // =========================================================================
    describe("3. Boundary & Stress Tests", () => {
        it("handles long text boundaries (5,000 characters and 50,000 characters)", () => {
            const member = createValidMember();
            const text5k = "A".repeat(5000);
            const text50k = "B".repeat(50000);

            member.userlog.push({
                type: "task_completed",
                text: text5k,
                createdBy: new mongoose.Types.ObjectId(),
            });

            member.userlog.push({
                type: "task_completed",
                text: text50k,
                createdBy: new mongoose.Types.ObjectId(),
            });

            const err = member.validateSync();
            expect(err).toBeUndefined();
            expect(member.userlog[0].text.length).toBe(5000);
            expect(member.userlog[1].text.length).toBe(50000);
        });

        it("handles complex Unicode, Arabic, RTL, and emoji characters", () => {
            const member = createValidMember();
            const arabicText = "تم إكمال المهمة بنجاح بواسطة مندوب المبيعات أحمد علي! 🚀🔥🎉 #12345 (ملاحظة: العميل مهتم بالاشتراك السنوي)";

            member.userlog.push({
                type: "task_completed",
                text: arabicText,
                createdBy: new mongoose.Types.ObjectId(),
            });

            const err = member.validateSync();
            expect(err).toBeUndefined();
            expect(member.userlog[0].text).toBe(arabicText);
        });

        it("handles adversarial payload characters (HTML, script tags, SQL-like syntax, control characters)", () => {
            const member = createValidMember();
            const adversarialText = "<script>alert('xss')</script>\n\r\t' OR '1'='1' -- DROP TABLE users; {\"json\": true}";

            member.userlog.push({
                type: "task_completed",
                text: adversarialText,
                createdBy: new mongoose.Types.ObjectId(),
            });

            const err = member.validateSync();
            expect(err).toBeUndefined();
            expect(member.userlog[0].text).toBe(adversarialText);
        });

        it("handles custom timestamps in the far past and far future", () => {
            const member = createValidMember();
            const pastDate = new Date("2000-01-01T00:00:00.000Z");
            const futureDate = new Date("2050-12-31T23:59:59.999Z");

            member.userlog.push({
                type: "task_completed",
                text: "Task completed in the past",
                createdBy: new mongoose.Types.ObjectId(),
                createdAt: pastDate,
            });

            member.userlog.push({
                type: "task_completed",
                text: "Task completed in the future",
                createdBy: new mongoose.Types.ObjectId(),
                createdAt: futureDate,
            });

            const err = member.validateSync();
            expect(err).toBeUndefined();
            expect(member.userlog[0].createdAt.toISOString()).toBe(pastDate.toISOString());
            expect(member.userlog[1].createdAt.toISOString()).toBe(futureDate.toISOString());
        });

        it("handles sequential volume stress: 100 sequential task_completed entries", () => {
            const member = createValidMember();
            const count = 100;
            const staffId = new mongoose.Types.ObjectId();

            for (let i = 0; i < count; i++) {
                member.userlog.push({
                    type: "task_completed",
                    text: `Task #${i + 1} completed for member by agent ${staffId}`,
                    createdBy: staffId,
                });
            }

            expect(member.userlog.length).toBe(100);
            const err = member.validateSync();
            expect(err).toBeUndefined();
        });

        it("handles high volume stress: 1,000 entries validated in under 200ms", () => {
            const member = createValidMember();
            const count = 1000;
            const staffId = new mongoose.Types.ObjectId();

            for (let i = 0; i < count; i++) {
                member.userlog.push({
                    type: "task_completed",
                    text: `Bulk task completion log entry index ${i}`,
                    createdBy: staffId,
                });
            }

            const startTime = performance.now();
            const err = member.validateSync();
            const duration = performance.now() - startTime;

            expect(err).toBeUndefined();
            expect(member.userlog.length).toBe(1000);
            expect(duration).toBeLessThan(200); // Must be fast
        });
    });

    // =========================================================================
    // 4. Adversarial & Negative Tests
    // =========================================================================
    describe("4. Adversarial & Negative Tests", () => {
        it("STILL rejects invalid enum strings (e.g., 'unknown_action', 'completed', 'TASK_COMPLETED')", () => {
            const invalidTypes = [
                "unknown_action",
                "completed", // subtle mismatch vs "task_completed"
                "TASK_COMPLETED", // case sensitivity
                "Task_Completed",
                "task-completed", // hyphen vs underscore
                "taskcompleted",
                "done",
                "finished",
                "deleted",
            ];

            for (const invalidType of invalidTypes) {
                const member = createValidMember();
                member.userlog.push({
                    type: invalidType,
                    text: "Valid text",
                    createdBy: new mongoose.Types.ObjectId(),
                });

                const err = member.validateSync();
                expect(err).toBeDefined();
                expect(err.errors["userlog.0.type"]).toBeDefined();
                expect(err.errors["userlog.0.type"].message).toContain("is not a valid enum value for path `type`");
            }
        });

        it("STILL rejects empty string '' for type", () => {
            const member = createValidMember();
            member.userlog.push({
                type: "",
                text: "Valid text",
                createdBy: new mongoose.Types.ObjectId(),
            });

            const err = member.validateSync();
            expect(err).toBeDefined();
            expect(err.errors["userlog.0.type"]).toBeDefined();
        });

        it("null type passes schema validation without error (Mongoose 9 null coercion)", () => {
            // In Mongoose 9, passing null for a String path does not trigger enum validation.
            // The null is stored as-is; no validation error is thrown.
            const member = createValidMember();
            member.userlog.push({
                type: null,
                text: "Valid text",
                createdBy: new mongoose.Types.ObjectId(),
            });

            const err = member.validateSync();
            // null bypasses enum validation in Mongoose 9 — no error
            expect(err).toBeUndefined();
        });

        it("falls back to default 'other' when type is undefined", () => {
            const member = createValidMember();
            member.userlog.push({
                text: "Log without explicit type",
                createdBy: new mongoose.Types.ObjectId(),
            });

            const err = member.validateSync();
            expect(err).toBeUndefined();
            expect(member.userlog[0].type).toBe("other");
        });

        it("STILL requires 'text' and rejects missing or empty text", () => {
            const memberNoText = createValidMember();
            memberNoText.userlog.push({
                type: "task_completed",
                createdBy: new mongoose.Types.ObjectId(),
            });

            const errNoText = memberNoText.validateSync();
            expect(errNoText).toBeDefined();
            expect(errNoText.errors["userlog.0.text"]).toBeDefined();
            expect(errNoText.errors["userlog.0.text"].kind).toBe("required");

            const memberEmptyText = createValidMember();
            memberEmptyText.userlog.push({
                type: "task_completed",
                text: "",
                createdBy: new mongoose.Types.ObjectId(),
            });

            const errEmptyText = memberEmptyText.validateSync();
            expect(errEmptyText).toBeDefined();
            expect(errEmptyText.errors["userlog.0.text"]).toBeDefined();
        });

        it("STILL requires 'createdBy' and rejects missing or null createdBy", () => {
            const memberNoCreatedBy = createValidMember();
            memberNoCreatedBy.userlog.push({
                type: "task_completed",
                text: "Task completed",
            });

            const errNoCreatedBy = memberNoCreatedBy.validateSync();
            expect(errNoCreatedBy).toBeDefined();
            expect(errNoCreatedBy.errors["userlog.0.createdBy"]).toBeDefined();
            expect(errNoCreatedBy.errors["userlog.0.createdBy"].kind).toBe("required");

            const memberNullCreatedBy = createValidMember();
            memberNullCreatedBy.userlog.push({
                type: "task_completed",
                text: "Task completed",
                createdBy: null,
            });

            const errNullCreatedBy = memberNullCreatedBy.validateSync();
            expect(errNullCreatedBy).toBeDefined();
            expect(errNullCreatedBy.errors["userlog.0.createdBy"]).toBeDefined();
        });

        it("rejects malformed ObjectId strings for createdBy with CastError", () => {
            const member = createValidMember();
            member.userlog.push({
                type: "task_completed",
                text: "Task completed",
                createdBy: "not-a-valid-24-char-hex-id",
            });

            const err = member.validateSync();
            expect(err).toBeDefined();
            expect(err.errors["userlog.0.createdBy"]).toBeDefined();
            expect(err.errors["userlog.0.createdBy"].name).toBe("CastError");
        });

        it("accepts valid 24-character hex strings for createdBy and casts to ObjectId", () => {
            const hexId = "507f1f77bcf86cd799439011";
            const member = createValidMember();
            member.userlog.push({
                type: "task_completed",
                text: "Task completed",
                createdBy: hexId,
            });

            const err = member.validateSync();
            expect(err).toBeUndefined();
            expect(member.userlog[0].createdBy).toBeInstanceOf(mongoose.Types.ObjectId);
            expect(member.userlog[0].createdBy.toString()).toBe(hexId);
        });
    });

    // =========================================================================
    // 5. Property-Based Fuzzing with fast-check
    // =========================================================================
    describe("5. Property-Based Fuzzing (fast-check)", () => {
        it("fuzzes random text inputs for task_completed logs", () => {
            // fast-check v4 uses fc.string() — fc.fullUnicodeString() was removed
            fc.assert(
                fc.property(
                    fc.string({ minLength: 1, maxLength: 500 }),
                    (randomText) => {
                        const member = createValidMember();
                        member.userlog.push({
                            type: "task_completed",
                            text: randomText,
                            createdBy: new mongoose.Types.ObjectId(),
                        });

                        const err = member.validateSync();
                        return err === undefined;
                    }
                ),
                { numRuns: 100 }
            );
        });

        it("fuzzes arbitrary non-enum strings for type and asserts rejection", () => {
            const enumSet = new Set(EXPECTED_ENUMS);
            fc.assert(
                fc.property(
                    fc.string().filter((s) => !enumSet.has(s) && s !== ""),
                    (invalidType) => {
                        const member = createValidMember();
                        member.userlog.push({
                            type: invalidType,
                            text: "Valid log text",
                            createdBy: new mongoose.Types.ObjectId(),
                        });

                        const err = member.validateSync();
                        return err !== undefined && err.errors["userlog.0.type"] !== undefined;
                    }
                ),
                { numRuns: 100 }
            );
        });
    });

    // =========================================================================
    // 6. Controller Simulation & Mixed Enum Audit Trail
    // =========================================================================
    describe("6. Controller Simulation & Mixed Enum Audit Trail", () => {
        it("simulates exact taskController completeMemberTask behavior", async () => {
            const member = createValidMember();
            const reqUser = {
                id: new mongoose.Types.ObjectId(),
                name: "Karim Sales Specialist",
                role: "Sales",
            };
            const completedTimestamp = new Date();

            // Exact code executed by completeMemberTask:
            member.userlog.push({
                type: "task_completed",
                text: `Task marked as completed by ${reqUser.name} (${reqUser.role}) on ${completedTimestamp.toISOString()}`,
                createdBy: reqUser.id,
                createdAt: completedTimestamp,
            });

            const err = member.validateSync();
            expect(err).toBeUndefined();

            const entry = member.userlog[0];
            expect(entry.type).toBe("task_completed");
            expect(entry.text).toContain("Karim Sales Specialist");
            expect(entry.text).toContain("(Sales)");
            expect(entry.createdAt.toISOString()).toBe(completedTimestamp.toISOString());
            expect(entry.createdBy.toString()).toBe(reqUser.id.toString());
        });

        it("maintains schema integrity when mixed with all other lifecycle userlog events", () => {
            const member = createValidMember();
            const staffId = new mongoose.Types.ObjectId();

            const auditSequence = [
                { type: "assign", text: "Assigned to sales rep", createdBy: staffId },
                { type: "check-in", text: "Member checked into branch", createdBy: staffId },
                { type: "pt-session", text: "Completed PT session with coach", createdBy: staffId },
                { type: "note", text: "Customer inquired about package upgrade", createdBy: staffId },
                { type: "task_completed", text: "Task marked as completed: follow-up call", createdBy: staffId },
                { type: "renewal", text: "Package renewed for 12 months", createdBy: staffId },
                { type: "freeze", text: "Membership frozen for 14 days", createdBy: staffId },
                { type: "other", text: "General frontdesk note", createdBy: staffId },
            ];

            for (const item of auditSequence) {
                member.userlog.push(item);
            }

            expect(member.userlog.length).toBe(8);
            const err = member.validateSync();
            expect(err).toBeUndefined();

            const types = member.userlog.map((l) => l.type);
            expect(types).toEqual([
                "assign",
                "check-in",
                "pt-session",
                "note",
                "task_completed",
                "renewal",
                "freeze",
                "other",
            ]);
        });
    });
});
