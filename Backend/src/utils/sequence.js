const mongoose = require("mongoose");
const Counter = require("../models/Counter");
const { getTenantId } = require("../context/tenantContext");

/**
 * Atomically increment and return the next per-tenant sequence number.
 * Uses atomic findOneAndUpdate with upsert and $inc.
 *
 * @param {string} name - Sequence key name ("systemId", "memberId", "subscriptionId")
 * @param {number} startingFloor - Minimum starting value when initialized
 * @param {string} [tenantIdOverride] - Explicit tenantId if called from migrations/scripts
 * @returns {Promise<number>}
 */
async function nextSequence(name, startingFloor = 100, tenantIdOverride = null) {
    const tenantId = tenantIdOverride || getTenantId();
    if (!tenantId) {
        throw new Error(
            `TenantContextMissingError: Cannot allocate sequence '${name}' without active tenant context.`
        );
    }

    const tenantObjId = new mongoose.Types.ObjectId(tenantId);

    const doc = await Counter.findOneAndUpdate(
        { tenantId: tenantObjId, name },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );

    if (doc.seq < startingFloor) {
        const adjusted = await Counter.findOneAndUpdate(
            { tenantId: tenantObjId, name, seq: { $lt: startingFloor } },
            { $set: { seq: startingFloor } },
            { new: true }
        );
        return adjusted ? adjusted.seq : doc.seq;
    }

    return doc.seq;
}

/** Next systemId for a guest/member within the tenant (starts from 100000) */
async function nextSystemId(tenantIdOverride = null) {
    return nextSequence("systemId", 100000, tenantIdOverride);
}

/** Next memberId for subscribed members within the tenant (starts from 100) */
async function nextMemberId(tenantIdOverride = null) {
    return nextSequence("memberId", 100, tenantIdOverride);
}

/** Next subscriptionId for member packages within the tenant (starts from 100) */
async function nextSubscriptionId(tenantIdOverride = null) {
    return nextSequence("subscriptionId", 100, tenantIdOverride);
}

/**
 * Check if a Mongo error is duplicate key error (code 11000),
 * optionally scoped to specific fields.
 */
function isDuplicateKeyError(error, fields = []) {
    if (error?.code !== 11000) return false;
    const dupFields = Object.keys(error.keyPattern || {});
    return fields.length === 0 || dupFields.some((f) => fields.includes(f));
}

module.exports = {
    nextSequence,
    nextSystemId,
    nextMemberId,
    nextSubscriptionId,
    isDuplicateKeyError,
};
