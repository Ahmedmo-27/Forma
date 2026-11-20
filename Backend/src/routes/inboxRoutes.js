const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/accessMiddleware");
const { requireFeature } = require("../middleware/featureGating");
const { enforceSubscriptionStatus } = require("../middleware/tenantStatus");
const validate = require("../middleware/validate");
const { inboxReplySchema, inboxConversationPatchSchema } = require("../validation/schemas");
const {
    listConversations,
    getMessages,
    sendReply,
    patchConversation,
    listChannels,
    disconnectChannel,
} = require("../controllers/inboxController");

router.use(protect);
router.use(requireFeature("inbox"));
router.use(enforceSubscriptionStatus);

router.get(
    "/conversations",
    allowRoles("inbox_view", "Owner", "General Manager", "Sales Manager", "Sales"),
    listConversations
);
router.get(
    "/conversations/:id/messages",
    allowRoles("inbox_view", "Owner", "General Manager", "Sales Manager", "Sales"),
    getMessages
);
router.post(
    "/conversations/:id/messages",
    allowRoles("inbox_reply", "Owner", "General Manager", "Sales Manager", "Sales"),
    validate(inboxReplySchema),
    sendReply
);
router.patch(
    "/conversations/:id",
    allowRoles("inbox_reply", "Owner", "General Manager", "Sales Manager", "Sales"),
    validate(inboxConversationPatchSchema),
    patchConversation
);

// Removing an account changes who receives the gym's messages,
// so it stays with managers (a per-user grant of inbox_reply also unlocks it).
router.get(
    "/channels",
    allowRoles("inbox_view", "Owner", "General Manager", "Sales Manager", "Sales"),
    listChannels
);
router.delete(
    "/channels/:id",
    allowRoles("inbox_reply", "Owner", "General Manager", "Sales Manager"),
    disconnectChannel
);

module.exports = router;
