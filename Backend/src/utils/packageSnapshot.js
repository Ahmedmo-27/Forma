/**
 * Freeze package terms at purchase time so later catalog edits
 * cannot rewrite what a member paid for.
 */

const SNAPSHOT_FIELDS = [
    "name",
    "activityType",
    "duration",
    "price",
    "freezeLimitDays",
    "invitationLimit",
    "renewalDiscountPercent",
    "description",
    "hasException",
    "free_pt_sessions",
    "locationScope",
    "eligibleLocationIds",
];

/**
 * Build an immutable packageSnapshot from a Package document or plain terms object.
 */
function buildPackageSnapshot(source) {
    if (!source) return null;

    const plain = typeof source.toObject === "function" ? source.toObject() : source;
    const locationScope = plain.locationScope === "branches" ? "branches" : "all";
    const eligibleLocationIds = Array.isArray(plain.eligibleLocationIds)
        ? plain.eligibleLocationIds.map((id) => id?._id || id).filter(Boolean)
        : [];

    return {
        name: plain.name,
        activityType: plain.activityType ?? "gym",
        duration: plain.duration,
        price: Number(plain.price) || 0,
        freezeLimitDays: Number(plain.freezeLimitDays) || 0,
        invitationLimit: Number(plain.invitationLimit) || 0,
        renewalDiscountPercent: Number(plain.renewalDiscountPercent) || 0,
        description: plain.description ?? null,
        hasException: Boolean(plain.hasException),
        free_pt_sessions: Number(plain.free_pt_sessions) || 0,
        locationScope,
        eligibleLocationIds: locationScope === "branches" ? eligibleLocationIds : [],
    };
}

function isPopulatedPackage(pkg) {
    if (!pkg || typeof pkg !== "object") return false;
    // Unpopulated ObjectId / BSON id — not a package document
    if (pkg._bsontype === "ObjectId" || pkg.constructor?.name === "ObjectId") return false;
    return pkg.name != null || pkg.price != null || pkg.duration != null;
}

function packageRefId(pkg) {
    if (!pkg) return null;
    if (typeof pkg !== "object") return pkg;
    if (pkg._id) return pkg._id;
    if (pkg._bsontype === "ObjectId" || pkg.constructor?.name === "ObjectId") return pkg;
    return null;
}

/**
 * Resolve the package terms a member actually purchased.
 * Prefer packageSnapshot; fall back to the live package ref for legacy rows.
 */
function resolveSubscriptionPackage(sub) {
    if (!sub) return null;

    const live = isPopulatedPackage(sub.package)
        ? (typeof sub.package.toObject === "function" ? sub.package.toObject() : sub.package)
        : null;

    const snap =
        sub.packageSnapshot && typeof sub.packageSnapshot === "object"
            ? (typeof sub.packageSnapshot.toObject === "function"
                ? sub.packageSnapshot.toObject()
                : sub.packageSnapshot)
            : null;

    if (!snap && !live) return null;

    const merged = {
        ...(live || {}),
        ...(snap || {}),
    };

    const refId = packageRefId(sub.package) || live?._id;
    if (refId) merged._id = refId;

    return merged;
}

module.exports = {
    SNAPSHOT_FIELDS,
    buildPackageSnapshot,
    resolveSubscriptionPackage,
};
