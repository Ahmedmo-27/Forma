/**
 * Scheduled in-app reminders for facility maintenance.
 *
 * For every active tenant the job looks at each branch's active maintenance
 * items, and when any are due or overdue it drops ONE digest notification per
 * eligible user per branch per repeat window. Eligible = the user can use the
 * maintenance checklist (same rules as the /api/maintenance routes) and may
 * access that branch.
 *
 * Idempotency: each digest carries a dedupeKey that is unique per
 * (tenant, recipient, dedupeKey). Re-runs, restarts, and overlapping instances
 * hit the unique index and are silently skipped, so nobody is reminded twice
 * in the same window.
 */

const mongoose = require("mongoose");
const Tenant = require("../models/Tenant");
const Plan = require("../models/Plan");
const { getEffectiveFeatures } = require("../models/Tenant");
const User = require("../models/User");
const Location = require("../models/Location");
const MaintenanceItem = require("../models/MaintenanceItem");
const MaintenanceLog = require("../models/MaintenanceLog");
const Notification = require("../models/Notification");
const { computeStatus } = require("../utils/maintenanceStatus");
const { userCanAccessLocation } = require("../utils/locationScope");
const { isRevoked, hasExplicitGrant } = require("../utils/accessControl");
const { roleAreaDecision } = require("../middleware/accessMiddleware");
const { runWithTenant, runAsPlatform } = require("../context/tenantContext");
const logger = require("../utils/logger");

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_REPEAT_HOURS = 24;
const FEATURE_KEY = "maintenance_checklist";
// Same fallback roles as the maintenanceRoutes board/complete routes.
const FALLBACK_ROLES = ["Receptionist", "Owner", "General Manager"];
const SKIPPED_TENANT_STATUSES = ["suspended", "cancelled"];
const MAX_TITLES_IN_MESSAGE = 3;

function repeatHours() {
    const raw = Number(process.env.MAINTENANCE_REMINDER_REPEAT_HOURS);
    return Number.isFinite(raw) && raw >= 1 ? raw : DEFAULT_REPEAT_HOURS;
}

/** Start of the repeat window containing `now`, as an ISO string. */
function windowStart(now, hours = repeatHours()) {
    const size = hours * HOUR_MS;
    return new Date(Math.floor(now.getTime() / size) * size).toISOString();
}

function dedupeKeyFor(locationId, now, hours = repeatHours()) {
    return `maint:${String(locationId)}:${windowStart(now, hours)}`;
}

/**
 * Mirrors the route gate for GET /maintenance/board: a user can use the
 * checklist when it is not revoked, the role checklist does not deny the
 * maintenance area, and they either hold the default role or an explicit grant.
 */
function canUseMaintenance(user, tenant) {
    if (!user) return false;
    if (user.role === "Owner") return true;
    if (isRevoked(user, FEATURE_KEY)) return false;
    const gate = roleAreaDecision({ user, tenant, planFeatures: null }, FEATURE_KEY);
    if (gate === "deny") return false;
    if (gate === "allow") return true;
    return hasExplicitGrant(user, FEATURE_KEY) || FALLBACK_ROLES.includes(user.role);
}

async function latestCompletionByItem(itemIds) {
    if (!itemIds.length) return new Map();
    const rows = await MaintenanceLog.aggregate([
        { $match: { itemId: { $in: itemIds.map((id) => new mongoose.Types.ObjectId(String(id))) } } },
        { $group: { _id: "$itemId", completedAt: { $max: "$completedAt" } } },
    ]);
    return new Map(rows.map((row) => [String(row._id), row.completedAt]));
}

/**
 * Items that need attention, grouped by branch.
 * @returns {Map<string, { overdue: object[], due: object[] }>}
 */
function groupAttentionByLocation(items, lastByItem, now) {
    const groups = new Map();
    for (const item of items) {
        const { status } = computeStatus(item, lastByItem.get(String(item._id)) || null, now);
        if (status !== "due" && status !== "overdue") continue;
        const key = String(item.locationId);
        if (!groups.has(key)) groups.set(key, { overdue: [], due: [] });
        groups.get(key)[status].push(item);
    }
    return groups;
}

function buildMessage(locationName, group) {
    const total = group.overdue.length + group.due.length;
    const noun = total === 1 ? "item needs" : "items need";
    const overdueNote = group.overdue.length ? ` (${group.overdue.length} overdue)` : "";
    const ordered = [...group.overdue, ...group.due];
    const titles = ordered.slice(0, MAX_TITLES_IN_MESSAGE).map((item) => item.title);
    const more = ordered.length > titles.length ? `, +${ordered.length - titles.length} more` : "";
    return `${total} maintenance ${noun} attention at ${locationName}${overdueNote}: ${titles.join(", ")}${more}`;
}

async function notifyRecipient({ userId, locationId, locationName, group, key }) {
    try {
        await Notification.create({
            recipient: userId,
            type: "maintenance_due",
            title: "Maintenance reminder",
            message: buildMessage(locationName, group),
            dedupeKey: key,
            metadata: {
                locationId: String(locationId),
                overdueCount: group.overdue.length,
                dueCount: group.due.length,
                itemIds: [...group.overdue, ...group.due].map((item) => String(item._id)),
            },
        });
        return true;
    } catch (error) {
        // Already reminded in this window (this run, a previous run, or another instance).
        if (error?.code === 11000) return false;
        throw error;
    }
}

