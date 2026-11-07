const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/accessMiddleware");
const { enforceSubscriptionStatus } = require("../middleware/tenantStatus");
const { requireFeature } = require("../middleware/featureGating");
const {
    getDashboard,
    getCohorts,
    getHeatmap,
    getForecast,
    getFunnel,
    getInsights,
    dismissInsight,
    listObjectives,
    suggestObjectives,
    createObjective,
    updateObjective,
    insightToObjective,
    exportMetric,
    rebuild,
} = require("../controllers/biController");

const router = express.Router();
const readers = allowRoles(
    "reports",
    "Owner",
    "General Manager",
    "Sales Manager",
    "Accountant",
    "Sales",
    "Receptionist",
    "Coach",
    "Coach Manager"
);
const leadership = allowRoles("reports", "Owner", "General Manager", "Sales Manager", "Accountant", "Coach Manager");
const sales = allowRoles("reports", "Owner", "General Manager", "Sales Manager", "Sales", "Accountant");

router.use(protect);
router.use(enforceSubscriptionStatus);

router.get("/dashboard", readers, requireFeature("members"), getDashboard);
router.get("/cohorts", leadership, requireFeature("exec_analytics"), getCohorts);
router.get("/heatmap", leadership, requireFeature("exec_analytics"), getHeatmap);
router.get("/forecast", leadership, requireFeature("exec_analytics"), getForecast);
router.get("/funnel", sales, requireFeature("funnels"), getFunnel);
router.get("/insights", leadership, requireFeature("business_intelligence"), getInsights);
router.post("/insights/:id/dismiss", leadership, requireFeature("business_intelligence"), dismissInsight);
router.post("/insights/:id/objective", leadership, requireFeature("business_intelligence"), insightToObjective);
router.get("/objectives", leadership, requireFeature("business_intelligence"), listObjectives);
router.post("/objectives/suggest", leadership, requireFeature("business_intelligence"), suggestObjectives);
router.post("/objectives", leadership, requireFeature("business_intelligence"), createObjective);
router.patch("/objectives/:id", leadership, requireFeature("business_intelligence"), updateObjective);
router.get("/export", leadership, requireFeature("business_intelligence"), exportMetric);
router.post("/rebuild", allowRoles("reports", "Owner", "General Manager"), requireFeature("business_intelligence"), rebuild);

module.exports = router;
