const PlanPrice = require("../models/PlanPrice");
const Plan = require("../models/Plan");
const billingService = require("../services/billing/billingService");

/**
 * GET /api/tenant/billing/prices
 * Returns all active prices (monthly, yearly, lifetime) across plans,
 * including remaining lifetime seats if capped, and promotional validity.
 */
const getPlanPrices = async (_req, res) => {
    try {
        const [plans, prices] = await Promise.all([
            Plan.find({ isActive: true }).select("key name features limits allowedRoles"),
            PlanPrice.find({ isActive: true }).populate("planId", "key name"),
        ]);

        const now = new Date();
        const activePrices = prices
            .filter((p) => {
                if (p.validFrom && new Date(p.validFrom) > now) return false;
                if (p.validUntil && new Date(p.validUntil) <= now) return false;
                return true;
            })
            .map((p) => {
                const remainingSeats =
                    p.maxLifetimeSeats != null
                        ? Math.max(0, p.maxLifetimeSeats - (p.soldLifetimeSeats || 0))
                        : null;
                const isSoldOut = remainingSeats !== null && remainingSeats <= 0;

                return {
                    id: p._id,
                    planId: p.planId?._id || p.planId,
                    planKey: p.planId?.key,
                    planName: p.planId?.name,
                    cycle: p.cycle,
                    amount: p.amount,
                    currency: p.currency,
                    validUntil: p.validUntil,
                    maxLifetimeSeats: p.maxLifetimeSeats,
                    soldLifetimeSeats: p.soldLifetimeSeats,
                    remainingSeats,
                    isSoldOut,
                };
            });

        res.json({
            plans,
            prices: activePrices,
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

/**
 * POST /api/tenant/billing/lifetime/checkout
 * Initiate lifetime checkout for a plan tier.
 */
const checkoutLifetime = async (req, res) => {
    try {
        const tenantId = req.user?.tenantId;
        const { planKey, paymentMethod, termsVersion } = req.body;

        const result = await billingService.checkoutLifetime({
            tenantId,
            planKey,
            paymentMethod,
            actorId: req.user.id,
            termsVersion,
        });

        res.status(200).json({
            message: "Lifetime checkout initiated successfully.",
            ...result,
        });
    } catch (err) {
        if (err.code === "LIFETIME_SEATS_SOLD_OUT") {
            return res.status(409).json({ code: err.code, message: err.message });
        }
        if (err.code === "PLAN_NOT_FOUND" || err.code === "PRICE_NOT_FOUND") {
            return res.status(404).json({ code: err.code, message: err.message });
        }
        res.status(500).json({ message: "Checkout failed", error: err.message });
    }
};

/**
 * POST /api/tenant/billing/lifetime/confirm
 * Confirm lifetime purchase (used by manual bank transfer submission or webhook simulation).
 */
const confirmLifetimePurchase = async (req, res) => {
    try {
        const tenantId = req.user?.tenantId;
        const { paymentRef, planKey, paymentMethod, termsVersion } = req.body;

        if (!paymentRef) {
            return res.status(400).json({ message: "paymentRef is required" });
        }

        const result = await billingService.confirmLifetimePurchase({
            tenantId,
            planKey,
            paymentRef,
            paymentMethod,
            actorId: req.user.id,
            actorType: "User",
            termsVersion,
        });

        res.status(200).json({
            message: result.isIdempotentReplay
                ? "Payment was already confirmed previously."
                : "Lifetime subscription confirmed and activated successfully.",
            ...result,
        });
    } catch (err) {
        if (err.code === "LIFETIME_SEATS_SOLD_OUT") {
            return res.status(409).json({ code: err.code, message: err.message });
        }
        res.status(500).json({ message: "Payment confirmation failed", error: err.message });
    }
};

/**
 * POST /api/tenant/billing/lifetime/upgrade
 * Upgrade Lifetime subscription from current tier to a higher tier.
 */
const upgradeLifetime = async (req, res) => {
    try {
        const tenantId = req.user?.tenantId;
        const { targetPlanKey, paymentMethod, termsVersion } = req.body;

        const result = await billingService.upgradeLifetime({
            tenantId,
            targetPlanKey,
            paymentMethod,
            actorId: req.user.id,
            actorType: "User",
            termsVersion,
        });

        res.status(200).json({
            message: `Successfully upgraded lifetime subscription to ${targetPlanKey.toUpperCase()}.`,
            ...result,
        });
    } catch (err) {
        if (err.code === "DOWNGRADE_NOT_PERMITTED" || err.code === "INVALID_UPGRADE_DIFFERENCE") {
            return res.status(400).json({ code: err.code, message: err.message });
        }
        if (err.code === "NOT_A_LIFETIME_SUBSCRIBER") {
            return res.status(403).json({ code: err.code, message: err.message });
        }
        if (err.code === "LIFETIME_SEATS_SOLD_OUT") {
            return res.status(409).json({ code: err.code, message: err.message });
        }
        res.status(500).json({ message: "Upgrade failed", error: err.message });
    }
};

module.exports = {
    getPlanPrices,
    checkoutLifetime,
    confirmLifetimePurchase,
    upgradeLifetime,
};
