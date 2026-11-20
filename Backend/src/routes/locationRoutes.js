const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { enforceSubscriptionStatus } = require("../middleware/tenantStatus");
const { allowRoles } = require("../middleware/accessMiddleware");
const { requireFeature } = require("../middleware/featureGating");
const { autoInvalidate } = require("../utils/cacheInvalidator");
const {
    listLocations,
    createLocation,
    updateLocation,
    deleteLocation,
} = require("../controllers/locationController");

router.use(protect);
router.use(enforceSubscriptionStatus);

router.get("/", listLocations);
router.post(
    "/",
    allowRoles("settings", "Owner"),
    requireFeature("locations"),
    autoInvalidate(["tenant", "locations"]),
    createLocation
);
router.patch(
    "/:id",
    allowRoles("settings", "Owner"),
    requireFeature("locations"),
    autoInvalidate(["tenant", "locations"]),
    updateLocation
);
router.delete(
    "/:id",
    allowRoles("settings", "Owner"),
    requireFeature("locations"),
    autoInvalidate(["tenant", "locations"]),
    deleteLocation
);

module.exports = router;
