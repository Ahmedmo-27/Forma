const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/accessMiddleware");
const validate = require("../middleware/validate");
const { requireFeature } = require("../middleware/featureGating");
const { cacheResponse } = require("../middleware/apiCache");
const { autoInvalidate } = require("../utils/cacheInvalidator");
const { locationScopeOptional } = require("../middleware/locationScope");
const {
    createExceptionSchema,
    exceptionStatusSchema,
} = require("../validation/schemas");
const {
    createException,
    updateExceptionStatus,
    getExceptions,
    getMemberPendingException,
} = require("../controllers/packageExceptionController");

router.use(protect);
router.use(requireFeature("exception_approvals"));
router.use(locationScopeOptional);

router.get("/", allowRoles("package_approvals", "Accountant", "Owner"), cacheResponse({ ttlSeconds: 60, tags: ["package-exceptions"] }), getExceptions);
router.get("/member/:memberId", allowRoles("package_approvals", "Sales Manager", "Owner", "Accountant", "Receptionist"), cacheResponse({ ttlSeconds: 60, tags: ["package-exceptions"] }), getMemberPendingException);
router.post("/", allowRoles("packages", "Sales Manager", "Owner"), validate(createExceptionSchema), autoInvalidate(["package-exceptions"]), createException);
router.put("/:id/status", allowRoles("package_approvals", "Accountant", "Owner"), validate(exceptionStatusSchema), autoInvalidate(["package-exceptions", "contracts", "revenue"]), updateExceptionStatus);

module.exports = router;
