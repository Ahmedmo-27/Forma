const Member = require("../../models/Member");
const User = require("../../models/User");
const TenantMetricSnapshot = require("../../models/TenantMetricSnapshot");
const Objective = require("../../models/Objective");
const ObjectiveProgress = require("../../models/ObjectiveProgress");
const Insight = require("../../models/Insight");
const PackageExceptionRequest = require("../../models/PackageExceptionRequest");
const SalesRepRequest = require("../../models/SalesRepRequest");
const CoachRepRequest = require("../../models/CoachRepRequest");
const { toPiasters } = require("./money");
const { localDateKey, addLocalDays } = require("./time");
const {
    computeDays,
    buildCohorts,
    evaluateInsights,
    windowRates,
    paceStatus,
    quietHourShare,
} = require("./metrics");
const logger = require("../../utils/logger");

const MEMBER_FIELDS = [
    "name", "systemId", "status", "source", "createdAt", "phones",
    "subscriptions", "freeze", "userlog", "notes", "assignedSales",
    "pt_subscriptions", "PT_sessions", "used_PT_sessions", "PT_sessions_expDate",
].join(" ");

function weekKey(dateKey) {
    const [y, m, d] = dateKey.split("-").map(Number);
    const utc = new Date(Date.UTC(y, m - 1, d));
    const onejan = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((utc - onejan) / 86400000) + onejan.getUTCDay() + 1) / 7);
    return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

async function loadPending(now) {
    const [exceptions, sales, coaches] = await Promise.all([
        PackageExceptionRequest.find({ status: "pending" }).select("createdAt").lean(),
        SalesRepRequest.find({ status: "pending" }).select("createdAt").lean(),
        CoachRepRequest.find({ status: "pending" }).select("createdAt").lean(),
    ]);
    const buckets = { total: 0, under1: 0, d1to3: 0, over3: 0 };
    for (const row of [...exceptions, ...sales, ...coaches]) {
        buckets.total += 1;
        const age = (now.getTime() - new Date(row.createdAt).getTime()) / 86400000;
        if (age > 3) buckets.over3 += 1;
        else if (age >= 1) buckets.d1to3 += 1;
        else buckets.under1 += 1;
    }
    return buckets;
}

async function loadFacts(now) {
    const members = await Member.find({}).select(MEMBER_FIELDS).lean();
    const reps = await User.find({ role: "Sales" }).select("monthlyTarget").lean();
    const targetsSumPiasters = reps.reduce((sum, rep) => sum + toPiasters(rep.monthlyTarget), 0);
    const pending = await loadPending(now);
    return { members, targetsSumPiasters, pending };
}

async function saveDay(day, timeZone, now) {
    const warnings = Object.values(day.quality || {}).some((value) => Number(value) > 0);
    await TenantMetricSnapshot.findOneAndUpdate(
        { grain: "day", localDate: day.localDate },
        {
            $set: {
                grain: "day",
                localDate: day.localDate,
                timezone: timeZone,
                metrics: day.metrics,
                segments: day.segments,
                hours: day.hours,
                weekday: day.weekday,
                samples: day.samples,
                lists: day.lists || {},
                pending: day.pending || {},
                quality: day.quality,
                jobStatus: warnings ? "warning" : "ok",
                computedAt: now,
            },
        },
        { upsert: true, setDefaultsOnInsert: true }
    );
}

function actualFor(objective, days) {
    const window = days.filter((day) => day.localDate >= objective.startDate && day.localDate <= objective.deadline);
    const rates = windowRates(window);
    if (objective.metricKey === "renewalRate") return rates.renewalRate.value;
    if (objective.metricKey === "conversionRate") return rates.conversionRate.value;
    if (objective.metricKey === "refundRate") return rates.refundRate.value;
    if (objective.metricKey === "ptUtilization") return rates.ptUtilization.value;
    if (objective.metricKey === "medianHoursToNote") return rates.medianHoursToNote.value;
    if (objective.metricKey === "membershipSalesPiasters") return rates.membershipSalesPiasters;
    if (objective.metricKey === "quietHourShare") return quietHourShare(window).share;
    if (objective.metricKey === "churnRate") {
        const covered = window[0]?.metrics?.coveredMembers || 0;
        const churned = window.reduce((sum, day) => sum + (day.metrics?.churnEvents || 0), 0);
        return covered ? churned / covered : null;
    }
    return null;
}

