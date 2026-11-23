const Tenant = require("../models/Tenant");
const Member = require("../models/Member");
const TenantMetricSnapshot = require("../models/TenantMetricSnapshot");
const { runAsPlatform, runWithTenant } = require("../context/tenantContext");
const { zonedParts, localDateKey, addLocalDays } = require("./bi/time");
const { formatPiasters } = require("./bi/money");
const ownerMail = require("./ownerMail");
const mailer = require("./mailer");
const logger = require("../utils/logger");

const DIGEST_WEEKDAY = 1; // Monday, in the gym's own timezone
const DIGEST_HOUR = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

const SUM_KEYS = [
    "newJoins",
    "membershipSalesPiasters",
    "ptSalesPiasters",
    "refundsPiasters",
    "checkIns",
    "termsEnded",
    "termsRenewed",
    "churnEvents",
];

/** ISO-8601 week key (e.g. "2026-W47") for a local YYYY-MM-DD date. */
function isoWeekKey(dateKey) {
    const [y, m, d] = dateKey.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((date - yearStart) / DAY_MS + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** True during the Monday 08:00 hour (or later that Monday) in the gym's timezone. */
function isDigestDue(now, timeZone) {
    const parts = zonedParts(now, timeZone);
    return parts.weekday === DIGEST_WEEKDAY && parts.hour >= DIGEST_HOUR;
}

function sumDays(days) {
    const totals = Object.fromEntries(SUM_KEYS.map((key) => [key, 0]));
    for (const day of days) {
        for (const key of SUM_KEYS) totals[key] += Number(day.metrics?.[key]) || 0;
    }
    return totals;
}

async function countExpiringSoon(now) {
    const horizon = new Date(now.getTime() + 7 * DAY_MS);
    const { withQueryMaxTime } = require("../config/queryBudgets");
    const rows = await withQueryMaxTime(Member.aggregate([
        { $match: { status: { $in: ["active", "frozen"] }, "subscriptions.0": { $exists: true } } },
        { $project: { lastEnd: { $arrayElemAt: ["$subscriptions.endDate", -1] } } },
        { $match: { lastEnd: { $gte: now, $lte: horizon } } },
        { $count: "n" },
    ]));
    return rows[0]?.n || 0;
}

/** Build the digest rows for the current tenant context. */
async function buildDigest(tenant, now = new Date()) {
    const timeZone = tenant.settings?.locale?.timezone || "Africa/Cairo";
    const today = localDateKey(now, timeZone);
    const from = addLocalDays(today, -7);
    const to = addLocalDays(today, -1);
    const days = await TenantMetricSnapshot.find({
        grain: "day",
        locationId: null,
        localDate: { $gte: from, $lte: to },
    }).select("localDate metrics").lean();

    const totals = sumDays(days);
    const [activeMembers, expiringSoon] = await Promise.all([
        Member.countDocuments({ status: "active" }),
        countExpiringSoon(now),
    ]);
    const revenue = totals.membershipSalesPiasters + totals.ptSalesPiasters - totals.refundsPiasters;
    const renewalRate = totals.termsEnded > 0 ? Math.round((totals.termsRenewed / totals.termsEnded) * 100) : null;

    const metrics = [
        { label: "Revenue collected (net of refunds)", value: formatPiasters(revenue) },
        { label: "New members", value: totals.newJoins },
        { label: "Check-ins", value: totals.checkIns },
        { label: "Renewals", value: `${totals.termsRenewed} of ${totals.termsEnded} ending${renewalRate != null ? ` (${renewalRate}%)` : ""}` },
        { label: "Members lost", value: totals.churnEvents },
        { label: "Active members today", value: activeMembers },
        { label: "Memberships ending in the next 7 days", value: expiringSoon },
    ];

    const highlights = [];
    if (expiringSoon > 0) highlights.push(`${expiringSoon} memberships end this week. Assign follow-ups from Tasks before they lapse.`);
    if (totals.refundsPiasters > 0) highlights.push(`Refunds this week: ${formatPiasters(totals.refundsPiasters)}.`);
    if (days.length === 0) highlights.push("No daily analytics were recorded last week, so revenue and visit totals may be incomplete.");

    return {
        periodLabel: `${from} to ${to}`,
        metrics,
        highlights,
        totals: { ...totals, revenuePiasters: revenue, activeMembers, expiringSoon },
        daysCovered: days.length,
    };
}

/**
 * Hourly pass: for each gym where it is Monday morning locally, send one weekly
 * digest to the owner (deduped per ISO week). Gyms can opt out in settings.
 */
async function runOwnerDigests(now = new Date()) {
    const tenants = await runAsPlatform(() => Tenant.find({
        isSoftDeleted: { $ne: true },
        status: { $in: ["active", "trial", "past_due"] },
        ownerUserId: { $ne: null },
        "settings.notifications.weeklyDigest": { $ne: false },
    }).select("name slug status ownerUserId settings"), { reason: "owner_weekly_digest" });

    const appUrl = `${ownerMail.appOrigin()}/analytics`;
    let sent = 0;
    for (const tenant of tenants) {
        const timeZone = tenant.settings?.locale?.timezone || "Africa/Cairo";
        try {
            if (!isDigestDue(now, timeZone)) continue;
            const week = isoWeekKey(localDateKey(now, timeZone));
            const digest = await runWithTenant(
                { tenantId: String(tenant._id), tenantSlug: tenant.slug },
                () => buildDigest(tenant, now)
            );
            const ok = await runAsPlatform(() => ownerMail.sendReminder({
                kind: "owner_weekly_digest",
                tenant,
                daysLeft: 0,
                window: week,
                send: (owner) => mailer.sendOwnerDigest({
                    to: owner.email,
                    name: owner.name,
                    gymName: tenant.settings?.branding?.displayName || tenant.name,
                    periodLabel: digest.periodLabel,
                    metrics: digest.metrics,
                    highlights: digest.highlights,
                    appUrl,
                }),
            }), { reason: "owner_weekly_digest_send" });
            if (ok) sent += 1;
        } catch (error) {
            logger.warn("mail", "Weekly digest failed", { tenantId: String(tenant._id), error: error.message });
        }
    }
    return { scanned: tenants.length, sent };
}

module.exports = { runOwnerDigests, buildDigest, isoWeekKey, isDigestDue, sumDays };
