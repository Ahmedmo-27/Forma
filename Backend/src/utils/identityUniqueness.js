const { isPlatformContext, runAsPlatform } = require("../context/tenantContext");
const { normalizeEmail } = require("./passwordUtils");
const { toWhatsAppDigits } = require("../services/whatsapp/phone");

const FIELD_LABELS = {
    email: "email",
    username: "username",
    phone: "phone number",
    phoneKey: "phone number",
    mobile_number: "phone number",
    phones: "phone number",
};

function normalizePhone(value) {
    const raw = String(value ?? "").trim();
    if (!raw || raw === "hidden") return "";
    return toWhatsAppDigits(raw) || raw.replace(/\D/g, "");
}

/** Stored and canonical forms that should count as the same phone. */
function phoneCandidates(value) {
    const values = new Set();
    const trimmed = String(value ?? "").trim();
    if (trimmed && trimmed !== "hidden") values.add(trimmed);

    const digits = trimmed.replace(/\D/g, "");
    if (digits) {
        values.add(digits);
        if (digits.startsWith("00")) values.add(digits.slice(2));
    }

    const canonical = normalizePhone(value);
    if (canonical) {
        values.add(canonical);
        if (canonical.startsWith("20") && canonical.length > 2) {
            const local = canonical.slice(2);
            values.add(local);
            values.add(`0${local}`);
            values.add(`+${canonical}`);
            values.add(`00${canonical}`);
        }
    }

    return [...values].filter(Boolean);
}

function duplicateError(field) {
    const label = FIELD_LABELS[field] || "value";
    const error = new Error(`This ${label} is already in use.`);
    error.statusCode = 409;
    error.code = "CONFLICT_DUPLICATE";
    error.field = field === "phoneKey" || field === "mobile_number" || field === "phones" ? "phone" : field;
    return error;
}

async function unscoped(fn) {
    if (isPlatformContext()) return fn();
    return runAsPlatform(fn, { reason: "global identity uniqueness check" });
}

function models() {
    return {
        User: require("../models/User"),
        Member: require("../models/Member"),
        PlatformUser: require("../models/PlatformUser"),
    };
}

async function assertUsernameAvailable(username, { excludeUserId } = {}) {
    const { normalizeUsername, validateUsernameFormat } = require("./username");
    const parsed = validateUsernameFormat(username);
    if (!parsed.ok) {
        const error = new Error(parsed.message);
        error.statusCode = 400;
        error.code = "INVALID_USERNAME";
        throw error;
    }

    const normalized = normalizeUsername(parsed.username);
    const { User } = models();
    const taken = await unscoped(async () => {
        const query = { username: normalized };
        if (excludeUserId) query._id = { $ne: excludeUserId };
        return Boolean(await User.findOne(query).select("_id"));
    });

    if (taken) throw duplicateError("username");
    return normalized;
}

async function assertEmailAvailable(email, { excludeUserId, excludePlatformUserId } = {}) {
    const normalized = normalizeEmail(email);
    if (!normalized) return normalized;

    const { User, PlatformUser } = models();
    const taken = await unscoped(async () => {
        const userQuery = { email: normalized };
        if (excludeUserId) userQuery._id = { $ne: excludeUserId };
        const user = await User.findOne(userQuery);
        if (user) return true;

        const platformQuery = { email: normalized };
        if (excludePlatformUserId) platformQuery._id = { $ne: excludePlatformUserId };
        const platformUser = await PlatformUser.findOne(platformQuery);
        return Boolean(platformUser);
    });

    if (taken) throw duplicateError("email");
    return normalized;
}

/**
 * Look up who holds a phone globally (staff user or member).
 * Returns { kind: null| "user"|"member", phoneKey, doc?, tenantId? }.
 */
