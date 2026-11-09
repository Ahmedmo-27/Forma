const { ACCESS_CATALOG, GROUP_ORDER, getFeature } = require("../config/accessCatalog");
const {
    featureArea,
    defaultAreasFor,
    resolveEffectiveAreas,
    isLegacyAccess,
    savedAreasFor,
} = require("../config/roleAccess");

const LEGACY_FEATURES = {
    canCommentOnMembers: ["comments", "coach_notes"],
    canRequestAssignment: ["request_assignment"],
    canRequestTakeover: ["request_takeover"],
    canSendWhatsAppTemplates: ["whatsapp_send"],
};

function actorId(user) {
    if (!user) return "";
    return String(user.id || user._id || "");
}

function storedLists(user) {
    const grants = Array.isArray(user?.featureAccess?.grants) ? user.featureAccess.grants : [];
    const revokes = Array.isArray(user?.featureAccess?.revokes) ? user.featureAccess.revokes : [];
    return {
        grants,
        revokes,
        empty: grants.length === 0 && revokes.length === 0,
    };
}

function legacyRevokeSet(user) {
    const set = new Set();
    const abilities = user?.abilities || {};
    for (const [abilityKey, featureKeys] of Object.entries(LEGACY_FEATURES)) {
        if (abilities[abilityKey] === false) {
            featureKeys.forEach((key) => set.add(key));
        }
    }
    if (user?.canViewPhones === false) set.add("view_phones");
    return set;
}

function roleDefaults(role) {
    return defaultAreasFor(role, (featureKey, roleName) => {
        const feature = getFeature(featureKey);
        return Boolean(feature && feature.defaultRoles.includes(roleName));
    });
}

function areaContext(user, context) {
    return {
        role: user?.role,
        roleAccess: context?.roleAccess || null,
        accessOverrides: user?.accessOverrides || context?.accessOverrides || null,
        planFeatures: context?.planFeatures || null,
        defaultAreas: roleDefaults(user?.role),
    };
}

function resolveEffectiveKeys(user, context, options = {}) {
    const role = user?.role;
    const { grants, revokes, empty } = storedLists(user);
    const revokeSet = new Set(revokes);
    // A save computes access from grants and revokes only, then rewrites the
    // legacy ability flags. Reading those flags here would put a cleared
    // restriction straight back.
    if (empty && !options.ignoreLegacy) {
        for (const key of legacyRevokeSet(user)) revokeSet.add(key);
    }
    const grantSet = new Set(grants);
    const keys = new Set();

    for (const feature of ACCESS_CATALOG) {
        const isDefault = feature.defaultRoles.includes(role);
        const granted = grantSet.has(feature.key);
        if (feature.exclusive && granted && !isDefault) continue;
        if (revokeSet.has(feature.key)) continue;
        if (isDefault || granted) keys.add(feature.key);
    }

    if (role === "General Manager") {
        for (const feature of ACCESS_CATALOG) {
            if (feature.key === "settings") continue;
            if (revokeSet.has(feature.key)) continue;
            keys.add(feature.key);
        }
    }

    if (context && role !== "Owner") {
        applyAreaFilter(keys, user, context, revokeSet);
    }

    return keys;
}

function applyAreaFilter(keys, user, context, revokeSet) {
    const ctx = areaContext(user, context);
    if (isLegacyAccess(ctx)) return;
    const areas = new Set(resolveEffectiveAreas(ctx));
    const defaults = new Set(ctx.defaultAreas);
    const { grants } = storedLists(user);
    const grantSet = new Set(grants);
    for (const feature of ACCESS_CATALOG) {
        const area = featureArea(feature.key);
        if (!area) continue;
        if (!areas.has(area)) {
            if (!grantSet.has(feature.key)) {
                keys.delete(feature.key);
            }
            continue;
        }
        const expand = user.role === "General Manager" || !defaults.has(area);
        if (expand && feature.key !== "settings" && !revokeSet.has(feature.key)) {
            keys.add(feature.key);
        }
    }
}

