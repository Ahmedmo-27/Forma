const jwt = require("jsonwebtoken");
const PlatformAdmin = require("../models/PlatformAdmin");
const Tenant = require("../models/Tenant");
const Plan = require("../models/Plan");
const User = require("../models/User");
const Member = require("../models/Member");
const AuditLog = require("../models/AuditLog");
const { hashPassword, verifyPassword, normalizeEmail } = require("../utils/passwordUtils");
const { PLATFORM_AUDIENCE } = require("../middleware/platformAuth");
const { getEffectiveFeatures, getEffectiveLimits } = require("../models/Tenant");

/**
 * Platform Admin Login
 * POST /api/platform/auth/login
 */
const loginPlatformAdmin = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        const normalized = normalizeEmail(email);
        const admin = await PlatformAdmin.findOne({ email: normalized });
        if (!admin || !admin.isActive) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const { match } = await verifyPassword(password, admin.password);
        if (!match) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const token = jwt.sign(
            { id: admin._id.toString(), email: admin.email, name: admin.name },
            process.env.PLATFORM_JWT_SECRET || process.env.JWT_SECRET,
            {
                audience: PLATFORM_AUDIENCE,
                expiresIn: "12h",
            }
        );

        res.json({
            message: "Platform admin authenticated",
            token,
            admin: {
                id: admin._id,
                email: admin.email,
                name: admin.name,
            },
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

/**
 * Plans CRUD
 */
const getPlans = async (_req, res) => {
    try {
        const plans = await Plan.find().sort({ priceMonthly: 1 });
        res.json(plans);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

const createPlan = async (req, res) => {
    try {
        const plan = await Plan.create(req.body);
        res.status(201).json(plan);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

const updatePlan = async (req, res) => {
    try {
        const plan = await Plan.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!plan) return res.status(404).json({ message: "Plan not found" });
        res.json(plan);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

/**
 * Tenants Management
 */
const getTenants = async (_req, res) => {
    try {
        const tenants = await Tenant.find().populate("planId", "key name");
        res.json(tenants);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

const getTenantById = async (req, res) => {
    try {
        const tenant = await Tenant.findById(req.params.id).populate("planId");
        if (!tenant) return res.status(404).json({ message: "Tenant not found" });

        const [membersCount, staffCount] = await Promise.all([
            Member.collection.countDocuments({ tenantId: tenant._id }),
            User.collection.countDocuments({ tenantId: tenant._id }),
        ]);

        res.json({
            tenant,
            effectiveFeatures: getEffectiveFeatures(tenant, tenant.planId),
            limits: getEffectiveLimits(tenant, tenant.planId),
            usage: { members: membersCount, staff: staffCount },
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

const createTenant = async (req, res) => {
    try {
        const tenant = await Tenant.create(req.body);
        res.status(201).json(tenant);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

const updateTenantStatus = async (req, res) => {
    try {
        const { status } = req.body;
        if (!["trial", "active", "past_due", "suspended", "cancelled"].includes(status)) {
            return res.status(400).json({ message: "Invalid tenant status" });
        }

        const tenant = await Tenant.findByIdAndUpdate(
            req.params.id,
            { $set: { status } },
            { new: true }
        );
        if (!tenant) return res.status(404).json({ message: "Tenant not found" });

        await AuditLog.create({
            tenantId: tenant._id,
            action: "tenant_status_updated",
            actor: req.platformAdmin.id,
            actorRole: "PlatformAdmin",
            targetType: "tenant",
            targetId: tenant._id.toString(),
            meta: { newStatus: status, updatedBy: req.platformAdmin.email },
        });

        res.json({ message: "Tenant status updated", tenant });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

const updateTenantPlan = async (req, res) => {
    try {
        const { planId, featureOverrides, limitOverrides } = req.body;
        const update = {};
        if (planId) update.planId = planId;
        if (featureOverrides) update.featureOverrides = featureOverrides;
        if (limitOverrides) update.limitOverrides = limitOverrides;

        const tenant = await Tenant.findByIdAndUpdate(req.params.id, { $set: update }, { new: true }).populate("planId");
        if (!tenant) return res.status(404).json({ message: "Tenant not found" });

        res.json({ message: "Tenant plan & overrides updated", tenant });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

/**
 * Support / Impersonation Access
 * Issues a scoped token to support a specific tenant and logs the audit event.
 * POST /api/platform/tenants/:id/impersonate
 */
const impersonateTenant = async (req, res) => {
    try {
        const tenant = await Tenant.findById(req.params.id);
        if (!tenant) return res.status(404).json({ message: "Tenant not found" });

        // Find Owner or first admin user for the tenant
        let user = await User.findOne({ tenantId: tenant._id, role: "Owner" });
        if (!user) {
            user = await User.findOne({ tenantId: tenant._id });
        }

        if (!user) {
            return res.status(404).json({ message: "No users exist in this tenant to impersonate" });
        }

        await AuditLog.create({
            tenantId: tenant._id,
            action: "platform_impersonation",
            actor: req.platformAdmin.id,
            actorRole: "PlatformAdmin",
            targetType: "tenant",
            targetId: tenant._id.toString(),
            meta: {
                platformAdminId: req.platformAdmin.id,
                platformAdminEmail: req.platformAdmin.email,
                impersonatedUserId: user._id.toString(),
                impersonatedUserRole: user.role,
                reason: req.body?.reason || "Support impersonation",
            },
        });

        const token = jwt.sign(
            {
                id: user._id.toString(),
                role: user.role,
                tenantId: tenant._id.toString(),
                tenantSlug: tenant.slug,
                isImpersonation: true,
                platformAdminId: req.platformAdmin.id,
            },
            process.env.JWT_SECRET,
            { expiresIn: "2h" }
        );

        res.json({
            message: `Impersonation token generated for ${tenant.name}`,
            token,
            tenant: { id: tenant._id, name: tenant.name, slug: tenant.slug },
            user: { id: user._id, name: user.name, role: user.role },
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

module.exports = {
    loginPlatformAdmin,
    getPlans,
    createPlan,
    updatePlan,
    getTenants,
    getTenantById,
    createTenant,
    updateTenantStatus,
    updateTenantPlan,
    impersonateTenant,
};
