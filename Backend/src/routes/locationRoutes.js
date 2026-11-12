const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/accessMiddleware");
const { autoInvalidate } = require("../utils/cacheInvalidator");
const {
    listLocations,
    createLocation,
    updateLocation,
    deleteLocation,
} = require("../controllers/locationController");

router.use(protect);

router.get("/", listLocations);
router.post(
    "/",
    allowRoles("settings", "Owner"),
    autoInvalidate(["tenant", "locations"]),
    createLocation
);
router.patch(
    "/:id",
    allowRoles("settings", "Owner"),
    autoInvalidate(["tenant", "locations"]),
    updateLocation
);
router.delete(
    "/:id",
    allowRoles("settings", "Owner"),
    autoInvalidate(["tenant", "locations"]),
    deleteLocation
);

module.exports = router;
