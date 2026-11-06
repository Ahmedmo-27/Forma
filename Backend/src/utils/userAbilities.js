const { hasAccess, resolveEffectiveKeys, explicitGrantKeys, navExtrasFor } = require("./accessControl");

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
        base.access = [...resolveEffectiveKeys(user)];
        base.grants = explicitGrantKeys(user);
        base.navExtras = navExtrasFor(user);
    }

    return base;
}

module.exports = { resolveAbilities, formatUserResponse };
