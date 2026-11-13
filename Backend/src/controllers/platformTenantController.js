const crypto = require("crypto");
const Tenant = require("../models/Tenant");
const Plan = require("../models/Plan");
const User = require("../models/User");
const Member = require("../models/Member");
const AuditLog = require("../models/AuditLog");
const BillingEvent = require("../models/BillingEvent");
const TenantNote = require("../models/TenantNote");
const { getEffectiveFeatures, getEffectiveLimits, getEffectiveRoles } = require("../models/Tenant");
const { runAsPlatform, runWithTenant } = require("../context/tenantContext");
const storageService = require("../services/storageService");
const { normalizeEmail, hashPassword } = require("../utils/passwordUtils");
const { uniqueUsername } = require("../utils/username");
const { assertEmailAvailable } = require("../utils/identityUniqueness");
const passwordSetup = require("../services/passwordSetupService");
const mailer = require("../services/mailer");
const { parsePagination, buildPagination } = require("../utils/pagination");
const { BILLING_CURRENCY } = require("../config/currency");
const { WHATSAPP_AUDIT_ACTIONS, startOfMonth } = require("../utils/whatsappTracking");
const logger = require("../utils/logger");

const RESERVED_SLUGS = new Set([
    "www",
    "api",
    "admin",
    "platform",
    "app",
    "auth",
    "support",
    "billing",
    "mail",
    "portal",
    "static",
    "dashboard",
    "leap",
    "flamefactory",
    "root",
    "sys",
    "system",
]);

/**
 * Measure tenant storage in bytes (local directory or R2 prefix).
 */
async function getTenantStorageBytes(tenantId) {
    try {
        return await storageService.sumTenantBytes(tenantId);
    } catch (err) {
        logger.warn("platform", "Failed to measure tenant storage", { error: err.message });
        return 0;
    }
}

/**
 * List Tenants with Server-Side Pagination, Filtering, Search, and Sort
 * GET /api/platform/tenants
 */
