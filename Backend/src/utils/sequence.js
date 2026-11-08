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

/**
 * Floor for the next member system id.
 * New gyms start at 100 (S100). If records already exist, the next id is
 * max(100, highest + 1) so numbers are never reused or moved backwards.
 * nextSequence only raises a counter; a counter already above this floor stays there.
 */
function systemIdFloor(highest) {
    const max = Number(highest);
    const top = Number.isFinite(max) && max > 0 ? max : 0;
    return Math.max(100, top + 1);
}

/** Next systemId for a guest/member within the tenant. Displayed as S{n}. */
async function nextSystemId(tenantIdOverride = null) {
    let highest = 0;
    try {
        const Member = require("../models/Member");
        const top = await Member.findOne({ systemId: { $type: "number" } })
            .sort({ systemId: -1 })
            .select("systemId")
            .lean();
        highest = top?.systemId || 0;
    } catch {
        highest = 0;
    }
    return nextSequence("systemId", systemIdFloor(highest), tenantIdOverride);
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

/**
 * Reserve a contiguous block of system ids for one import part.
 * The counter moves forward by `count`. If it would land below the floor,
 * the block starts at the floor instead.
 */
async function reserveSystemIds(count, floor = 100, tenantIdOverride = null) {
    const tenantId = tenantIdOverride || getTenantId();
    if (!tenantId) {
        throw new Error(
            "TenantContextMissingError: Cannot allocate sequence 'systemId' without active tenant context."
        );
    }
    const size = Number(count);
    if (!Number.isInteger(size) || size < 1) {
        throw new Error("Cannot reserve an empty block of system ids");
    }

    const tenantObjId = new mongoose.Types.ObjectId(tenantId);
    const doc = await Counter.findOneAndUpdate(
        { tenantId: tenantObjId, name: "systemId" },
        { $inc: { seq: size } },
        { new: true, upsert: true }
    );

    let end = doc.seq;
    if (end - size + 1 < floor) {
        end = floor + size - 1;
        await Counter.updateOne(
            { tenantId: tenantObjId, name: "systemId" },
            { $set: { seq: end } }
        );
    }

    return { start: end - size + 1, end };
}

module.exports = {
    nextSequence,
    systemIdFloor,
    nextSystemId,
    nextMemberId,
    nextSubscriptionId,
    reserveSystemIds,
    isDuplicateKeyError,
};
