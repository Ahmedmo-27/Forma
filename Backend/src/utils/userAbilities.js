const { hasAccess, resolveEffectiveKeys, explicitGrantKeys, navExtrasFor, areaGrantKeys, effectiveAreas } = require("./accessControl");

function resolveAbilities(user, context) {
    const commentKey = user?.role === "Coach" || user?.role === "Coach Manager"
        ? "coach_notes"
        : "comments";
    const effective = context ? resolveEffectiveKeys(user, context) : null;
    const check = (key) => (effective ? effective.has(key) : hasAccess(user, key));
    return {
        canCommentOnMembers: check(commentKey),
        canRequestAssignment: check("request_assignment"),
        canRequestTakeover: check("request_takeover"),
        canSendWhatsAppTemplates: check("whatsapp_send"),
    };
}

function formatUserResponse(user, options = {}) {
    const context = options.accessContext || null;
    const base = {
        _id: user._id,
        name: user.name,
        email: user.email,
        username: user.username || null,
        mobile_number: user.mobile_number || null,
        role: user.role,
        monthlyTarget: user.monthlyTarget ?? 0,
        createdAt: user.createdAt,
    };

    if (user.role === "Sales" || user.role === "Coach" || user.role === "Coach Manager") {
        base.abilities = resolveAbilities(user, context);
    }

    if (user.role === "Sales" || user.role === "Receptionist") {
        const effective = context ? resolveEffectiveKeys(user, context) : null;
        base.canViewPhones = effective ? effective.has("view_phones") : hasAccess(user, "view_phones");
    }

    if (options.includeAccess) {
        base.access = [...resolveEffectiveKeys(user, context)];
        base.grants = explicitGrantKeys(user);
        base.areaGrants = areaGrantKeys(user, context);
        base.effectiveAreas = context ? effectiveAreas(user, context) : undefined;
        base.navExtras = navExtrasFor(user, context);
    }

    if (user.accessOverrides) {
        base.accessOverrides = {
            add: user.accessOverrides.add || [],
            remove: user.accessOverrides.remove || [],
        };
    }

    return base;
}

module.exports = { resolveAbilities, formatUserResponse };
