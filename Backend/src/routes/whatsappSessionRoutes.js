const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { requireFeature } = require("../middleware/featureGating");
const validate = require("../middleware/validate");
const { uploadWhatsAppImage } = require("../config/whatsappUpload");
const {
    sendWhatsAppMessageSchema,
    sendWhatsAppImageSchema,
} = require("../validation/schemas");
const {
    getSession,
    start,
    logout,
    sendMessage,
    sendImageMessage,
} = require("../controllers/whatsappSessionController");

router.use(protect);
router.use(requireFeature("whatsapp"));

router.get("/session", getSession);
router.post("/session/start", start);
router.post("/session/logout", logout);
router.post("/messages", validate(sendWhatsAppMessageSchema), sendMessage);
router.post(
    "/messages/image",
    uploadWhatsAppImage,
    validate(sendWhatsAppImageSchema),
    sendImageMessage
);

module.exports = router;
