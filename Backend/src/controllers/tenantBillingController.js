const PlanPrice = require("../models/PlanPrice");
const Plan = require("../models/Plan");
const { BILLING_CURRENCY } = require("../config/currency");

/**
 * GET /api/tenant/billing/prices
 * Returns active plan prices for any month/year duration (lifetime is not offered for sale).
 */
const getPlanPrices = async (_req, res) => {
    try {
        const [plans, prices] = await Promise.all([
            Plan.find({ isActive: true }).select("key name features limits allowedRoles").lean(),
            PlanPrice.find({ isActive: true, cycle: { $in: ["monthly", "yearly"] } })
                .select("planId cycle intervalCount amount validFrom validUntil")
                .lean(),
        ]);
        const plansById = new Map(plans.map((plan) => [String(plan._id), plan]));

        const now = new Date();
        const activePrices = prices
            .filter((p) => p.cycle !== "lifetime")
            .filter((p) => {
                if (p.validFrom && new Date(p.validFrom) > now) return false;
                if (p.validUntil && new Date(p.validUntil) <= now) return false;
                return true;
            })
            .map((p) => {
                const plan = plansById.get(String(p.planId));
                const intervalCount = Number(p.intervalCount) >= 1 ? Number(p.intervalCount) : 1;

                return {
                    id: p._id,
                    planId: p.planId,
                    planKey: plan?.key,
                    planName: plan?.name,
                    cycle: p.cycle,
                    intervalCount,
                    amount: p.amount,
                    currency: BILLING_CURRENCY,
                    validUntil: p.validUntil,
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

module.exports = {
    getPlanPrices,
};