function effectiveAreas(user, context) {
    return resolveEffectiveAreas(areaContext(user, context));
}

function areaGrantKeys(user, context) {
    if (!user || !context || user.role === "Owner") return [];
    const ctx = areaContext(user, context);
    if (isLegacyAccess(ctx)) return [];
    const areas = new Set(resolveEffectiveAreas(ctx));
    const defaults = new Set(ctx.defaultAreas);
    const keys = [];
    for (const feature of ACCESS_CATALOG) {
        if (feature.key === "settings") continue;
        const area = featureArea(feature.key);
        if (!area || !areas.has(area)) continue;
        if (user.role === "General Manager" || !defaults.has(area)) keys.push(feature.key);
    }
    return keys;
}

function hasAccess(user, featureKey) {
    return resolveEffectiveKeys(user).has(featureKey);
}

function isRevoked(user, featureKey) {
    const feature = getFeature(featureKey);
    if (!feature || !user) return false;
    const { revokes, empty } = storedLists(user);
    if (revokes.includes(featureKey)) return true;
    if (empty && legacyRevokeSet(user).has(featureKey) && feature.defaultRoles.includes(user.role)) {
        return true;
    }
    return false;
}

function hasExplicitGrant(user, featureKey) {
    const feature = getFeature(featureKey);
    if (!feature || !user) return false;
    const { grants } = storedLists(user);
    if (!grants.includes(featureKey)) return false;
    if (feature.defaultRoles.includes(user.role)) return false;
    if (feature.exclusive) return false;
    if (isRevoked(user, featureKey)) return false;
    return true;
}

function explicitGrantKeys(user) {
    const keys = [];
    for (const feature of ACCESS_CATALOG) {
        if (hasExplicitGrant(user, feature.key)) keys.push(feature.key);
    }
    return keys;
}

function navExtrasFor(user, context) {
    const effective = resolveEffectiveKeys(user, context);
    return ACCESS_CATALOG
        .filter((feature) => feature.nav && effective.has(feature.key) && (!feature.defaultRoles.includes(user?.role) || hasExplicitGrant(user, feature.key)))
        .map((feature) => ({ key: feature.key, to: feature.nav.to, label: feature.nav.label }));
}

function hasStaffDelegation(actor) {
    if (!actor) return false;
    if (actor.role === "Owner" || actor.role === "General Manager") return true;
    const overrides = actor.accessOverrides?.add || [];
    if (overrides.includes("staff")) return true;
    if (Array.isArray(actor.delegatedAreas) && actor.delegatedAreas.includes("staff")) return true;
    if (actor.canManageAllStaff || actor.hasStaffAccess || actor.hasAccessControlDelegation) return true;
    const grants = actor.featureAccess?.grants || [];
    if (grants.includes("access_control") || grants.includes("staff")) return true;
    return false;
}

function canEditTarget(actor, target) {
    if (!actor || !target) return false;
    if (actorId(actor) && actorId(actor) === actorId(target)) return false;
    if (target.role === "Owner") return actor.role === "Owner";
    if (actor.role === "Owner") return true;
    if (actor.role === "General Manager" || hasStaffDelegation(actor)) {
        return target.role !== "General Manager" && target.role !== "Owner";
    }
    if (actor.role === "Sales Manager") return ["Sales", "Receptionist"].includes(target.role);
    if (actor.role === "Coach Manager") return target.role === "Coach";
    return false;
}

function canEditFeature(actor, feature) {
    if (!actor || !feature) return false;
    if (actor.role === "Owner") return true;
    if (feature.key === "settings") return false;

    const area = featureArea(feature.key);
    if (Array.isArray(actor.areas)) {
        if (!area) return false;
        return actor.areas.includes(area);
    }

    if (actor.role === "General Manager") {
        if (!area) return false;
        return true;
    }
    if (actor.role === "Sales Manager") {
        return feature.domain === "sales";
    }
    if (actor.role === "Coach Manager") {
        return feature.domain === "coach";
    }
    return false;
}

