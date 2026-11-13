const crypto = require("crypto");
const Plan = require("../models/Plan");
const PlanPrice = require("../models/PlanPrice");
const Tenant = require("../models/Tenant");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const ManualPayment = require("../models/ManualPayment");
const tenantContext = require("../context/tenantContext");
const { normalizeEmail, hashPassword } = require("../utils/passwordUtils");
const passwordSetup = require("../services/passwordSetupService");
const mailer = require("../services/mailer");
const billingService = require("../services/billing/billingService");
const paymentAdapter = require("../services/billing/paymentAdapter");
const { BILLING_CURRENCY } = require("../config/currency");
const logger = require("../utils/logger");
const publicSiteService = require("../services/publicSiteService");

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
    "forma",
    "plans",
    "checkout",
    "get-started",
]);

/**
 * GET /api/public/site-config
 * Published flag for www. Optional Bearer platform JWT → canPreview for super_admin.
 */
async function getSiteConfig(req, res) {
    try {
        const site = await publicSiteService.getPublicSiteSetting();
        const { canPreview, previewAs } = await publicSiteService.resolveCanPreview(
            req.headers.authorization
        );
        res.json({
            published: site.published,
            message: site.message,
            canPreview,
            previewAs,
            allowAccess: site.published || canPreview,
        });
    } catch (err) {
        logger.error("public", "getSiteConfig error", { error: err.message });
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

/**
 * GET /api/public/plans
 * Marketing-safe catalog of public active plans and their active prices.
 */
async function listPublicPlans(_req, res) {
    try {
        const payload = await tenantContext.runAsPlatform(async () => {
            const [plans, prices] = await Promise.all([
                // Treat missing visibility as public (older seeded docs may omit the field).
                // Exclude only explicitly hidden/archived plans.
                Plan.find({
                    isActive: true,
                    visibility: { $nin: ["hidden", "archived"] },
                })
                    .select("key name description features limits fairUseCaps sortOrder")
                    .sort({ sortOrder: 1, priceMonthly: 1 })
                    .lean(),
                PlanPrice.find({ isActive: true })
                    .select("planId cycle intervalCount amount validFrom validUntil maxLifetimeSeats soldLifetimeSeats")
                    .lean(),
            ]);

            const planIds = new Set(plans.map((p) => String(p._id)));
            const now = new Date();

            const activePrices = prices
                .filter((p) => planIds.has(String(p.planId)))
                .filter((p) => p.cycle !== "lifetime")
                .filter((p) => {
                    if (p.validFrom && new Date(p.validFrom) > now) return false;
                    if (p.validUntil && new Date(p.validUntil) <= now) return false;
                    return true;
                })
                .map((p) => {
                    const plan = plans.find((pl) => String(pl._id) === String(p.planId));
                    const intervalCount = Number(p.intervalCount) >= 1 ? Number(p.intervalCount) : 1;

                    return {
                        id: p._id,
                        planKey: plan?.key,
                        planName: plan?.name,
                        cycle: p.cycle,
                        intervalCount,
                        amount: p.amount,
                        currency: BILLING_CURRENCY,
                        validUntil: p.validUntil,
                    };
                });

            return {
                currency: BILLING_CURRENCY,
                plans: plans.map((p) => ({
                    key: p.key,
                    name: p.name,
                    description: p.description || "",
                    features: p.features || [],
                    limits: p.limits || {},
                    fairUseCaps: p.fairUseCaps || {},
                    sortOrder: p.sortOrder ?? 0,
                })),
                prices: activePrices,
            };
        });

        res.json(payload);
    } catch (err) {
        logger.error("public", "listPublicPlans error", { error: err.message });
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

/**
 * POST /api/public/signup
 * Sales-assisted signup: create trial tenant + owner invite + pending manual payment.
 */
async function publicSignup(req, res) {
    try {
        const site = await publicSiteService.getPublicSiteSetting();
        if (!site.published) {
            return res.status(403).json({
                code: "PUBLIC_SITE_UNPUBLISHED",
                message: site.message || "Public signup is not available while the site is under development.",
            });
        }

        const {
            name,
            slug,
            ownerName,
            ownerEmail,
            planKey = "basic",
            cycle = "monthly",
            intervalCount: rawIntervalCount = 1,
            trialDays = 14,
        } = req.body;

        if (!name || !slug || !ownerName || !ownerEmail) {
            return res.status(400).json({ message: "name, slug, ownerName, and ownerEmail are required" });
        }

        if (!["monthly", "yearly"].includes(cycle)) {
            return res.status(400).json({ message: "cycle must be monthly or yearly" });
        }

        const intervalCount = billingService.normalizeIntervalCount(rawIntervalCount);
        if (Number(rawIntervalCount) < 1 || !Number.isFinite(Number(rawIntervalCount))) {
            return res.status(400).json({ message: "intervalCount must be an integer >= 1" });
        }

        const result = await tenantContext.runAsPlatform(async () => {
            const normalizedSlug = String(slug).trim().toLowerCase();
            if (!/^[a-z0-9-]+$/.test(normalizedSlug)) {
                const error = new Error("Slug must contain only lowercase alphanumeric characters and hyphens");
                error.statusCode = 400;
                throw error;
            }

            if (RESERVED_SLUGS.has(normalizedSlug)) {
                const error = new Error(`The slug '${normalizedSlug}' is reserved and cannot be used`);
                error.statusCode = 400;
                throw error;
            }

            const existingTenant = await Tenant.findOne({
                $or: [{ slug: normalizedSlug }, { "slugHistory.slug": normalizedSlug }],
            });
            if (existingTenant) {
                const error = new Error(`Slug '${normalizedSlug}' is already taken`);
                error.statusCode = 400;
                throw error;
            }

            const { plan, planPrice } = await billingService.resolveActivePlanPrice(
                planKey,
                cycle,
                intervalCount
            );
            if (plan.visibility === "archived" || !plan.isActive) {
                const error = new Error(`Plan '${planKey}' is not available for signup`);
                error.statusCode = 400;
                throw error;
            }
            if (plan.visibility === "hidden") {
                const error = new Error(`Plan '${planKey}' is not available for public signup`);
                error.statusCode = 400;
                throw error;
            }

            const normalizedEmail = normalizeEmail(ownerEmail);
            const existingUser = await User.findOne({ email: normalizedEmail });
            if (existingUser) {
                const error = new Error(`User with email '${normalizedEmail}' already exists`);
                error.statusCode = 400;
                throw error;
            }

            const now = new Date();
            const status = "trial";
            const trialEndsAt = new Date(now.getTime() + Number(trialDays) * 24 * 60 * 60 * 1000);

            const tenant = await Tenant.create({
                name: String(name).trim(),
                slug: normalizedSlug,
                status,
                planId: plan._id,
                trialEndsAt,
                currentPeriodEnd: null,
                billing: {
                    cycle,
                    intervalCount,
                    lifetime: {},
                },
                tags: ["public_signup"],
                settings: {
                    branding: {},
                    locale: {
                        currency: BILLING_CURRENCY,
                        timezone: "Africa/Cairo",
                    },
                },
            });

            const temporaryPassword = crypto.randomBytes(16).toString("hex") + "A1!";
            const passwordHash = await hashPassword(temporaryPassword);

            const ownerUser = await tenantContext.runWithTenant(
                { tenantId: String(tenant._id), tenantSlug: tenant.slug },
                async () => User.create({
                    tenantId: tenant._id,
                    name: String(ownerName).trim(),
                    email: normalizedEmail,
                    password: passwordHash,
                    role: "Owner",
                    canAccessAllLocations: true,
                    allowedLocationIds: [],
                })
            );

            tenant.ownerUserId = ownerUser._id;
            await tenant.save();

            try {
                const { ensureMainLocation } = require("./locationController");
                await tenantContext.runWithTenant(
                    { tenantId: String(tenant._id), tenantSlug: tenant.slug },
                    () => ensureMainLocation(tenant._id)
                );
            } catch (locErr) {
                logger.warn("public", "Main location bootstrap failed during signup", {
                    tenantId: String(tenant._id),
                    error: locErr.message,
                });
            }

            const issued = await passwordSetup.issueToken({
                userId: ownerUser._id,
                tenantId: tenant._id,
                email: ownerUser.email,
                purpose: "invite",
                hours: passwordSetup.INVITE_HOURS,
            });
            const inviteUrl = passwordSetup.relativeUrl(issued.token, ownerUser.email);

            try {
                await mailer.sendInvite({
                    to: ownerUser.email,
                    name: ownerUser.name,
                    gymName: tenant.name,
                    setupUrl: passwordSetup.absoluteUrl(issued.token, ownerUser.email),
                });
            } catch (mailErr) {
                logger.warn("public", "Owner invite email failed", { error: mailErr.message });
            }

            const amount = planPrice.amount;
            const adapter = paymentAdapter.getPaymentAdapter("manual_transfer");
            const paymentSession = await adapter.initiatePayment({
                tenant,
                plan,
                planPrice,
                amount,
                actorId: ownerUser._id,
                metadata: {
                    source: "public_signup",
                    cycle,
                    intervalCount,
                },
            });

            await ManualPayment.create({
                tenantId: tenant._id,
                paymentRef: paymentSession.paymentRef,
                planKey: plan.key,
                cycle,
                intervalCount,
                amount,
                currency: BILLING_CURRENCY,
                status: "pending",
                submittedBy: ownerUser._id,
                notes: "Created via public signup",
            });

            try {
                await AuditLog.create({
                    tenantId: tenant._id,
                    action: "tenant_status_updated",
                    actor: ownerUser._id.toString(),
                    actorRole: "Owner",
                    targetType: "tenant",
                    targetId: tenant._id.toString(),
                    meta: {
                        action: "tenant_onboarded",
                        source: "public_signup",
                        tenantName: tenant.name,
                        slug: tenant.slug,
                        ownerEmail: ownerUser.email,
                        planKey: plan.key,
                        cycle,
                    },
                });
            } catch (auditErr) {
                logger.error("public", "signup audit failed (response still returned)", {
                    tenantId: String(tenant._id),
                    error: auditErr.message,
                });
            }

            return {
                tenant: {
                    name: tenant.name,
                    slug: tenant.slug,
                    status: tenant.status,
                    planKey: plan.key,
                    cycle,
                    intervalCount,
                    trialEndsAt,
                },
                owner: {
                    name: ownerUser.name,
                    email: ownerUser.email,
                },
                invite: {
                    inviteUrl,
                    expiresInHours: issued.expiresInHours,
                },
                payment: {
                    paymentRef: paymentSession.paymentRef,
                    paymentMethod: paymentSession.paymentMethod,
                    status: paymentSession.status,
                    amount: paymentSession.amount,
                    currency: paymentSession.currency,
                    cycle,
                    intervalCount,
                    instructions: paymentSession.instructions,
                },
            };
        });

        res.status(201).json({
            message: "Signup received. Complete the bank transfer using the reference below. Sales will confirm payment.",
            ...result,
        });
    } catch (err) {
        if (err.statusCode) {
            return res.status(err.statusCode).json({
                code: err.code,
                message: err.message,
            });
        }
        if (err.code === "PLAN_NOT_FOUND" || err.code === "PRICE_NOT_FOUND") {
            return res.status(404).json({ code: err.code, message: err.message });
        }
        logger.error("public", "publicSignup error", { error: err.message });
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

module.exports = {
    getSiteConfig,
    listPublicPlans,
    publicSignup,
};
