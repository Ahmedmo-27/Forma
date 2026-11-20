import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Tenant = require("../models/Tenant");
const User = require("../models/User");
const Location = require("../models/Location");
const MaintenanceItem = require("../models/MaintenanceItem");
const MaintenanceLog = require("../models/MaintenanceLog");
const Notification = require("../models/Notification");
const { getTenantId } = require("../context/tenantContext");
const {
    runMaintenanceReminders,
    remindCurrentTenant,
    clearResolvedReminders,
    groupAttentionByLocation,
    canUseMaintenance,
    dedupeKeyFor,
    windowStart,
    buildMessage,
    repeatHours,
} = require("./maintenanceReminders");
const { runWithTenant } = require("../context/tenantContext");

const NOW = new Date("2026-03-10T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const oid = () => new mongoose.Types.ObjectId();
const ago = (ms) => new Date(NOW.getTime() - ms);

/** Minimal chainable stand-in for a mongoose query. */
const query = (data) => {
    const q = {
        select: () => q,
        lean: () => Promise.resolve(data),
    };
    return q;
};

const LOC_A = oid();
const LOC_B = oid();

const overdueItem = (locationId, title = "Check AC filters") => ({
    _id: oid(),
    locationId,
    title,
    active: true,
    intervalValue: 1,
    intervalUnit: "day",
    createdAt: ago(5 * DAY),
});

// Completed an hour ago on a monthly interval: status "ok".
const okItem = (locationId) => ({
    _id: oid(),
    locationId,
    title: "Deep clean",
    active: true,
    intervalValue: 1,
    intervalUnit: "month",
    createdAt: ago(40 * DAY),
});

const staff = (role, extra = {}) => ({ _id: oid(), name: role, role, ...extra });

const tenantDoc = { _id: oid(), slug: "gym-a", roleAccess: null, roleLocationAccess: null };

/** Wire model statics so one tenant run sees the given world. */
function stubWorld({ items, logs = [], users, locations }) {
    vi.spyOn(MaintenanceItem, "find").mockImplementation(() => query(items));
    vi.spyOn(MaintenanceLog, "aggregate").mockResolvedValue(logs);
    vi.spyOn(Location, "find").mockImplementation(() => query(locations));
    vi.spyOn(User, "find").mockImplementation(() => query(users));
}

/** Notification.create that enforces the (recipient, dedupeKey) unique index. */
function stubNotifications() {
    const seen = new Set();
    const created = [];
    vi.spyOn(Notification, "create").mockImplementation(async (doc) => {
        const key = `${doc.recipient}|${doc.dedupeKey}`;
        if (seen.has(key)) {
            const err = new Error("E11000 duplicate key");
            err.code = 11000;
            throw err;
        }
        seen.add(key);
        created.push(doc);
        return doc;
    });
    return created;
}

describe("maintenance reminders", () => {
    beforeEach(() => {
        delete process.env.MAINTENANCE_REMINDER_REPEAT_HOURS;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete process.env.MAINTENANCE_REMINDER_REPEAT_HOURS;
    });

    describe("dedupe window", () => {
        it("uses one key per branch per day by default", () => {
            const morning = new Date("2026-03-10T01:00:00.000Z");
            const evening = new Date("2026-03-10T23:30:00.000Z");
            const nextDay = new Date("2026-03-11T00:30:00.000Z");
            expect(repeatHours()).toBe(24);
            expect(dedupeKeyFor(LOC_A, morning)).toBe(dedupeKeyFor(LOC_A, evening));
            expect(dedupeKeyFor(LOC_A, morning)).not.toBe(dedupeKeyFor(LOC_A, nextDay));
            expect(dedupeKeyFor(LOC_A, morning)).not.toBe(dedupeKeyFor(LOC_B, morning));
            expect(windowStart(morning)).toBe("2026-03-10T00:00:00.000Z");
        });

        it("honors MAINTENANCE_REMINDER_REPEAT_HOURS and ignores bad values", () => {
            process.env.MAINTENANCE_REMINDER_REPEAT_HOURS = "6";
            expect(repeatHours()).toBe(6);
            const a = new Date("2026-03-10T05:59:00.000Z");
            const b = new Date("2026-03-10T06:01:00.000Z");
            expect(dedupeKeyFor(LOC_A, a)).not.toBe(dedupeKeyFor(LOC_A, b));

            process.env.MAINTENANCE_REMINDER_REPEAT_HOURS = "abc";
            expect(repeatHours()).toBe(24);
            process.env.MAINTENANCE_REMINDER_REPEAT_HOURS = "0";
            expect(repeatHours()).toBe(24);
        });
    });

    describe("grouping", () => {
        it("keeps only due and overdue items, grouped per branch", () => {
            const a1 = overdueItem(LOC_A);
            const a2 = okItem(LOC_A);
            const b1 = overdueItem(LOC_B, "Calibrate scales");
            const lastByItem = new Map([[String(a2._id), ago(60 * 60 * 1000)]]);

            const groups = groupAttentionByLocation([a1, a2, b1], lastByItem, NOW);

            expect([...groups.keys()].sort()).toEqual([String(LOC_A), String(LOC_B)].sort());
            expect(groups.get(String(LOC_A)).overdue).toEqual([a1]);
            expect(groups.get(String(LOC_A)).due).toEqual([]);
            expect(groups.get(String(LOC_B)).overdue).toEqual([b1]);
        });

        it("returns nothing when every item is ok", () => {
            const item = okItem(LOC_A);
            const groups = groupAttentionByLocation(
                [item],
                new Map([[String(item._id), ago(60 * 60 * 1000)]]),
                NOW
            );
            expect(groups.size).toBe(0);
        });

        it("writes a short digest message", () => {
            const group = {
                overdue: [overdueItem(LOC_A, "One"), overdueItem(LOC_A, "Two")],
                due: [overdueItem(LOC_A, "Three"), overdueItem(LOC_A, "Four")],
            };
            const message = buildMessage("Downtown", group);
            expect(message).toContain("4 maintenance items need attention at Downtown");
            expect(message).toContain("(2 overdue)");
            expect(message).toContain("One, Two, Three");
            expect(message).toContain("+1 more");
            expect(buildMessage("Downtown", { overdue: [], due: [overdueItem(LOC_A, "Solo")] }))
                .toBe("1 maintenance item needs attention at Downtown: Solo");
        });
    });

    describe("who can use maintenance", () => {
        it("follows the same defaults as the maintenance routes", () => {
            expect(canUseMaintenance(staff("Owner"), tenantDoc)).toBe(true);
            expect(canUseMaintenance(staff("General Manager"), tenantDoc)).toBe(true);
            expect(canUseMaintenance(staff("Receptionist"), tenantDoc)).toBe(true);
            expect(canUseMaintenance(staff("Coach"), tenantDoc)).toBe(false);
            expect(canUseMaintenance(staff("Sales"), tenantDoc)).toBe(false);
        });

        it("honors per-user grants and revokes", () => {
            const granted = staff("Coach", { featureAccess: { grants: ["maintenance_checklist"], revokes: [] } });
            const revoked = staff("Receptionist", { featureAccess: { grants: [], revokes: ["maintenance_checklist"] } });
            expect(canUseMaintenance(granted, tenantDoc)).toBe(true);
            expect(canUseMaintenance(revoked, tenantDoc)).toBe(false);
        });

        it("honors the role checklist and per-user area overrides", () => {
            const tenant = { ...tenantDoc, roleAccess: { Receptionist: ["members", "checkin"], Coach: ["maintenance"] } };
            expect(canUseMaintenance(staff("Receptionist"), tenant)).toBe(false);
            expect(canUseMaintenance(staff("Coach"), tenant)).toBe(true);

            const added = staff("Receptionist", { accessOverrides: { add: ["maintenance"], remove: [] } });
            expect(canUseMaintenance(added, tenant)).toBe(true);
        });
    });

    describe("remindCurrentTenant", () => {
        function world() {
            const itemA = overdueItem(LOC_A);
            const itemB = overdueItem(LOC_B, "Calibrate scales");
            const itemFine = okItem(LOC_A);
            const owner = staff("Owner");
            const gmAll = staff("General Manager", { canAccessAllLocations: true });
            const recepA = staff("Receptionist", { allowedLocationIds: [LOC_A] });
            const recepB = staff("Receptionist", { allowedLocationIds: [LOC_B] });
            const coach = staff("Coach");
            return {
                itemA, itemB, itemFine, owner, gmAll, recepA, recepB, coach,
                items: [itemA, itemB, itemFine],
                logs: [{ _id: itemFine._id, completedAt: ago(60 * 60 * 1000) }],
                users: [owner, gmAll, recepA, recepB, coach],
                locations: [
                    { _id: LOC_A, name: "Downtown" },
                    { _id: LOC_B, name: "Uptown" },
                ],
            };
        }

        it("notifies only eligible users, per branch, and never for ok items", async () => {
            const w = world();
            stubWorld(w);
            const created = stubNotifications();

            const result = await remindCurrentTenant(tenantDoc, NOW);

            const byUser = new Map();
            for (const doc of created) {
                const list = byUser.get(String(doc.recipient)) || [];
                list.push(doc);
                byUser.set(String(doc.recipient), list);
            }

            // Owner and the all-branch GM get both branches.
            expect(byUser.get(String(w.owner._id))).toHaveLength(2);
            expect(byUser.get(String(w.gmAll._id))).toHaveLength(2);
            // Branch-restricted receptionists only get their own branch.
            const forA = byUser.get(String(w.recepA._id));
            const forB = byUser.get(String(w.recepB._id));
            expect(forA).toHaveLength(1);
            expect(forA[0].metadata.locationId).toBe(String(LOC_A));
            expect(forB).toHaveLength(1);
            expect(forB[0].metadata.locationId).toBe(String(LOC_B));
            // Coach has no maintenance access.
            expect(byUser.has(String(w.coach._id))).toBe(false);

            expect(result).toEqual({ created: 6, skipped: 0, locations: 2 });

            const downtown = created.find((d) => d.metadata.locationId === String(LOC_A));
            expect(downtown.type).toBe("maintenance_due");
            expect(downtown.message).toContain("Downtown");
            // The "ok" item is not part of the digest.
            expect(downtown.metadata.itemIds).toEqual([String(w.itemA._id)]);
            expect(downtown.metadata.overdueCount).toBe(1);
        });

        it("does not remind twice in the same window, but does in the next one", async () => {
            const w = world();
            stubWorld(w);
            const created = stubNotifications();

            const first = await remindCurrentTenant(tenantDoc, NOW);
            const second = await remindCurrentTenant(tenantDoc, new Date(NOW.getTime() + 3 * 60 * 60 * 1000));
            expect(first.created).toBe(6);
            expect(second).toEqual({ created: 0, skipped: 6, locations: 2 });
            expect(created).toHaveLength(6);

            const nextDay = await remindCurrentTenant(tenantDoc, new Date(NOW.getTime() + DAY));
            expect(nextDay.created).toBe(6);
            expect(created).toHaveLength(12);
        });

        it("does nothing when there are no active items or nothing is due", async () => {
            stubWorld({ items: [], users: [staff("Owner")], locations: [] });
            const created = stubNotifications();
            expect(await remindCurrentTenant(tenantDoc, NOW)).toEqual({ created: 0, skipped: 0, locations: 0 });

            const fine = okItem(LOC_A);
            vi.restoreAllMocks();
            stubWorld({
                items: [fine],
                logs: [{ _id: fine._id, completedAt: ago(60 * 60 * 1000) }],
                users: [staff("Owner")],
                locations: [{ _id: LOC_A, name: "Downtown" }],
            });
            const created2 = stubNotifications();
            expect(await remindCurrentTenant(tenantDoc, NOW)).toEqual({ created: 0, skipped: 0, locations: 0 });
            expect(created).toHaveLength(0);
            expect(created2).toHaveLength(0);
        });

        it("skips items whose branch no longer exists", async () => {
            const orphan = overdueItem(oid());
            stubWorld({ items: [orphan], users: [staff("Owner")], locations: [] });
            const created = stubNotifications();
            expect(await remindCurrentTenant(tenantDoc, NOW)).toEqual({ created: 0, skipped: 0, locations: 0 });
            expect(created).toHaveLength(0);
        });

        it("rethrows unexpected notification errors", async () => {
            const w = world();
            stubWorld(w);
            vi.spyOn(Notification, "create").mockRejectedValue(new Error("db down"));
            await expect(remindCurrentTenant(tenantDoc, NOW)).rejects.toThrow("db down");
        });
    });

    describe("runMaintenanceReminders (all tenants)", () => {
        it("runs each live tenant inside its own tenant context and isolates failures", async () => {
            const tenantA = { _id: oid(), slug: "a", roleAccess: null, roleLocationAccess: null };
            const tenantB = { _id: oid(), slug: "b", roleAccess: null, roleLocationAccess: null };
            const tenantFilter = vi.fn();
            vi.spyOn(Tenant, "find").mockImplementation((filter) => {
                tenantFilter(filter);
                return query([tenantA, tenantB]);
            });

            const seenTenants = [];
            vi.spyOn(MaintenanceItem, "find").mockImplementation(() => {
                const id = getTenantId();
                seenTenants.push(id);
                if (id === String(tenantA._id)) throw new Error("tenant A exploded");
                return query([]);
            });

            const totals = await runMaintenanceReminders(NOW);

            expect(tenantFilter).toHaveBeenCalledWith({ status: { $nin: ["suspended", "cancelled"] } });
            expect(seenTenants).toEqual([String(tenantA._id), String(tenantB._id)]);
            expect(totals).toMatchObject({ tenants: 1, failed: 1, created: 0 });
        });

        it("never leaks one tenant's staff into another tenant's reminders", async () => {
            const tenantA = { _id: oid(), slug: "a", roleAccess: null, roleLocationAccess: null };
            const tenantB = { _id: oid(), slug: "b", roleAccess: null, roleLocationAccess: null };
            vi.spyOn(Tenant, "find").mockImplementation(() => query([tenantA, tenantB]));

            const ownerA = staff("Owner");
            const ownerB = staff("Owner");
            const usersByTenant = { [String(tenantA._id)]: [ownerA], [String(tenantB._id)]: [ownerB] };
            const itemsByTenant = {
                [String(tenantA._id)]: [overdueItem(LOC_A)],
                [String(tenantB._id)]: [overdueItem(LOC_B)],
            };
            vi.spyOn(MaintenanceItem, "find").mockImplementation(() => query(itemsByTenant[getTenantId()]));
            vi.spyOn(MaintenanceLog, "aggregate").mockResolvedValue([]);
            vi.spyOn(Location, "find").mockImplementation(() =>
                query([{ _id: LOC_A, name: "A site" }, { _id: LOC_B, name: "B site" }])
            );
            vi.spyOn(User, "find").mockImplementation(() => query(usersByTenant[getTenantId()]));
            const created = stubNotifications();

            const totals = await runMaintenanceReminders(NOW);

            expect(totals).toMatchObject({ tenants: 2, created: 2, failed: 0 });
            const recipients = created.map((doc) => String(doc.recipient)).sort();
            expect(recipients).toEqual([String(ownerA._id), String(ownerB._id)].sort());
            const forA = created.find((doc) => String(doc.recipient) === String(ownerA._id));
            expect(forA.metadata.locationId).toBe(String(LOC_A));
        });
    });

    describe("clearResolvedReminders", () => {
        it("marks the branch's unread reminders read once nothing is due", async () => {
            const fine = okItem(LOC_A);
            vi.spyOn(MaintenanceItem, "find").mockImplementation(() => query([fine]));
            vi.spyOn(MaintenanceLog, "aggregate").mockResolvedValue([
                { _id: fine._id, completedAt: new Date() },
            ]);
            const update = vi.spyOn(Notification, "updateMany").mockResolvedValue({ modifiedCount: 3 });

            const modified = await runWithTenant({ tenantId: String(tenantDoc._id) }, () =>
                clearResolvedReminders(LOC_A)
            );

            expect(modified).toBe(3);
            expect(update).toHaveBeenCalledWith(
                { type: "maintenance_due", read: false, "metadata.locationId": String(LOC_A) },
                { $set: { read: true } }
            );
        });

        it("leaves reminders unread while something is still due", async () => {
            vi.spyOn(MaintenanceItem, "find").mockImplementation(() => query([overdueItem(LOC_A)]));
            vi.spyOn(MaintenanceLog, "aggregate").mockResolvedValue([]);
            const update = vi.spyOn(Notification, "updateMany").mockResolvedValue({ modifiedCount: 0 });

            const modified = await clearResolvedReminders(LOC_A);

            expect(modified).toBe(0);
            expect(update).not.toHaveBeenCalled();
        });

        it("never throws", async () => {
            vi.spyOn(MaintenanceItem, "find").mockImplementation(() => {
                throw new Error("boom");
            });
            await expect(clearResolvedReminders(LOC_A)).resolves.toBe(0);
        });
    });
});
