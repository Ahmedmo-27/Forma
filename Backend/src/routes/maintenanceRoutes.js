const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { enforceSubscriptionStatus } = require("../middleware/tenantStatus");
const { requireFeature } = require("../middleware/featureGating");
const { allowRoles, allowAnyFeature } = require("../middleware/accessMiddleware");
const { locationScopeOptional } = require("../middleware/locationScope");
const validate = require("../middleware/validate");
const {
    createMaintenanceItemSchema,
    updateMaintenanceItemSchema,
    copyMaintenanceItemSchema,
    completeMaintenanceItemSchema,
} = require("../validation/schemas");
const {
    listItems,
    createItems,
    updateItem,
    deleteItem,
    copyItem,
    getBoard,
    completeItem,
    getHistory,
} = require("../controllers/maintenanceController");

router.use(protect);
router.use(enforceSubscriptionStatus);
router.use(requireFeature("maintenance"));
router.use(locationScopeOptional);

router.get(
    "/board",
    allowRoles("maintenance_checklist", "Receptionist", "Owner", "General Manager"),
    getBoard
);

router.get(
    "/items",
    allowAnyFeature(
        ["maintenance_checklist", "manage_maintenance"],
        "Receptionist",
        "Owner",
        "General Manager"
    ),
    listItems
);

router.post(
    "/items",
    allowRoles("manage_maintenance", "Owner", "General Manager"),
    validate(createMaintenanceItemSchema),
    createItems
);

router.patch(
    "/items/:id",
    allowRoles("manage_maintenance", "Owner", "General Manager"),
    validate(updateMaintenanceItemSchema),
    updateItem
);

router.delete(
    "/items/:id",
    allowRoles("manage_maintenance", "Owner", "General Manager"),
    deleteItem
);

router.post(
    "/items/:id/copy",
    allowRoles("manage_maintenance", "Owner", "General Manager"),
    validate(copyMaintenanceItemSchema),
    copyItem
);

router.post(
    "/items/:id/complete",
    allowRoles("maintenance_checklist", "Receptionist", "Owner", "General Manager"),
    validate(completeMaintenanceItemSchema),
    completeItem
);

router.get(
    "/items/:id/history",
    allowAnyFeature(
        ["maintenance_checklist", "manage_maintenance"],
        "Receptionist",
        "Owner",
        "General Manager"
    ),
    getHistory
);

module.exports = router;
