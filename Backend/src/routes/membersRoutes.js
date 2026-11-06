const express   = require("express");
const router    = express.Router();
const { protect, authorizeRoles }   = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");
const uploadLimiter = require("../middleware/uploadLimiter");
const { uploadSingle, uploadSinglePhoto } = require("../config/multer");
const validate  = require("../middleware/validate");
const { requireFeature } = require("../middleware/featureGating");
const { enforceMemberLimit, enforceSubscriptionStatus } = require("../middleware/tenantStatus");
const { cacheResponse } = require("../middleware/apiCache");
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

// ── Role groups ───────────────────────────────────────────────────────────────

router.use(protect);
router.use(enforceSubscriptionStatus);
router.use(requireFeature("members"));

const readAccess  = [authorize("Receptionist", "Owner", "Sales", "Sales Manager", "Coach", "Accountant")];
const writeAccess = [authorize("Receptionist", "Owner", "Sales Manager", "Sales")];
const notesAccess = [authorize("Owner", "Sales", "Sales Manager", "Coach", "Coach Manager")];
const freezeAccess = [authorize("Receptionist", "Owner", "Sales", "Sales Manager")];
const inviteAccess = [authorize("Receptionist", "Owner", "Sales", "Sales Manager")];

// ── Routes ────────────────────────────────────────────────────────────────────

