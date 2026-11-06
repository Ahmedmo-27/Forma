const express   = require("express");
const router    = express.Router();
const { protect }   = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/accessMiddleware");
const { memberListDecision } = require("../utils/accessControl");
const uploadLimiter = require("../middleware/uploadLimiter");
const { uploadSingle, uploadSinglePhoto } = require("../config/multer");
const validate  = require("../middleware/validate");
const { requireFeature } = require("../middleware/featureGating");
const { enforceMemberLimit, enforceSubscriptionStatus } = require("../middleware/tenantStatus");
const { cacheResponse } = require("../middleware/apiCache");
const { liveStream } = require("../utils/liveEvents");
const { autoInvalidate } = require("../utils/cacheInvalidator");
const {
    createMemberSchema,
    freezeMemberSchema,
    addNoteSchema,
    addAlertSchema,
    invitationSchema,
    assignPackageSchema,
} = require("../validation/schemas");
const {
    createMember,
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
} = require("../controllers/memberController");

router.use(protect);
router.use(enforceSubscriptionStatus);
router.use(requireFeature("members"));

// ── Routes ────────────────────────────────────────────────────────────────────

router.post("/", allowRoles("members", "Receptionist", "Owner", "Sales Manager", "Sales"), enforceMemberLimit, validate(createMemberSchema), autoInvalidate(["members", "revenue"]), createMember);
router.post("/bulk-import", allowRoles("import_members", "Sales Manager", "Owner"), requireFeature("excel_import"), autoInvalidate(["members", "revenue"]), (req, res, next) => {
    const multer = require("multer");
    const upload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
        fileFilter: (req, file, cb) => {
            const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname);
            cb(ok ? null : new Error("Only .xlsx, .xls or .csv files allowed"), ok);
        },
    }).single("file");
    upload(req, res, (err) => {
        if (err) return res.status(400).json({ message: err.message });
        next();
    });
}, bulkImportMembers);

router.post("/bulk-transfer-sales", protect, allowRoles("transfer", "Sales Manager", "Owner"), autoInvalidate(["members", "revenue"]), bulkTransferSalesReps);
router.post("/bulk-transfer-coach", protect, allowRoles("coach_transfer", "Coach Manager", "Owner"), autoInvalidate(["members", "coach-transfers"]), bulkTransferCoach);

// Body-based check-in for barcode scanners: POST /members/check-in { identifier: "FF000105" }
router.post("/check-in", allowRoles("check_in", "Receptionist", "Owner", "Sales Manager", "Sales"), requireFeature("checkin"), autoInvalidate(["checkins", "members"]), (req, res, next) => {
    req.params.memberId = req.body.identifier;
    checkInMember(req, res, next);
});

router.get("/", protect, cacheResponse({ ttlSeconds: 60, tags: ["members"] }), (req, res, next) => {
    const decision = memberListDecision(req.user);
    if (decision === "deny") return res.status(403).json({ message: "You do not have access to this feature" });
    if (decision === "all") return getAllMembers(req, res, next);
    return getMembers(req, res, next);
});

// All members (for global search — all authenticated staff)
router.get("/all", protect, allowRoles("member_profile", "Receptionist", "Owner", "Sales", "Sales Manager", "Accountant", "Coach", "Coach Manager"), cacheResponse({ ttlSeconds: 60, tags: ["members"] }), getAllMembers);

router.get("/all-notes", protect, allowRoles("comments", "Sales", "Sales Manager", "Owner", "Coach Manager"), cacheResponse({ ttlSeconds: 60, tags: ["members"] }), getAllNotes);
router.get("/live", allowRoles("check_in", "Receptionist", "Owner", "Sales", "Sales Manager"), liveStream);
router.get("/today-checkins", protect, allowRoles("check_in", "Receptionist", "Owner", "Sales", "Sales Manager"), cacheResponse({ ttlSeconds: 5, tags: ["checkins"] }), getTodayCheckIns);
router.get("/today-coach-transfers", protect, allowRoles("my_transfers", "Coach", "Coach Manager"), cacheResponse({ ttlSeconds: 60, tags: ["coach-transfers"] }), getTodayCoachTransfers);

router.get("/:memberId", protect, allowRoles("member_profile", "Receptionist", "Owner", "Sales", "Sales Manager", "Coach", "Coach Manager", "Accountant"), cacheResponse({ ttlSeconds: 120, tags: ["members"] }), getMemberProfile);

