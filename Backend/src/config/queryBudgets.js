/** Default maxTimeMS for heavy aggregations (ms). Override with MONGO_QUERY_MAX_TIME_MS. */
function queryMaxTimeMS() {
    const n = Number(process.env.MONGO_QUERY_MAX_TIME_MS);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 30000;
}

/**
 * Apply maxTimeMS when the aggregate cursor supports `.option` (real Mongoose).
 * Test doubles often return a Promise/array without `.option` — leave those alone.
 */
function withQueryMaxTime(aggregate) {
    if (aggregate && typeof aggregate.option === "function") {
        return aggregate.option({ maxTimeMS: queryMaxTimeMS() });
    }
    return aggregate;
}

module.exports = { queryMaxTimeMS, withQueryMaxTime };
