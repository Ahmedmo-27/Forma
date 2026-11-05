const Tenant = require("../models/Tenant");
const Member = require("../models/Member");
const User = require("../models/User");
const { getEffectiveFeatures, getEffectiveLimits } = require("../models/Tenant");
const { runAsPlatform } = require("../context/tenantContext");
const { encryptSecret } = require("../utils/tenantCrypto");
const { writeAudit } = require("../utils/audit");

function sanitizeTenantResponse(tenant, plan, usage = {}) {
    const effectiveFeatures = getEffectiveFeatures(tenant, plan);
    const limits = getEffectiveLimits(tenant, plan);

    return {
        id: tenant._id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        trialEndsAt: tenant.trialEndsAt,
        currentPeriodEnd: tenant.currentPeriodEnd,
        plan: plan ? {
            id: plan._id,
            key: plan.key,
            name: plan.name,
            allowedRoles: plan.allowedRoles || [],
        } : null,
        effectiveFeatures,
        limits,
        usage: {
            members: usage.members ?? 0,
            staff: usage.staff ?? 0,
        },
        settings: {
            branding: tenant.settings?.branding || {},
            locale: tenant.settings?.locale || { currency: "EGP", timezone: "Africa/Cairo", language: "en" },
            enabledActivities: tenant.settings?.enabledActivities || [
                "gym", "crossfit", "box", "mma", "kickboxing", "calisthenics",
            ],
            whatsapp: {
                phoneNumberId: tenant.settings?.whatsapp?.phoneNumberId || null,
                businessAccountId: tenant.settings?.whatsapp?.businessAccountId || null,
                hasAccessToken: Boolean(tenant.settings?.whatsapp?.accessToken),
            },
            featureConfig: tenant.settings?.featureConfig || {},
        },
    };
}

/**
 * GET /api/tenant/me
 * Returns current tenant details, branding, plan, effective features, and usage.
 * Secrets (like WhatsApp accessToken) are strictly never returned.
 */
const getMyTenant = async (req, res) => {
    try {
        const tenantId = req.user?.tenantId;
        if (!tenantId) {
            return res.status(400).json({ message: "No tenant context associated with this user" });
        }

        const tenant = await runAsPlatform(async () => {
            return await Tenant.findById(tenantId).populate("planId");
        });

        if (!tenant) {
            return res.status(404).json({ message: "Tenant not found" });
        }

        const [membersCount, staffCount] = await Promise.all([
            Member.countDocuments(),
            User.countDocuments(),
        ]);

        const response = sanitizeTenantResponse(tenant, tenant.planId, {
            members: membersCount,
            staff: staffCount,
        });

        res.json(response);
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * PATCH /api/tenant/me
 * Allows Owner to update branding, locale, enabled activities, and WhatsApp credentials.
 */
const updateMyTenantSettings = async (req, res) => {
    try {
        const tenantId = req.user?.tenantId;
        const tenant = await runAsPlatform(async () => {
            return await Tenant.findById(tenantId).populate("planId");
        });

        if (!tenant) {
            return res.status(404).json({ message: "Tenant not found" });
        }

        const { branding, locale, enabledActivities, whatsapp, featureConfig } = req.body;

        if (branding) {
            tenant.settings.branding = {
                ...tenant.settings.branding.toObject(),
                ...branding,
            };
        }

        if (locale) {
            tenant.settings.locale = {
                ...tenant.settings.locale.toObject(),
                ...locale,
            };
        }

        if (Array.isArray(enabledActivities)) {
            tenant.settings.enabledActivities = enabledActivities;
        }

        if (whatsapp) {
            if (whatsapp.phoneNumberId !== undefined) {
                tenant.settings.whatsapp.phoneNumberId = whatsapp.phoneNumberId;
            }
            if (whatsapp.businessAccountId !== undefined) {
                tenant.settings.whatsapp.businessAccountId = whatsapp.businessAccountId;
            }
            if (whatsapp.accessToken) {
                tenant.settings.whatsapp.accessToken = encryptSecret(whatsapp.accessToken);
            }
        }

        if (featureConfig) {
            tenant.settings.featureConfig = {
                ...tenant.settings.featureConfig,
                ...featureConfig,
            };
        }

        await runAsPlatform(async () => {
            await tenant.save();
        });

        await writeAudit({
            action: "phone_privacy_updated",
            actor: req.user.id,
            actorRole: req.user.role,
            targetType: "tenant",
            targetId: tenant._id.toString(),
            meta: { updatedSettings: Object.keys(req.body) },
            req,
        });

        const [membersCount, staffCount] = await Promise.all([
            Member.countDocuments(),
            User.countDocuments(),
        ]);

        const response = sanitizeTenantResponse(tenant, tenant.planId, {
            members: membersCount,
            staff: staffCount,
        });

        res.json({
            message: "Tenant settings updated successfully",
            tenant: response,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

module.exports = {
    getMyTenant,
    updateMyTenantSettings,
    sanitizeTenantResponse,
};
