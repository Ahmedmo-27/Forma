const Tenant = require("../models/Tenant");
const Member = require("../models/Member");
const User = require("../models/User");
const TenantMetricSnapshot = require("../models/TenantMetricSnapshot");
const { runAsPlatform } = require("../context/tenantContext");
const { tenantHealthScore } = require("./platformAnalyticsService");

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Each signal: why the gym is at risk, how much it counts toward the 0-100
 * risk score, and what the account manager should do about it.
 */
const SIGNALS = {
    past_due: {
        weight: 40,
        action: "Contact the owner about the overdue payment before the grace period ends.",
    },
    inactive: {
        weight: 35,
        action: "Call the owner. Ask what stopped them and offer a short re-onboarding session.",
    },
    never_active: {
        weight: 30,
        action: "Schedule a setup call. The gym signed up but nobody has used the dashboard.",
    },
    no_members: {
        weight: 25,
        action: "Offer to import their member list (CSV or Excel) for them.",
    },
    checkins_drop: {
        weight: 20,
        action: "Check whether the front desk stopped scanning check-ins, or whether attendance really fell.",
    },
    low_renewals: {
        weight: 20,
        action: "Show the owner the renewal follow-up tasks and the expiring members report.",
    },
    trial_ending: {
        weight: 20,
        action: "Book a demo before the trial ends, or extend the trial if they need more time.",
    },
    owner_only: {
        weight: 10,
        action: "Help the owner invite front-desk and sales staff, so the gym runs on Forma day to day.",
    },
    low_health: {
        weight: 10,
        action: "Review the gym's setup with the owner. Several basics are missing.",
    },
};

function dateKey(date) {
    return date.toISOString().slice(0, 10);
}

function daysBetween(from, to) {
    return Math.floor((to.getTime() - new Date(from).getTime()) / DAY_MS);
}

async function countByTenant(Model, tenantIds, match = {}) {
    const rows = await Model.collection
        .aggregate(
            [
                { $match: { tenantId: { $in: tenantIds }, ...match } },
                { $group: { _id: "$tenantId", n: { $sum: 1 } } },
            ],
            { maxTimeMS: require("../config/queryBudgets").queryMaxTimeMS() }
        )
        .toArray();
    return new Map(rows.map((row) => [String(row._id), row.n]));
}

/** Sum the last 7 and the previous 7 days of tenant-wide BI snapshots. */
async function activityByTenant(tenantIds, now) {
    const recentFrom = dateKey(new Date(now.getTime() - 7 * DAY_MS));
    const priorFrom = dateKey(new Date(now.getTime() - 14 * DAY_MS));
    const rows = await TenantMetricSnapshot.collection
        .aggregate(
            [
                {
                    $match: {
                        tenantId: { $in: tenantIds },
                        grain: "day",
                        locationId: null,
                        localDate: { $gte: priorFrom, $lt: dateKey(now) },
                    },
                },
                {
                    $project: {
                        tenantId: 1,
                        recent: { $gte: ["$localDate", recentFrom] },
                        checkIns: { $ifNull: ["$metrics.checkIns", 0] },
                        termsEnded: { $ifNull: ["$metrics.termsEnded", 0] },
                        termsRenewed: { $ifNull: ["$metrics.termsRenewed", 0] },
                    },
                },
                {
                    $group: {
                        _id: "$tenantId",
                        recentCheckIns: { $sum: { $cond: ["$recent", "$checkIns", 0] } },
                        priorCheckIns: { $sum: { $cond: ["$recent", 0, "$checkIns"] } },
                        termsEnded: { $sum: "$termsEnded" },
                        termsRenewed: { $sum: "$termsRenewed" },
                        days: { $sum: 1 },
                    },
                },
            ],
            { maxTimeMS: require("../config/queryBudgets").queryMaxTimeMS() }
        )
        .toArray();
    return new Map(rows.map((row) => [String(row._id), row]));
}

