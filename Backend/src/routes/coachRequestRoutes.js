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

// All routes require authentication
router.use(protect);
router.use(requireFeature("pt_tracking"));

// Sales sees own requests; Sales Manager/Owner sees all
router.get("/",           authorize("Coach", "Coach Manager", "Owner"), getRequests);

// Sales creates a reassignment request
router.post("/",          authorize("Coach"),                           createRequest);

// Sales Manager / Owner approves or rejects
router.put("/:id/status", authorize("Coach Manager", "Owner"),          updateRequestStatus);

module.exports = router;