async function refreshObjectives(days, now) {
    const objectives = await Objective.find({ archived: false });
    for (const objective of objectives) {
        const actual = actualFor(objective, days);
        if (actual == null) continue;
        const pace = paceStatus({
            baseline: objective.baseline,
            target: objective.target,
            actual,
            start: `${objective.startDate}T00:00:00.000Z`,
            deadline: `${objective.deadline}T00:00:00.000Z`,
            now,
            direction: objective.direction,
        });
        objective.behindStreak = pace.behind ? (objective.behindStreak || 0) + 1 : 0;
        if (!objective.archived) objective.status = pace.status;
        await objective.save();
        const focus = days[days.length - 1];
        await ObjectiveProgress.findOneAndUpdate(
            { objectiveId: objective._id, localDate: focus.localDate },
            {
                $set: {
                    actual,
                    expected: pace.expected,
                    pace: pace.pace,
                    elapsed: pace.elapsed,
                    status: pace.status,
                    projected: pace.projected,
                },
            },
            { upsert: true }
        );
    }
}

async function refreshInsights(storedDays) {
    if (!storedDays.length) return [];
    const focus = storedDays[storedDays.length - 1];
    const recent = storedDays.filter((day) => day.localDate > addLocalDays(focus.localDate, -30));
    const prior = storedDays.filter((day) => day.localDate <= addLocalDays(focus.localDate, -30) && day.localDate > addLocalDays(focus.localDate, -120));
    const drafts = evaluateInsights({ focus, recentDays: recent, priorDays: prior });
    const week = weekKey(focus.localDate);
    for (const draft of drafts) {
        const existing = await Insight.findOne({ ruleKey: draft.ruleKey, weekKey: week });
        if (existing) continue;
        await Insight.create({ ...draft, weekKey: week, status: "new" });
    }
    return drafts;
}

/**
 * Idempotent rebuild of the given local dates for the active tenant.
 * Passing the same dates twice overwrites the same snapshot rows.
 */
async function snapshotTenant(tenant, { dateKeys, now = new Date(), dryRun = false } = {}) {
    const timeZone = tenant.settings?.locale?.timezone || "Africa/Cairo";
    const today = localDateKey(now, timeZone);
    const keys = (dateKeys && dateKeys.length ? dateKeys : [addLocalDays(today, -1), today]).slice().sort();
    const focusDate = keys.includes(today) ? today : keys[keys.length - 1];
    const facts = await loadFacts(now);
    const computed = computeDays({
        members: facts.members,
        dateKeys: keys,
        timeZone,
        now,
        focusDate,
        pending: facts.pending,
        targetsSumPiasters: facts.targetsSumPiasters,
    });
    if (dryRun) {
        return { timeZone, days: computed.days, dryRun: true };
    }
    for (const day of computed.days) {
        await saveDay(day, timeZone, now);
    }
    if (focusDate === today) {
        const cohorts = buildCohorts(facts.members, now, timeZone, 12);
        await TenantMetricSnapshot.findOneAndUpdate(
            { grain: "cohort", localDate: "cohort" },
            {
                $set: {
                    grain: "cohort",
                    localDate: "cohort",
                    timezone: timeZone,
                    cohorts,
                    metrics: {},
                    jobStatus: "ok",
                    computedAt: now,
                },
            },
            { upsert: true }
        );
    }
    const stored = await TenantMetricSnapshot.find({ grain: "day" }).sort({ localDate: 1 }).limit(400).lean();
    await refreshObjectives(stored, now);
    await refreshInsights(stored);
    return { timeZone, days: computed.days, dryRun: false };
}

async function runDueBiSnapshots() {
    const Tenant = require("../../models/Tenant");
    const { runAsPlatform, runWithTenant } = require("../../context/tenantContext");
    const tenants = await runAsPlatform(() => Tenant.find({
        isSoftDeleted: { $ne: true },
        status: { $nin: ["suspended", "cancelled"] },
    }).select("name settings status"));
    let done = 0;
    for (const tenant of tenants) {
        try {
            await runWithTenant({ tenantId: String(tenant._id) }, () => snapshotTenant(tenant));
            done += 1;
        } catch (error) {
            logger.error("bi", "Snapshot failed", { tenantId: String(tenant._id), error: error.message });
        }
    }
    logger.info("bi", "Snapshot run finished", { tenants: done });
    return done;
}

module.exports = {
    snapshotTenant,
    runDueBiSnapshots,
    loadFacts,
    weekKey,
    actualFor,
    refreshInsights,
};
