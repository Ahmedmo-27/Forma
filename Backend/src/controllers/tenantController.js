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

    const isLifetime = tenant?.billing?.cycle === "lifetime";
    const lifetimeDetails = isLifetime && tenant?.billing?.lifetime ? {
        purchasedAt: tenant.billing.lifetime.purchasedAt,
        amountPaid: tenant.billing.lifetime.amountPaid,
        currency: tenant.billing.lifetime.currency,
        entitlementPolicy: tenant.billing.lifetime.entitlementPolicy || "follow_tier",
        lifetimeTermsVersion: tenant.billing.lifetime.lifetimeTermsVersion,
        fairUseLimits: tenant.billing.lifetime.fairUseLimits || {
            storageGbLimit: 25,
            whatsappMessagesMonthlyLimit: 2000,
        },
    } : null;

    return {
        id: tenant._id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        trialEndsAt: isLifetime ? null : tenant.trialEndsAt,
        currentPeriodEnd: isLifetime ? null : tenant.currentPeriodEnd,
        billing: {
            cycle: tenant?.billing?.cycle || "monthly",
            isLifetime,
            lifetime: lifetimeDetails,
        },
        plan: plan ? {
            id: plan._id,
            key: plan.key,
            name: plan.name,
            allowedRoles: plan.allowedRoles || [],
        } : null,
        effectiveFeatures,
        limits: {
            ...limits,
            storageGb: isLifetime ? (tenant.billing?.lifetime?.fairUseLimits?.storageGbLimit || 25) : 5,
            whatsappMonthlyMessages: isLifetime ? (tenant.billing?.lifetime?.fairUseLimits?.whatsappMessagesMonthlyLimit || 2000) : 500,
        },
        usage: {
            members: usage.members ?? 0,
            staff: usage.staff ?? 0,
            storageGb: usage.storageGb ?? 0.5,
            whatsappMonthlyMessages: usage.whatsappMonthlyMessages ?? 0,
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

/**
 * POST /api/tenant/me/logo
 * Allows Owner to upload tenant logo via StorageService.
 */
const uploadTenantLogo = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "Logo file is required" });
        }

        const tenantId = req.user?.tenantId;
        const tenant = await runAsPlatform(async () => {
            return await Tenant.findById(tenantId).populate("planId");
        });

        if (!tenant) {
            return res.status(404).json({ message: "Tenant not found" });
        }

        const filename = req.file.filename;
        const logoKey = `${tenantId}/branding/${filename}`;

        tenant.settings.branding.logoKey = logoKey;
        await runAsPlatform(async () => {
            await tenant.save();
        });

        res.json({
            message: "Logo uploaded successfully",
            logoKey,
            filename,
            url: `/uploads/${filename}`,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

module.exports = {
    getMyTenant,
    updateMyTenantSettings,
    uploadTenantLogo,
    sanitizeTenantResponse,
};
