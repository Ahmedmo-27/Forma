const GYM_ROLES = [
    "Owner",
    "General Manager",
    "Receptionist",
    "Coach",
    "Head Coach",
    "Accountant",
    "Sales",
    "Sales Manager",
    "Retail",
];

const MAX_DISMISSED_IDS = 100;

function buildActiveAnnouncementQuery(now = new Date()) {
    return {
        isActive: true,
        startDate: { $lte: now },
        $or: [{ endDate: null }, { endDate: { $gt: now } }],
    };
}

function normalizeId(value) {
    if (value == null) return "";
    if (typeof value === "object" && value._id != null) return String(value._id);
    return String(value);
}

function matchesPlanOrTenant(announcement, { planKey, tenantId }) {
    const target = announcement?.target || {};
    const type = target.type || "all";

    if (type === "all") return true;

    if (type === "plan") {
        const keys = Array.isArray(target.targetPlanKeys) ? target.targetPlanKeys : [];
        if (!keys.length) return false;
        return Boolean(planKey) && keys.includes(planKey);
    }

    if (type === "tenant") {
        const ids = Array.isArray(target.targetTenantIds) ? target.targetTenantIds.map(normalizeId) : [];
        if (!ids.length) return false;
        return Boolean(tenantId) && ids.includes(normalizeId(tenantId));
    }

    return false;
}

function matchesRoles(announcement, role) {
    const roles = Array.isArray(announcement?.target?.targetRoles)
        ? announcement.target.targetRoles.filter(Boolean)
        : [];
    if (!roles.length) return true;
    return Boolean(role) && roles.includes(role);
}

function matchesAudience(announcement, { planKey, tenantId, role } = {}) {
    if (!announcement) return false;
    return matchesPlanOrTenant(announcement, { planKey, tenantId }) && matchesRoles(announcement, role);
}

function filterForUser(list, ctx = {}) {
    if (!Array.isArray(list)) return [];
    return list.filter((item) => matchesAudience(item, ctx));
}

function sanitizeTargetRoles(roles) {
    if (!Array.isArray(roles)) return [];
    const allowed = new Set(GYM_ROLES);
    return [...new Set(roles.map((r) => String(r || "").trim()).filter((r) => allowed.has(r)))];
}

function pruneDismissedIds(ids, max = MAX_DISMISSED_IDS) {
    const normalized = [...new Set((Array.isArray(ids) ? ids : []).map(normalizeId).filter(Boolean))];
    if (normalized.length <= max) return normalized;
    return normalized.slice(normalized.length - max);
}

module.exports = {
    GYM_ROLES,
    MAX_DISMISSED_IDS,
    buildActiveAnnouncementQuery,
    matchesAudience,
    filterForUser,
    sanitizeTargetRoles,
    pruneDismissedIds,
    normalizeId,
};