router.post("/:memberId/notes", allowRoles("comments", "Owner", "Sales", "Sales Manager", "Coach", "Coach Manager"), validate(addNoteSchema), autoInvalidate(["members"]), addNote);
router.post("/:memberId/invitations", allowRoles("members", "Receptionist", "Owner", "Sales", "Sales Manager"), uploadLimiter, uploadSingle("idFile"), validate(invitationSchema), autoInvalidate(["members"]), addInvitation);
router.put("/:memberId/sales-rep", protect, allowRoles("transfer", "Sales Manager", "Owner"), autoInvalidate(["members", "revenue"]), switchSalesRep);
router.post("/:memberId/alerts", protect, allowRoles("members", "Receptionist", "Sales", "Sales Manager"), validate(addAlertSchema), autoInvalidate(["members"]), addAlert);
router.post("/:memberId/checkin", allowRoles("check_in", "Receptionist", "Owner", "Sales Manager", "Sales"), requireFeature("checkin"), autoInvalidate(["checkins", "members"]), checkInMember);
router.patch("/:memberId/alerts/:alertId/deactivate", protect, allowRoles("members", "Receptionist", "Sales", "Sales Manager", "Owner"), autoInvalidate(["members"]), deactivateAlert);
router.patch("/:memberId/assign-sales", allowRoles("members", "Receptionist", "Owner", "Sales Manager", "Sales"), autoInvalidate(["members", "revenue"]), assignSalesman);
router.patch("/:memberId/freeze", allowRoles("members", "Receptionist", "Owner", "Sales", "Sales Manager"), validate(freezeMemberSchema), autoInvalidate(["members"]), freezeMember);
router.patch("/:memberId/block", protect, allowRoles("management", "Owner", "Sales Manager", "Coach Manager", "General Manager"), autoInvalidate(["members"]), blockMember);
router.patch("/:memberId/unblock", protect, allowRoles("management", "Owner", "Sales Manager", "Coach Manager", "General Manager"), autoInvalidate(["members"]), unblockMember);
router.post("/:memberId/package", protect, allowRoles("package_approvals", "Accountant", "Owner"), requireFeature("packages"), validate(assignPackageSchema), autoInvalidate(["members", "revenue", "contracts"]), assignPackage);
router.patch("/:memberId/national-id", protect, allowRoles("accounting_dashboard", "Accountant", "Owner"), uploadLimiter, uploadSingle("nationalIdFile"), autoInvalidate(["members"]), uploadNationalId);
router.patch("/:memberId/photo", protect, allowRoles("members", "Accountant", "Owner", "Receptionist"), uploadLimiter, uploadSinglePhoto("photoFile"), autoInvalidate(["members"]), uploadProfilePhoto);
router.delete("/:memberId/photo", protect, allowRoles("members", "Accountant", "Owner", "Receptionist"), uploadLimiter, autoInvalidate(["members"]), deleteProfilePhoto);

router.post("/PTcheckin", protect, allowRoles("coach_checkin", "Coach", "Coach Manager"), requireFeature("pt_tracking"), autoInvalidate(["members", "coach-transfers"]), sessionCheckIn_for_couch);

// ── Coach routes ──────────────────────────────────────────────────────────────

router.patch("/:memberId/assign-coach", protect, allowRoles("coach_transfer", "Coach Manager", "Owner"), autoInvalidate(["members"]), assignCoach);
router.put("/:memberId/coach-rep", protect, allowRoles("coach_transfer", "Coach Manager", "Owner"), autoInvalidate(["members"]), switchCoach);
router.post("/:memberId/couch-notes", protect, allowRoles("coach_notes", "Coach", "Coach Manager"), autoInvalidate(["members"]), addCouch_notes);
router.get("/by/:memberId", allowRoles("member_profile", "Receptionist", "Owner", "Sales", "Sales Manager", "Coach", "Coach Manager", "Accountant", "General Manager"), cacheResponse({ ttlSeconds: 120, tags: ["members"] }), getMemberById);


router.post("/:memberId/pt-sessions", protect, allowRoles("accounting_dashboard", "Owner", "Accountant"), requireFeature("pt_tracking"), autoInvalidate(["members", "revenue"]), addPT_sessions);
router.post("/:memberId/refund", protect, allowRoles("refunds", "Owner", "Accountant"), requireFeature("accounting"), autoInvalidate(["members", "revenue", "contracts"]), refund);
router.post("/:memberId/refund_pt", protect, allowRoles("refunds", "Owner", "Accountant"), requireFeature("accounting"), autoInvalidate(["members", "revenue", "contracts"]), refundPT_Sessions);
module.exports = router;
