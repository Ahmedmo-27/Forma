const express = require("express");
const router  = express.Router();
const {
    createRequest,
    updateRequestStatus,
    getRequests
} = require("../controllers/coachRequestController");
const { protect } = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");
const { requireFeature } = require("../middleware/featureGating");
const { cacheResponse } = require("../middleware/apiCache");
const { autoInvalidate } = require("../utils/cacheInvalidator");

// All routes require authentication
router.use(protect);
router.use(requireFeature("pt_tracking"));

// Coach sees own requests; Coach Manager/Owner sees all
router.get("/",           authorize("Coach", "Coach Manager", "Owner"), cacheResponse({ ttlSeconds: 45, tags: ["coach-requests"] }), getRequests);

// Coach creates a reassignment request
router.post("/",          authorize("Coach"), autoInvalidate(["coach-requests", "members"]), createRequest);

// Coach Manager / Owner approves or rejects
router.put("/:id/status", authorize("Coach Manager", "Owner"), autoInvalidate(["coach-requests", "members"]), updateRequestStatus);

module.exports = router;
