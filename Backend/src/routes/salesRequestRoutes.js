const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");
const validate = require("../middleware/validate");
const { requireFeature } = require("../middleware/featureGating");
const { cacheResponse } = require("../middleware/apiCache");
const { autoInvalidate } = require("../utils/cacheInvalidator");
const {
    salesRequestSchema,
    salesRequestStatusSchema,
} = require("../validation/schemas");
const {
    createRequest,
    updateRequestStatus,
    getRequests
} = require("../controllers/salesRequestController");

// Identical auth on /api/sales-requests and /api/requests (both mount this router)
router.use(protect);
router.use(requireFeature("sales_crm"));

router.get("/",           authorize("Sales", "Sales Manager", "Owner"), cacheResponse({ ttlSeconds: 45, tags: ["requests"] }), getRequests);
router.post("/",          authorize("Sales"), validate(salesRequestSchema), autoInvalidate(["requests", "members"]), createRequest);
router.put("/:id/status", authorize("Sales Manager", "Owner"), validate(salesRequestStatusSchema), autoInvalidate(["requests", "members"]), updateRequestStatus);

module.exports = router;
