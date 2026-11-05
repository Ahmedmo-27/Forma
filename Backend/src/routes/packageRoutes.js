const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");
const validate = require("../middleware/validate");
const { requireFeature } = require("../middleware/featureGating");
const { createPackageSchema, updatePackageSchema } = require("../validation/schemas");
const { createPackage, getAllPackages, updatePackage, deletePackage } = require("../controllers/packageController");

router.use(protect);
router.use(requireFeature("packages"));

router.get("/", getAllPackages);
router.post("/", authorize("Owner", "Sales Manager"), validate(createPackageSchema), createPackage);
router.patch("/:id", authorize("Owner", "Sales Manager"), validate(updatePackageSchema), updatePackage);
router.delete("/:id", authorize("Owner", "Sales Manager"), deletePackage);

module.exports = router;
