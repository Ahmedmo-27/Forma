function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeUsername(value) {
    return String(value || "").trim().toLowerCase();
}

/** Local-part of an email, safe to store as a username. */
function usernameFromEmail(email) {
    const local = String(email || "").split("@")[0].trim().toLowerCase();
    const cleaned = local.replace(/[^a-z0-9._-]/g, "").replace(/^[._-]+|[._-]+$/g, "");
    return cleaned || "user";
}

/**
 * Pick a username that is free in the current query scope
 * (tenant context when creating staff, platform context at login).
 */
async function uniqueUsername(User, email, { excludeId } = {}) {
    const base = usernameFromEmail(email);
    let candidate = base;
    for (let n = 1; n < 50; n += 1) {
        const query = { username: candidate };
        if (excludeId) query._id = { $ne: excludeId };
        const exists = await User.exists(query);
        if (!exists) return candidate;
        candidate = `${base}${n + 1}`;
    }
    return `${base}${Date.now().toString().slice(-4)}`;
}

module.exports = {
    escapeRegex,
    normalizeUsername,
    usernameFromEmail,
    uniqueUsername,
};