/**
 * Run the reminder pass for the tenant in the current async context.
 * @returns {Promise<{ created: number, skipped: number, locations: number }>}
 */
async function remindCurrentTenant(tenant, now = new Date()) {
    const result = { created: 0, skipped: 0, locations: 0 };

    const items = await MaintenanceItem.find({ active: true }).lean();
    if (!items.length) return result;

    const lastByItem = await latestCompletionByItem(items.map((item) => item._id));
    const groups = groupAttentionByLocation(items, lastByItem, now);
    if (!groups.size) return result;

    const [locations, users] = await Promise.all([
        Location.find({ _id: { $in: [...groups.keys()] } }).select("name").lean(),
        User.find({})
            .select("name role featureAccess abilities accessOverrides allowedLocationIds canAccessAllLocations")
            .lean(),
    ]);
    const nameByLocation = new Map(locations.map((loc) => [String(loc._id), loc.name]));
    const staff = users.filter((user) => canUseMaintenance(user, tenant));
    if (!staff.length) return result;

    for (const [locationId, group] of groups) {
        // Items can outlive a deleted branch; nothing to say about it.
        if (!nameByLocation.has(locationId)) continue;
        result.locations += 1;
        const key = dedupeKeyFor(locationId, now);
        for (const user of staff) {
            if (!userCanAccessLocation(user, tenant, locationId)) continue;
            const created = await notifyRecipient({
                userId: user._id,
                locationId,
                locationName: nameByLocation.get(locationId),
                group,
                key,
            });
            if (created) result.created += 1;
            else result.skipped += 1;
        }
    }
    return result;
}

/**
 * After an item is completed: if the branch has nothing due or overdue any more,
 * mark its unread maintenance reminders as read so the bell badge clears.
 * Runs inside the caller's tenant context (a request). Never throws.
 */
async function clearResolvedReminders(locationId, now = new Date()) {
    try {
        const items = await MaintenanceItem.find({ locationId, active: true }).lean();
        const lastByItem = await latestCompletionByItem(items.map((item) => item._id));
        const groups = groupAttentionByLocation(items, lastByItem, now);
        if (groups.has(String(locationId))) return 0;
        const res = await Notification.updateMany(
            { type: "maintenance_due", read: false, "metadata.locationId": String(locationId) },
            { $set: { read: true } }
        );
        return res.modifiedCount || 0;
    } catch (error) {
        logger.warn("maintenance", "Could not clear resolved reminders", { error: error.message });
        return 0;
    }
}

const MODULE_FEATURE = "maintenance";

async function loadPlansFor(tenants) {
    const ids = [...new Set(tenants.map((tenant) => tenant.planId && String(tenant.planId)).filter(Boolean))];
    if (!ids.length) return new Map();
    const plans = await runAsPlatform(
        () => Plan.find({ _id: { $in: ids } }).select("features").lean(),
        { reason: "maintenance_reminders_plans" }
    );
    return new Map(plans.map((plan) => [String(plan._id), plan]));
}

/** True unless the gym's effective features positively exclude the maintenance module. */
function tenantHasModule(tenant, plansById) {
    const plan = tenant.planId ? plansById.get(String(tenant.planId)) : null;
    if (!plan) return true;
    return getEffectiveFeatures(tenant, plan).includes(MODULE_FEATURE);
}
/**
 * Run reminders for every live tenant. One tenant failing never blocks the rest.
 */
async function runMaintenanceReminders(now = new Date()) {
    const tenants = await runAsPlatform(
        () => Tenant.find({ status: { $nin: SKIPPED_TENANT_STATUSES } })
            .select("_id slug roleAccess roleLocationAccess planId featureOverrides billing")
            .lean(),
        { reason: "maintenance_reminders" }
    );

    const plansById = await loadPlansFor(tenants);

    const totals = { tenants: 0, created: 0, skipped: 0, failed: 0 };
    for (const tenant of tenants) {
        // The maintenance module can be switched off per plan or per gym.
        if (!tenantHasModule(tenant, plansById)) continue;
        try {
            const res = await runWithTenant(
                { tenantId: String(tenant._id), tenantSlug: tenant.slug },
                () => remindCurrentTenant(tenant, now)
            );
            totals.tenants += 1;
            totals.created += res.created;
            totals.skipped += res.skipped;
        } catch (error) {
            totals.failed += 1;
            logger.error("maintenance", "Maintenance reminders failed for tenant", {
                tenantId: String(tenant._id),
                error: error.message,
            });
        }
    }

    if (totals.created > 0 || totals.failed > 0) {
        logger.info("maintenance", "Maintenance reminders processed", totals);
    }
    return totals;
}

module.exports = {
    runMaintenanceReminders,
    remindCurrentTenant,
    clearResolvedReminders,
    groupAttentionByLocation,
    canUseMaintenance,
    tenantHasModule,
    dedupeKeyFor,
    windowStart,
    buildMessage,
    repeatHours,
};
