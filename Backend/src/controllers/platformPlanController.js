const Plan = require("../models/Plan");
const Feature = require("../models/Feature");
const PlanPrice = require("../models/PlanPrice");
const Coupon = require("../models/Coupon");
const Tenant = require("../models/Tenant");
const BillingEvent = require("../models/BillingEvent");
const AuditLog = require("../models/AuditLog");
const { parsePagination, buildPagination } = require("../utils/pagination");
const logger = require("../utils/logger");

const DEFAULT_FEATURES = [
    { key: "members", name: "Members Management", category: "members", description: "Full membership directory, profiles, barcodes, and statuses", isCore: true },
    { key: "checkin", name: "Access & Check-in", category: "core", description: "Front desk barcode scanning, access gates, and attendance tracking", isCore: true },
    { key: "packages", name: "Packages & Subscriptions", category: "finance", description: "Gym membership packages, durations, session tracking, and renewals", isCore: true },
    { key: "pt_tracking", name: "Personal Training (PT)", category: "coaching", description: "PT assignment, coach session balances, and coach commissions", isCore: false },
    { key: "audit", name: "Audit Trail", category: "core", description: "Action logging, operator activity history, and security changes", isCore: true },
    { key: "accounting", name: "Ledger & Accounting", category: "finance", description: "Income, expense transactions, cash drawer tracking, and financial statements", isCore: false },
    { key: "exception_approvals", name: "Exception Approvals", category: "finance", description: "Discount, freeze, refund, and package exception approval workflows", isCore: false },
    { key: "sales_crm", name: "Sales Pipeline & CRM", category: "sales", description: "Lead tracking, pipeline stages, sales rep assignment, and conversion reports", isCore: false },
    { key: "whatsapp", name: "WhatsApp Automation", category: "communication", description: "Automated WhatsApp notifications, payment receipts, and expiring reminders", isCore: false },
    { key: "excel_import", name: "Excel Import & Export", category: "integrations", description: "Bulk member import from spreadsheet and CSV financial export", isCore: false },
    { key: "exec_analytics", name: "Executive Analytics", category: "analytics", description: "Churn analytics, revenue forecasting, retention cohorts, and attendance heatmaps", isCore: false },
    { key: "funnels", name: "Sales Conversion Funnels", category: "analytics", description: "Lead-to-member conversion tracking, drop-off analysis, and marketing ROI", isCore: false },
    { key: "business_intelligence", name: "Business Intelligence", category: "analytics", description: "Custom KPI dashboards, executive summaries, and multi-branch rollups", isCore: false },
];

const SYSTEM_ROLES = [
    {
        key: "Owner",
        name: "Gym Owner",
        description: "Full administrative access to gym operations, financial reports, settings, and staff management.",
        defaultTier: "basic",
        category: "Management",
    },
    {
        key: "Receptionist",
        name: "Front Desk Receptionist",
        description: "Handles member check-ins, barcode scans, daily visitor inquiries, and basic renewals.",
        defaultTier: "basic",
        category: "Operations",
    },
    {
        key: "Coach",
        name: "Fitness Coach / Trainer",
        description: "Views assigned trainees, logs private sessions, and records member training progress.",
        defaultTier: "basic",
        category: "Coaching",
    },
    {
        key: "Coach Manager",
        name: "Head Coach / Fitness Manager",
        description: "Oversees fitness coaches, assigns personal trainers, and manages class schedules.",
        defaultTier: "basic",
        category: "Coaching",
    },
    {
        key: "Accountant",
        name: "Gym Accountant / Cashier",
        description: "Manages daily cash drawer, payment vouchers, ledger expenses, and tax/invoice reconciliation.",
        defaultTier: "gold",
        category: "Finance",
    },
    {
        key: "Sales",
        name: "Sales Representative",
        description: "Manages inbound leads, calls prospects, books gym tours, and logs sale opportunities.",
        defaultTier: "gold",
        category: "Sales",
    },
    {
        key: "Sales Manager",
        name: "Commercial / Sales Manager",
        description: "Sets sales quotas, reassigns leads across sales reps, and reviews pipeline conversion funnels.",
        defaultTier: "gold",
        category: "Sales",
    },
];

// ==========================================
// 1. Feature Catalog & Roles Management
// ==========================================

async function ensureDefaultFeatures() {
    try {
        const count = await Feature.countDocuments();
        if (count === 0) {
            for (const item of DEFAULT_FEATURES) {
                await Feature.findOneAndUpdate(
                    { key: item.key },
                    { $setOnInsert: item },
                    { upsert: true }
                );
            }
        }
    } catch (_) {
        // Non-blocking in case of race condition
    }
}

