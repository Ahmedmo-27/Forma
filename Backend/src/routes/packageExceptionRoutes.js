const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");
const validate = require("../middleware/validate");
const { requireFeature } = require("../middleware/featureGating");
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

router.get("/", authorize("Accountant", "Owner"), getExceptions);
router.get("/member/:memberId", authorize("Sales Manager", "Owner", "Accountant", "Receptionist"), getMemberPendingException);
router.post("/", authorize("Sales Manager", "Owner"), validate(createExceptionSchema), createException);
router.put("/:id/status", authorize("Accountant", "Owner"), validate(exceptionStatusSchema), updateExceptionStatus);

module.exports = router;
