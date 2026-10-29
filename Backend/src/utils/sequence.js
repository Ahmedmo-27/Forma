const Counter = require("../models/Counter");
const Member = require("../models/Member");

async function syncAndIncrement(key, getMax) {
    const max = await getMax();
    await Counter.updateOne({ _id: key }, { $max: { seq: max } }, { upsert: true });
    const doc = await Counter.findOneAndUpdate(
        { _id: key },
        { $inc: { seq: 1 } },
        { new: true }
    );
    return doc.seq;
}

async function nextSystemId() {
    return syncAndIncrement("systemId", async () => {
        const last = await Member.findOne({}, { systemId: 1 }).sort({ systemId: -1 });
        return last?.systemId || 99999;  // starts from 100000
    });
}

async function nextMemberId() {
    return syncAndIncrement("memberId", async () => {
        const last = await Member.findOne({ memberId: { $ne: null } }, { memberId: 1 }).sort({ memberId: -1 });
        return last?.memberId || 99;
    });
}

async function nextSubscriptionId() {
    return syncAndIncrement("subscriptionId", async () => {
        const result = await Member.aggregate([
            { $unwind: "$subscriptions" },
            { $group: { _id: null, maxId: { $max: "$subscriptions.subscriptionId" } } },
        ]);
        return result[0]?.maxId ?? 99;
    });
}

function isDuplicateKeyError(error, fields = []) {
    if (error?.code !== 11000) return false;
    const dupFields = Object.keys(error.keyPattern || {});
    return fields.length === 0 || dupFields.some((f) => fields.includes(f));
}

module.exports = { nextSystemId, nextMemberId, nextSubscriptionId, isDuplicateKeyError };
