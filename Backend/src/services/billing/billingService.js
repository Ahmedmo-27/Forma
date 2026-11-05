const mongoose = require("mongoose");
const Tenant = require("../../models/Tenant");
const Plan = require("../../models/Plan");
const PlanPrice = require("../../models/PlanPrice");
const BillingEvent = require("../../models/BillingEvent");
const AuditLog = require("../../models/AuditLog");
const { getPaymentAdapter } = require("./paymentAdapter");
const { runAsPlatform } = require("../../context/tenantContext");

const TIER_RANKS = {
    basic: 1,
    gold: 2,
    platinum: 3,
};

/**
 * Executes a callback within a MongoDB transaction if available on the current connection.
 * Gracefully falls back to direct execution if running on a standalone non-replica MongoDB.
 */
async function executeInTransaction(callback) {
    // If not connected to a live database (e.g. running in mocked unit tests), run callback directly
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
        return await callback(null);
    }

    let session = null;
    try {
        session = await mongoose.startSession();
        session.startTransaction();
        const result = await callback(session);
        await session.commitTransaction();
        return result;
    } catch (err) {
        if (session) {
            try {
                await session.abortTransaction();
            } catch (_) {}
        }
        // Fallback for standalone mongod (common in unit test containers)
        if (err.message && err.message.includes("Transaction numbers are only allowed on a replica set member")) {
            return await callback(null);
        }
        throw err;
    } finally {
        if (session) {
            session.endSession();
        }
    }
}

/**
 * Resolve active PlanPrice for a plan key and cycle.
 * Enforces validity date window and active flag.
 */
async function resolveActivePlanPrice(planKey, cycle = "lifetime", now = new Date()) {
    const plan = await Plan.findOne({ key: planKey });
    if (!plan) {
        const error = new Error(`Plan '${planKey}' not found.`);
        error.code = "PLAN_NOT_FOUND";
        throw error;
    }

    const planPrice = await PlanPrice.findOne({
        planId: plan._id,
        cycle,
        isActive: true,
        validFrom: { $lte: now },
        $or: [{ validUntil: null }, { validUntil: { $gt: now } }],
    });

    if (!planPrice) {
        const error = new Error(`No active ${cycle} price found for plan '${planKey}'.`);
        error.code = "PRICE_NOT_FOUND";
        throw error;
    }

    return { plan, planPrice };
}

/**
 * Initiate lifetime checkout.
 * Resolves price server-side, checks seat cap, and initiates payment session via adapter.
 */
async function checkoutLifetime({
    tenantId,
    planKey,
    paymentMethod = "manual_transfer",
    actorId,
    termsVersion = "2026.1",
}) {
    return runAsPlatform(async () => {
        const tenant = await Tenant.findById(tenantId);
        if (!tenant) {
            const error = new Error("Tenant not found");
            error.code = "TENANT_NOT_FOUND";
            throw error;
        }

        const now = new Date();
        const { plan, planPrice } = await module.exports.resolveActivePlanPrice(planKey, "lifetime", now);

        // Check seat cap before initiating
        if (planPrice.maxLifetimeSeats != null && planPrice.soldLifetimeSeats >= planPrice.maxLifetimeSeats) {
            const error = new Error(`Lifetime licenses for ${plan.name} are completely sold out.`);
            error.code = "LIFETIME_SEATS_SOLD_OUT";
            throw error;
        }

        const adapter = getPaymentAdapter(paymentMethod);
        const paymentSession = await adapter.initiatePayment({
            tenant,
            plan,
            planPrice,
            amount: planPrice.amount,
            currency: planPrice.currency,
            actorId,
            metadata: {
                termsVersion,
                planKey: plan.key,
                cycle: "lifetime",
            },
        });

        return {
            paymentRef: paymentSession.paymentRef,
            amount: planPrice.amount,
            currency: planPrice.currency,
            planKey: plan.key,
            planName: plan.name,
            paymentMethod,
            termsVersion,
            sessionDetails: paymentSession,
        };
    }, { reason: "checkout_lifetime", actorId: actorId ? actorId.toString() : "system" });
}

/**
 * Confirm a lifetime purchase.
 * Idempotent by paymentRef.
 * Atomically decrements available seat cap and updates tenant + BillingEvent + AuditLog.
 */