async function getFeatures(_req, res) {
    try {
        await ensureDefaultFeatures();
        const features = await Feature.find().sort({ category: 1, name: 1 });
        res.json(features);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

async function getRoles(_req, res) {
    try {
        res.json(SYSTEM_ROLES);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

async function createFeature(req, res) {
    try {
        const { key, name, description, category, isCore, isActive } = req.body;
        if (!key || !name) {
            return res.status(400).json({ message: "Feature key and name are required" });
        }

        const normalizedKey = key.trim().toLowerCase();
        const existing = await Feature.findOne({ key: normalizedKey });
        if (existing) {
            return res.status(400).json({ message: `Feature key '${normalizedKey}' already exists` });
        }

        const feature = await Feature.create({
            key: normalizedKey,
            name: name.trim(),
            description: description || "",
            category: category || "core",
            isCore: Boolean(isCore),
            isActive: isActive !== false,
        });

        res.status(201).json(feature);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

async function updateFeature(req, res) {
    try {
        const { id } = req.params;
        const feature = await Feature.findByIdAndUpdate(id, req.body, { new: true });
        if (!feature) return res.status(404).json({ message: "Feature not found" });
        res.json(feature);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

// ==========================================
// 2. Plans & Impact Preview
// ==========================================

async function getPlans(_req, res) {
    try {
        const plans = await Plan.find().sort({ sortOrder: 1, priceMonthly: 1 });
        res.json(plans);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

async function createPlan(req, res) {
    try {
        const { key, name, priceMonthly, priceYearly, currency, features, allowedRoles, limits, fairUseCaps, visibility, description } = req.body;

        const existing = await Plan.findOne({ key: key?.trim()?.toLowerCase() });
        if (existing) {
            return res.status(400).json({ message: `Plan key '${key}' already exists` });
        }

        const plan = await Plan.create({
            key: key?.trim()?.toLowerCase(),
            name: name?.trim(),
            priceMonthly,
            priceYearly,
            currency: currency || "USD",
            features: features || [],
            allowedRoles: allowedRoles || [],
            limits: limits || { maxMembers: 500, maxStaff: 10, maxBranches: 1 },
            fairUseCaps: fairUseCaps || { storageGb: 25, whatsappMessagesMonthly: 2000 },
            visibility: visibility || "public",
            description: description || "",
        });

        res.status(201).json(plan);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
}

async function getPlanImpactPreview(req, res) {
    try {
        const { id } = req.params;
        const { targetFeatures = [] } = req.body;

        const plan = await Plan.findById(id);
        if (!plan) return res.status(404).json({ message: "Plan not found" });

        const currentFeatures = new Set(plan.features || []);
        const nextFeatures = new Set(targetFeatures);

        const featuresAdded = targetFeatures.filter((f) => !currentFeatures.has(f));
        const featuresRemoved = (plan.features || []).filter((f) => !nextFeatures.has(f));

        const activeTenants = await Tenant.find({
            planId: plan._id,
            status: { $in: ["trial", "active", "past_due"] },
        }).select("name slug billing");

        let recurringCount = 0;
        let lifetimeFollowTierCount = 0;
        let lifetimeSnapshotCount = 0;

        for (const t of activeTenants) {
            if (t.billing?.cycle === "lifetime") {
                if (t.billing.lifetime?.entitlementPolicy === "snapshot") {
                    lifetimeSnapshotCount++;
                } else {
                    lifetimeFollowTierCount++;
                }
            } else {
                recurringCount++;
            }
        }

        const totalAffectedTenants = recurringCount + lifetimeFollowTierCount;

        res.json({
            plan: { id: plan._id, key: plan.key, name: plan.name },
            featuresAdded,
            featuresRemoved,
            totalSubscribers: activeTenants.length,
            impact: {
                totalAffectedTenants,
                recurringSubscribersAffected: recurringCount,
                lifetimeFollowTierAffected: lifetimeFollowTierCount,
                lifetimeSnapshotProtected: lifetimeSnapshotCount,
            },
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

async function updatePlan(req, res) {
    try {
        const { id } = req.params;
        const plan = await Plan.findById(id);
        if (!plan) return res.status(404).json({ message: "Plan not found" });

        // Update plan fields
        Object.assign(plan, req.body);
        await plan.save();

        res.json({ message: "Plan updated successfully", plan });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
}

async function archivePlan(req, res) {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        if (!reason || !reason.trim()) {
            return res.status(400).json({ message: "Mandatory 'reason' required to archive a plan" });
        }

        const plan = await Plan.findById(id);
        if (!plan) return res.status(404).json({ message: "Plan not found" });

        plan.visibility = "archived";
        plan.isActive = false;
        await plan.save();

        await AuditLog.create({
            action: "plan_updated",
            actor: req.platformUser.id,
            actorRole: "PlatformUser",
            targetType: "plan",
            targetId: plan._id.toString(),
            meta: {
                action: "plan_archived",
                planKey: plan.key,
                reason,
            },
        });

        res.json({ message: `Plan '${plan.name}' archived. Existing subscribers remain untouched.`, plan });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

// ==========================================
// 3. PlanPrice (Tiers, Cycles, Caps, Price Changes)
// ==========================================

async function getPlanPrices(_req, res) {
    try {
        const prices = await PlanPrice.find().populate("planId", "key name").sort({ planId: 1, cycle: 1 });
        res.json(prices);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

async function createPlanPrice(req, res) {
    try {
        const { planId, cycle, amount, currency, maxLifetimeSeats, validFrom, validUntil, isActive } = req.body;
        if (!planId || !cycle || amount == null) {
            return res.status(400).json({ message: "planId, cycle, and amount are required" });
        }

        const price = await PlanPrice.create({
            planId,
            cycle,
            amount: Number(amount),
            currency: currency || "USD",
            maxLifetimeSeats: cycle === "lifetime" ? (maxLifetimeSeats != null ? Number(maxLifetimeSeats) : null) : null,
            validFrom: validFrom || new Date(),
            validUntil: validUntil || null,
            isActive: isActive !== false,
        });

        res.status(201).json(price);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
}

async function updatePlanPrice(req, res) {
    try {
        const { id } = req.params;
        const { amount, currency, maxLifetimeSeats, validUntil, isActive, reason } = req.body;

        const price = await PlanPrice.findById(id).populate("planId", "key name");
        if (!price) return res.status(404).json({ message: "PlanPrice not found" });

        const oldAmount = price.amount;
        if (amount != null && Number(amount) !== oldAmount) {
            if (!reason || !reason.trim()) {
                return res.status(400).json({
                    message: "Mandatory 'reason' field required when modifying pricing amounts",
                });
            }

            // Write price_change BillingEvent
            await BillingEvent.create({
                tenantId: price.planId._id, // Platform reference
                type: "price_change",
                planKey: price.planId.key,
                cycle: price.cycle,
                amount: Number(amount),
                currency: currency || price.currency,
                actorId: req.platformUser.id,
                actorType: "PlatformAdmin",
                meta: {
                    planPriceId: price._id.toString(),
                    oldAmount,
                    newAmount: Number(amount),
                    reason,
                },
            });
        }

        if (amount != null) price.amount = Number(amount);
        if (currency) price.currency = currency;
        if (maxLifetimeSeats !== undefined) price.maxLifetimeSeats = maxLifetimeSeats != null ? Number(maxLifetimeSeats) : null;
        if (validUntil !== undefined) price.validUntil = validUntil;
        if (isActive !== undefined) price.isActive = Boolean(isActive);

        await price.save();

        res.json({ message: "Price updated successfully", price });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

async function togglePlanPriceSales(req, res) {
    try {
        const { id } = req.params;
        const price = await PlanPrice.findById(id);
        if (!price) return res.status(404).json({ message: "PlanPrice not found" });

        price.isActive = !price.isActive;
        await price.save();

        res.json({
            message: `Sales for ${price.cycle} tier are now ${price.isActive ? "OPEN" : "CLOSED"}`,
            isActive: price.isActive,
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

// ==========================================
// 4. Coupons & Promotions Management
// ==========================================

async function getCoupons(req, res) {
    try {
        const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20 });
        const { isActive, search } = req.query || {};

        const filter = {};
        if (isActive !== undefined && isActive !== "") {
            filter.isActive = isActive === "true" || isActive === true;
        }
        if (search && search.trim()) {
            filter.code = new RegExp(search.trim(), "i");
        }

        const [coupons, total] = await Promise.all([
            Coupon.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
            Coupon.countDocuments(filter),
        ]);

        res.json({
            coupons,
            pagination: buildPagination(page, limit, total),
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

async function createCoupon(req, res) {
    try {
        const { code, type, discountValue, currency, appliesTo, maxRedemptions, expiresAt, isActive } = req.body;
        if (!code || !type || discountValue == null) {
            return res.status(400).json({ message: "code, type, and discountValue are required" });
        }

        const normalizedCode = code.trim().toUpperCase();
        const existing = await Coupon.findOne({ code: normalizedCode });
        if (existing) {
            return res.status(400).json({ message: `Coupon '${normalizedCode}' already exists` });
        }

        const coupon = await Coupon.create({
            code: normalizedCode,
            type,
            discountValue: Number(discountValue),
            currency: currency || "USD",
            appliesTo: appliesTo || { planKeys: [], cycles: [] },
            maxRedemptions: maxRedemptions != null ? Number(maxRedemptions) : null,
            expiresAt: expiresAt || null,
            isActive: isActive !== false,
        });

        res.status(201).json(coupon);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
}

async function updateCoupon(req, res) {
    try {
        const { id } = req.params;
        const coupon = await Coupon.findByIdAndUpdate(id, req.body, { new: true });
        if (!coupon) return res.status(404).json({ message: "Coupon not found" });
        res.json(coupon);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
}

async function deleteCoupon(req, res) {
    try {
        const { id } = req.params;
        await Coupon.findByIdAndDelete(id);
        res.json({ message: "Coupon deleted" });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

module.exports = {
    getFeatures,
    getRoles,
    SYSTEM_ROLES,
    DEFAULT_FEATURES,
    createFeature,
    updateFeature,
    getPlans,
    createPlan,
    getPlanImpactPreview,
    updatePlan,
    archivePlan,
    getPlanPrices,
    createPlanPrice,
    updatePlanPrice,
    togglePlanPriceSales,
    getCoupons,
    createCoupon,
    updateCoupon,
    deleteCoupon,
};