router.post("/", ...writeAccess, enforceMemberLimit, validate(createMemberSchema), autoInvalidate(["members", "revenue"]), createMember);
router.post("/bulk-import", authorizeRoles("Sales Manager", "Owner"), requireFeature("excel_import"), autoInvalidate(["members", "revenue"]), (req, res, next) => {
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

router.post("/bulk-transfer-sales", protect, authorizeRoles("Sales Manager", "Owner"), autoInvalidate(["members", "revenue"]), bulkTransferSalesReps);
router.post("/bulk-transfer-coach", protect, authorizeRoles("Coach Manager", "Owner"), autoInvalidate(["members", "coach-transfers"]), bulkTransferCoach);

// Body-based check-in for barcode scanners: POST /members/check-in { identifier: "FF000105" }
router.post("/check-in", ...writeAccess, requireFeature("checkin"), autoInvalidate(["checkins", "members"]), (req, res, next) => {
    req.params.memberId = req.body.identifier;
    checkInMember(req, res, next);
});

router.get("/", protect, cacheResponse({ ttlSeconds: 60, tags: ["members"] }), (req, res, next) => {
    if (["Sales", "Sales Manager", "Coach", "Coach Manager"].includes(req.user.role)) {
        return getMembers(req, res, next);
    }
    if (["Owner", "Accountant", "Receptionist"].includes(req.user.role)) {
        return getAllMembers(req, res, next);
    }
    return res.status(403).json({ message: "Access denied" });
});

// All members (for global search — all authenticated staff)
router.get("/all", protect, authorize("Receptionist", "Owner", "Sales", "Sales Manager", "Accountant", "Coach", "Coach Manager"), cacheResponse({ ttlSeconds: 60, tags: ["members"] }), getAllMembers);

router.get("/all-notes", protect, authorize("Sales", "Sales Manager", "Owner", "Coach Manager"), cacheResponse({ ttlSeconds: 60, tags: ["members"] }), getAllNotes);
router.get("/today-checkins", protect, authorize("Receptionist", "Owner", "Sales", "Sales Manager"), cacheResponse({ ttlSeconds: 60, tags: ["checkins"] }), getTodayCheckIns);
router.get("/today-coach-transfers", protect, authorize("Coach", "Coach Manager"), cacheResponse({ ttlSeconds: 60, tags: ["coach-transfers"] }), getTodayCoachTransfers);

router.get("/:memberId", protect, cacheResponse({ ttlSeconds: 120, tags: ["members"] }), (req, res, next) => {
    const profileRoles = ["Receptionist", "Owner", "Sales", "Sales Manager", "Coach", "Coach Manager", "Accountant"];
    if (profileRoles.includes(req.user.role)) {
        return getMemberProfile(req, res, next);
    }
    return res.status(403).json({ message: "Access denied" });
});

router.post("/:memberId/notes", ...notesAccess, validate(addNoteSchema), autoInvalidate(["members"]), addNote);
router.post("/:memberId/invitations", ...inviteAccess, uploadLimiter, uploadSingle("idFile"), validate(invitationSchema), autoInvalidate(["members"]), addInvitation);
router.put("/:memberId/sales-rep", protect, authorizeRoles("Sales Manager", "Owner"), autoInvalidate(["members", "revenue"]), switchSalesRep);
router.post("/:memberId/alerts", protect, authorize("Receptionist", "Sales", "Sales Manager"), validate(addAlertSchema), autoInvalidate(["members"]), addAlert);
router.post("/:memberId/checkin", ...writeAccess, requireFeature("checkin"), autoInvalidate(["checkins", "members"]), checkInMember);
router.patch("/:memberId/alerts/:alertId/deactivate", protect, authorize("Receptionist", "Sales", "Sales Manager", "Owner"), autoInvalidate(["members"]), deactivateAlert);
router.patch("/:memberId/assign-sales", ...writeAccess, autoInvalidate(["members", "revenue"]), assignSalesman);
router.patch("/:memberId/freeze", ...freezeAccess, validate(freezeMemberSchema), autoInvalidate(["members"]), freezeMember);
router.patch("/:memberId/block", protect, authorize("Sales Manager"), autoInvalidate(["members"]), blockMember);
router.patch("/:memberId/unblock", protect, authorize("Sales Manager"), autoInvalidate(["members"]), unblockMember);
router.post("/:memberId/package", protect, authorize("Accountant", "Owner"), requireFeature("packages"), validate(assignPackageSchema), autoInvalidate(["members", "revenue", "contracts"]), assignPackage);
router.patch("/:memberId/national-id", protect, authorize("Accountant", "Owner"), uploadLimiter, uploadSingle("nationalIdFile"), autoInvalidate(["members"]), uploadNationalId);
router.patch("/:memberId/photo", protect, authorize("Accountant", "Owner", "Receptionist"), uploadLimiter, uploadSinglePhoto("photoFile"), autoInvalidate(["members"]), uploadProfilePhoto);
router.delete("/:memberId/photo", protect, authorize("Accountant", "Owner", "Receptionist"), uploadLimiter, autoInvalidate(["members"]), deleteProfilePhoto);

router.post("/PTcheckin", protect, authorizeRoles("Coach", "Coach Manager"), requireFeature("pt_tracking"), autoInvalidate(["members", "coach-transfers"]), sessionCheckIn_for_couch);

// ── Coach routes ──────────────────────────────────────────────────────────────

router.patch("/:memberId/assign-coach", protect, authorizeRoles("Coach Manager", "Owner"), autoInvalidate(["members"]), assignCoach);
router.put("/:memberId/coach-rep", protect, authorizeRoles("Coach Manager", "Owner"), autoInvalidate(["members"]), switchCoach);
router.post("/:memberId/couch-notes", protect, authorizeRoles("Coach", "Coach Manager"), autoInvalidate(["members"]), addCouch_notes);
router.get("/by/:memberId", ...readAccess, cacheResponse({ ttlSeconds: 120, tags: ["members"] }), getMemberById);


router.post("/:memberId/pt-sessions", protect, authorizeRoles("Owner", "Accountant"), requireFeature("pt_tracking"), autoInvalidate(["members", "revenue"]), addPT_sessions);
router.post("/:memberId/refund", protect, authorizeRoles("Owner","Accountant"), requireFeature("accounting"), autoInvalidate(["members", "revenue", "contracts"]), refund);
router.post("/:memberId/refund_pt", protect, authorizeRoles("Owner","Accountant"), requireFeature("accounting"), autoInvalidate(["members", "revenue", "contracts"]), refundPT_Sessions);
module.exports = router;
