const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { enforceSubscriptionStatus } = require("../middleware/tenantStatus");
const { allowRoles, allowAnyFeature, requireAccess } = require("../middleware/accessMiddleware");
const validate = require("../middleware/validate");
const { requireFeature } = require("../middleware/featureGating");
const { cacheResponse } = require("../middleware/apiCache");
const { autoInvalidate } = require("../utils/cacheInvalidator");
const { createPackageSchema, updatePackageSchema } = require("../validation/schemas");
const { createPackage, getAllPackages, updatePackage, deletePackage } = require("../controllers/packageController");
const { locationScopeOptional } = require("../middleware/locationScope");

router.use(protect);
router.use(enforceSubscriptionStatus);
router.use(requireFeature("packages"));
router.use(locationScopeOptional);

// Catalog pickers for assign / request / approve flows — not only package managers.
router.get(
    "/",
    allowAnyFeature(
        ["packages", "request_package", "package_approvals", "bypass_package_approval"],
        "Sales",
        "Sales Manager",
        "Owner",
        "Accountant",
        "General Manager"
    ),
    cacheResponse({ ttlSeconds: 300, tags: ["packages"] }),
    getAllPackages
);

router.use(requireAccess("packages"));
router.post("/", allowRoles("packages", "Owner", "Sales Manager", "General Manager"), validate(createPackageSchema), autoInvalidate(["packages"]), createPackage);
router.patch("/:id", allowRoles("packages", "Owner", "Sales Manager", "General Manager"), validate(updatePackageSchema), autoInvalidate(["packages"]), updatePackage);
router.delete("/:id", allowRoles("packages", "Owner", "Sales Manager", "General Manager"), autoInvalidate(["packages"]), deletePackage);

module.exports = router;
