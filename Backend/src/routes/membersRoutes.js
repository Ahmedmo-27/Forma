const express   = require("express");
const router    = express.Router();
const { protect, authorizeRoles }   = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");
const uploadLimiter = require("../middleware/uploadLimiter");
const { uploadSingle, uploadSinglePhoto } = require("../config/multer");
const validate  = require("../middleware/validate");
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

const readAccess  = [protect, authorize("Receptionist", "Owner", "Sales", "Sales Manager", "Coach", "Accountant")];
const writeAccess = [protect, authorize("Receptionist", "Owner", "Sales Manager", "Sales")];
const notesAccess = [protect, authorize("Owner", "Sales", "Sales Manager", "Coach", "Coach Manager")];
const freezeAccess = [protect, authorize("Receptionist", "Owner", "Sales", "Sales Manager")];
const inviteAccess = [protect, authorize("Receptionist", "Owner", "Sales", "Sales Manager")];

// ── Routes ────────────────────────────────────────────────────────────────────

router.post("/", ...writeAccess, validate(createMemberSchema), createMember);
router.post("/bulk-import", protect, authorizeRoles("Sales Manager", "Owner"), (req, res, next) => {
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

router.post("/bulk-transfer-sales", protect, authorizeRoles("Sales Manager", "Owner"), bulkTransferSalesReps);
router.post("/bulk-transfer-coach", protect, authorizeRoles("Coach Manager", "Owner"), bulkTransferCoach);

// Body-based check-in for barcode scanners: POST /members/check-in { identifier: "FF000105" }
router.post("/check-in", ...writeAccess, (req, res, next) => {
    req.params.memberId = req.body.identifier;
    checkInMember(req, res, next);
});

router.get("/", protect, (req, res, next) => {
    if (["Sales", "Sales Manager", "Coach", "Coach Manager"].includes(req.user.role)) {
        return getMembers(req, res, next);
    }
    if (["Owner", "Accountant", "Receptionist"].includes(req.user.role)) {
        return getAllMembers(req, res, next);
    }
    return res.status(403).json({ message: "Access denied" });
});

// All members (for global search — all authenticated staff)
router.get("/all", protect, authorize("Receptionist", "Owner", "Sales", "Sales Manager", "Accountant", "Coach", "Coach Manager"), getAllMembers);

router.get("/all-notes", protect, authorize("Sales", "Sales Manager", "Owner", "Coach Manager"), getAllNotes);
router.get("/today-checkins", protect, authorize("Receptionist", "Owner", "Sales", "Sales Manager"), getTodayCheckIns);
router.get("/today-coach-transfers", protect, authorize("Coach", "Coach Manager"), getTodayCoachTransfers);

router.get("/:memberId", protect, (req, res, next) => {
    const profileRoles = ["Receptionist", "Owner", "Sales", "Sales Manager", "Coach", "Coach Manager", "Accountant"];
    if (profileRoles.includes(req.user.role)) {
        return getMemberProfile(req, res, next);
    }
    return res.status(403).json({ message: "Access denied" });
});

router.post("/:memberId/notes", ...notesAccess, validate(addNoteSchema), addNote);
router.post("/:memberId/invitations", ...inviteAccess, uploadLimiter, uploadSingle("idFile"), validate(invitationSchema), addInvitation);
router.put("/:memberId/sales-rep", protect, authorizeRoles("Sales Manager", "Owner"), switchSalesRep);
router.post("/:memberId/alerts", protect, authorize("Receptionist", "Sales", "Sales Manager"), validate(addAlertSchema), addAlert);
router.post("/:memberId/checkin", ...writeAccess, checkInMember);
router.patch("/:memberId/alerts/:alertId/deactivate", protect, authorize("Receptionist", "Sales", "Sales Manager", "Owner"), deactivateAlert);
router.patch("/:memberId/assign-sales", ...writeAccess, assignSalesman);
router.patch("/:memberId/freeze", ...freezeAccess, validate(freezeMemberSchema), freezeMember);
router.patch("/:memberId/block", protect, authorize("Sales Manager"), blockMember);
router.patch("/:memberId/unblock", protect, authorize("Sales Manager"), unblockMember);
router.post("/:memberId/package", protect, authorize("Accountant", "Owner"), validate(assignPackageSchema), assignPackage);
router.patch("/:memberId/national-id", protect, authorize("Accountant"), uploadLimiter, uploadSingle("nationalIdFile"), uploadNationalId);
router.patch("/:memberId/photo", protect, authorize("Accountant"), uploadLimiter, uploadSinglePhoto("photoFile"), uploadProfilePhoto);
router.delete("/:memberId/photo", protect, authorize("Accountant"), uploadLimiter, deleteProfilePhoto);

router.post("/PTcheckin", protect, authorizeRoles("Coach", "Coach Manager"), sessionCheckIn_for_couch);

// ── Coach routes ──────────────────────────────────────────────────────────────

router.patch("/:memberId/assign-coach", protect, authorizeRoles("Coach Manager", "Owner"), assignCoach);
router.put("/:memberId/coach-rep", protect, authorizeRoles("Coach Manager", "Owner"), switchCoach);
router.post("/:memberId/couch-notes", protect, authorizeRoles("Coach", "Coach Manager"), addCouch_notes);
router.get("/by/:memberId", ...readAccess, getMemberById);


router.post("/:memberId/pt-sessions", protect, authorizeRoles("Owner", "Accountant"), addPT_sessions);
router.post("/:memberId/refund", protect, authorizeRoles("Owner","Accountant"), refund);
router.post("/:memberId/refund_pt", protect, authorizeRoles("Owner","Accountant"), refundPT_Sessions);
module.exports = router;