async function getTenants(req, res) {
    try {
        const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20 });

        const {
            search,
            status,
            plan,
            cycle,
            pastDue,
            lifetime,
            trialExpiringDays,
            createdFrom,
            createdTo,
            sortBy = "createdAt",
            sortOrder = "desc",
        } = req.query;

        const filter = { isSoftDeleted: { $ne: true } };

        if (status) {
            filter.status = status;
        }

        if (cycle) {
            filter["billing.cycle"] = cycle;
        }

        if (lifetime === "true") {
            filter["billing.cycle"] = "lifetime";
        }

        if (pastDue === "true") {
            filter.status = "past_due";
        }

        if (trialExpiringDays) {
            const days = parseInt(trialExpiringDays, 10);
            const now = new Date();
            const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
            filter.status = "trial";
            filter.trialEndsAt = { $gte: now, $lte: future };
        }

        if (createdFrom || createdTo) {
            filter.createdAt = {};
            if (createdFrom) filter.createdAt.$gte = new Date(createdFrom);
            if (createdTo) filter.createdAt.$lte = new Date(createdTo);
        }

        if (search && search.trim()) {
            const regex = new RegExp(search.trim(), "i");
            filter.$or = [{ name: regex }, { slug: regex }];
        }

        const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

        const [tenants, total] = await Promise.all([
            Tenant.find(filter)
                .populate("planId", "key name priceMonthly priceYearly limits fairUseCaps")
                .populate("ownerUserId", "name email")
                .sort(sort)
                .skip(skip)
                .limit(limit),
            Tenant.countDocuments(filter),
        ]);

        // Aggregate lightweight metrics for summary rows
        const summaryRows = await Promise.all(
            tenants.map(async (t) => {
                const [memberCount, staffCount] = await Promise.all([
                    Member.collection.countDocuments({ tenantId: t._id }),
                    User.collection.countDocuments({ tenantId: t._id }),
                ]);

                const storageBytes = await getTenantStorageBytes(t._id);
                const effectiveLimits = getEffectiveLimits(t, t.planId);
                const isLifetime = t.billing?.cycle === "lifetime";
                const storageLimitGb = t.limitOverrides?.storageGb != null
                    ? t.limitOverrides.storageGb
                    : (isLifetime
                        ? (t.billing?.lifetime?.fairUseLimits?.storageGbLimit || 25)
                        : (t.planId?.fairUseCaps?.storageGb ?? 25));

                // Calculate MRR contribution
                let mrrContribution = 0;
                if (t.status === "active") {
                    if (t.billing?.cycle === "monthly") {
                        mrrContribution = t.planId?.priceMonthly || 0;
                    } else if (t.billing?.cycle === "yearly") {
                        mrrContribution = Math.round(((t.planId?.priceYearly || 0) / 12) * 100) / 100;
                    }
                }

                return {
                    id: t._id,
                    name: t.name,
                    slug: t.slug,
                    status: t.status,
                    cycle: t.billing?.cycle || "monthly",
                    plan: {
                        id: t.planId?._id,
                        key: t.planId?.key,
                        name: t.planId?.name,
                    },
                    owner: t.ownerUserId
                        ? { id: t.ownerUserId._id, name: t.ownerUserId.name, email: t.ownerUserId.email }
                        : null,
                    usage: {
                        members: memberCount,
                        maxMembers: effectiveLimits.maxMembers,
                        staff: staffCount,
                        maxStaff: effectiveLimits.maxStaff,
                        storageBytes,
                        storageGb: Math.round((storageBytes / (1024 * 1024 * 1024)) * 100) / 100,
                        storageLimitGb,
                    },
                    trialEndsAt: t.trialEndsAt,
                    currentPeriodEnd: t.currentPeriodEnd,
                    mrrContribution,
                    tags: t.tags || [],
                    lastActivityAt: t.lastActivityAt || t.updatedAt,
                    createdAt: t.createdAt,
                };
            })
        );

        res.json({
            tenants: summaryRows,
            pagination: buildPagination(page, limit, total),
        });
    } catch (err) {
        logger.error("platform", "getTenants failed", { error: err.message });
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

/**
 * Get Comprehensive Tenant Detail
 * GET /api/platform/tenants/:id
 */
async function getTenantDetail(req, res) {
    try {
        const tenant = await Tenant.findById(req.params.id)
            .populate("planId")
            .populate("ownerUserId", "name email mobile_number createdAt");

        if (!tenant) {
            return res.status(404).json({ message: "Tenant not found" });
        }

        const [
            memberCount,
            staffCount,
            notes,
            recentAudit,
            recentLedger,
            monthlyWhatsAppCount,
        ] = await Promise.all([
            Member.collection.countDocuments({ tenantId: tenant._id }),
            User.collection.countDocuments({ tenantId: tenant._id }),
            TenantNote.find({ tenantId: tenant._id }).sort({ pinned: -1, createdAt: -1 }),
            AuditLog.find({ tenantId: tenant._id }).sort({ createdAt: -1 }).limit(25),
            BillingEvent.find({ tenantId: tenant._id }).sort({ createdAt: -1 }).limit(25),
            AuditLog.countDocuments({
                tenantId: tenant._id,
                action: { $in: WHATSAPP_AUDIT_ACTIONS },
                createdAt: {
                    $gte: startOfMonth(tenant?.settings?.locale?.timezone),
                },
            }),
        ]);

        const storageBytes = await getTenantStorageBytes(tenant._id);
        const effectiveFeatures = getEffectiveFeatures(tenant, tenant.planId);
        const effectiveRoles = getEffectiveRoles(tenant, tenant.planId);
        const baseLimits = getEffectiveLimits(tenant, tenant.planId);

        const isLifetime = tenant.billing?.cycle === "lifetime";
        const storageLimitGb = tenant.limitOverrides?.storageGb != null
            ? tenant.limitOverrides.storageGb
            : (isLifetime
                ? (tenant.billing?.lifetime?.fairUseLimits?.storageGbLimit || 25)
                : (tenant.planId?.fairUseCaps?.storageGb ?? 25));

        const whatsappLimit = tenant.limitOverrides?.whatsappMonthlyMessages != null
            ? tenant.limitOverrides.whatsappMonthlyMessages
            : (isLifetime
                ? (tenant.billing?.lifetime?.fairUseLimits?.whatsappMessagesMonthlyLimit || 2000)
                : (tenant.planId?.fairUseCaps?.whatsappMessagesMonthly ?? 2000));

        const effectiveLimits = {
            ...baseLimits,
            storageGb: storageLimitGb,
            whatsappMonthlyMessages: whatsappLimit,
        };

        res.json({
            tenant: {
                id: tenant._id,
                name: tenant.name,
                slug: tenant.slug,
                status: tenant.status,
                plan: tenant.planId,
                owner: tenant.ownerUserId,
                billing: tenant.billing,
                featureOverrides: tenant.featureOverrides || { add: [], remove: [] },
                roleOverrides: tenant.roleOverrides || { add: [], remove: [] },
                limitOverrides: tenant.limitOverrides || {},
                effectiveFeatures,
                effectiveRoles,
                effectiveLimits,
                trialEndsAt: tenant.trialEndsAt,
                currentPeriodEnd: tenant.currentPeriodEnd,
                billingProviderCustomerId: tenant.billingProviderCustomerId,
                tags: tenant.tags || [],
                slugHistory: tenant.slugHistory || [],
                settings: tenant.settings,
                createdAt: tenant.createdAt,
                updatedAt: tenant.updatedAt,
                isSoftDeleted: tenant.isSoftDeleted,
                softDeletedAt: tenant.softDeletedAt,
                purgeScheduledAt: tenant.purgeScheduledAt,
            },
            usage: {
                members: memberCount,
                staff: staffCount,
                storageBytes,
                storageGb: Math.round((storageBytes / (1024 * 1024 * 1024)) * 100) / 100,
                storageLimitGb,
                monthlyWhatsApp: monthlyWhatsAppCount,
            },
            notes,
            recentAudit,
            recentLedger,
        });
    } catch (err) {
        logger.error("platform", "getTenantDetail failed", { error: err.message });
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

/**
 * Safe Onboarding Endpoint
 * Creates Tenant, Owner user with one-time invite token, and initial subscription/ledger.
 * POST /api/platform/tenants
 */
async function onboardTenant(req, res) {
    try {
        const {
            name,
            slug,
            ownerName,
            ownerEmail,
            planKey = "basic",
            cycle = "monthly",
            intervalCount: rawIntervalCount = 1,
            trialDays = 14,
            isLifetime = false,
            amountPaid = 0,
            tags = [],
            settings = {},
        } = req.body;

        if (!name || !slug || !ownerName || !ownerEmail) {
            return res.status(400).json({ message: "name, slug, ownerName, and ownerEmail are required" });
        }

        const intervalCount = Math.max(1, Math.floor(Number(rawIntervalCount) || 1));

        const normalizedSlug = slug.trim().toLowerCase();
        if (!/^[a-z0-9-]+$/.test(normalizedSlug)) {
            return res.status(400).json({
                message: "Slug must contain only lowercase alphanumeric characters and hyphens",
            });
        }

        if (RESERVED_SLUGS.has(normalizedSlug)) {
            return res.status(400).json({ message: `The slug '${normalizedSlug}' is reserved and cannot be used` });
        }

        // Check uniqueness across slug and slugHistory
        const existingTenant = await Tenant.findOne({
            $or: [{ slug: normalizedSlug }, { "slugHistory.slug": normalizedSlug }],
        });
        if (existingTenant) {
            return res.status(400).json({ message: `Slug '${normalizedSlug}' is already taken` });
        }

        const plan = await Plan.findOne({ key: planKey });
        if (!plan) {
            return res.status(400).json({ message: `Plan '${planKey}' not found` });
        }

        if (isLifetime || cycle === "lifetime") {
            return res.status(400).json({
                code: "LIFETIME_DISABLED",
                message: "Lifetime subscriptions are no longer available",
            });
        }

        if (!["monthly", "yearly"].includes(cycle)) {
            return res.status(400).json({ message: "cycle must be monthly or yearly" });
        }

        const normalizedEmail = normalizeEmail(ownerEmail);
        await assertEmailAvailable(normalizedEmail);

        // Calculate trial or period dates
        const now = new Date();
        let status = "trial";
        let trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
        let currentPeriodEnd = null;

        const billing = {
            cycle,
            intervalCount,
            lifetime: {},
        };

        // Create Tenant
        const tenant = await Tenant.create({
            name: name.trim(),
            slug: normalizedSlug,
            status,
            planId: plan._id,
            trialEndsAt,
            currentPeriodEnd,
            billing,
            tags,
            settings: {
                branding: settings.branding || {},
                locale: {
                    ...(settings.locale || {}),
                    currency: BILLING_CURRENCY,
                    timezone: settings.locale?.timezone || "Africa/Cairo",
                },
            },
        });

        // Generate secure temporary random password for user creation
        const temporaryPassword = crypto.randomBytes(16).toString("hex") + "A1!";
        const passwordHash = await hashPassword(temporaryPassword);

        // Create Owner User inside tenant context so tenantPlugin stamps correctly
        const ownerUser = await runWithTenant(
            { tenantId: String(tenant._id), tenantSlug: tenant.slug },
            async () => {
                const username = await uniqueUsername(User, normalizedEmail);
                return User.create({
                    tenantId: tenant._id,
                    name: ownerName.trim(),
                    email: normalizedEmail,
                    username,
                    password: passwordHash,
                    role: "Owner",
                    canAccessAllLocations: true,
                    allowedLocationIds: [],
                });
            }
        );

        // Attach owner to tenant
        tenant.ownerUserId = ownerUser._id;
        await tenant.save();

        // Bootstrap Main branch so members always have a home location
        try {
            const { ensureMainLocation } = require("./locationController");
            await runWithTenant(
                { tenantId: String(tenant._id), tenantSlug: tenant.slug },
                () => ensureMainLocation(tenant._id)
            );
        } catch (locErr) {
            logger.warn("platform", "Main location bootstrap failed during onboard", {
                tenantId: String(tenant._id),
                error: locErr.message,
            });
        }

        // One-time invite token (72h). Raw token is emailed and returned once; only the hash is stored.
        const issued = await passwordSetup.issueToken({
            userId: ownerUser._id,
            tenantId: tenant._id,
            email: ownerUser.email,
            purpose: "invite",
            hours: passwordSetup.INVITE_HOURS,
        });
        const inviteToken = issued.token;
        const inviteUrl = passwordSetup.relativeUrl(inviteToken, ownerUser.email);

        try {
            await mailer.sendInvite({
                to: ownerUser.email,
                name: ownerUser.name,
                gymName: tenant.name,
                setupUrl: passwordSetup.absoluteUrl(inviteToken, ownerUser.email),
            });
        } catch (mailErr) {
            logger.warn("mail", "Owner invite email failed", { error: mailErr.message });
        }

        // Audit must never drop the invite response (QA F01)
        try {
            await AuditLog.create({
                tenantId: tenant._id,
                action: "tenant_status_updated",
                actor: req.platformUser.id,
                actorRole: "PlatformUser",
                targetType: "tenant",
                targetId: tenant._id.toString(),
                meta: {
                    action: "tenant_onboarded",
                    tenantName: tenant.name,
                    slug: tenant.slug,
                    ownerEmail: ownerUser.email,
                    planKey: plan.key,
                    cycle: tenant.billing.cycle,
                    onboardedBy: req.platformUser.email,
                },
            });
        } catch (auditErr) {
            logger.error("platform", "onboardTenant audit failed (invite still returned)", {
                tenantId: String(tenant._id),
                error: auditErr.message,
            });
        }

        res.status(201).json({
            message: "Tenant onboarded successfully",
            tenant: {
                id: tenant._id,
                name: tenant.name,
                slug: tenant.slug,
                status: tenant.status,
                planKey: plan.key,
                cycle: tenant.billing.cycle,
            },
            owner: {
                id: ownerUser._id,
                name: ownerUser.name,
                email: ownerUser.email,
            },
            invite: {
                inviteToken,
                inviteUrl,
                expiresInHours: issued.expiresInHours,
            },
        });
    } catch (err) {
        if (err.statusCode && err.statusCode < 500) {
            return res.status(err.statusCode).json({
                code: err.code,
                message: err.message,
            });
        }
        logger.error("platform", "onboardTenant error", { error: err.message });
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

/**
 * Lifecycle Actions on Tenant (Suspend, Reactivate, Cancel, Extend Trial, Overrides, etc.)
 * Every action requires a mandatory `reason` field and writes an append-only AuditLog.
 * PATCH /api/platform/tenants/:id/lifecycle
 */
async function updateTenantLifecycle(req, res) {
    try {
        const { id } = req.params;
        const { action, reason, ...payload } = req.body;

        if (!action) {
            return res.status(400).json({ message: "Lifecycle 'action' is required" });
        }

        if (!reason || !reason.trim()) {
            return res.status(400).json({
                message: "Mandatory 'reason' field is required for all tenant lifecycle actions",
            });
        }

        const tenant = await Tenant.findById(id).populate("planId");
        if (!tenant) return res.status(404).json({ message: "Tenant not found" });

        const beforeState = {
            status: tenant.status,
            planKey: tenant.planId?.key,
            cycle: tenant.billing?.cycle,
            trialEndsAt: tenant.trialEndsAt,
            slug: tenant.slug,
            featureOverrides: tenant.featureOverrides,
            roleOverrides: tenant.roleOverrides,
            limitOverrides: tenant.limitOverrides,
            entitlementPolicy: tenant.billing?.lifetime?.entitlementPolicy,
        };

        const afterState = {};

        switch (action) {
            case "suspend":
                tenant.status = "suspended";
                afterState.status = "suspended";
                break;

            case "reactivate":
                tenant.status = "active";
                afterState.status = "active";
                break;

            case "cancel": {
                tenant.status = "cancelled";
                tenant.isSoftDeleted = true;
                tenant.softDeletedAt = new Date();
                const retentionDays = parseInt(process.env.PLATFORM_TENANT_RETENTION_DAYS, 10) || 90;
                tenant.purgeScheduledAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);
                afterState.status = "cancelled";
                afterState.purgeScheduledAt = tenant.purgeScheduledAt;
                break;
            }

            case "extend_trial": {
                const days = parseInt(payload.days, 10);
                if (!days || days <= 0) {
                    return res.status(400).json({ message: "Valid positive number of days required" });
                }
                const currentEnd = tenant.trialEndsAt && tenant.trialEndsAt > new Date() ? tenant.trialEndsAt : new Date();
                tenant.trialEndsAt = new Date(currentEnd.getTime() + days * 24 * 60 * 60 * 1000);
                tenant.status = "trial";
                afterState.trialEndsAt = tenant.trialEndsAt;
                afterState.status = "trial";
                break;
            }

            case "change_plan": {
                const { newPlanKey, newPlanId } = payload;
                const newPlan = newPlanKey
                    ? await Plan.findOne({ key: newPlanKey })
                    : await Plan.findById(newPlanId);
                if (!newPlan) return res.status(400).json({ message: "Plan not found" });
                tenant.planId = newPlan._id;
                afterState.planKey = newPlan.key;
                break;
            }

            case "change_cycle": {
                const { newCycle } = payload;
                if (!["monthly", "yearly"].includes(newCycle)) {
                    return res.status(400).json({ message: "Invalid cycle. Must be monthly or yearly." });
                }
                tenant.billing.cycle = newCycle;
                afterState.cycle = newCycle;
                break;
            }

            case "change_overrides": {
                if (payload.featureOverrides) {
                    tenant.featureOverrides = {
                        add: Array.isArray(payload.featureOverrides.add) ? payload.featureOverrides.add : [],
                        remove: Array.isArray(payload.featureOverrides.remove) ? payload.featureOverrides.remove : [],
                    };
                    tenant.markModified("featureOverrides");
                    afterState.featureOverrides = tenant.featureOverrides;
                }
                if (payload.roleOverrides) {
                    tenant.roleOverrides = payload.roleOverrides;
                    afterState.roleOverrides = payload.roleOverrides;
                }
                if (payload.limitOverrides) {
                    tenant.limitOverrides = payload.limitOverrides;
                    afterState.limitOverrides = payload.limitOverrides;
                }
                break;
            }

            case "change_entitlement_policy": {
                const { entitlementPolicy } = payload;
                if (!["follow_tier", "snapshot"].includes(entitlementPolicy)) {
                    return res.status(400).json({ message: "Invalid entitlement policy" });
                }
                tenant.billing.lifetime.entitlementPolicy = entitlementPolicy;
                afterState.entitlementPolicy = entitlementPolicy;
                break;
            }

            case "change_slug": {
                const { newSlug } = payload;
                if (!newSlug || !/^[a-z0-9-]+$/.test(newSlug.trim().toLowerCase())) {
                    return res.status(400).json({ message: "Valid slug format required" });
                }
                const normalized = newSlug.trim().toLowerCase();
                if (RESERVED_SLUGS.has(normalized)) {
                    return res.status(400).json({ message: "Slug is reserved" });
                }
                const existing = await Tenant.findOne({
                    _id: { $ne: tenant._id },
                    $or: [{ slug: normalized }, { "slugHistory.slug": normalized }],
                });
                if (existing) {
                    return res.status(400).json({ message: `Slug '${normalized}' already in use` });
                }

                // Add old slug to slugHistory
                tenant.slugHistory.push({
                    slug: tenant.slug,
                    changedAt: new Date(),
                    changedBy: req.platformUser.id,
                });
                tenant.slug = normalized;
                afterState.slug = normalized;
                break;
            }

            case "transfer_ownership": {
                const { newOwnerUserId } = payload;
                const newOwner = await User.findOne({ _id: newOwnerUserId, tenantId: tenant._id });
                if (!newOwner) {
                    return res.status(400).json({ message: "New owner user not found in this gym" });
                }
                newOwner.role = "Owner";
                await newOwner.save();
                tenant.ownerUserId = newOwner._id;
                afterState.ownerUserId = newOwner._id.toString();
                break;
            }

            default:
                return res.status(400).json({ message: `Unknown lifecycle action: ${action}` });
        }

        await tenant.save();

        if (action === "suspend") {
            const ownerMail = require("../services/ownerMail");
            await ownerMail.notifySuspended(tenant);
        }

        // Write append-only audit trail
        await AuditLog.create({
            tenantId: tenant._id,
            action: "tenant_status_updated",
            actor: req.platformUser.id,
            actorRole: "PlatformUser",
            targetType: "tenant",
            targetId: tenant._id.toString(),
            meta: {
                lifecycleAction: action,
                beforeState,
                afterState,
                reason,
                actorEmail: req.platformUser.email,
            },
        });

        res.json({
            message: `Tenant action '${action}' applied successfully`,
            tenant: {
                id: tenant._id,
                name: tenant.name,
                slug: tenant.slug,
                status: tenant.status,
                billing: tenant.billing,
                trialEndsAt: tenant.trialEndsAt,
                featureOverrides: tenant.featureOverrides,
                roleOverrides: tenant.roleOverrides,
                limitOverrides: tenant.limitOverrides,
            },
        });
    } catch (err) {
        logger.error("platform", "updateTenantLifecycle failed", { error: err.message });
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

/**
 * Add Internal Note to Tenant
 * POST /api/platform/tenants/:id/notes
 */
async function addTenantNote(req, res) {
    try {
        const { text, pinned } = req.body;
        if (!text || !text.trim()) {
            return res.status(400).json({ message: "Note text is required" });
        }

        const note = await TenantNote.create({
            tenantId: req.params.id,
            authorId: req.platformUser.id,
            authorName: req.platformUser.name,
            authorEmail: req.platformUser.email,
            text: text.trim(),
            pinned: Boolean(pinned),
        });

        res.status(201).json(note);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

/**
 * Delete Internal Note
 * DELETE /api/platform/tenants/:id/notes/:noteId
 */
async function deleteTenantNote(req, res) {
    try {
        const note = await TenantNote.findOneAndDelete({
            _id: req.params.noteId,
            tenantId: req.params.id,
        });
        if (!note) return res.status(404).json({ message: "Note not found" });
        res.json({ message: "Note deleted successfully" });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

/**
 * Update Tenant Tags
 * PATCH /api/platform/tenants/:id/tags
 */
async function updateTenantTags(req, res) {
    try {
        const { tags } = req.body;
        if (!Array.isArray(tags)) {
            return res.status(400).json({ message: "Tags must be an array of strings" });
        }

        const tenant = await Tenant.findByIdAndUpdate(
            req.params.id,
            { $set: { tags: tags.map((t) => String(t).trim()).filter(Boolean) } },
            { new: true }
        );

        if (!tenant) return res.status(404).json({ message: "Tenant not found" });
        res.json({ message: "Tags updated", tags: tenant.tags });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

/**
 * Bulk Tenant Actions (dry-run preview or execute)
 * POST /api/platform/tenants/bulk
 */
async function bulkTenantActions(req, res) {
    try {
        const { action, tenantIds, previewOnly = true, payload = {}, reason } = req.body;
        if (!action || !Array.isArray(tenantIds) || !tenantIds.length) {
            return res.status(400).json({ message: "action and non-empty tenantIds array are required" });
        }

        // Hard cap on batch size
        const MAX_BATCH_SIZE = 100;
        if (tenantIds.length > MAX_BATCH_SIZE) {
            return res.status(400).json({
                message: `Batch size exceeds maximum limit of ${MAX_BATCH_SIZE} tenants`,
            });
        }

        if (!previewOnly && (!reason || !reason.trim())) {
            return res.status(400).json({ message: "Mandatory 'reason' required to execute bulk action" });
        }

        const tenants = await Tenant.find({ _id: { $in: tenantIds } }).select("name slug status trialEndsAt ownerUserId");

        if (previewOnly) {
            return res.json({
                message: `Previewing bulk ${action} for ${tenants.length} tenants`,
                tenantCount: tenants.length,
                action,
                sampleTenants: tenants.slice(0, 5).map((t) => ({ id: t._id, name: t.name, status: t.status })),
                proposedChanges: payload,
            });
        }

        // Execute bulk action
        let modifiedCount = 0;
        for (const t of tenants) {
            if (action === "extend_trial" && payload.days) {
                const days = parseInt(payload.days, 10);
                const current = t.trialEndsAt && t.trialEndsAt > new Date() ? t.trialEndsAt : new Date();
                t.trialEndsAt = new Date(current.getTime() + days * 24 * 60 * 60 * 1000);
                t.status = "trial";
                await t.save();
                modifiedCount++;
            } else if (action === "suspend") {
                t.status = "suspended";
                await t.save();
                modifiedCount++;
                const ownerMail = require("../services/ownerMail");
                await ownerMail.notifySuspended(t);
            }

            await AuditLog.create({
                tenantId: t._id,
                action: "tenant_status_updated",
                actor: req.platformUser.id,
                actorRole: "PlatformUser",
                targetType: "tenant",
                targetId: t._id.toString(),
                meta: {
                    bulkAction: action,
                    reason,
                    payload,
                },
            });
        }

        res.json({
            message: `Bulk ${action} executed successfully on ${modifiedCount} tenants`,
            modifiedCount,
        });
    } catch (err) {
        logger.error("platform", "bulkTenantActions error", { error: err.message });
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

module.exports = {
    getTenants,
    getTenantDetail,
    onboardTenant,
    updateTenantLifecycle,
    addTenantNote,
    deleteTenantNote,
    updateTenantTags,
    bulkTenantActions,
    getTenantStorageBytes,
};
