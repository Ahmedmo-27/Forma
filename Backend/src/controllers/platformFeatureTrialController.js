const FeatureTrialRequest = require("../models/FeatureTrialRequest");
const Tenant = require("../models/Tenant");
const { runAsPlatform } = require("../context/tenantContext");
const { parsePagination, buildPagination } = require("../utils/pagination");
const { writePlatformAudit } = require("../utils/audit");
const { durationToDays, addDays } = require("../utils/featureTrialAccess");
const { serializeRequest } = require("./featureTrialController");

/**
 * GET /api/platform/feature-trials
 */
async function listFeatureTrials(req, res) {
    try {
        const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20 });
        const { status = "pending", tenantId, featureKey, search } = req.query || {};

        const filter = {};
        if (status && status !== "all") filter.status = status;
        if (tenantId) filter.tenantId = tenantId;
        if (featureKey) filter.featureKey = String(featureKey).toLowerCase();
        if (search && String(search).trim()) {
            const q = String(search).trim();
            filter.$or = [
                { tenantName: new RegExp(q, "i") },
                { tenantSlug: new RegExp(q, "i") },
                { featureKey: new RegExp(q, "i") },
                { featureName: new RegExp(q, "i") },
                { requestedByName: new RegExp(q, "i") },
            ];
        }

        const [rows, total] = await Promise.all([
            FeatureTrialRequest.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            FeatureTrialRequest.countDocuments(filter),
        ]);

        return res.json({
            requests: rows.map(serializeRequest),
            pagination: buildPagination(page, limit, total),
        });
    } catch (err) {
        return res.status(500).json({ message: "Server error", error: err.message });
    }
}

/**
 * POST /api/platform/feature-trials/:id/approve
 * Body: { durationValue?, durationUnit?, note? }
 */
async function approveFeatureTrial(req, res) {
    return runAsPlatform(async () => {
        try {
            const doc = await FeatureTrialRequest.findById(req.params.id);
            if (!doc) return res.status(404).json({ message: "Request not found" });
            if (doc.status !== "pending") {
                return res.status(400).json({
                    code: "REQUEST_NOT_PENDING",
                    message: "Only pending requests can be approved.",
                });
            }

            const unit =
                req.body?.durationUnit === "weeks" || req.body?.durationUnit === "days"
                    ? req.body.durationUnit
                    : doc.requestedDurationUnit;
            const value =
                req.body?.durationValue != null
                    ? Number(req.body.durationValue)
                    : doc.requestedDurationValue;

            const days = durationToDays(value, unit);
            if (days == null) {
                return res.status(400).json({
                    code: "INVALID_DURATION",
                    message: "Duration must be 1–90 days or 1–12 weeks.",
                });
            }

            const tenant = await Tenant.findById(doc.tenantId);
            if (!tenant) {
                return res.status(404).json({ message: "Tenant not found" });
            }

            const now = new Date();
            const endsAt = addDays(now, days);
            const platformUserId = req.platformUser?.id || req.platformUser?._id;

            doc.status = "approved";
            doc.approvedDurationValue = value;
            doc.approvedDurationUnit = unit;
            doc.adminNote = typeof req.body?.note === "string" ? req.body.note.trim() : doc.adminNote;
            doc.decidedByPlatformUserId = platformUserId || null;
            doc.decidedAt = now;
            doc.trialStartsAt = now;
            doc.trialEndsAt = endsAt;
            await doc.save();

            const trials = Array.isArray(tenant.featureTrials) ? [...tenant.featureTrials] : [];
            const remaining = trials.filter((t) => t.featureKey !== doc.featureKey);
            remaining.push({
                featureKey: doc.featureKey,
                startsAt: now,
                endsAt,
                requestId: doc._id,
                grantedByPlatformUserId: platformUserId || null,
            });
            tenant.featureTrials = remaining;
            tenant.markModified("featureTrials");
            await tenant.save();

            await writePlatformAudit({
                tenantId: tenant._id,
                action: "feature_trial.approve",
                actor: platformUserId,
                targetType: "FeatureTrialRequest",
                targetId: doc._id,
                meta: {
                    featureKey: doc.featureKey,
                    durationValue: value,
                    durationUnit: unit,
                    days,
                    trialEndsAt: endsAt,
                    tenantSlug: tenant.slug,
                },
                req,
            });

            return res.json({
                request: serializeRequest(doc),
                featureTrial: {
                    featureKey: doc.featureKey,
                    startsAt: now,
                    endsAt,
                },
            });
        } catch (err) {
            return res.status(500).json({ message: "Server error", error: err.message });
        }
    });
}

/**
 * POST /api/platform/feature-trials/:id/reject
 * Body: { note? }
 */
async function rejectFeatureTrial(req, res) {
    return runAsPlatform(async () => {
        try {
            const doc = await FeatureTrialRequest.findById(req.params.id);
            if (!doc) return res.status(404).json({ message: "Request not found" });
            if (doc.status !== "pending") {
                return res.status(400).json({
                    code: "REQUEST_NOT_PENDING",
                    message: "Only pending requests can be rejected.",
                });
            }

            const platformUserId = req.platformUser?.id || req.platformUser?._id;
            doc.status = "rejected";
            doc.adminNote = typeof req.body?.note === "string" ? req.body.note.trim() : "";
            doc.decidedByPlatformUserId = platformUserId || null;
            doc.decidedAt = new Date();
            await doc.save();

            await writePlatformAudit({
                tenantId: doc.tenantId,
                action: "feature_trial.reject",
                actor: platformUserId,
                targetType: "FeatureTrialRequest",
                targetId: doc._id,
                meta: {
                    featureKey: doc.featureKey,
                    note: doc.adminNote,
                    tenantSlug: doc.tenantSlug,
                },
                req,
            });

            return res.json({ request: serializeRequest(doc) });
        } catch (err) {
            return res.status(500).json({ message: "Server error", error: err.message });
        }
    });
}

module.exports = {
    listFeatureTrials,
    approveFeatureTrial,
    rejectFeatureTrial,
};
