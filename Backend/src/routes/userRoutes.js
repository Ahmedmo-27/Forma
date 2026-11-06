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
const {
    searchUsersForAccess,
    getUserAccess,
    updateUserAccess,
    updateUserAreaAccess,
} = require("../controllers/accessController");
const { protect, authorizeRoles } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/accessMiddleware");
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
router.get("/access/search", allowRoles("access_control", "Owner", "Sales Manager", "Coach Manager"), searchUsersForAccess);
router.get("/sales-revenue", allowRoles("sales_dashboard", "Sales"), cacheResponse({ ttlSeconds: 60, scope: "user", tags: ["revenue"] }), getSalesRevenue);
router.get("/sales-manager/revenue", allowRoles("reports", "Sales Manager", "Owner", "Accountant"), requireFeature("exec_analytics"), cacheResponse({ ttlSeconds: 120, tags: ["revenue"] }), getSalesManagerRevenue);
router.get("/sales-manager/subscriptions", allowRoles("reports", "Sales Manager", "Owner", "Accountant"), cacheResponse({ ttlSeconds: 120, tags: ["revenue", "contracts"] }), getSubscriptionsByDate);
router.get("/my-subscriptions", allowRoles("sales_dashboard", "Sales"), cacheResponse({ ttlSeconds: 60, scope: "user", tags: ["revenue"] }), getSalesMySubscriptions);
router.get("/sales-reps", allowRoles("sales_team", "Sales Manager", "Owner"), cacheResponse({ ttlSeconds: 180, tags: ["users"] }), getSalesReps);
router.get("/sales", allowRoles("sales_team", "Sales Manager", "Owner", "Accountant", "Receptionist", "Sales"), cacheResponse({ ttlSeconds: 180, tags: ["users"] }), getSalesUsers);
router.get("/receptionists", cacheResponse({ ttlSeconds: 180, tags: ["users"] }), getReceptionists);
router.get("/team", allowRoles("sales_team", "Sales Manager", "Owner", "Accountant"), cacheResponse({ ttlSeconds: 180, tags: ["users"] }), getSalesTeam);
router.get("/team/:id", allowRoles("sales_team", "Sales Manager", "Owner", "Accountant"), cacheResponse({ ttlSeconds: 180, tags: ["users"] }), getSalesProfile);
router.get("/coach-team", allowRoles("coach_team", "Coach Manager", "Owner", "Sales Manager", "Receptionist", "Sales", "Accountant"), cacheResponse({ ttlSeconds: 180, tags: ["users"] }), getCoachTeam);
router.get("/coach-team/:id", allowRoles("coach_team", "Coach Manager", "Owner"), cacheResponse({ ttlSeconds: 180, tags: ["users"] }), getCoachProfile);
router.post("/staff", allowRoles("staff", "Sales Manager", "Owner", "Coach Manager"), enforceStaffLimit, autoInvalidate(["users"]), createStaffUser);
router.patch("/:id/target", protect, allowRoles("targets", "Sales Manager", "Owner", "Accountant"), autoInvalidate(["users", "revenue"]), updateSalesRepTarget);
router.patch("/:id/abilities", protect, authorizeRoles("Sales Manager", "Owner", "General Manager"), autoInvalidate(["users"]), updateSalesRepAbilities);
router.patch("/:id/coach-abilities", protect, authorizeRoles("Coach Manager", "Owner", "General Manager"), autoInvalidate(["users"]), updateCoachRepAbilities);
router.patch("/:id/phone-privacy", protect, authorizeRoles("Sales Manager", "Owner", "General Manager"), autoInvalidate(["users"]), updatePhonePrivacy);
router.patch("/:id/mobile", protect, authorizeRoles("Sales Manager", "Owner"), autoInvalidate(["users"]), updateStaffMobile);
router.patch("/:id/reset-password", protect, allowRoles("staff", "Sales Manager", "Owner"), autoInvalidate(["users"]), resetUserPassword);
router.get("/receptionist-team", protect, allowRoles("sales_team", "Sales Manager", "Owner", "Accountant"), cacheResponse({ ttlSeconds: 180, tags: ["users"] }), getReceptionistTeam);
router.get("/changerole/:id/:new_role", protect, allowRoles("change_role", "Owner"), autoInvalidate(["users"]), change_Role);
router.get("/allTeams", protect, allowRoles("teams_overview", "Owner"), cacheResponse({ ttlSeconds: 180, tags: ["users"] }), getTeamsPage);
router.get("/:id/access", allowRoles("access_control", "Owner", "Sales Manager", "Coach Manager"), getUserAccess);
router.put("/:id/access", allowRoles("access_control", "Owner", "Sales Manager", "Coach Manager"), autoInvalidate(["users"]), updateUserAccess);
router.patch("/:id/access", allowRoles("access_control", "Owner", "General Manager"), autoInvalidate(["users"]), updateUserAreaAccess);
router.get("/:id", protect, authorizeRoles("Sales Manager", "Owner", "Accountant", "General Manager"), cacheResponse({ ttlSeconds: 180, tags: ["users"] }), getUserById);


module.exports = router;
