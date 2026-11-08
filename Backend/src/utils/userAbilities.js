const { hasAccess, resolveEffectiveKeys, explicitGrantKeys, navExtrasFor, areaGrantKeys, effectiveAreas } = require("./accessControl");

function resolveAbilities(user) {
    const commentKey = user?.role === "Coach" || user?.role === "Coach Manager"
        ? "coach_notes"
        : "comments";
    return {
        canCommentOnMembers: hasAccess(user, commentKey),
        canRequestAssignment: hasAccess(user, "request_assignment"),
        canRequestTakeover: hasAccess(user, "request_takeover"),
        canSendWhatsAppTemplates: hasAccess(user, "whatsapp_send"),
    };
}

function formatUserResponse(user, options = {}) {
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
        base.abilities = resolveAbilities(user);
    }

    if (user.role === "Sales" || user.role === "Receptionist") {
        base.canViewPhones = hasAccess(user, "view_phones");
    }

    if (options.includeAccess) {
        const context = options.accessContext || null;
        base.access = [...resolveEffectiveKeys(user, context)];
        base.grants = explicitGrantKeys(user);
        base.areaGrants = areaGrantKeys(user, context);
        base.effectiveAreas = context ? effectiveAreas(user, context) : undefined;
        base.navExtras = navExtrasFor(user);
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