function lockReason(actor, target, feature) {
    if (!canEditTarget(actor, target)) return "You cannot edit this user";
    if (feature.exclusive && !feature.defaultRoles.includes(target.role)) return "This role only";
    if (!canEditFeature(actor, feature)) {
        if (actor.role === "Sales Manager" && !Array.isArray(actor.areas)) return "Sales managers can only change sales features";
        if (actor.role === "Coach Manager" && !Array.isArray(actor.areas)) return "Coach managers can only change coach features";
        return "You cannot change this feature";
    }
    return null;
}

function featureSource(feature, role, enabled) {
    const isDefault = feature.defaultRoles.includes(role);
    if (enabled && !isDefault) return "grant";
    if (!enabled && isDefault) return "revoked";
    return "default";
}

function groupFeaturesFor(actor, target, context) {
    const effective = resolveEffectiveKeys(target, context);
    const grouped = new Map(GROUP_ORDER.map((role) => [role, []]));

    for (const feature of ACCESS_CATALOG) {
        const enabled = effective.has(feature.key);
        const reason = lockReason(actor, target, feature);
        grouped.get(feature.group).push({
            key: feature.key,
            label: feature.label,
            description: feature.description,
            icon: feature.icon,
            planFeature: feature.planFeature || null,
            exclusive: Boolean(feature.exclusive),
            isDefault: feature.defaultRoles.includes(target.role),
            enabled,
            locked: Boolean(reason),
            lockReason: reason,
            source: featureSource(feature, target.role, enabled),
        });
    }

    return GROUP_ORDER
        .map((role) => ({ role, features: grouped.get(role) }))
        .filter((group) => group.features.length > 0);
}

function ensureFeatureAccess(user) {
    if (!user.featureAccess) user.featureAccess = { grants: [], revokes: [] };
    if (!Array.isArray(user.featureAccess.grants)) user.featureAccess.grants = [];
    if (!Array.isArray(user.featureAccess.revokes)) user.featureAccess.revokes = [];
}

function setFeatureEnabled(user, featureKey, enabled) {
    const feature = getFeature(featureKey);
    if (!feature) return;
    ensureFeatureAccess(user);
    const grants = new Set(user.featureAccess.grants);
    const revokes = new Set(user.featureAccess.revokes);
    const isDefault = feature.defaultRoles.includes(user.role);

    if (enabled) {
        revokes.delete(featureKey);
        if (isDefault || feature.exclusive) grants.delete(featureKey);
        else grants.add(featureKey);
    } else {
        grants.delete(featureKey);
        if (isDefault) revokes.add(featureKey);
        else revokes.delete(featureKey);
    }

    user.featureAccess = { grants: [...grants], revokes: [...revokes] };
    if (typeof user.markModified === "function") user.markModified("featureAccess");
}

function featureKeyForAbility(role, abilityKey) {
    if (abilityKey === "canCommentOnMembers" && (role === "Coach" || role === "Coach Manager")) {
        return "coach_notes";
    }
    const list = LEGACY_FEATURES[abilityKey];
    return list ? list[0] : null;
}

function syncLegacyFields(user) {
    const effective = resolveEffectiveKeys(user, null, { ignoreLegacy: true });
    if (!user.abilities) user.abilities = {};
    user.abilities.canCommentOnMembers = effective.has("comments") || effective.has("coach_notes");
    user.abilities.canRequestAssignment = effective.has("request_assignment");
    user.abilities.canRequestTakeover = effective.has("request_takeover");
    user.abilities.canSendWhatsAppTemplates = effective.has("whatsapp_send");
    if (typeof user.markModified === "function") user.markModified("abilities");

    const { grants, revokes } = storedLists(user);
    const touchesPhones = ["Sales", "Receptionist"].includes(user.role)
        || grants.includes("view_phones")
        || revokes.includes("view_phones");
    if (touchesPhones) user.canViewPhones = effective.has("view_phones");
}

const STAFF_ROLES = ["Owner", "General Manager", "Sales Manager", "Sales", "Coach Manager", "Coach", "Receptionist", "Accountant"];

