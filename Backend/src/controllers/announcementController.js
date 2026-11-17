const Announcement = require("../models/Announcement");
const User = require("../models/User");
const { runAsPlatform } = require("../context/tenantContext");
const {
    buildActiveAnnouncementQuery,
    filterForUser,
    pruneDismissedIds,
    normalizeId,
} = require("../utils/announcementAudience");

const TYPE_ORDER = { feature: 0, warning: 1, maintenance: 2, info: 3 };

function audienceContext(req) {
    const plan = req.plan || req.tenant?.planId || null;
    return {
        planKey: plan?.key || null,
        tenantId: req.user?.tenantId || req.tenant?._id || null,
        role: req.user?.role || null,
    };
}

function sortAnnouncements(items) {
    return [...items].sort((a, b) => {
        const typeDiff = (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9);
        if (typeDiff !== 0) return typeDiff;
        return new Date(b.startDate || b.createdAt || 0) - new Date(a.startDate || a.createdAt || 0);
    });
}

function dismissedSet(user) {
    return new Set((user?.dismissedAnnouncementIds || []).map(normalizeId));
}

async function loadActiveForUser(req) {
    const rows = await runAsPlatform(async () => {
        return Announcement.find(buildActiveAnnouncementQuery())
            .select("title message type startDate endDate createdAt target")
            .sort({ startDate: -1 })
            .lean();
    });

    return sortAnnouncements(filterForUser(rows, audienceContext(req)));
}

/**
 * GET /api/announcements
 * Active announcements for the current user's plan + tenant + role.
 * Each item includes `dismissed`. Pass ?includeDismissed=true for history.
 */
async function listAnnouncements(req, res) {
    try {
        const includeDismissed = String(req.query.includeDismissed || "") === "true";
        const user = await User.findById(req.user.id).select("dismissedAnnouncementIds").lean();
        const dismissed = dismissedSet(user);
        const matched = await loadActiveForUser(req);

        const items = matched
            .map((row) => {
                const id = normalizeId(row._id);
                return {
                    _id: row._id,
                    title: row.title,
                    message: row.message,
                    type: row.type,
                    startDate: row.startDate,
                    endDate: row.endDate,
                    createdAt: row.createdAt,
                    dismissed: dismissed.has(id),
                };
            })
            .filter((row) => includeDismissed || !row.dismissed);

        const unreadCount = matched.filter((row) => !dismissed.has(normalizeId(row._id))).length;

        res.json({
            announcements: items,
            unreadCount,
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

/**
 * POST /api/announcements/:id/dismiss
 */
async function dismissAnnouncement(req, res) {
    try {
        const id = normalizeId(req.params.id);
        if (!id) return res.status(400).json({ message: "Announcement id is required" });

        const matched = await loadActiveForUser(req);
        const visible = matched.find((row) => normalizeId(row._id) === id);
        if (!visible) {
            return res.status(404).json({ message: "Announcement not found" });
        }

        const user = await User.findById(req.user.id).select("dismissedAnnouncementIds");
        if (!user) return res.status(404).json({ message: "User not found" });

        const next = pruneDismissedIds([
            ...(user.dismissedAnnouncementIds || []).map(normalizeId),
            id,
        ]);
        user.dismissedAnnouncementIds = next;
        await user.save();

        res.json({ ok: true, dismissedId: id });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

/**
 * POST /api/announcements/dismiss-all
 */
async function dismissAllAnnouncements(req, res) {
    try {
        const matched = await loadActiveForUser(req);
        const ids = matched.map((row) => normalizeId(row._id)).filter(Boolean);

        const user = await User.findById(req.user.id).select("dismissedAnnouncementIds");
        if (!user) return res.status(404).json({ message: "User not found" });

        const next = pruneDismissedIds([
            ...(user.dismissedAnnouncementIds || []).map(normalizeId),
            ...ids,
        ]);
        user.dismissedAnnouncementIds = next;
        await user.save();

        res.json({ ok: true, dismissedCount: ids.length });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

module.exports = {
    listAnnouncements,
    dismissAnnouncement,
    dismissAllAnnouncements,
};
