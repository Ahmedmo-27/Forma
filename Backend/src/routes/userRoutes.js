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
    getTeamsPage,
    updateMyProfile,
} = require("../controllers/userController");
const { protect, authorizeRoles } = require("../middleware/authMiddleware");
const loginLimiter = require("../middleware/loginLimiter");
const validate = require("../middleware/validate");
const { loginSchema, createStaffSchema } = require("../validation/schemas");

// Public auth — rate limited + validated
router.post("/login", loginLimiter, validate(loginSchema), loginUser);

// Registration is Owner-only (was publicly open — anyone could create Receptionist accounts)
router.post("/register", protect, authorizeRoles("Owner"), registerUser);

router.get("/profile", protect, (req, res) => {
    res.json({ message: "protected route accessed", user: req.user });
});

router.get("/me", protect, getMyProfile);
router.patch("/me", protect, updateMyProfile);
router.get("/sales-revenue", protect, authorizeRoles("Sales"), getSalesRevenue);
router.get("/sales-manager/revenue", protect, authorizeRoles("Sales Manager", "Owner", "Accountant"), getSalesManagerRevenue);
router.get("/sales-manager/subscriptions", protect, authorizeRoles("Sales Manager", "Owner", "Accountant"), getSubscriptionsByDate);
router.get("/my-subscriptions", protect, authorizeRoles("Sales"), getSalesMySubscriptions);
router.get("/sales-reps", protect, authorizeRoles("Sales Manager", "Owner"), getSalesReps);
router.get("/sales", protect, authorizeRoles("Sales Manager", "Owner", "Accountant", "Receptionist", "Sales"), getSalesUsers);
router.get("/receptionists", protect, getReceptionists);
router.get("/team", protect, authorizeRoles("Sales Manager", "Owner", "Accountant"), getSalesTeam);
router.get("/team/:id", protect, authorizeRoles("Sales Manager", "Owner", "Accountant"), getSalesProfile);
router.get("/coach-team", protect, authorizeRoles("Coach Manager", "Owner", "Sales Manager", "Receptionist", "Sales", "Accountant"), getCoachTeam);
router.get("/coach-team/:id", protect, authorizeRoles("Coach Manager", "Owner"), getCoachProfile);
router.post("/staff", protect, authorizeRoles("Sales Manager", "Owner", "Coach Manager"), createStaffUser);
router.patch("/:id/target", protect, authorizeRoles("Sales Manager"), updateSalesRepTarget);
router.patch("/:id/abilities", protect, authorizeRoles("Sales Manager"), updateSalesRepAbilities);
router.patch("/:id/coach-abilities", protect, authorizeRoles("Coach Manager"), updateCoachRepAbilities);
router.patch("/:id/phone-privacy", protect, authorizeRoles("Sales Manager"), updatePhonePrivacy);
router.patch("/:id/mobile", protect, authorizeRoles("Sales Manager", "Owner"), updateStaffMobile);
router.get("/receptionist-team", protect, authorizeRoles("Sales Manager", "Owner", "Accountant"), getReceptionistTeam);
router.get("/changerole/:id/:new_role", protect, authorizeRoles("Owner"), change_Role);
router.get("/:id", protect, authorizeRoles("Sales Manager", "Owner", "Accountant"), getUserById);
router.get("/allTeams",protect,authorizeRoles("Owner"),getTeamsPage);


module.exports = router;
