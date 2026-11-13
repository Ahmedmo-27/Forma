const express   = require("express");
const router    = express.Router();
const { protect }   = require("../middleware/authMiddleware");
const { allowRoles, allowAnyFeature } = require("../middleware/accessMiddleware");
const { memberListDecision } = require("../utils/accessControl");
const uploadLimiter = require("../middleware/uploadLimiter");
const { uploadSingle, uploadSinglePhoto, uploadSpreadsheet } = require("../config/multer");
const validate  = require("../middleware/validate");
const { requireFeature } = require("../middleware/featureGating");
const { enforceMemberLimit, enforceSubscriptionStatus } = require("../middleware/tenantStatus");
const { cacheResponse } = require("../middleware/apiCache");
const { liveStream } = require("../utils/liveEvents");
const { autoInvalidate } = require("../utils/cacheInvalidator");
const { locationScopeOptional } = require("../middleware/locationScope");
const {
    createMemberSchema,
    updateMemberSchema,
    freezeMemberSchema,
    addNoteSchema,
    addAlertSchema,
    invitationSchema,
    assignPackageSchema,
} = require("../validation/schemas");
const {
    createMember,
    updateMember,
    getMemberProfile,
    getAllMembers,
    checkInMember,
    assignSalesman,
    freezeMember,
    getMembers,
    getMemberById,
    addNote,
    switchSalesRep,
    bulkTransferSalesReps,
    bulkTransferCoach,
    getTodayCoachTransfers,
    addInvitation,
    getAllNotes,
    sessionCheckIn_for_couch,
    assignCoach,
    addCouch_notes,
    switchCoach,
    assignPackage,
    getTodayCheckIns,
    uploadNationalId,
    uploadProfilePhoto,
    deleteProfilePhoto,
    addAlert,
    deactivateAlert,
    blockMember,
    unblockMember,
    addPT_sessions,
    refund,
    refundPT_Sessions,
    bulkImportMembers,
    getMemberImportJob,
} = require("../controllers/memberController");

router.use(protect);
router.use(enforceSubscriptionStatus);
router.use(requireFeature("members"));
router.use(locationScopeOptional);

// ── Routes ────────────────────────────────────────────────────────────────────

router.post("/", allowRoles("members", "Receptionist", "Owner", "Sales Manager", "Sales"), enforceMemberLimit, validate(createMemberSchema), autoInvalidate(["members", "revenue", "contracts"]), createMember);
router.post("/bulk-import", allowRoles("import_members", "Sales Manager", "Owner"), requireFeature("excel_import"), uploadSpreadsheet, bulkImportMembers);
router.get("/bulk-import/:jobId", allowRoles("import_members", "Sales Manager", "Owner"), requireFeature("excel_import"), getMemberImportJob);

router.post("/bulk-transfer-sales", protect, allowRoles("transfer", "Sales Manager", "Owner", "Head Coach", "General Manager"), autoInvalidate(["members", "revenue"]), bulkTransferSalesReps);
router.post("/bulk-transfer-coach", protect, allowRoles("coach_transfer", "Head Coach", "Owner", "Sales Manager", "General Manager"), autoInvalidate(["members", "coach-transfers"]), bulkTransferCoach);

// Body-based check-in for barcode scanners: POST /members/check-in { identifier: "FF000105" }
// Coaches may gym-check-in via coach_checkin (dual-mode coach desk); reception/sales use check_in.
router.post("/check-in", allowAnyFeature(["check_in", "coach_checkin"], "Receptionist", "Owner", "Sales Manager", "Sales", "Coach", "Head Coach"), requireFeature("checkin"), autoInvalidate(["checkins", "members"]), (req, res, next) => {
    req.params.memberId = req.body.identifier;
    checkInMember(req, res, next);
});

router.get("/", protect, cacheResponse({ ttlSeconds: 60, tags: ["members"] }), (req, res, next) => {
    const context = {
        roleAccess: req.tenant?.roleAccess || null,
        planFeatures: Array.isArray(req.planFeatures) ? req.planFeatures : null,
    };
    const decision = memberListDecision(req.user, context);
    if (decision === "deny") return res.status(403).json({ message: "You do not have access to this feature" });
    if (decision === "all") return getAllMembers(req, res, next);
    return getMembers(req, res, next);
});

// All members (for global search — all authenticated staff)
router.get("/all", protect, allowRoles("member_profile", "Receptionist", "Owner", "Sales", "Sales Manager", "Accountant", "Coach", "Head Coach"), cacheResponse({ ttlSeconds: 60, tags: ["members"] }), getAllMembers);

router.get("/all-notes", protect, allowRoles("comments", "Sales", "Sales Manager", "Owner", "Head Coach"), cacheResponse({ ttlSeconds: 60, tags: ["members"] }), getAllNotes);
router.get("/live", allowRoles("check_in", "Receptionist", "Owner", "Sales", "Sales Manager"), liveStream);
router.get("/today-checkins", protect, allowRoles("check_in", "Receptionist", "Owner", "Sales", "Sales Manager"), cacheResponse({ ttlSeconds: 5, tags: ["checkins"] }), getTodayCheckIns);
router.get("/today-coach-transfers", protect, allowRoles("my_transfers", "Coach", "Head Coach"), cacheResponse({ ttlSeconds: 60, tags: ["coach-transfers"] }), getTodayCoachTransfers);