async function confirmLifetimePurchase({
    tenantId,
    planKey,
    paymentRef,
    paymentMethod = "manual_transfer",
    actorId,
    actorType = "User",
    entitlementPolicy = "follow_tier",
    termsVersion = "2026.1",
    amountPaid,
    refundWindowDays = 30,
}) {
    return runAsPlatform(async () => {
        // 1. Idempotency check: if already processed, return existing record
        const existingEvent = await BillingEvent.findOne({ externalRef: paymentRef });
        if (existingEvent) {
            const currentTenant = await Tenant.findById(tenantId).populate("planId");
            return {
                isIdempotentReplay: true,
                billingEvent: existingEvent,
                tenant: currentTenant,
            };
        }

        const { plan, planPrice } = await module.exports.resolveActivePlanPrice(planKey, "lifetime");
        const finalAmount = amountPaid != null ? amountPaid : planPrice.amount;

        // 2. Atomic seat reservation check on PlanPrice
        const seatCondition = {
            _id: planPrice._id,
            $or: [
                { maxLifetimeSeats: null },
                { soldLifetimeSeats: { $lt: planPrice.maxLifetimeSeats } },
            ],
        };

        const priceUpdated = await PlanPrice.findOneAndUpdate(
            seatCondition,
            { $inc: { soldLifetimeSeats: 1 } },
            { new: true }
        );

        if (!priceUpdated) {
            const err = new Error(`LIFETIME_SEATS_SOLD_OUT: All available lifetime seats have been claimed.`);
            err.code = "LIFETIME_SEATS_SOLD_OUT";
            throw err;
        }

        const now = new Date();
        const refundEnds = new Date(now.getTime() + refundWindowDays * 24 * 60 * 60 * 1000);

        // 3. Atomically update Tenant and insert immutable BillingEvent & AuditLog
        const result = await executeInTransaction(async (session) => {
            const opts = session ? { session } : {};

            const updatedTenant = await Tenant.findByIdAndUpdate(
                tenantId,
                {
                    $set: {
                        status: "active", // Ends trial if active trial
                        planId: plan._id,
                        currentPeriodEnd: null,
                        trialEndsAt: null,
                        "billing.cycle": "lifetime",
                        "billing.lifetime.purchasedAt": now,
                        "billing.lifetime.amountPaid": finalAmount,
                        "billing.lifetime.currency": planPrice.currency,
                        "billing.lifetime.priceSnapshot": {
                            planPriceId: planPrice._id,
                            amount: planPrice.amount,
                            currency: planPrice.currency,
                        },
                        "billing.lifetime.paymentRef": paymentRef,
                        "billing.lifetime.paymentMethod": paymentMethod,
                        "billing.lifetime.entitlementPolicy": entitlementPolicy,
                        "billing.lifetime.featureSnapshot": entitlementPolicy === "snapshot" ? (plan.features || []) : [],
                        "billing.lifetime.lifetimeTermsVersion": termsVersion,
                        "billing.lifetime.refundWindowEndsAt": refundEnds,
                        "billing.lifetime.revokedAt": null,
                        "billing.lifetime.revokeReason": null,
                    },
                },
                { new: true, ...opts }
            ).populate("planId");

            if (!updatedTenant) {
                throw new Error("Tenant not found during confirmation.");
            }

            const billingEvent = await BillingEvent.create(
                [
                    {
                        tenantId: updatedTenant._id,
                        type: "purchase",
                        planKey: plan.key,
                        cycle: "lifetime",
                        amount: finalAmount,
                        currency: planPrice.currency,
                        actorId,
                        actorType,
                        externalRef: paymentRef,
                        meta: {
                            termsVersion,
                            entitlementPolicy,
                            refundWindowEndsAt: refundEnds,
                        },
                    },
                ],
                opts
            );

            await AuditLog.create(
                [
                    {
                        tenantId: updatedTenant._id,
                        action: "lifetime_purchased",
                        actor: actorId,
                        actorRole: actorType,
                        targetType: "tenant",
                        targetId: updatedTenant._id.toString(),
                        meta: {
                            planKey: plan.key,
                            amountPaid: finalAmount,
                            currency: planPrice.currency,
                            paymentRef,
                            entitlementPolicy,
                            termsVersion,
                        },
                    },
                ],
                opts
            );

            return {
                tenant: updatedTenant,
                billingEvent: billingEvent[0],
            };
        });

        return result;
    }, { reason: "confirm_lifetime_purchase", actorId: actorId ? actorId.toString() : "system" });
}