/** Pure scoring for one gym, kept separate so it can be unit tested. */
function scoreTenant({ tenant, memberCount, staffCount, activity, now }) {
    const signals = [];
    const add = (key, label) => signals.push({ key, label, weight: SIGNALS[key].weight });
    const ageDays = tenant.createdAt ? daysBetween(tenant.createdAt, now) : 0;
    const lastActivity = tenant.lastActivityAt ? new Date(tenant.lastActivityAt) : null;

    if (tenant.status === "past_due") {
        const graceEndsAt = tenant.dunning?.graceEndsAt;
        add("past_due", graceEndsAt
            ? `Payment overdue. Suspends on ${dateKey(new Date(graceEndsAt))}.`
            : "Payment overdue.");
    }

    if (lastActivity) {
        const idle = daysBetween(lastActivity, now);
        if (idle >= 14) add("inactive", `No staff activity for ${idle} days.`);
    } else if (ageDays >= 7) {
        add("never_active", `No staff activity recorded in ${ageDays} days since signup.`);
    }

    if (memberCount === 0 && ageDays >= 7) add("no_members", "No members added yet.");

    if (activity) {
        const { recentCheckIns, priorCheckIns, termsEnded, termsRenewed } = activity;
        if (priorCheckIns >= 20 && recentCheckIns < priorCheckIns * 0.5) {
            const drop = Math.round((1 - recentCheckIns / priorCheckIns) * 100);
            add("checkins_drop", `Check-ins down ${drop}% week over week (${recentCheckIns} vs ${priorCheckIns}).`);
        }
        if (termsEnded >= 5 && termsRenewed / termsEnded < 0.4) {
            add("low_renewals", `Only ${termsRenewed} of ${termsEnded} memberships renewed in the last 14 days.`);
        }
    }

    if (tenant.status === "trial" && tenant.trialEndsAt) {
        const daysLeft = Math.ceil((new Date(tenant.trialEndsAt).getTime() - now.getTime()) / DAY_MS);
        if (daysLeft >= 0 && daysLeft <= 7 && memberCount < 20) {
            add("trial_ending", `Trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"} with ${memberCount} members.`);
        }
    }

    if (staffCount <= 1 && ageDays >= 14) add("owner_only", "Only the owner account uses the system.");

    const healthScore = tenantHealthScore({ status: tenant.status, lastActivityAt: lastActivity, memberCount, staffCount, now });
    if (healthScore < 50) add("low_health", `Health score ${healthScore} of 100.`);

    const riskScore = Math.min(100, signals.reduce((sum, s) => sum + s.weight, 0));
    const level = riskScore >= 60 ? "high" : riskScore >= 30 ? "medium" : "low";
    signals.sort((a, b) => b.weight - a.weight);

    return {
        riskScore,
        level,
        healthScore,
        signals,
        suggestedActions: signals.map((s) => SIGNALS[s.key].action),
    };
}

/**
 * At-risk queue for the console: every live customer gym with at least a
 * medium risk score, highest risk first.
 */
async function buildAtRiskQueue({ now = new Date(), minLevel = "medium" } = {}) {
    return runAsPlatform(async () => {
        const tenants = await Tenant.find({
            isSoftDeleted: { $ne: true },
            purpose: { $ne: "showcase" },
            status: { $in: ["trial", "active", "past_due"] },
        })
            .select("name slug status planId ownerUserId lastActivityAt trialEndsAt createdAt dunning billing")
            .populate("planId", "name key")
            .populate("ownerUserId", "name email mobile_number")
            .lean();

        const ids = tenants.map((t) => t._id);
        const [members, staff, activity] = await Promise.all([
            countByTenant(Member, ids),
            countByTenant(User, ids),
            activityByTenant(ids, now),
        ]);

        const threshold = minLevel === "high" ? 60 : minLevel === "low" ? 1 : 30;
        const rows = [];
        for (const tenant of tenants) {
            const key = String(tenant._id);
            const memberCount = members.get(key) || 0;
            const staffCount = staff.get(key) || 0;
            const result = scoreTenant({ tenant, memberCount, staffCount, activity: activity.get(key), now });
            if (result.riskScore < threshold) continue;
            rows.push({
                id: tenant._id,
                name: tenant.name,
                slug: tenant.slug,
                status: tenant.status,
                plan: tenant.planId?.name || null,
                isLifetime: tenant.billing?.cycle === "lifetime",
                owner: tenant.ownerUserId
                    ? { name: tenant.ownerUserId.name, email: tenant.ownerUserId.email, phone: tenant.ownerUserId.mobile_number || null }
                    : null,
                lastActivityAt: tenant.lastActivityAt || null,
                trialEndsAt: tenant.trialEndsAt || null,
                memberCount,
                staffCount,
                ...result,
            });
        }

        rows.sort((a, b) => b.riskScore - a.riskScore || a.healthScore - b.healthScore || a.name.localeCompare(b.name));
        return {
            generatedAt: now,
            totals: {
                scanned: tenants.length,
                high: rows.filter((r) => r.level === "high").length,
                medium: rows.filter((r) => r.level === "medium").length,
            },
            tenants: rows,
        };
    }, { reason: "churn_risk_queue" });
}

module.exports = { buildAtRiskQueue, scoreTenant, SIGNALS };
