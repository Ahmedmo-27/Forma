const Plan = require("../models/Plan");

/** Plan schema defaults, so the caps are defined in exactly one place. */
const DEFAULT_CAPS = Object.freeze({
    storageGb: Plan.schema.path("fairUseCaps.storageGb")?.defaultValue ?? 25,
    whatsappMonthlyMessages: Plan.schema.path("fairUseCaps.whatsappMessagesMonthly")?.defaultValue ?? 2000,
});

function positiveOrNull(value) {
    const n = Number(value);
    return value != null && Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Effective fair-use caps for a gym. Order: per-tenant override, then the
 * lifetime purchase's frozen limits, then the plan's fairUseCaps, then the
 * Plan schema default.
 */
function resolveFairUseLimits(tenant, plan) {
    const overrides = tenant?.limitOverrides || {};
    const isLifetime = tenant?.billing?.cycle === "lifetime";
    const lifetime = isLifetime ? tenant?.billing?.lifetime?.fairUseLimits || {} : {};
    const caps = plan?.fairUseCaps || {};

    const storageGb = positiveOrNull(overrides.storageGb)
        ?? (isLifetime ? positiveOrNull(lifetime.storageGbLimit) : null)
        ?? positiveOrNull(caps.storageGb)
        ?? DEFAULT_CAPS.storageGb;

    const whatsappMonthlyMessages = positiveOrNull(overrides.whatsappMonthlyMessages)
        ?? (isLifetime ? positiveOrNull(lifetime.whatsappMessagesMonthlyLimit) : null)
        ?? positiveOrNull(caps.whatsappMessagesMonthly)
        ?? DEFAULT_CAPS.whatsappMonthlyMessages;

    return { storageGb, whatsappMonthlyMessages };
}

module.exports = { resolveFairUseLimits, DEFAULT_CAPS };