/**
 * Upgrade Lifetime subscription from one tier to a higher tier.
 * Computes difference server-side. Downgrades or same-tier requests are strictly rejected.
 */
async function upgradeLifetime({
    tenantId,
    targetPlanKey,
    paymentRef,
    paymentMethod = "manual_transfer",
    actorId,
    actorType = "User",
    termsVersion = "2026.1",
}) {
    return runAsPlatform(async () => {
        const tenant = await Tenant.findById(tenantId).populate("planId");
        if (!tenant) {
            const err = new Error("Tenant not found.");
            err.code = "TENANT_NOT_FOUND";
            throw err;
        }

        if (tenant.billing?.cycle !== "lifetime") {
            const err = new Error("Upgrade path applies to active lifetime subscribers. Current tenant is not lifetime.");
            err.code = "NOT_A_LIFETIME_SUBSCRIBER";
            throw err;
        }

        const currentPlanKey = tenant.planId?.key;
        const currentRank = TIER_RANKS[currentPlanKey] || 0;
        const targetRank = TIER_RANKS[targetPlanKey] || 0;

        if (targetRank <= currentRank) {
            const err = new Error(
                `Downgrade or lateral change is not permitted. Cannot move from ${currentPlanKey} (rank ${currentRank}) to ${targetPlanKey} (rank ${targetRank}).`
            );
            err.code = "DOWNGRADE_NOT_PERMITTED";
            throw err;
        }

        const { plan: targetPlan, planPrice: targetPlanPrice } = await module.exports.resolveActivePlanPrice(targetPlanKey, "lifetime");

        const amountPreviouslyPaid = tenant.billing?.lifetime?.amountPaid || 0;
        const amountDifference = Math.max(0, targetPlanPrice.amount - amountPreviouslyPaid);

        if (amountDifference <= 0) {
            const err = new Error("Target plan price is not greater than the amount already credited.");
            err.code = "INVALID_UPGRADE_DIFFERENCE";
            throw err;
        }

        // Atomic seat reservation on target tier
        const seatCondition = {
            _id: targetPlanPrice._id,
            $or: [
                { maxLifetimeSeats: null },
                { soldLifetimeSeats: { $lt: targetPlanPrice.maxLifetimeSeats } },
            ],
        };

        const targetPriceUpdated = await PlanPrice.findOneAndUpdate(
            seatCondition,
            { $inc: { soldLifetimeSeats: 1 } },
            { new: true }
        );

        if (!targetPriceUpdated) {
            const err = new Error(`LIFETIME_SEATS_SOLD_OUT: All available lifetime seats for ${targetPlan.name} have been claimed.`);
            err.code = "LIFETIME_SEATS_SOLD_OUT";
            throw err;
        }

        const effectivePaymentRef = paymentRef || `UPGRADE-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

        const result = await executeInTransaction(async (session) => {
            const opts = session ? { session } : {};

            const updatedTenant = await Tenant.findByIdAndUpdate(
                tenantId,
                {
                    $set: {
                        planId: targetPlan._id,
                        "billing.lifetime.amountPaid": amountPreviouslyPaid + amountDifference,
                        "billing.lifetime.priceSnapshot": {
                            planPriceId: targetPlanPrice._id,
                            amount: targetPlanPrice.amount,
                            currency: targetPlanPrice.currency,
                        },
                        "billing.lifetime.paymentRef": effectivePaymentRef,
                        "billing.lifetime.paymentMethod": paymentMethod,
                        "billing.lifetime.lifetimeTermsVersion": termsVersion,
                        // If snapshot entitlement policy, refresh snapshot to target tier
                        ...(tenant.billing?.lifetime?.entitlementPolicy === "snapshot"
                            ? { "billing.lifetime.featureSnapshot": targetPlan.features || [] }
                            : {}),
                    },
                },
                { new: true, ...opts }
            ).populate("planId");

            const billingEvent = await BillingEvent.create(
                [
                    {
                        tenantId: updatedTenant._id,
                        type: "upgrade",
                        planKey: targetPlan.key,
                        cycle: "lifetime",
                        amount: amountDifference,
                        currency: targetPlanPrice.currency,
                        actorId,
                        actorType,
                        externalRef: effectivePaymentRef,
                        meta: {
                            previousPlanKey: currentPlanKey,
                            amountPreviouslyPaid,
                            newTotalPaid: amountPreviouslyPaid + amountDifference,
                            termsVersion,
                        },
                    },
                ],
                opts
            );

            await AuditLog.create(
                [
                    {
                        tenantId: updatedTenant._id,
                        action: "lifetime_upgraded",
                        actor: actorId,
                        actorRole: actorType,
                        targetType: "tenant",
                        targetId: updatedTenant._id.toString(),
                        meta: {
                            fromPlan: currentPlanKey,
                            toPlan: targetPlan.key,
                            amountDifference,
                            newTotalPaid: amountPreviouslyPaid + amountDifference,
                        },
                    },
                ],
                opts
            );

            return {
                tenant: updatedTenant,
                billingEvent: billingEvent[0],
                amountDifference,
            };
        });

        return result;
    }, { reason: "upgrade_lifetime", actorId: actorId ? actorId.toString() : "system" });
}

/**
 * Platform Admin: Manually grant lifetime to a tenant.
 * Requires a mandatory reason.
 */
async function grantLifetimeManually({
    tenantId,
    planKey,
    reason,
    actorId,
    entitlementPolicy = "follow_tier",
    amountPaid = 0,
    currency = "USD",
    paymentMethod = "manual_transfer",
    paymentRef,
    termsVersion = "2026.1",
}) {
    if (!reason || reason.trim().length < 5) {
        throw new Error("A specific reason of at least 5 characters is required for manual lifetime grants.");
    }

    return runAsPlatform(async () => {
        const plan = await Plan.findOne({ key: planKey });
        if (!plan) throw new Error(`Plan '${planKey}' not found.`);

        const effectivePaymentRef = paymentRef || `GRANT-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        const now = new Date();

        const result = await executeInTransaction(async (session) => {
            const opts = session ? { session } : {};

            const updatedTenant = await Tenant.findByIdAndUpdate(
                tenantId,
                {
                    $set: {
                        status: "active",
                        planId: plan._id,
                        currentPeriodEnd: null,
                        trialEndsAt: null,
                        "billing.cycle": "lifetime",
                        "billing.lifetime.purchasedAt": now,
                        "billing.lifetime.amountPaid": amountPaid,
                        "billing.lifetime.currency": currency,
                        "billing.lifetime.paymentRef": effectivePaymentRef,
                        "billing.lifetime.paymentMethod": paymentMethod,
                        "billing.lifetime.entitlementPolicy": entitlementPolicy,
                        "billing.lifetime.featureSnapshot": entitlementPolicy === "snapshot" ? (plan.features || []) : [],
                        "billing.lifetime.lifetimeTermsVersion": termsVersion,
                        "billing.lifetime.refundWindowEndsAt": null,
                        "billing.lifetime.revokedAt": null,
                        "billing.lifetime.revokeReason": null,
                    },
                },
                { new: true, ...opts }
            ).populate("planId");

            if (!updatedTenant) throw new Error("Tenant not found.");

            const billingEvent = await BillingEvent.create(
                [
                    {
                        tenantId: updatedTenant._id,
                        type: "manual_grant",
                        planKey: plan.key,
                        cycle: "lifetime",
                        amount: amountPaid,
                        currency,
                        actorId,
                        actorType: "PlatformAdmin",
                        externalRef: effectivePaymentRef,
                        meta: { reason, entitlementPolicy, termsVersion },
                    },
                ],
                opts
            );

            await AuditLog.create(
                [
                    {
                        tenantId: updatedTenant._id,
                        action: "lifetime_granted",
                        actor: actorId,
                        actorRole: "PlatformAdmin",
                        targetType: "tenant",
                        targetId: updatedTenant._id.toString(),
                        meta: { reason, planKey: plan.key, amountPaid, entitlementPolicy },
                    },
                ],
                opts
            );

            return { tenant: updatedTenant, billingEvent: billingEvent[0] };
        });

        return result;
    }, { reason: "manual_lifetime_grant", actorId: actorId ? actorId.toString() : "platformAdmin" });
}

