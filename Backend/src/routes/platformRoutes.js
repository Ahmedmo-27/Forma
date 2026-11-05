const express = require("express");
const router = express.Router();
const validate = require("../middleware/validate");
const { protectPlatform } = require("../middleware/platformAuth");
const {
    createPlanSchema,
    updatePlanSchema,
    createTenantSchema,
    updateTenantSchema,
} = require("../validation/schemas");
const {
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
} = require("../controllers/platformController");

// Public platform admin login
router.post("/auth/login", loginPlatformAdmin);

// Protected routes (requires platform admin JWT)
router.use(protectPlatform);

// Plans
router.get("/plans", getPlans);
router.post("/plans", validate(createPlanSchema), createPlan);
router.patch("/plans/:id", validate(updatePlanSchema), updatePlan);

// Tenants
router.get("/tenants", getTenants);
router.post("/tenants", validate(createTenantSchema), createTenant);
router.get("/tenants/:id", getTenantById);
router.patch("/tenants/:id/status", updateTenantStatus);
router.patch("/tenants/:id/plan", updateTenantPlan);
router.post("/tenants/:id/impersonate", impersonateTenant);

module.exports = router;