async function findPhoneConflict(phone, { excludeUserId, excludeMemberId } = {}) {
    const phoneKey = normalizePhone(phone);
    if (!phoneKey) {
        const error = new Error("A valid phone number is required");
        error.statusCode = 400;
        error.code = "INVALID_PHONE";
        throw error;
    }

    const candidates = phoneCandidates(phone);
    const { User, Member } = models();
    return unscoped(async () => {
        const userQuery = {
            $or: [
                { phoneKey: { $in: candidates } },
                { mobile_number: { $in: candidates } },
            ],
        };
        if (excludeUserId) userQuery._id = { $ne: excludeUserId };
        const user = await User.findOne(userQuery)
            .select("_id tenantId phoneKey mobile_number name");
        if (user) {
            return { kind: "user", phoneKey, doc: user, tenantId: user.tenantId || null };
        }

        const memberQuery = {
            $or: [
                { phoneKey: { $in: candidates } },
                { phones: { $in: candidates } },
            ],
        };
        if (excludeMemberId) memberQuery._id = { $ne: excludeMemberId };
        const member = await Member.findOne(memberQuery)
            .select("_id tenantId systemId name locationId locationIds phones phoneKey");
        if (member) {
            return { kind: "member", phoneKey, doc: member, tenantId: member.tenantId || null };
        }

        return { kind: null, phoneKey, doc: null, tenantId: null };
    });
}

async function assertPhoneAvailable(phone, { excludeUserId, excludeMemberId } = {}) {
    const conflict = await findPhoneConflict(phone, { excludeUserId, excludeMemberId });
    if (conflict.kind) throw duplicateError("phone");
    return conflict.phoneKey;
}

async function takenPhoneSet(phones) {
    const candidates = [...new Set(phones.flatMap((phone) => phoneCandidates(phone)))];
    if (!candidates.length) return new Set();

    const { User, Member } = models();
    return unscoped(async () => {
        const [members, users] = await Promise.all([
            Member.find({
                $or: [
                    { phoneKey: { $in: candidates } },
                    { phones: { $in: candidates } },
                ],
            }).select("phones phoneKey").lean(),
            User.find({
                $or: [
                    { phoneKey: { $in: candidates } },
                    { mobile_number: { $in: candidates } },
                ],
            }).select("mobile_number phoneKey").lean(),
        ]);

        const taken = new Set();
        for (const member of members) {
            for (const value of phoneCandidates(member.phoneKey || member.phones)) taken.add(value);
        }
        for (const user of users) {
            for (const value of phoneCandidates(user.phoneKey || user.mobile_number)) taken.add(value);
        }
        return taken;
    });
}

function phoneAlreadyUsed(taken, phone) {
    return phoneCandidates(phone).some((value) => taken.has(value));
}

function replyIfConflict(res, error) {
    if (error?.statusCode === 409) {
        res.status(409).json({
            code: error.code || "CONFLICT_DUPLICATE",
            message: error.message,
            field: error.field,
        });
        return true;
    }

    if (error?.code === 11000) {
        const raw = Object.keys(error.keyPattern || {}).find((key) => key !== "tenantId") || "record";
        const field = FIELD_LABELS[raw] ? (raw === "email" || raw === "username" ? raw : "phone") : "record";
        const label = FIELD_LABELS[raw] || "value";
        res.status(409).json({
            code: "CONFLICT_DUPLICATE",
            message: `This ${label} is already in use.`,
            field,
        });
        return true;
    }

    if (error?.statusCode === 400 && (error.code === "INVALID_PHONE" || error.code === "INVALID_USERNAME")) {
        res.status(400).json({ message: error.message, code: error.code, field: error.field || (error.code === "INVALID_USERNAME" ? "username" : undefined) });
        return true;
    }

    return false;
}

module.exports = {
    normalizePhone,
    phoneCandidates,
    assertEmailAvailable,
    assertUsernameAvailable,
    findPhoneConflict,
    assertPhoneAvailable,
    takenPhoneSet,
    phoneAlreadyUsed,
    replyIfConflict,
};
