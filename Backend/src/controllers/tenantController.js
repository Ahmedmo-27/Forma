const path = require("path");
const fs = require("fs");
const storageService = require("../services/storageService");
const Tenant = require("../models/Tenant");
const Member = require("../models/Member");
const User = require("../models/User");
const Announcement = require("../models/Announcement");
const { getEffectiveFeatures, getEffectiveLimits } = require("../models/Tenant");
const {
    AREAS,
    CHECKLIST_ROLES,
    canEditRoleChecklist,
    normalizeAreas,
    areasWithinActor,
    plainRoleAccess,
    savedAreasFor,
} = require("../config/roleAccess");
const { effectiveAreas, roleDefaults } = require("../utils/accessControl");
const { runAsPlatform } = require("../context/tenantContext");
const { encryptSecret } = require("../utils/tenantCrypto");
const { writeAudit } = require("../utils/audit");
const { assertAllowedLogo, MIME_TO_EXT } = require("../utils/fileMagic");
const { BILLING_CURRENCY } = require("../config/currency");
const { countMonthlyWhatsAppMessages } = require("../utils/whatsappTracking");

function sanitizeTenantResponse(tenant, plan, usage = {}) {
    const effectiveFeatures = getEffectiveFeatures(tenant, plan);
    const limits = getEffectiveLimits(tenant, plan);

    const isLifetime = tenant?.billing?.cycle === "lifetime";
    const lifetimeDetails = isLifetime && tenant?.billing?.lifetime ? {
        purchasedAt: tenant.billing.lifetime.purchasedAt,
        amountPaid: tenant.billing.lifetime.amountPaid,
        currency: BILLING_CURRENCY,
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
            storageGb: isLifetime
                ? (tenant.billing?.lifetime?.fairUseLimits?.storageGbLimit || 25)
                : (plan?.fairUseCaps?.storageGb ?? 25),
            whatsappMonthlyMessages: isLifetime
                ? (tenant.billing?.lifetime?.fairUseLimits?.whatsappMessagesMonthlyLimit || 2000)
                : (plan?.fairUseCaps?.whatsappMessagesMonthly ?? 2000),
        },
        usage: {
            members: usage.members ?? 0,
            staff: usage.staff ?? 0,
            storageGb: usage.storageGb ?? 0,
            whatsappMonthlyMessages: usage.whatsappMonthlyMessages ?? 0,
        },
        settings: {
            branding: tenant.settings?.branding || {},
            locale: {
                ...(tenant.settings?.locale || { timezone: "Africa/Cairo", language: "en" }),
                currency: BILLING_CURRENCY,
            },
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

        const timezone = tenant.settings?.locale?.timezone || "Africa/Cairo";

        const [membersCount, staffCount, whatsappMonthlyCount, announcements] = await Promise.all([
            Member.countDocuments(),
            User.countDocuments(),
            countMonthlyWhatsAppMessages(tenantId, timezone),
            runAsPlatform(async () => {
                const now = new Date();
                return await Announcement.find({
                    isActive: true,
                    startDate: { $lte: now },
                    $or: [{ endDate: null }, { endDate: { $gt: now } }],
                }).select("title message type startDate");
            }),
        ]);

        let storageGb = 0;
        try {
            const bytes = await storageService.sumTenantBytes(tenant._id);
            storageGb = Math.round((bytes / (1024 * 1024 * 1024)) * 100) / 100;
        } catch (_) {
            storageGb = 0;
        }

        const response = sanitizeTenantResponse(tenant, tenant.planId, {
            members: membersCount,
            staff: staffCount,
            storageGb,
            whatsappMonthlyMessages: whatsappMonthlyCount,
        });

        response.announcements = announcements || [];

        const accessContext = {
            roleAccess: tenant.roleAccess || null,
            planFeatures: response.effectiveFeatures,
        };
        const actor = {
            role: req.user.role,
            accessOverrides: req.user.accessOverrides,
        };
        response.roleAccess = plainRoleAccess(tenant.roleAccess) || {};
        response.accessCatalog = AREAS;
        response.checklistRoles = CHECKLIST_ROLES;
        response.roleDefaults = Object.fromEntries(
            CHECKLIST_ROLES.map((role) => [role, roleDefaults(role)])
        );
        response.effectiveAccess = effectiveAreas(actor, accessContext);

        res.json({ ...response, tenant: response });
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

        const raw = req.body.settings ? { ...req.body.settings, ...req.body } : req.body;
        const { branding, locale, enabledActivities, whatsapp, featureConfig } = raw;

        if (branding) {
            const currentBranding = tenant.settings?.branding?.toObject?.()
                || tenant.settings?.branding
                || {};
            const nextBranding = {
                ...currentBranding,
                ...branding,
            };
            if (branding.logoKey === undefined) {
                nextBranding.logoKey = currentBranding.logoKey ?? null;
            }
            if (branding.palette) {
                nextBranding.palette = {
                    ...(currentBranding.palette || {}),
                    ...branding.palette,
                };
            }
            tenant.settings.branding = nextBranding;
            tenant.markModified("settings.branding");
        }

        if (locale) {
            tenant.settings.locale = {
                ...tenant.settings.locale.toObject(),
                ...locale,
                currency: BILLING_CURRENCY,
            };
            tenant.markModified("settings.locale");
        }

        if (Array.isArray(enabledActivities)) {
            tenant.settings.enabledActivities = enabledActivities;
            tenant.markModified("settings.enabledActivities");
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
            tenant.markModified("settings.whatsapp");
        }

        if (featureConfig) {
            tenant.settings.featureConfig = {
                ...tenant.settings.featureConfig,
                ...featureConfig,
            };
            tenant.markModified("settings.featureConfig");
        }

        tenant.markModified("settings");

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

        let filename = req.file.filename;
        try {
            const mime = await assertAllowedLogo(req.file);
            const exts = MIME_TO_EXT[mime] || [];
            if (exts.length && !exts.some((ext) => filename.toLowerCase().endsWith(ext))) {
                const nextName = `${filename.replace(/\.[^.]+$/, "")}${exts[0]}`;
                if (req.file.path) {
                    const nextPath = path.join(path.dirname(req.file.path), nextName);
                    await fs.promises.rename(req.file.path, nextPath);
                    req.file.path = nextPath;
                }
                req.file.filename = nextName;
                filename = nextName;
            }
            await storageService.persistUpload(tenantId, req.file);
        } catch (err) {
            if (req.file?.path) fs.unlink(req.file.path, () => {});
            const status = err.statusCode || 500;
            return res.status(status).json({ message: err.message || "Logo upload failed" });
        }

        const oldLogoKey = tenant.settings?.branding?.logoKey || null;
        const oldFilename = oldLogoKey ? path.basename(oldLogoKey) : null;

        if (!tenant.settings) tenant.settings = {};
        if (!tenant.settings.branding) tenant.settings.branding = {};
        tenant.settings.branding.logoKey = filename;
        tenant.markModified("settings.branding");

        await runAsPlatform(async () => {
            await Tenant.updateOne(
                { _id: tenant._id },
                { $set: { "settings.branding.logoKey": filename } }
            );
        });

        if (oldFilename && oldFilename !== filename) {
            await storageService.deleteFile(tenantId, oldFilename);
        }

        res.json({
            message: "Logo uploaded successfully",
            logoKey: filename,
            filename,
            url: `/uploads/${filename}`,
            tenant: sanitizeTenantResponse(tenant, tenant.planId),
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

const updateRoleAccess = async (req, res) => {
    try {
        const role = decodeURIComponent(req.params.role || "");
        if (!canEditRoleChecklist(req.user.role, role)) {
            return res.status(403).json({ message: "You cannot change this role's access" });
        }

        const parsed = normalizeAreas(req.body?.areas);
        if (parsed.error) return res.status(400).json({ message: parsed.error });

        const tenant = await runAsPlatform(async () => {
            return await Tenant.findById(req.user.tenantId).populate("planId");
        });
        if (!tenant) return res.status(404).json({ message: "Tenant not found" });

        let areas = parsed.areas;
        if (req.user.role === "General Manager") {
            const actorAreas = effectiveAreas(req.user, {
                roleAccess: tenant.roleAccess || null,
                planFeatures: getEffectiveFeatures(tenant, tenant.planId),
            });
            const previous = savedAreasFor(tenant.roleAccess, role) || roleDefaults(role);
            const added = areas.filter((key) => !previous.includes(key));
            const limited = areasWithinActor(added, actorAreas);
            if (limited.error) return res.status(403).json({ message: limited.error });
        }

        const next = { ...(plainRoleAccess(tenant.roleAccess) || {}) };
        next[role] = areas;
        tenant.roleAccess = next;
        tenant.markModified("roleAccess");
        await runAsPlatform(async () => {
            await tenant.save();
        });

        await writeAudit({
            action: "role_access_updated",
            actor: req.user.id,
            actorRole: req.user.role,
            targetType: "tenant",
            targetId: tenant._id,
            meta: { role, areas },
            req,
        });

        res.json({
            message: "Role access updated",
            role,
            areas,
            roleAccess: next,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

module.exports = {
    getMyTenant,
    updateMyTenantSettings,
    uploadTenantLogo,
    updateRoleAccess,
    sanitizeTenantResponse,
};
