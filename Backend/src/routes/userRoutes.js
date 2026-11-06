const express = require("express");
const router = express.Router();
const {
    registerUser,
    loginUser,
    getSalesRevenue,
    getSalesManagerRevenue,
    getSalesUsers,
    getReceptionists,
    getSalesReps,
    getMyProfile,
    getUserById,
    updateSalesRepTarget,
    createStaffUser,
    updateSalesRepAbilities,
    updateCoachRepAbilities,
    getSalesTeam,
    getSalesProfile,
    getSubscriptionsByDate,
    getSalesMySubscriptions,
    change_Role,
    getCoachTeam,
    getCoachProfile,
    updatePhonePrivacy,
    updateStaffMobile,
    getReceptionistTeam,
    resetUserPassword,
    updateMyProfile,
    getTeamsPage
} = require("../controllers/userController");
const { protect, authorizeRoles } = require("../middleware/authMiddleware");
const loginLimiter = require("../middleware/loginLimiter");
const validate = require("../middleware/validate");
const { loginSchema, createStaffSchema, setupPasswordSchema, forgotPasswordSchema } = require("../validation/schemas");
const { setupPassword, forgotPassword } = require("../controllers/passwordSetupController");
const { enforceStaffLimit, enforceSubscriptionStatus } = require("../middleware/tenantStatus");
const { requireFeature } = require("../middleware/featureGating");
const { cacheResponse } = require("../middleware/apiCache");
const { autoInvalidate } = require("../utils/cacheInvalidator");

// Public auth — rate limited + validated
router.post("/login", loginLimiter, validate(loginSchema), loginUser);
router.post("/setup-password", loginLimiter, validate(setupPasswordSchema), setupPassword);
router.post("/forgot-password", loginLimiter, validate(forgotPasswordSchema), forgotPassword);

router.use(protect);
router.use(enforceSubscriptionStatus);

// Registration is Owner-only (was publicly open — anyone could create Receptionist accounts)
router.post("/register", authorizeRoles("Owner"), enforceStaffLimit, autoInvalidate(["users"]), registerUser);

router.get("/profile", (req, res) => {
    res.json({ message: "protected route accessed", user: req.user });
});

router.get("/me", getMyProfile);
router.patch("/me", autoInvalidate(["users"]), updateMyProfile);
router.get("/sales-revenue", authorizeRoles("Sales"), cacheResponse({ ttlSeconds: 60, scope: "user", tags: ["revenue"] }), getSalesRevenue);
router.get("/sales-manager/revenue", authorizeRoles("Sales Manager", "Owner", "Accountant"), requireFeature("exec_analytics"), cacheResponse({ ttlSeconds: 120, tags: ["revenue"] }), getSalesManagerRevenue);
router.get("/sales-manager/subscriptions", authorizeRoles("Sales Manager", "Owner", "Accountant"), cacheResponse({ ttlSeconds: 120, tags: ["revenue", "contracts"] }), getSubscriptionsByDate);
router.get("/my-subscriptions", authorizeRoles("Sales"), cacheResponse({ ttlSeconds: 60, scope: "user", tags: ["revenue"] }), getSalesMySubscriptions);
router.get("/sales-reps", authorizeRoles("Sales Manager", "Owner"), cacheResponse({ ttlSeconds: 180, tags: ["users"] }), getSalesReps);
router.get("/sales", authorizeRoles("Sales Manager", "Owner", "Accountant", "Receptionist", "Sales"), cacheResponse({ ttlSeconds: 180, tags: ["users"] }), getSalesUsers);
router.get("/receptionists", cacheResponse({ ttlSeconds: 180, tags: ["users"] }), getReceptionists);
router.get("/team", authorizeRoles("Sales Manager", "Owner", "Accountant"), cacheResponse({ ttlSeconds: 180, tags: ["users"] }), getSalesTeam);
router.get("/team/:id", authorizeRoles("Sales Manager", "Owner", "Accountant"), cacheResponse({ ttlSeconds: 180, tags: ["users"] }), getSalesProfile);
router.get("/coach-team", authorizeRoles("Coach Manager", "Owner", "Sales Manager", "Receptionist", "Sales", "Accountant"), cacheResponse({ ttlSeconds: 180, tags: ["users"] }), getCoachTeam);
router.get("/coach-team/:id", authorizeRoles("Coach Manager", "Owner"), cacheResponse({ ttlSeconds: 180, tags: ["users"] }), getCoachProfile);
router.post("/staff", authorizeRoles("Sales Manager", "Owner", "Coach Manager"), enforceStaffLimit, autoInvalidate(["users"]), createStaffUser);
router.patch("/:id/target", protect, authorizeRoles("Sales Manager"), autoInvalidate(["users", "revenue"]), updateSalesRepTarget);
router.patch("/:id/abilities", protect, authorizeRoles("Sales Manager"), autoInvalidate(["users"]), updateSalesRepAbilities);
router.patch("/:id/coach-abilities", protect, authorizeRoles("Coach Manager"), autoInvalidate(["users"]), updateCoachRepAbilities);
router.patch("/:id/phone-privacy", protect, authorizeRoles("Sales Manager"), autoInvalidate(["users"]), updatePhonePrivacy);
router.patch("/:id/mobile", protect, authorizeRoles("Sales Manager", "Owner"), autoInvalidate(["users"]), updateStaffMobile);
router.patch("/:id/reset-password", protect, authorizeRoles("Sales Manager", "Owner"), autoInvalidate(["users"]), resetUserPassword);
router.get("/receptionist-team", protect, authorizeRoles("Sales Manager", "Owner", "Accountant"), cacheResponse({ ttlSeconds: 180, tags: ["users"] }), getReceptionistTeam);
router.get("/changerole/:id/:new_role", protect, authorizeRoles("Owner"), autoInvalidate(["users"]), change_Role);
router.get("/allTeams", protect, authorizeRoles("Owner"), cacheResponse({ ttlSeconds: 180, tags: ["users"] }), getTeamsPage);
router.get("/:id", protect, authorizeRoles("Sales Manager", "Owner", "Accountant"), cacheResponse({ ttlSeconds: 180, tags: ["users"] }), getUserById);


module.exports = router;
