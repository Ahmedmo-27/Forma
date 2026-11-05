const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");
const validate = require("../middleware/validate");
const { requireFeature } = require("../middleware/featureGating");
const { cacheResponse } = require("../middleware/apiCache");
const { autoInvalidate } = require("../utils/cacheInvalidator");
const {
    createWhatsAppTemplateSchema,
    updateWhatsAppTemplateSchema,
    logWhatsAppTemplateSendSchema,
} = require("../validation/schemas");
const {
    createTemplate,
    getTemplates,
    updateTemplate,
    deleteTemplate,
    logTemplateSend,
} = require("../controllers/whatsappTemplateController");

router.use(protect);
router.use(requireFeature("whatsapp"));

router.get("/", cacheResponse({ ttlSeconds: 300, tags: ["whatsapp"] }), getTemplates);

router.post(
    "/log-send",
    validate(logWhatsAppTemplateSendSchema),
    logTemplateSend
);

router.post(
    "/",
    authorize("Owner", "Sales Manager", "Accountant", "Coach Manager"),
    validate(createWhatsAppTemplateSchema),
    autoInvalidate(["whatsapp"]),
    createTemplate
);
router.patch(
    "/:id",
    authorize("Owner", "Sales Manager", "Accountant", "Coach Manager"),
    validate(updateWhatsAppTemplateSchema),
    autoInvalidate(["whatsapp"]),
    updateTemplate
);
router.delete(
    "/:id",
    authorize("Owner", "Sales Manager", "Accountant", "Coach Manager"),
    autoInvalidate(["whatsapp"]),
    deleteTemplate
);

module.exports = router;
