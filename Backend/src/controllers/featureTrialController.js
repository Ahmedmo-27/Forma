const FeatureTrialRequest = require("../models/FeatureTrialRequest");
const Tenant = require("../models/Tenant");
const { getEffectiveFeatures } = require("../models/Tenant");
const { FEATURE_BY_KEY, isKnownFeature } = require("../config/featureRegistry");
const { runAsPlatform } = require("../context/tenantContext");
const {
    canRequestFeatureTrials,
    durationToDays,
} = require("../utils/featureTrialAccess");
const {
    buildLockedFeatureCatalog,
    activeFeatureTrials,
} = require("../services/featurePlanLookup");
const { writeAudit } = require("../utils/audit");

function requesterDenied(res) {
    return res.status(403).json({
        code: "FEATURE_TRIAL_FORBIDDEN",
        message: "You do not have permission to request feature trials.",
    });
}

function serializeRequest(doc) {
    const plain = typeof doc.toObject === "function" ? doc.toObject() : doc;
    return {
        id: String(plain._id),
        tenantId: plain.tenantId ? String(plain.tenantId) : null,
        tenantName: plain.tenantName || "",
        tenantSlug: plain.tenantSlug || "",
        featureKey: plain.featureKey,
        featureName: plain.featureName || "",
        requestedDurationValue: plain.requestedDurationValue,
        requestedDurationUnit: plain.requestedDurationUnit,
        requestedByUserId: plain.requestedByUserId ? String(plain.requestedByUserId) : null,
        requestedByName: plain.requestedByName || "",
        requestedByRole: plain.requestedByRole || "",
        source: plain.source === "platform" ? "platform" : "tenant",
        status: plain.status,
        adminNote: plain.adminNote || "",
        approvedDurationValue: plain.approvedDurationValue,
        approvedDurationUnit: plain.approvedDurationUnit,
        decidedAt: plain.decidedAt,
        trialStartsAt: plain.trialStartsAt,
        trialEndsAt: plain.trialEndsAt,
        createdAt: plain.createdAt,
        updatedAt: plain.updatedAt,
    };
}

/**
 * GET /api/feature-trials/mine
 */
async function listMine(req, res) {
    try {
        if (!canRequestFeatureTrials(req.user)) return requesterDenied(res);

        const tenantId = req.tenant?._id || req.user?.tenantId;
        const [requests, lockedFeatureCatalog] = await Promise.all([
            runAsPlatform(
                () =>
                    FeatureTrialRequest.find({ tenantId })
                        .sort({ createdAt: -1 })
                        .limit(100)
                        .lean(),
                { reason: "feature_trial_list_mine" }
            ),
            buildLockedFeatureCatalog(req.planFeatures || []),
        ]);

        const plan = req.plan || req.tenant?.planId;
        return res.json({
            requests: requests.map(serializeRequest),
            activeFeatureTrials: activeFeatureTrials(req.tenant),
            lockedFeatureCatalog,
            effectiveFeatures: getEffectiveFeatures(req.tenant, plan),
        });
    } catch (err) {
        return res.status(500).json({ message: "Server error", error: err.message });
    }
}

/**
 * POST /api/feature-trials
 * Body: { featureKey, durationValue, durationUnit }
 */
async function createRequest(req, res) {
    try {
        if (!canRequestFeatureTrials(req.user)) return requesterDenied(res);

        const featureKey = String(req.body?.featureKey || "").trim().toLowerCase();
        const durationUnit = req.body?.durationUnit === "weeks" ? "weeks" : "days";
        const durationValue = Number(req.body?.durationValue);

        if (!featureKey || !isKnownFeature(featureKey)) {
            return res.status(400).json({
                code: "INVALID_FEATURE",
                message: "Unknown feature key.",
            });
        }

        const days = durationToDays(durationValue, durationUnit);
        if (days == null) {
            return res.status(400).json({
                code: "INVALID_DURATION",
                message: "Duration must be 1–90 days or 1–12 weeks.",
            });
        }

        const plan = req.plan || req.tenant?.planId;
        const effective = new Set(getEffectiveFeatures(req.tenant, plan));
        if (effective.has(featureKey)) {
            return res.status(400).json({
                code: "FEATURE_ALREADY_ENABLED",
                message: "This feature is already enabled for your gym.",
            });
        }

        const tenant = req.tenant;
        const meta = FEATURE_BY_KEY.get(featureKey);

        try {
            const created = await runAsPlatform(
                () =>
                    FeatureTrialRequest.create({
                        tenantId: tenant._id,
                        tenantName: tenant.name,
                        tenantSlug: tenant.slug,
                        featureKey,
                        featureName: meta?.name || featureKey,
                        requestedDurationValue: durationValue,
                        requestedDurationUnit: durationUnit,
                        requestedByUserId: req.user._id || req.user.id,
                        requestedByName: req.user.name || "",
                        requestedByRole: req.user.role || "",
                        status: "pending",
                    }),
                { reason: "feature_trial_create" }
            );

            await writeAudit({
                action: "feature_trial.request",
                actor: req.user._id || req.user.id,
                actorRole: req.user.role,
                targetType: "FeatureTrialRequest",
                targetId: created._id,
                meta: {
                    featureKey,
                    durationValue,
                    durationUnit,
                },
                req,
            });

            return res.status(201).json({
                request: serializeRequest(created),
            });
        } catch (err) {
            if (err?.code === 11000) {
                return res.status(409).json({
                    code: "PENDING_REQUEST_EXISTS",
                    message: "A pending trial request already exists for this feature.",
                });
            }
            throw err;
        }
    } catch (err) {
        return res.status(500).json({ message: "Server error", error: err.message });
    }
}

/**
 * POST /api/feature-trials/:id/cancel
 */
async function cancelRequest(req, res) {
    try {
        if (!canRequestFeatureTrials(req.user)) return requesterDenied(res);

        const tenantId = String(req.tenant?._id || req.user?.tenantId || "");
        const id = req.params.id;

        const doc = await runAsPlatform(
            () => FeatureTrialRequest.findById(id),
            { reason: "feature_trial_cancel_load" }
        );
        if (!doc || String(doc.tenantId) !== tenantId) {
            return res.status(404).json({ message: "Request not found" });
        }
        if (doc.status !== "pending") {
            return res.status(400).json({
                code: "REQUEST_NOT_PENDING",
                message: "Only pending requests can be cancelled.",
            });
        }

        doc.status = "cancelled";
        doc.decidedAt = new Date();
        await runAsPlatform(() => doc.save(), { reason: "feature_trial_cancel_save" });

        await writeAudit({
            action: "feature_trial.cancel",
            actor: req.user._id || req.user.id,
            actorRole: req.user.role,
            targetType: "FeatureTrialRequest",
            targetId: doc._id,
            meta: { featureKey: doc.featureKey },
            req,
        });

        return res.json({ request: serializeRequest(doc) });
    } catch (err) {
        return res.status(500).json({ message: "Server error", error: err.message });
    }
}

module.exports = {
    listMine,
    createRequest,
    cancelRequest,
    serializeRequest,
};