function editableRolesFor(actor) {
    const actorRole = typeof actor === "string" ? actor : actor?.role;
    if (!actorRole) return [];
    if (actorRole === "Owner") return [...STAFF_ROLES];
    if (actorRole === "General Manager" || hasStaffDelegation(actor)) {
        return ["Receptionist", "Coach", "Coach Manager", "Accountant", "Sales", "Sales Manager"];
    }
    if (actorRole === "Sales Manager") return ["Sales", "Receptionist"];
    if (actorRole === "Coach Manager") return ["Coach"];
    return [];
}

/** Roles a person can look up in the access directory. Strictly follows the team hierarchy. */
function directoryRolesFor(actor) {
    return editableRolesFor(actor);
}

const ASSIGNABLE_ROLES = {
    Owner: ["General Manager", "Sales Manager", "Sales", "Coach Manager", "Coach", "Receptionist", "Accountant"],
    "General Manager": ["Sales Manager", "Sales", "Coach Manager", "Coach", "Receptionist", "Accountant"],
    "Sales Manager": ["Sales", "Receptionist"],
    "Coach Manager": ["Coach"],
};

function assignableRolesFor(actor) {
    const actorRole = typeof actor === "string" ? actor : actor?.role;
    if (!actorRole) return [];
    if (actorRole === "Owner") {
        return ["General Manager", "Sales Manager", "Sales", "Coach Manager", "Coach", "Receptionist", "Accountant"];
    }
    if (actorRole === "General Manager" || hasStaffDelegation(actor)) {
        return ["Sales Manager", "Sales", "Coach Manager", "Coach", "Receptionist", "Accountant"];
    }
    return ASSIGNABLE_ROLES[actorRole] ? [...ASSIGNABLE_ROLES[actorRole]] : [];
}

/**
 * Strict role hierarchy:
 * 1. Owner at top: can change any role below Owner. Nobody can change an Owner's role.
 * 2. General Manager & delegated staff: can change roles below GM (cannot change Owner or GM).
 * 3. Sales Manager & Coach Manager: maintain their own teams only (unless granted staff delegation).
 *    - Sales Manager can only change members of their team (Sales, Receptionist) to a role in their team.
 *    - Coach Manager can only change members of their team (Coach) to a role in their team.
 * 4. Nobody can change their own role, and nobody can assign the "Owner" role.
 */
function canAssignRole(actor, target, newRole) {
    if (!actor || !target) return { ok: false, status: 403, message: "Not authorized" };
    if (actorId(actor) && actorId(actor) === actorId(target)) {
        return { ok: false, status: 403, message: "You cannot change your own role" };
    }
    if (target.role === "Owner") {
        return { ok: false, status: 403, message: "The Owner role cannot be changed" };
    }
    if (newRole === "Owner") {
        return { ok: false, status: 400, message: "That role cannot be assigned" };
    }
    const hasStaff = hasStaffDelegation(actor);
    const allowed = assignableRolesFor(actor);
    if (!allowed.length) return { ok: false, status: 403, message: "Not authorized" };
    if (!allowed.includes(newRole)) {
        return { ok: false, status: 400, message: "That role cannot be assigned" };
    }
    if (actor.role === "General Manager" || hasStaff) {
        if (target.role === "General Manager" && actor.role !== "Owner") {
            return { ok: false, status: 403, message: "Only the owner can change a General Manager" };
        }
        if (!editableRolesFor(actor).includes(target.role)) {
            return { ok: false, status: 403, message: "You cannot change this user's role" };
        }
    }
    if (actor.role === "Sales Manager" && !hasStaff) {
        if (!["Sales", "Receptionist"].includes(target.role)) {
            return { ok: false, status: 403, message: "Sales managers can only change roles for their own team" };
        }
    }
    if (actor.role === "Coach Manager" && !hasStaff) {
        if (target.role !== "Coach") {
            return { ok: false, status: 403, message: "Coach managers can only change roles for their own team" };
        }
    }
    return { ok: true };
}

/**
 * Diff a confirmed enabled-key list into grants and revokes.
 * Features the actor cannot edit keep their current grant or revoke.
 * Returns { error } or { grants, revokes }.
 */
