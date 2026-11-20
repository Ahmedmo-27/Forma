const { getEffectiveFeatures } = require("../models/Tenant");

/**
 * Setup steps for a new gym, each derived from data that already exists so the
 * checklist ticks itself off. Must run inside the tenant's context.
 */
async function getOnboardingChecklist(tenant, plan) {
    const Package = require("../models/Package");
    const Member = require("../models/Member");
    const User = require("../models/User");

    const features = new Set(getEffectiveFeatures(tenant, plan));
    const [hasPackage, hasPerson, hasMembership, staffCount] = await Promise.all([
        Package.exists({}),
        Member.exists({}),
        Member.exists({ isMember: true }),
        User.countDocuments(),
    ]);

    const settings = tenant.settings || {};
    const branding = settings.branding || {};
    const whatsapp = settings.whatsapp || {};

    const steps = [
        { key: "branding", done: Boolean(branding.logoKey || branding.displayName) },
        { key: "packages", done: Boolean(hasPackage) },
        { key: "first_member", done: Boolean(hasPerson) },
        { key: "first_membership", done: Boolean(hasMembership) },
        { key: "invite_staff", done: staffCount > 1 },
    ];
    if (features.has("whatsapp")) {
        steps.push({ key: "whatsapp", done: Boolean(whatsapp.phoneNumberId && whatsapp.accessToken) });
    }
    steps.push({ key: "billing_profile", done: Boolean(tenant.billingProfile?.legalName) });

    const completed = steps.filter((step) => step.done).length;
    return {
        steps,
        completed,
        total: steps.length,
        allDone: completed === steps.length,
        dismissedAt: settings.onboarding?.dismissedAt || null,
    };
}

module.exports = { getOnboardingChecklist };