/**
 * Platform Admin: Revoke lifetime subscription.
 * Sets status to "suspended", logs revokeReason, and sets data-export grace period.
 */
async function revokeLifetime({
    tenantId,
    reason,
    actorId,
    refundAmount = 0,
    allowGracePeriodDays = 14,
}) {
    if (!reason || reason.trim().length < 5) {
        throw new Error("A specific reason of at least 5 characters is required for revocation.");
    }

    return runAsPlatform(async () => {
        const tenant = await Tenant.findById(tenantId).populate("planId");
        if (!tenant) throw new Error("Tenant not found.");

        const now = new Date();
        const gracePeriodEndsAt = new Date(now.getTime() + allowGracePeriodDays * 24 * 60 * 60 * 1000);
        const externalRef = `REVOKE-${Date.now()}`;

        const result = await executeInTransaction(async (session) => {
            const opts = session ? { session } : {};

            const updatedTenant = await Tenant.findByIdAndUpdate(
                tenantId,
                {
                    $set: {
                        status: "suspended",
                        "billing.lifetime.revokedAt": now,
                        "billing.lifetime.revokeReason": reason,
                        "billing.lifetime.gracePeriodEndsAt": gracePeriodEndsAt,
                    },
                },
                { new: true, ...opts }
            ).populate("planId");

            const eventType = refundAmount > 0 ? "refund" : "revoke";

            const billingEvent = await BillingEvent.create(
                [
                    {
                        tenantId: updatedTenant._id,
                        type: eventType,
                        planKey: tenant.planId?.key || "unknown",
                        cycle: "lifetime",
                        amount: refundAmount,
                        currency: tenant.billing?.lifetime?.currency || "USD",
                        actorId,
                        actorType: "PlatformAdmin",
                        externalRef,
                        meta: { reason, gracePeriodEndsAt, refundAmount },
                    },
                ],
                opts
            );

            await AuditLog.create(
                [
                    {
                        tenantId: updatedTenant._id,
                        action: "lifetime_revoked",
                        actor: actorId,
                        actorRole: "PlatformAdmin",
                        targetType: "tenant",
                        targetId: updatedTenant._id.toString(),
                        meta: { reason, refundAmount, gracePeriodEndsAt },
                    },
                ],
                opts
            );

            return { tenant: updatedTenant, billingEvent: billingEvent[0], gracePeriodEndsAt };
        });

        return result;
    }, { reason: "revoke_lifetime", actorId: actorId ? actorId.toString() : "platformAdmin" });
}