function diffConfirmedFeatures(actor, target, requestedKeys, context) {
    const requested = new Set(Array.isArray(requestedKeys) ? requestedKeys : []);
    const unknown = [...requested].filter((key) => !getFeature(key));
    if (unknown.length) {
        return { error: `Unknown feature: ${unknown[0]}` };
    }

    const { grants, revokes, empty } = storedLists(target);
    const legacy = empty ? legacyRevokeSet(target) : new Set();
    const nextGrants = [];
    const nextRevokes = [];

    const targetCtx = context ? areaContext(target, context) : null;
    const targetEffectiveAreas = targetCtx && !isLegacyAccess(targetCtx)
        ? new Set(resolveEffectiveAreas(targetCtx))
        : null;

    for (const feature of ACCESS_CATALOG) {
        let isDefault = feature.defaultRoles.includes(target.role);
        if (targetEffectiveAreas) {
            const area = featureArea(feature.key);
            if (area) {
                if (!targetEffectiveAreas.has(area)) {
                    isDefault = false;
                } else if (targetEffectiveAreas.has(area) && !isDefault && feature.key !== "settings") {
                    isDefault = true;
                }
            }
        }

        const editable = canEditFeature(actor, feature);
        const lockedExclusive = feature.exclusive && !feature.defaultRoles.includes(target.role);

        if (!editable || lockedExclusive) {
            if (requested.has(feature.key) && lockedExclusive && editable) {
                return { error: `${feature.label} is limited to its default role` };
            }
            if (grants.includes(feature.key)) nextGrants.push(feature.key);
            else if (revokes.includes(feature.key) || legacy.has(feature.key)) nextRevokes.push(feature.key);
            continue;
        }

        const wants = requested.has(feature.key);
        if (wants && !isDefault) nextGrants.push(feature.key);
        // A restored default must be stored, or an old ability flag keeps it off.
        if (wants && isDefault && legacy.has(feature.key)) nextGrants.push(feature.key);
        if (!wants && isDefault) nextRevokes.push(feature.key);
    }

    return { grants: nextGrants, revokes: nextRevokes };
}

function memberListDecision(user, context) {
    const role = user?.role;
    if (context) {
        const ctx = areaContext(user, context);
        const areas = new Set(resolveEffectiveAreas(ctx));
        if (!areas.has("members")) {
            if (role === "Sales" && areas.has("sales") && !isRevoked(user, "sales_members")) return "scoped";
            if ((role === "Coach" || role === "Coach Manager") && areas.has("coaching") && !isRevoked(user, "coach_members")) return "scoped";
            return "deny";
        }
    }
    if (hasExplicitGrant(user, "members")) return "all";
    if (role === "Sales") {
        if (isRevoked(user, "sales_members")) return "deny";
        return "scoped";
    }
    if (role === "Sales Manager") {
        if (isRevoked(user, "members")) return "deny";
        return "scoped";
    }
    if (role === "Coach" || role === "Coach Manager") {
        if (isRevoked(user, "coach_members")) return "deny";
        return "scoped";
    }
    if (role === "Owner" || role === "General Manager" || role === "Accountant" || role === "Receptionist") {
        if (isRevoked(user, "members")) return "deny";
        return "all";
    }
    if (hasExplicitGrant(user, "sales_members") || hasExplicitGrant(user, "coach_members")) return "scoped";
    return "deny";
}

module.exports = {
    resolveEffectiveKeys,
    effectiveAreas,
    areaGrantKeys,
    roleDefaults,
    savedAreasFor,
    hasAccess,
    isRevoked,
    hasExplicitGrant,
    explicitGrantKeys,
    navExtrasFor,
    canEditTarget,
    canEditFeature,
    lockReason,
    groupFeaturesFor,
    setFeatureEnabled,
    featureKeyForAbility,
    syncLegacyFields,
    editableRolesFor,
    directoryRolesFor,
    assignableRolesFor,
    canAssignRole,
    diffConfirmedFeatures,
    memberListDecision,
};
