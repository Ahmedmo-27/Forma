const logger = require("../utils/logger");
const {
    HostLogError,
    fetchBackendLogs,
    fetchFrontendLogs,
} = require("../services/platformLogsService");

async function respond(res, loader) {
    try {
        const result = await loader();
        res.json(result);
    } catch (err) {
        if (err instanceof HostLogError || err.statusCode === 502) {
            logger.error("platform", "Host log request failed", { message: err.message });
            return res.status(502).json({ message: err.message || "Logs are temporarily unavailable" });
        }
        logger.error("platform", "Platform logs failed");
        return res.status(500).json({ message: "Server error" });
    }
}

function getBackendLogs(req, res) {
    return respond(res, () => fetchBackendLogs(req.query || {}));
}

function getFrontendLogs(req, res) {
    return respond(res, () => fetchFrontendLogs(req.query || {}));
}

module.exports = {
    getBackendLogs,
    getFrontendLogs,
};