/**
 * Platform Admin: Update Entitlement Policy (follow_tier <-> snapshot)
 */
async function updateEntitlementPolicy({ tenantId, entitlementPolicy, actorId }) {
    return runAsPlatform(async () => {
        const tenant = await Tenant.findById(tenantId).populate("planId");
        if (!tenant) throw new Error("Tenant not found.");

        const updates = {
            "billing.lifetime.entitlementPolicy": entitlementPolicy,
        };

        if (entitlementPolicy === "snapshot") {
            updates["billing.lifetime.featureSnapshot"] = tenant.planId?.features || [];
        }

        const updated = await Tenant.findByIdAndUpdate(tenantId, { $set: updates }, { new: true }).populate("planId");

        await AuditLog.create({
            tenantId: updated._id,
            action: "entitlement_policy_updated",
            actor: actorId,
            actorRole: "PlatformAdmin",
            targetType: "tenant",
            targetId: updated._id.toString(),
            meta: { entitlementPolicy },
        });

        return updated;
    }, { reason: "update_entitlement_policy", actorId: actorId ? actorId.toString() : "platformAdmin" });
}

module.exports = {
    checkoutLifetime,
    confirmLifetimePurchase,
    upgradeLifetime,
    grantLifetimeManually,
    revokeLifetime,
    updateEntitlementPolicy,
    resolveActivePlanPrice,
};
