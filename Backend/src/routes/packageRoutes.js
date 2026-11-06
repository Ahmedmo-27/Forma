const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { allowRoles, requireAccess } = require("../middleware/accessMiddleware");
const validate = require("../middleware/validate");
const { requireFeature } = require("../middleware/featureGating");
const { cacheResponse } = require("../middleware/apiCache");
const { autoInvalidate } = require("../utils/cacheInvalidator");
const { createPackageSchema, updatePackageSchema } = require("../validation/schemas");
const { createPackage, getAllPackages, updatePackage, deletePackage } = require("../controllers/packageController");

router.use(protect);
router.use(requireFeature("packages"));
router.use(requireAccess("packages"));

router.get("/", cacheResponse({ ttlSeconds: 300, tags: ["packages"] }), getAllPackages);
router.post("/", allowRoles("packages", "Owner", "Sales Manager"), validate(createPackageSchema), autoInvalidate(["packages"]), createPackage);
router.patch("/:id", allowRoles("packages", "Owner", "Sales Manager"), validate(updatePackageSchema), autoInvalidate(["packages"]), updatePackage);
router.delete("/:id", allowRoles("packages", "Owner", "Sales Manager"), autoInvalidate(["packages"]), deletePackage);

module.exports = router;
