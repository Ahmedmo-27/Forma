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
const { loginSchema, createStaffSchema } = require("../validation/schemas");
const { enforceStaffLimit, enforceSubscriptionStatus } = require("../middleware/tenantStatus");
const { requireFeature } = require("../middleware/featureGating");

// Public auth — rate limited + validated
router.post("/login", loginLimiter, validate(loginSchema), loginUser);

router.use(protect);
router.use(enforceSubscriptionStatus);

// Registration is Owner-only (was publicly open — anyone could create Receptionist accounts)
router.post("/register", authorizeRoles("Owner"), enforceStaffLimit, registerUser);

router.get("/profile", (req, res) => {
    res.json({ message: "protected route accessed", user: req.user });
});

router.get("/me", getMyProfile);
router.patch("/me", updateMyProfile);
router.get("/sales-revenue", authorizeRoles("Sales"), getSalesRevenue);
router.get("/sales-manager/revenue", authorizeRoles("Sales Manager", "Owner", "Accountant"), requireFeature("exec_analytics"), getSalesManagerRevenue);
router.get("/sales-manager/subscriptions", authorizeRoles("Sales Manager", "Owner", "Accountant"), getSubscriptionsByDate);
router.get("/my-subscriptions", authorizeRoles("Sales"), getSalesMySubscriptions);
router.get("/sales-reps", authorizeRoles("Sales Manager", "Owner"), getSalesReps);
router.get("/sales", authorizeRoles("Sales Manager", "Owner", "Accountant", "Receptionist", "Sales"), getSalesUsers);
router.get("/receptionists", getReceptionists);
router.get("/team", authorizeRoles("Sales Manager", "Owner", "Accountant"), getSalesTeam);
router.get("/team/:id", authorizeRoles("Sales Manager", "Owner", "Accountant"), getSalesProfile);
router.get("/coach-team", authorizeRoles("Coach Manager", "Owner", "Sales Manager", "Receptionist", "Sales", "Accountant"), getCoachTeam);
router.get("/coach-team/:id", authorizeRoles("Coach Manager", "Owner"), getCoachProfile);
router.post("/staff", authorizeRoles("Sales Manager", "Owner", "Coach Manager"), enforceStaffLimit, createStaffUser);
router.patch("/:id/target", protect, authorizeRoles("Sales Manager"), updateSalesRepTarget);
router.patch("/:id/abilities", protect, authorizeRoles("Sales Manager"), updateSalesRepAbilities);
router.patch("/:id/coach-abilities", protect, authorizeRoles("Coach Manager"), updateCoachRepAbilities);
router.patch("/:id/phone-privacy", protect, authorizeRoles("Sales Manager"), updatePhonePrivacy);
router.patch("/:id/mobile", protect, authorizeRoles("Sales Manager", "Owner"), updateStaffMobile);
router.patch("/:id/reset-password", protect, authorizeRoles("Sales Manager", "Owner"), resetUserPassword);
router.get("/receptionist-team", protect, authorizeRoles("Sales Manager", "Owner", "Accountant"), getReceptionistTeam);
router.get("/changerole/:id/:new_role", protect, authorizeRoles("Owner"), change_Role);
router.get("/:id", protect, authorizeRoles("Sales Manager", "Owner", "Accountant"), getUserById);
router.get("/allTeams",protect,authorizeRoles("Owner"),getTeamsPage);


module.exports = router;
