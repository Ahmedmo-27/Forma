const express = require("express");
const router  = express.Router();
const {
    createRequest,
    updateRequestStatus,
    getRequests
} = require("../controllers/coachRequestController");
const { protect } = require("../middleware/authMiddleware");
const { allowRoles, allowAnyFeature, requireAccess } = require("../middleware/accessMiddleware");
const { requireFeature } = require("../middleware/featureGating");
const { cacheResponse } = require("../middleware/apiCache");
const { autoInvalidate } = require("../utils/cacheInvalidator");
const { locationScopeOptional } = require("../middleware/locationScope");

// All routes require authentication
router.use(protect);
router.use(requireFeature("pt_tracking"));
router.use(requireAccess("coaching"));
router.use(locationScopeOptional);

// Coach sees own requests; Head Coach/Owner sees all
router.get("/",           allowRoles("my_transfers", "Coach", "Head Coach", "Owner"), cacheResponse({ ttlSeconds: 45, tags: ["coach-requests"] }), getRequests);

// Coach creates a reassignment request
router.post("/",          allowAnyFeature(["request_assignment", "request_takeover"], "Coach"), autoInvalidate(["coach-requests", "members"]), createRequest);

// Head Coach / Owner approves or rejects
router.put("/:id/status", allowRoles("coach_transfer", "Head Coach", "Owner"), autoInvalidate(["coach-requests", "members"]), updateRequestStatus);

module.exports = router;
