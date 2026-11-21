const { isPlatformContext, runAsPlatform } = require("../context/tenantContext");

const USERNAME_MIN = 3;
const USERNAME_MAX = 30;
/** Instagram-style: letters, numbers, periods, underscores. */
const USERNAME_BODY_RE = /^[a-z0-9._]+$/;

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeUsername(value) {
    return String(value || "").trim().toLowerCase();
}

/**
 * Validate a chosen username (create / self-edit).
 * Returns { ok: true, username } or { ok: false, message }.
 */
function validateUsernameFormat(value) {
    const username = normalizeUsername(value);
    if (!username) {
        return { ok: false, message: "Username is required" };
    }
    if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
        return {
            ok: false,
            message: `Username must be between ${USERNAME_MIN} and ${USERNAME_MAX} characters`,
        };
    }
    if (!USERNAME_BODY_RE.test(username)) {
        return {
            ok: false,
            message: "Username can only use letters, numbers, periods, and underscores",
        };
    }
    if (username.startsWith(".") || username.endsWith(".")) {
        return { ok: false, message: "Username cannot start or end with a period" };
    }
    if (username.includes("..")) {
        return { ok: false, message: "Username cannot contain consecutive periods" };
    }
    return { ok: true, username };
}

/** Local-part of an email, safe to store as a username. */
function usernameFromEmail(email) {
    const local = String(email || "").split("@")[0].trim().toLowerCase();
    const cleaned = local.replace(/[^a-z0-9._-]/g, "").replace(/^[._-]+|[._-]+$/g, "");
    return cleaned || "user";
}

/**
 * Return the first free username for `base`, trying base, base2, base3, ...
 * Checked across every gym, because login resolves usernames globally.
 */
async function allocateFreeUsername(User, base, { excludeId } = {}) {
    const allocate = async () => {
        let candidate = base;
        for (let n = 1; n < 50; n += 1) {
            const query = { username: candidate };
            if (excludeId) query._id = { $ne: excludeId };
            const exists = await User.findOne(query);
            if (!exists) return candidate;
            candidate = `${base}${n + 1}`;
        }
        return `${base}${Date.now().toString().slice(-4)}`;
    };

    if (isPlatformContext()) return allocate();
    return runAsPlatform(allocate, { reason: "allocate globally unique username" });
}

/**
 * Pick a username that is free across every gym.
 * Used when there is no tenant yet (e.g. self-registration).
 */
async function uniqueUsername(User, email, { excludeId } = {}) {
    return allocateFreeUsername(User, usernameFromEmail(email), { excludeId });
}

/**
 * First and last word of a person's name, lowercased and joined with a dot:
 * "Ahmed Mohamed Hassan" -> "ahmed.hassan". Letters from any script are kept, so
 * Arabic names work. Returns "" when nothing usable is left.
 */
function usernameFromName(name) {
    const words = String(name || "")
        .normalize("NFKC")
        .toLowerCase()
        .replace(/['’`]/g, "") // apostrophes vanish: "O'Brien" -> "obrien"
        .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, " ")
        .split(/\s+/)
        .map((word) => word.replace(/^-+|-+$/g, ""))
        .filter(Boolean);
    if (!words.length) return "";
    const picked = words.length > 1 ? [words[0], words[words.length - 1]] : words;
    return picked.join(".");
}

/**
 * Tenant-scoped username: `<gym slug>.<first.last name>`, e.g. "fouda-gym.ahmed.hassan".
 * The gym slug is unique per gym, so names never clash across gyms. A second person
 * with the same name in the same gym gets a numeric suffix ("fouda-gym.ahmed.hassan2").
 *
 * If the name has no usable letters, the email local-part is used instead.
 * If the tenant has no slug, this falls back to uniqueUsername.
 */
async function tenantUsername(User, tenant, { name, email } = {}, { excludeId } = {}) {
    const slug = String(tenant?.slug || "").trim().toLowerCase();
    if (!slug) return uniqueUsername(User, email, { excludeId });
    const personPart = usernameFromName(name) || usernameFromEmail(email);
    return allocateFreeUsername(User, `${slug}.${personPart}`, { excludeId });
}

/**
 * True when no other user owns this username (optionally excluding one id).
 * Checked across every gym — login resolves usernames globally.
 */
async function isUsernameTaken(User, username, { excludeId } = {}) {
    const check = async () => {
        const query = { username };
        if (excludeId) query._id = { $ne: excludeId };
        return Boolean(await User.findOne(query));
    };
    if (isPlatformContext()) return check();
    return runAsPlatform(check, { reason: "check globally unique username" });
}

/**
 * Claim a custom username, or fall back to the tenant auto-username.
 * `rawUsername` empty/undefined → auto. Otherwise format + uniqueness must pass.
 */
async function resolveUsername(User, tenant, { name, email, username: rawUsername } = {}, { excludeId } = {}) {
    const trimmed = String(rawUsername || "").trim();
    if (!trimmed) {
        return tenantUsername(User, tenant, { name, email }, { excludeId });
    }

    const parsed = validateUsernameFormat(trimmed);
    if (!parsed.ok) {
        const error = new Error(parsed.message);
        error.statusCode = 400;
        error.code = "INVALID_USERNAME";
        throw error;
    }

    if (await isUsernameTaken(User, parsed.username, { excludeId })) {
        const error = new Error("This username is already in use.");
        error.statusCode = 409;
        error.code = "CONFLICT_DUPLICATE";
        error.field = "username";
        throw error;
    }

    return parsed.username;
}

module.exports = {
    USERNAME_MIN,
    USERNAME_MAX,
    escapeRegex,
    normalizeUsername,
    validateUsernameFormat,
    usernameFromEmail,
    usernameFromName,
    uniqueUsername,
    tenantUsername,
    isUsernameTaken,
    resolveUsername,
};
