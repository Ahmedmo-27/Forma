const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/accessMiddleware");
const { enforceSubscriptionStatus } = require("../middleware/tenantStatus");
const { requireFeature } = require("../middleware/featureGating");
const { cacheResponse } = require("../middleware/apiCache");
const {
    getChurn,
    getForecast,
    getCohorts,
    getAttendance,
    getFunnel,
    getExecutive,
} = require("../controllers/gymAnalyticsController");

const leadership = allowRoles("reports", "Owner", "General Manager", "Sales Manager", "Accountant");
const memberCache = cacheResponse({ ttlSeconds: 120, tags: ["members", "revenue"] });
const attendanceCache = cacheResponse({ ttlSeconds: 120, tags: ["members", "revenue", "checkins"] });

router.use(protect);
router.use(enforceSubscriptionStatus);

router.get("/churn", leadership, requireFeature("exec_analytics"), memberCache, getChurn);
router.get("/forecast", leadership, requireFeature("exec_analytics"), memberCache, getForecast);
router.get("/cohorts", leadership, requireFeature("exec_analytics"), memberCache, getCohorts);
router.get("/attendance", leadership, requireFeature("exec_analytics"), attendanceCache, getAttendance);
router.get("/funnel", leadership, requireFeature("funnels"), memberCache, getFunnel);
router.get("/executive", leadership, requireFeature("business_intelligence"), memberCache, getExecutive);

module.exports = router;