router.get("/:memberId", protect, allowRoles("member_profile", "Receptionist", "Owner", "Sales", "Sales Manager", "Coach", "Head Coach", "Accountant"), cacheResponse({ ttlSeconds: 120, tags: ["members"] }), getMemberProfile);

router.post("/:memberId/notes", allowRoles("comments", "Owner", "Sales", "Sales Manager", "Coach", "Head Coach"), validate(addNoteSchema), autoInvalidate(["members"]), addNote);
router.post("/:memberId/invitations", allowRoles("members", "Receptionist", "Owner", "Sales", "Sales Manager"), uploadLimiter, uploadSingle("idFile"), validate(invitationSchema), autoInvalidate(["members"]), addInvitation);
router.put("/:memberId/sales-rep", protect, allowRoles("transfer", "Sales Manager", "Owner", "Head Coach", "General Manager"), autoInvalidate(["members", "revenue"]), switchSalesRep);
router.post("/:memberId/alerts", protect, allowRoles("members", "Receptionist", "Sales", "Sales Manager"), validate(addAlertSchema), autoInvalidate(["members"]), addAlert);
router.post("/:memberId/checkin", allowAnyFeature(["check_in", "coach_checkin"], "Receptionist", "Owner", "Sales Manager", "Sales", "Coach", "Head Coach"), requireFeature("checkin"), autoInvalidate(["checkins", "members"]), checkInMember);
router.patch("/:memberId/alerts/:alertId/deactivate", protect, allowRoles("members", "Receptionist", "Sales", "Sales Manager", "Owner"), autoInvalidate(["members"]), deactivateAlert);
router.patch("/:memberId/assign-sales", allowRoles("members", "Receptionist", "Owner", "Sales Manager", "Sales"), autoInvalidate(["members", "revenue"]), assignSalesman);
router.patch("/:memberId/freeze", allowRoles("members", "Receptionist", "Owner", "Sales", "Sales Manager"), validate(freezeMemberSchema), autoInvalidate(["members"]), freezeMember);
router.patch("/:memberId/block", protect, allowRoles("management", "Owner", "Sales Manager", "Head Coach", "General Manager"), autoInvalidate(["members"]), blockMember);
router.patch("/:memberId/unblock", protect, allowRoles("management", "Owner", "Sales Manager", "Head Coach", "General Manager"), autoInvalidate(["members"]), unblockMember);
router.post("/:memberId/package", protect, allowRoles("package_approvals", "Accountant", "Owner"), requireFeature("packages"), validate(assignPackageSchema), autoInvalidate(["members", "revenue", "contracts"]), assignPackage);
router.patch("/:memberId/national-id", protect, allowRoles("accounting_dashboard", "Accountant", "Owner"), uploadLimiter, uploadSingle("nationalIdFile"), autoInvalidate(["members"]), uploadNationalId);
router.patch("/:memberId/photo", protect, allowRoles("members", "Accountant", "Owner", "Receptionist"), uploadLimiter, uploadSinglePhoto("photoFile"), autoInvalidate(["members"]), uploadProfilePhoto);
router.patch("/:memberId", allowRoles("members", "Receptionist", "Owner", "Sales Manager", "Sales", "Accountant", "General Manager"), validate(updateMemberSchema), autoInvalidate(["members"]), updateMember);
router.delete("/:memberId/photo", protect, allowRoles("members", "Accountant", "Owner", "Receptionist"), uploadLimiter, autoInvalidate(["members"]), deleteProfilePhoto);

router.post("/PTcheckin", protect, allowRoles("coach_checkin", "Coach", "Head Coach"), requireFeature("pt_tracking"), autoInvalidate(["members", "coach-transfers"]), sessionCheckIn_for_couch);

// ── Coach routes ──────────────────────────────────────────────────────────────

router.patch("/:memberId/assign-coach", protect, allowRoles("coach_transfer", "Head Coach", "Owner"), autoInvalidate(["members"]), assignCoach);
router.put("/:memberId/coach-rep", protect, allowRoles("coach_transfer", "Head Coach", "Owner", "Sales Manager", "General Manager"), autoInvalidate(["members"]), switchCoach);
router.post("/:memberId/couch-notes", protect, allowRoles("coach_notes", "Coach", "Head Coach"), autoInvalidate(["members"]), addCouch_notes);
router.get("/by/:memberId", allowRoles("member_profile", "Receptionist", "Owner", "Sales", "Sales Manager", "Coach", "Head Coach", "Accountant", "General Manager"), cacheResponse({ ttlSeconds: 120, tags: ["members"] }), getMemberById);


router.post("/:memberId/pt-sessions", protect, allowAnyFeature(["accounting_dashboard", "assign_pt"], "Owner", "Accountant", "Coach", "Head Coach"), requireFeature("pt_tracking"), autoInvalidate(["members", "revenue"]), addPT_sessions);
router.post("/:memberId/refund", protect, allowRoles("refunds", "Owner", "Accountant"), requireFeature("accounting"), autoInvalidate(["members", "revenue", "contracts"]), refund);
router.post("/:memberId/refund_pt", protect, allowRoles("refunds", "Owner", "Accountant"), requireFeature("accounting"), autoInvalidate(["members", "revenue", "contracts"]), refundPT_Sessions);
module.exports = router;
