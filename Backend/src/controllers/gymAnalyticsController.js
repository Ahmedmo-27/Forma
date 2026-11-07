const analytics = require("../services/gymAnalyticsService");

function clampInt(value, fallback, min, max) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function parseQueryDate(value, endOfDay) {
    if (!value) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
    if (match) {
        const year = Number(match[1]);
        const month = Number(match[2]) - 1;
        const day = Number(match[3]);
        return endOfDay
            ? new Date(year, month, day, 23, 59, 59, 999)
            : new Date(year, month, day, 0, 0, 0, 0);
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function funnelRange(query) {
    const now = new Date();
    let from = parseQueryDate(query.from, false) || new Date(now.getFullYear(), now.getMonth(), 1);
    let to = parseQueryDate(query.to, true) || new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    if (from > to) {
        const swap = from;
        from = new Date(to.getFullYear(), to.getMonth(), to.getDate());
        to = new Date(swap.getFullYear(), swap.getMonth(), swap.getDate(), 23, 59, 59, 999);
    }
    const includeImported = query.includeImported === "1" || query.includeImported === "true";
    return { from, to, includeImported };
}

const getChurn = async (req, res) => {
    try {
        const months = clampInt(req.query.months, 12, 1, 24);
        res.json(await analytics.getChurn({ months }));
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

const getForecast = async (req, res) => {
    try {
        res.json(await analytics.getForecast());
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

const getCohorts = async (req, res) => {
    try {
        const months = clampInt(req.query.months, 12, 1, 24);
        res.json(await analytics.getCohorts({ months }));
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

const getAttendance = async (req, res) => {
    try {
        const weeks = clampInt(req.query.weeks, 8, 1, 26);
        res.json(await analytics.getAttendance({ weeks }));
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

const getFunnel = async (req, res) => {
    try {
        res.json(await analytics.getFunnel(funnelRange(req.query)));
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

const getExecutive = async (req, res) => {
    try {
        res.json(await analytics.getExecutive());
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

module.exports = {
    getChurn,
    getForecast,
    getCohorts,
    getAttendance,
    getFunnel,
    getExecutive,
};
