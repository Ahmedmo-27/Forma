import { createRequire } from "module";
import mongoose from "mongoose";

// Load through CommonJS so spies hit the same module instances the service uses.
const require = createRequire(import.meta.url);
const Tenant = require("../models/Tenant");
const AuditLog = require("../models/AuditLog");
const ownerMail = require("../services/ownerMail");
const mailer = require("../services/mailer");
const { runDunning, applyPastDue, daysSince } = require("../services/billing/dunningService");

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-03-10T09:00:00.000Z");

function tenantDoc(overrides = {}) {
    return {
        _id: new mongoose.Types.ObjectId(),
        name: "Iron Gym",
        status: "past_due",
        ownerUserId: new mongoose.Types.ObjectId(),
        billing: { cycle: "monthly" },
        save: vi.fn().mockResolvedValue(true),
        ...overrides,
    };
}

function mockPastDue(rows) {
    vi.spyOn(Tenant, "find").mockReturnValue({ select: () => Promise.resolve(rows) });
}

describe("dunning", () => {
    let readyState;

    beforeEach(() => {
        vi.restoreAllMocks();
        readyState = vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
        vi.spyOn(ownerMail, "loadDunningSchedule").mockResolvedValue({
            gracePeriodDays: 3,
            reminderDays: [3, 1],
            trialReminderDays: [7, 3, 1],
            overdueReminderDays: [0, 2],
        });
        vi.spyOn(Tenant, "updateMany").mockResolvedValue({ modifiedCount: 0 });
        vi.spyOn(ownerMail, "notifySuspended").mockResolvedValue(undefined);
        vi.spyOn(AuditLog, "create").mockResolvedValue({});
    });

    afterEach(() => {
        readyState.mockRestore();
    });

    it("applyPastDue starts the grace period from now", () => {
        const tenant = applyPastDue(tenantDoc({ status: "active" }), { now: NOW, gracePeriodDays: 5 });
        expect(tenant.status).toBe("past_due");
        expect(tenant.dunning.pastDueSince).toEqual(NOW);
        expect(tenant.dunning.graceEndsAt).toEqual(new Date(NOW.getTime() + 5 * DAY));
        expect(tenant.dunning.markedBy).toBe("platform");
    });

    it("daysSince floors partial days and never goes negative", () => {
        expect(daysSince(new Date(NOW.getTime() - 2.5 * DAY), NOW)).toBe(2);
        expect(daysSince(new Date(NOW.getTime() + DAY), NOW)).toBe(0);
    });

    it("moves overdue subscriptions to past_due with grace dates, skipping lifetime tenants", async () => {
        mockPastDue([]);
        await runDunning(NOW);

        const overdueCall = Tenant.updateMany.mock.calls.find(([filter]) => filter.status?.$in?.includes?.("active") || filter.status === "active");
        expect(overdueCall).toBeTruthy();
        const [filter, update] = overdueCall;
        expect(filter["billing.cycle"]).toEqual({ $ne: "lifetime" });
        const set = update.$set || update;
        expect(set.status).toBe("past_due");
        expect(set["dunning.graceEndsAt"]).toEqual(new Date(NOW.getTime() + 3 * DAY));
    });

    it("suspends a tenant once the grace period has ended and audits it", async () => {
        const tenant = tenantDoc({
            dunning: { pastDueSince: new Date(NOW.getTime() - 4 * DAY), graceEndsAt: new Date(NOW.getTime() - DAY) },
        });
        mockPastDue([tenant]);
        const reminder = vi.spyOn(ownerMail, "sendReminder").mockResolvedValue(true);

        const summary = await runDunning(NOW);

        expect(summary.suspended).toBe(1);
        expect(tenant.status).toBe("suspended");
        expect(tenant.dunning.suspendedByDunning).toBe(true);
        expect(tenant.save).toHaveBeenCalled();
        expect(ownerMail.notifySuspended).toHaveBeenCalledWith(tenant);
        expect(reminder).not.toHaveBeenCalled();
        expect(AuditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({ action: "tenant_dunning_suspended", scope: "tenant", tenantId: tenant._id })
        );
    });

    it("sends the overdue reminder on a configured day during grace", async () => {
        const pastDueSince = new Date(NOW.getTime() - 2 * DAY);
        const tenant = tenantDoc({ dunning: { pastDueSince, graceEndsAt: new Date(pastDueSince.getTime() + 3 * DAY) } });
        mockPastDue([tenant]);
        const reminder = vi.spyOn(ownerMail, "sendReminder").mockResolvedValue(true);
        const send = vi.spyOn(mailer, "sendPaymentOverdue").mockResolvedValue({});

        const summary = await runDunning(NOW);

        expect(summary).toMatchObject({ remindersSent: 1, suspended: 0 });
        expect(tenant.status).toBe("past_due");
        const args = reminder.mock.calls[0][0];
        expect(args).toMatchObject({ kind: "payment_overdue", daysLeft: 2 });
        expect(args.window).toBe(ownerMail.reminderWindow(pastDueSince, 2));

        await args.send({ email: "owner@gym.test", name: "Owner" });
        expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "owner@gym.test", daysUntilSuspension: 1 }));
    });

    it("skips reminders on days that are not in the schedule", async () => {
        const pastDueSince = new Date(NOW.getTime() - DAY);
        mockPastDue([tenantDoc({ dunning: { pastDueSince, graceEndsAt: new Date(pastDueSince.getTime() + 3 * DAY) } })]);
        const reminder = vi.spyOn(ownerMail, "sendReminder").mockResolvedValue(true);

        const summary = await runDunning(NOW);

        expect(summary.remindersSent).toBe(0);
        expect(reminder).not.toHaveBeenCalled();
    });

    it("backfills grace dates for past_due rows that predate dunning", async () => {
        const periodEnd = new Date(NOW.getTime() - DAY);
        const tenant = tenantDoc({ currentPeriodEnd: periodEnd, dunning: undefined });
        mockPastDue([tenant]);
        vi.spyOn(ownerMail, "sendReminder").mockResolvedValue(false);

        const summary = await runDunning(NOW);

        expect(summary.backfilled).toBe(1);
        expect(tenant.dunning.pastDueSince).toEqual(periodEnd);
        expect(tenant.dunning.graceEndsAt).toEqual(new Date(periodEnd.getTime() + 3 * DAY));
        expect(tenant.status).toBe("past_due");
    });

    it("keeps going when one tenant fails", async () => {
        const broken = tenantDoc({
            dunning: { pastDueSince: new Date(NOW.getTime() - 5 * DAY), graceEndsAt: new Date(NOW.getTime() - DAY) },
            save: vi.fn().mockRejectedValue(new Error("write conflict")),
        });
        const healthy = tenantDoc({
            dunning: { pastDueSince: new Date(NOW.getTime() - 5 * DAY), graceEndsAt: new Date(NOW.getTime() - DAY) },
        });
        mockPastDue([broken, healthy]);

        const summary = await runDunning(NOW);

        expect(summary.suspended).toBe(1);
        expect(healthy.status).toBe("suspended");
    });
});
