const fs = require("fs");
const path = require("path");
const storageService = require("../services/storageService");
const Member = require("../models/Member");
const Package = require("../models/Package");
const User = require("../models/User");
const ProfileView = require("../models/ProfileView");
const { hasAccess, hasExplicitGrant } = require("../utils/accessControl");
const { attachCurrentPackage, cairoDayBounds } = require("../utils/revenueUtils");
const { findMemberByIdentifier, buildMemberFilter } = require("../utils/memberLookup");
const { userCanAccessLocation, forbidIfOutOfLocationScope } = require("../utils/locationScope");

/**
 * Load member by id/systemId/memberId and enforce navbar/grant location scope.
 * Returns { member } or { error: { status, code, message } }.
 */
async function findScopedMember(req, identifier) {
    const member = await findMemberByIdentifier(identifier);
    if (!member) {
        return { error: { status: 404, message: "Member not found" } };
    }
    const forbidden = forbidIfOutOfLocationScope(req, member);
    if (forbidden) return { error: forbidden };
    return { member };
}

function sendMemberScopeError(res, error) {
    return res.status(error.status || 500).json({
        code: error.code,
        message: error.message || "Member not found",
    });
}
const { notifyMemberAssigned, notifyTaskAssigned } = require("../utils/notificationService");
const Task = require("../models/Task");
const { parsePagination, buildPagination } = require("../utils/pagination");
const { buildMemberListFilter, statsFilterFromListFilter, getMemberStatusStats, numericId } = require("../utils/memberFilters");
const { escapeRegex } = require("../utils/username");
const { isAssignedToRep, redactMemberForViewer } = require("../utils/memberPrivacy");
const { assertAllowedUpload, assertAllowedImage } = require("../utils/fileMagic");
const { writeAudit } = require("../utils/audit");
const { nextSystemId, nextMemberId, nextSubscriptionId, isDuplicateKeyError } = require("../utils/sequence");
const { normalizePhone, assertPhoneAvailable, replyIfConflict } = require("../utils/identityUniqueness");
const { startMemberImport, getMemberImport } = require("../services/memberImportRunner");
const { resolveSalesAssignee } = require("../utils/salesAssignment");
const { sanitizePlainText } = require("../utils/sanitizeText");
const { validateNoOverlappingSubscription } = require("../utils/subscriptionUtils");
const { buildPackageSnapshot, resolveSubscriptionPackage } = require("../utils/packageSnapshot");
const { generateBarcode } = require("../utils/barcodeHelper");
const { publishLive } = require("../utils/liveEvents");
const logger = require("../utils/logger");
const mongoose = require("mongoose");

// ─── Helper: get purchased package terms from last subscription ───────────────
const getCurrentPackage = (member) => {
    if (!member.subscriptions || !member.subscriptions.length) return null;
    const last = member.subscriptions[member.subscriptions.length - 1];
    if (last.refunded || last.cancelled || last.subscriptionStatus === "cancelled") return null;
    return resolveSubscriptionPackage(last);
};

const refId = (value) => {
    if (!value) return null;
    const id = value._id || value;
    const text = String(id);
    return mongoose.Types.ObjectId.isValid(text) ? text : null;
};

/**
 * Replace stored ids with the names the member screens render.
 * One user query and one package query, instead of a populate per array.
 * Profile views only need authors on the latest log entries.
 */
const hydrateMemberRefs = async (member, { userlogLimit = null, summary = false } = {}) => {
    if (!member) return member;
    const userIds = new Set();
    const packageIds = new Set();
    const addUser = (value) => {
        const id = refId(value);
        if (id) userIds.add(id);
    };

    addUser(member.assignedSales);
    for (const sub of member.subscriptions || []) {
        const pkg = refId(sub.package);
        if (pkg) packageIds.add(pkg);
    }

    const logs = userlogLimit == null ? [] : (member.userlog || []).slice(-userlogLimit);
    if (!summary) {
        addUser(member.createdBy);
        addUser(member.current_couch);
        for (const sub of member.subscriptions || []) {
            addUser(sub.createdBy);
            addUser(sub.approvedBy);
            addUser(sub.salesManager);
        }
        for (const note of member.notes || []) addUser(note.createdBy);
        for (const note of member.couch_notes || []) addUser(note.createdBy);
        for (const alert of member.alert || []) addUser(alert.createdBy);
        for (const freeze of member.freeze || []) {
            addUser(freeze.createdBy);
            addUser(freeze.endedBy);
        }
        for (const invite of member.invitations || []) addUser(invite.createdBy);
        for (const pt of member.pt_subscriptions || []) addUser(pt.createdBy);
        for (const log of logs) addUser(log.createdBy);
    }

    const locationRef = refId(member.locationId);
    const [users, packages, locationDoc] = await Promise.all([
        userIds.size ? User.find({ _id: { $in: [...userIds] } }).select("name email role").lean() : [],
        packageIds.size
            ? Package.find({ _id: { $in: [...packageIds] } })
                .select("name duration activityType price freezeLimitDays invitationLimit renewalDiscountPercent hasException")
                .lean()
            : [],
        locationRef
            ? Location.findById(locationRef).select("name locationId branch_location").lean()
            : null,
    ]);
    const usersById = new Map(users.map((user) => [String(user._id), user]));
    const packagesById = new Map(packages.map((pkg) => [String(pkg._id), pkg]));
    const fillUser = (value) => usersById.get(refId(value)) || value;

    member.assignedSales = fillUser(member.assignedSales);
    if (locationDoc) member.locationId = locationDoc;
    for (const sub of member.subscriptions || []) {
        sub.package = packagesById.get(refId(sub.package)) || sub.package;
    }
    if (summary) return member;

    member.createdBy = fillUser(member.createdBy);
    member.current_couch = fillUser(member.current_couch);
    for (const sub of member.subscriptions || []) {
        sub.createdBy = fillUser(sub.createdBy);
        sub.approvedBy = fillUser(sub.approvedBy);
        sub.salesManager = fillUser(sub.salesManager);
    }
    for (const note of member.notes || []) note.createdBy = fillUser(note.createdBy);
    for (const note of member.couch_notes || []) note.createdBy = fillUser(note.createdBy);
    for (const alert of member.alert || []) alert.createdBy = fillUser(alert.createdBy);
    for (const freeze of member.freeze || []) {
        freeze.createdBy = fillUser(freeze.createdBy);
        freeze.endedBy = fillUser(freeze.endedBy);
    }
    for (const invite of member.invitations || []) invite.createdBy = fillUser(invite.createdBy);
    for (const pt of member.pt_subscriptions || []) pt.createdBy = fillUser(pt.createdBy);
    for (const log of logs) log.createdBy = fillUser(log.createdBy);
    return member;
};

// ─── Helper: validate sales assignee ─────────────────────────────────────────
const validateSalesAssignee = async (salesId) => {
    const salesUser = await User.findById(salesId);
    if (!salesUser || !["Sales", "Sales Manager"].includes(salesUser.role)) {
        return null;
    }
    return salesUser;
};

const validateCoachAssignee = async (CoachId) => {
    const CoachUser = await User.findById(CoachId);
    if (!CoachUser || !["Coach", "Head Coach"].includes(CoachUser.role)) {
        return null;
    }
    return CoachUser;
};

// ─── Helper: generate next systemId (everyone, starts at 100) ────────────────
const generateSystemId = () => nextSystemId();

// ─── Helper: generate next memberId (subscribers only, starts at 100) ────────
const generateMemberId = () => nextMemberId();

// ─── Helper: generate next subscriptionId (global counter, starts at 100) ────
const generateSubscriptionId = () => nextSubscriptionId();

// ─── Helper: calculate subscription end date ─────────────────────────────────
const calcEndDate = (startDate, duration) => {
    const end = new Date(startDate);
    switch (duration) {
        case "1 month":  end.setMonth(end.getMonth() + 1); break;
        case "3 months": end.setMonth(end.getMonth() + 3); break;
        case "6 months": end.setMonth(end.getMonth() + 6); break;
        case "1 year":   end.setFullYear(end.getFullYear() + 1); break;
    }
    return end;
};

// ─── Helper: find by systemId, memberId, or MongoDB _id ──────────────────────
const findMember = async (id, req = null) => {
    const query = buildMemberFilter(id);
    if (!query) return null;
    const member = await Member.findOne(query).populate("subscriptions.package");
    if (!member || !req) return member;
    if (forbidIfOutOfLocationScope(req, member)) return null;
    return member;
};

// ─── 1. Add Person (guest or member) ─────────────────────────────────────────
const Location = require("../models/Location");

async function resolveMemberLocationId(req, explicitLocationId) {
    const raw = explicitLocationId || req.locationScope?.locationId || null;
    if (raw) {
        if (!userCanAccessLocation(req.user, req.tenant, raw) && req.user.role !== "Owner") {
            return { error: "You do not have access to this location", status: 403 };
        }
        const exists = await Location.findById(raw).select("_id").lean();
        if (!exists) return { error: "Location not found", status: 404 };
        return { locationId: exists._id };
    }

    // Fallback: first location in tenant (Main)
    const first = await Location.findOne({}).sort({ createdAt: 1 }).select("_id").lean();
    if (!first) {
        const { ensureMainLocation } = require("./locationController");
        const main = await ensureMainLocation(req.user.tenantId);
        return { locationId: main._id };
    }
    return { locationId: first._id };
}

const createMember = async (req, res) => {
    try {
        const {
            name, phones,
            gender, birthdate, source,
            packageId, assignedSales, coachId, locationId: bodyLocationId,
        } = req.body;

        const phoneKey = await assertPhoneAvailable(phones);

        const systemId = await generateSystemId();
        const salesAssignee = await resolveSalesAssignee(assignedSales || null);
        let coachAssignee = null;
        if (coachId) {
            coachAssignee = await validateCoachAssignee(coachId);
            if (!coachAssignee) {
                return res.status(400).json({ message: "Invalid coach — user not found or not a coach role" });
            }
        }
        const loc = await resolveMemberLocationId(req, bodyLocationId);
        if (loc.error) {
            return res.status(loc.status || 400).json({ message: loc.error });
        }

        const personData = {
            systemId,
            name,
            phones: String(phones ?? "").trim(),
            phoneKey,
            // photo must only be set via dedicated upload endpoint
            photo:         null,
            gender:        gender        || null,
            birthdate:     birthdate     || null,
            source:        source        || null,
            assignedSales: salesAssignee,
            current_couch: coachAssignee ? coachAssignee._id : null,
            couch_subscription_status: coachAssignee ? "active" : undefined,
            locationId:    loc.locationId,
            createdBy:     req.user.id
        };

        if (packageId) {
            const pkg = await Package.findById(packageId);
            if (!pkg || !pkg.isActive) {
                return res.status(400).json({ message: "Package not found or inactive" });
            }

            const startDate      = new Date();
            const endDate        = calcEndDate(startDate, pkg.duration);
            const memberId       = await generateMemberId();
            const subscriptionId = await generateSubscriptionId();

            Object.assign(personData, {
                memberId,
                barcode: generateBarcode(memberId),
                isMember: true,
                status:   "active",
                subscriptions: [{
                    subscriptionId,
                    package:         pkg._id,
                    packageSnapshot: buildPackageSnapshot(pkg),
                    startDate,
                    endDate,
                    pricePaid:       pkg.price,
                    discountPercent: 0,
                    isRenewal:       false,
                    createdBy:       req.user.id
                }]
            });
        } else {
            personData.status   = "guest";
            personData.isMember = false;
        }

        const member = await createMemberRecord(personData);

        if (personData.assignedSales) {
            await notifyMemberAssigned({
                recipientId: personData.assignedSales,
                member,
                actorId: req.user.id,
            });
        }
        if (personData.current_couch) {
            await notifyMemberAssigned({
                recipientId: personData.current_couch,
                member,
                actorId: req.user.id,
            });
        }

        await writeAudit({
            action: "member_created",
            actor: req.user.id,
            actorRole: req.user.role,
            targetType: "member",
            targetId: member._id,
            meta: { systemId: member.systemId, withPackage: Boolean(packageId) },
            req,
        });

        res.status(201).json({ message: packageId ? "Member created" : "Guest added", member });
    } catch (error) {
        if (replyIfConflict(res, error)) return;
        if (isDuplicateKeyError(error, ["systemId", "memberId"])) {
            return res.status(409).json({ message: "Member ID conflict, please retry" });
        }
        res.status(500).json({ message: error.message });
    }
};

async function createMemberRecord(personData, maxAttempts = 5) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            if (attempt > 0) {
                personData.systemId = await generateSystemId();
                if (personData.memberId != null) {
                    personData.memberId = await generateMemberId();
                    personData.barcode = generateBarcode(personData.memberId);
                }
                if (personData.subscriptions?.length) {
                    personData.subscriptions[0].subscriptionId = await generateSubscriptionId();
                }
            }
            return await Member.create(personData);
        } catch (error) {
            if (isDuplicateKeyError(error, ["systemId", "memberId"]) && attempt < maxAttempts - 1) {
                continue;
            }
            throw error;
        }
    }
    throw new Error("Failed to allocate unique member identifiers");
}

// ─── 2. Get All Members ───────────────────────────────────────────────────────
const MEMBER_LIST_SELECT = "systemId memberId barcode name phones photo status isMember gender source assignedSales createdBy current_couch couch_subscription_status subscriptions freezeDaysUsed invitationsUsed isBlocked createdAt userlog";
// Large list / report fetches (limit >= 1000) use this lean select. Include
// coach + report filter fields so Guest/Members reports can show trainers.
const MEMBER_SEARCH_SELECT = "systemId memberId name phones photo status gender source subscriptions assignedSales current_couch createdAt";
const MEMBER_SORT_FIELDS = new Set(["createdAt", "systemId", "name"]);

function memberListSort(query = {}) {
    const large = parseInt(query.limit, 10) >= 1000 || query.all === "true" || query.all === true;
    const sortField = MEMBER_SORT_FIELDS.has(query.sortBy)
        ? query.sortBy
        : (query.source || large ? "createdAt" : "systemId");
    const sortDir = query.sortDir !== undefined
        ? (parseInt(query.sortDir, 10) === -1 ? -1 : 1)
        : (query.source || large ? -1 : 1);
    return sortField === "createdAt"
        ? { createdAt: sortDir, _id: sortDir }
        : { [sortField]: sortDir, _id: sortDir };
}

const getAllMembers = async (req, res) => {
    try {
        // Detect global-search / "all" call (frontend passes limit=10000)
        const isGlobalSearch = parseInt(req.query.limit, 10) >= 1000;

        const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 10, maxLimit: 500 });
        const sortObj = memberListSort(req.query);

        const filter = buildMemberListFilter({
            status:          req.query.status,
            search:          req.query.search,
            assignedSales:   req.query.assignedSales,
            subscribedToday: req.query.subscribedToday,
            transferred:     req.query.transferred,
            recent:          req.query.recent,
            expiringSoon:    req.query.expiringSoon,
            currentCouch:    req.query.currentCouch,
            unassignedSales: req.query.unassignedSales,
            unassignedCoach: req.query.unassignedCoach,
            dateFrom:        req.query.dateFrom,
            dateTo:          req.query.dateTo,
            dateField:       req.query.dateField,
            packageId:       req.query.packageId,
            gender:          req.query.gender,
            transferType:    req.query.transferType,
            locationFilter:  req.locationFilter,
        });

        // Source filter (e.g. source=data entry for imported members)
        if (req.query.source) {
            filter.source = req.query.source;
        }

        const statsFilter = statsFilterFromListFilter(filter);

        if (isGlobalSearch) {
            const members = await Member.find(filter)
                .select(MEMBER_SEARCH_SELECT)
                .populate("subscriptions.package", "name duration activityType")
                .populate("assignedSales", "name role")
                .populate("current_couch", "name role")
                .sort(sortObj)
                .skip(skip)
                .limit(limit)
                .lean();

            const redacted = members.map(m => redactMemberForViewer(m, req.user));

            return res.status(200).json({
                count: redacted.length,
                members: redacted,
                pagination: buildPagination(page, limit, redacted.length),
            });
        }

        const [total, members, stats] = await Promise.all([
            Member.countDocuments(filter),
            Member.find(filter)
                .select(MEMBER_LIST_SELECT)
                .populate("subscriptions.package", "name duration activityType")
                .populate("subscriptions.salesManager", "name role")
                .populate("createdBy", "name")
                .populate("assignedSales", "name role")
                .populate("current_couch", "name role")
                .populate("userlog.createdBy", "name role")
                .sort(sortObj)
                .skip(skip)
                .limit(limit)
                .lean(),
            getMemberStatusStats(Member, statsFilter),
        ]);

        const redactedMembers = members.map(m => redactMemberForViewer(m, req.user));

        res.status(200).json({
            count: total,
            members: redactedMembers,
            pagination: buildPagination(page, limit, total),
            stats,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── 3. Get Member Profile ────────────────────────────────────────────────────
const getMemberProfile = async (req, res) => {
    try {
        const { memberId } = req.params;
        const query = buildMemberFilter(memberId);
        if (!query) {
            return res.status(400).json({ message: "Invalid member ID" });
        }

        // Names the profile screen renders, without populating every log author.
        // Ended freezes are applied by the 30-minute freeze cycle, not on this read.
        // Counts use the full log; only the latest entries are returned.
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        // Aggregate $match does not cast strings the way findOne does.
        const match = { ...query };
        if (typeof match._id === "string") match._id = new mongoose.Types.ObjectId(match._id);
        const [member] = await Member.aggregate([
            { $match: match },
            {
                $addFields: {
                    _checkInCount: {
                        $size: {
                            $filter: {
                                input: { $ifNull: ["$userlog", []] },
                                as: "log",
                                cond: { $eq: ["$$log.type", "check-in"] },
                            },
                        },
                    },
                    _ptCount: {
                        $size: {
                            $filter: {
                                input: { $ifNull: ["$userlog", []] },
                                as: "log",
                                cond: { $eq: ["$$log.type", "pt-session"] },
                            },
                        },
                    },
                    _monthCheckIns: {
                        $size: {
                            $filter: {
                                input: { $ifNull: ["$userlog", []] },
                                as: "log",
                                cond: {
                                    $and: [
                                        { $eq: ["$$log.type", "check-in"] },
                                        { $gte: ["$$log.createdAt", monthStart] },
                                    ],
                                },
                            },
                        },
                    },
                    userlog: { $slice: [{ $ifNull: ["$userlog", []] }, -100] },
                },
            },
        ]);

        if (!member) {
            return res.status(404).json({ message: "Member not found" });
        }

        const profileForbidden = forbidIfOutOfLocationScope(req, member);
        if (profileForbidden) {
            return sendMemberScopeError(res, profileForbidden);
        }

        const checkInCount = member._checkInCount || 0;
        const ptCount = member._ptCount || 0;
        const monthCheckIns = member._monthCheckIns || 0;
        delete member._checkInCount;
        delete member._ptCount;
        delete member._monthCheckIns;

        const recentLog = member.userlog || [];
        const checkIns = recentLog
            .filter(log => log.type === "check-in")
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const ptSessions = recentLog
            .filter(log => log.type === "pt-session")
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // The view write is recorded for the history tab, but it does not delay the profile.
        ProfileView.create({ member: member._id, viewedBy: req.user.id }).catch((error) => {
            logger.warn("members", "Profile view was not recorded", { message: error.message });
        });

        const [, profileViews] = await Promise.all([
            hydrateMemberRefs(member, { userlogLimit: 100 }),
            ProfileView.find({ member: member._id })
                .populate("viewedBy", "name role")
                .sort({ createdAt: -1 })
                .limit(50)
                .lean(),
        ]);

        const currentPkg = getCurrentPackage(member);

        const memberPayload = redactMemberForViewer(member, req.user);

        res.status(200).json({
            member: memberPayload,
            checkIns,
            ptSessions,
            profileViews,
            stats: {
                totalCheckIns:        checkInCount,
                thisMonthCheckIns:    monthCheckIns,
                totalPTSessions:      ptCount,
                totalSubscriptions:   (member.subscriptions || []).length,
                totalFreezes:         (member.freeze || []).length,
                freezeDaysUsed:       member.freezeDaysUsed,
                freezeDaysRemaining:  (currentPkg?.freezeLimitDays || 0) - member.freezeDaysUsed,
                invitationsUsed:      member.invitationsUsed,
                invitationsRemaining: (currentPkg?.invitationLimit || 0) - member.invitationsUsed,
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * Desk branch for a check-in stamp.
 * Prefer explicit body.locationId (multi-branch desks), else navbar single-branch scope.
 */
async function resolveCheckInLocationId(req) {
    const bodyLoc = req.body?.locationId || req.body?.checkInLocationId || null;
    const scopeLoc = req.locationScope?.locationId
        || (req.locationFilter?.locationId && !(req.locationFilter.locationId.$in)
            ? req.locationFilter.locationId
            : null);
    const raw = bodyLoc || scopeLoc || null;

    if (!raw) {
        const multiOn = Array.isArray(req.planFeatures)
            ? req.planFeatures.includes("multi_branches")
            : false;
        const mode = req.locationScope?.mode;
        // Multi-branch desks viewing All / multiple grants must pick a desk branch
        if (multiOn && (mode === "unrestricted" || mode === "subset")) {
            return {
                error: "Select which branch this check-in is for",
                code: "CHECKIN_LOCATION_REQUIRED",
                status: 400,
            };
        }
        return { locationId: null };
    }

    if (!mongoose.Types.ObjectId.isValid(String(raw))) {
        return { error: "Invalid check-in location", code: "INVALID_LOCATION", status: 400 };
    }

    if (!userCanAccessLocation(req.user, req.tenant, raw) && req.user.role !== "Owner") {
        return {
            error: "You do not have access to this location",
            code: "LOCATION_FORBIDDEN",
            status: 403,
        };
    }

    const exists = await Location.findById(raw).select("_id").lean();
    if (!exists) {
        return { error: "Location not found", code: "LOCATION_NOT_FOUND", status: 404 };
    }

    return { locationId: exists._id };
}

// ─── 4. Check In Member ───────────────────────────────────────────────────────
const checkInMember = async (req, res) => {
    try {
        const { memberId } = req.params;

        const query = buildMemberFilter(memberId);
        if (!query) {
            return res.status(404).json({ message: "Member not found" });
        }

        const deskLoc = await resolveCheckInLocationId(req);
        if (deskLoc.error) {
            return res.status(deskLoc.status || 400).json({
                code: deskLoc.code,
                message: deskLoc.error,
            });
        }

        const now = new Date();
        const entry = {
            _id: new mongoose.Types.ObjectId(),
            type: "check-in",
            text: "Member checked in",
            createdBy: req.user.id,
            createdAt: now,
            locationId: deskLoc.locationId || null,
        };

        // Active members with an active subscription only append a log entry. One update, no full-document save.
        // Do not filter by member home branch — guests can check in at any desk the staff may operate.
        const updated = await Member.findOneAndUpdate(
            {
                ...query,
                isBlocked: { $ne: true },
                isMember: true,
                status: "active",
                "subscriptions.0": { $exists: true },
                $expr: {
                    $gte: [
                        { $arrayElemAt: ["$subscriptions.endDate", -1] },
                        now,
                    ],
                },
            },
            { $push: { userlog: entry } },
            { new: false, projection: { name: 1, systemId: 1, status: 1, subscriptions: { $slice: -1 } } }
        ).lean();

        if (updated) {
            const currentSub = updated.subscriptions?.at(-1);
            const pkgName = currentSub?.packageSnapshot?.name || null;
            publishLive(req.user.tenantId, {
                type: "check-in",
                message: `${updated.name} checked in${pkgName ? ` · ${pkgName}` : ""}`,
                checkInId: entry._id,
                systemId: updated.systemId,
                memberName: updated.name,
                status: updated.status,
                packageName: pkgName,
            });
            return res.status(201).json({ message: "Check-in recorded", checkIn: entry, status: updated.status });
        }

        // Fast-path did not match. Inspect the member to return the exact reason or handle frozen members.
        const memberDoc = await findMember(memberId);
        if (!memberDoc) {
            return res.status(404).json({ message: "Member not found" });
        }
        const member = memberDoc;

        if (member.isBlocked) {
            return res.status(403).json({ message: "Cannot check in — member is blocked" });
        }

        const hasSubscriptions = Array.isArray(member.subscriptions) && member.subscriptions.length > 0;
        const currentSub = hasSubscriptions ? member.subscriptions[member.subscriptions.length - 1] : null;
        const currentPkg = currentSub?.packageSnapshot || currentSub?.package || null;
        const isCancelledSub = currentSub
            ? (currentSub.refunded || currentSub.cancelled || currentSub.subscriptionStatus === "cancelled")
            : false;

        if (member.status === "guest" || !member.isMember || !hasSubscriptions || !currentPkg || isCancelledSub) {
            const isGuest = member.status === "guest" || !member.isMember || isCancelledSub;
            const message = isGuest
                ? "Cannot check in — this member is a guest and does not have a package"
                : "Cannot check in — this member does not have a package";
            return res.status(400).json({ message });
        }

        const isExpiredStatus = member.status === "expired";
        const isEndDatePassed = currentSub.endDate && new Date(currentSub.endDate) < now;

        if (isExpiredStatus || (isEndDatePassed && member.status !== "frozen")) {
            if (member.status !== "expired") {
                member.status = "expired";
                await member.save();
            }
            return res.status(400).json({ message: "Cannot check in — this member has an expired package" });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // If frozen — end the freeze early and extend subscription
        if (member.status === "frozen") {
            const activeFreeze = member.freeze
                .slice().reverse()
                .find(f => new Date(f.endDate) > today);

            if (activeFreeze) {
                const freezeStart      = new Date(activeFreeze.startDate);
                freezeStart.setHours(0, 0, 0, 0);
                const originalEnd      = new Date(activeFreeze.endDate);
                const actualFrozenDays = Math.ceil((today - freezeStart) / 86400000);
                const daysSaved        = Math.ceil((originalEnd - today) / 86400000);

                activeFreeze.endDate  = today;
                activeFreeze.endedBy  = req.user.id;

                const previousDays = member.freeze
                    .filter(f => f !== activeFreeze)
                    .reduce((sum, f) => sum + Math.ceil(
                        (new Date(f.endDate) - new Date(f.startDate)) / 86400000
                    ), 0);
                member.freezeDaysUsed = previousDays + actualFrozenDays;

                if (currentSub && daysSaved > 0) {
                    const newEnd = new Date(currentSub.endDate);
                    newEnd.setDate(newEnd.getDate() + daysSaved);
                    currentSub.endDate = newEnd;
                }

                member.userlog.push({
                    type:      "other",
                    text:      `Freeze ended early on check-in. Actual freeze: ${actualFrozenDays} day(s). Subscription extended by ${daysSaved} day(s).`,
                    createdBy: req.user.id
                });
            }

            if (currentSub && new Date(currentSub.endDate) < now) {
                member.status = "expired";
                await member.save();
                return res.status(400).json({ message: "Cannot check in — this member has an expired package" });
            }

            member.status = "active";
        }

        member.userlog.push(entry);
        await member.save();

        const savedEntry = member.userlog[member.userlog.length - 1];
        const pkgName = currentSub?.packageSnapshot?.name || currentSub?.package?.name || null;
        publishLive(req.user.tenantId, {
            type: "check-in",
            message: `${member.name} checked in${pkgName ? ` · ${pkgName}` : ""}`,
            checkInId: savedEntry._id,
            systemId: member.systemId,
            memberName: member.name,
            status: member.status,
            packageName: pkgName,
        });
        return res.status(201).json({ message: "Check-in recorded", checkIn: savedEntry, status: member.status });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── 5. Assign Salesman ───────────────────────────────────────────────────────
const assignSalesman = async (req, res) => {
    try {
        const { memberId } = req.params;
        const { salesId } = req.body;

        const salesUser = await validateSalesAssignee(salesId);
        if (!salesUser) {
            return res.status(400).json({
                message: "Invalid salesman — user not found or not a sales role"
            });
        }

        const memberDoc = await findMember(memberId);
        if (!memberDoc) {
            return res.status(404).json({ message: "Member not found" });
        }
        const memberForbidden = forbidIfOutOfLocationScope(req, memberDoc);
        if (memberForbidden) return sendMemberScopeError(res, memberForbidden);
        const member = memberDoc;

        // Receptionist can only assign if member has no sales rep yet
        if (req.user.role === "Receptionist" && member.assignedSales) {
            return res.status(403).json({ message: "Member already has an assigned sales rep. Only Sales Manager can reassign." });
        }

        member.assignedSales = salesId;
        member.userlog.push({
            type: "assign",
            text: `Assigned to ${salesUser.name}`,
            createdBy: req.user.id,
        });
        await member.save();
        await member.populate("assignedSales", "name role");

        await notifyMemberAssigned({
            recipientId: salesId,
            member,
            actorId: req.user.id,
        });

        res.status(200).json({ message: "Salesman assigned", member });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── 6. Freeze Member ─────────────────────────────────────────────────────────
const freezeMember = async (req, res) => {
    try {
        const { memberId } = req.params;
        const { startDate, endDate } = req.body;

        if (!startDate || !endDate) {
            return res.status(400).json({ message: "startDate and endDate are required" });
        }

        const start = new Date(startDate);
        const end   = new Date(endDate);

        if (end <= start) {
            return res.status(400).json({ message: "endDate must be after startDate" });
        }

        const memberDoc = await findMember(memberId);
        if (!memberDoc) {
            return res.status(404).json({ message: "Member not found" });
        }
        const memberForbidden = forbidIfOutOfLocationScope(req, memberDoc);
        if (memberForbidden) return sendMemberScopeError(res, memberForbidden);
        const member = memberDoc;

        if (member.status !== "active") {
            return res.status(400).json({
                message: `Cannot freeze — member status is "${member.status}"`
            });
        }

        if (member.isBlocked) {
            return res.status(403).json({ message: "Cannot freeze — member is blocked" });
        }

        const currentPkg    = getCurrentPackage(member);
        const allowedDays   = currentPkg?.freezeLimitDays || 0;
        const requestedDays = Math.ceil((end - start) / 86400000);
        const remainingDays = allowedDays - member.freezeDaysUsed;

        if (requestedDays > remainingDays) {
            return res.status(400).json({
                message: `Freeze limit exceeded. Remaining freeze days: ${remainingDays}`
            });
        }

        member.freeze.push({ startDate: start, endDate: end, createdBy: req.user.id });
        member.freezeDaysUsed += requestedDays;

        // Only set status to frozen if the freeze starts today or in the past
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startDay = new Date(start);
        startDay.setHours(0, 0, 0, 0);
        if (startDay <= today) {
            member.status = "frozen";
        }
        // If startDate is in the future, status stays "active" until the freeze begins

        await member.save();

        publishLive(req.user.tenantId, {
            type: "member",
            message: `${member.name} is now ${member.status}`,
            systemId: member.systemId,
            memberName: member.name,
            status: member.status,
        });

        await writeAudit({
            action: "member_frozen",
            actor: req.user.id,
            actorRole: req.user.role,
            targetType: "member",
            targetId: member._id,
            meta: { startDate: start, endDate: end, requestedDays },
            req,
        });

        res.status(200).json({
            message:         "Member frozen",
            freezeDaysUsed:  member.freezeDaysUsed,
            freezeLimitDays: allowedDays,
            member: redactMemberForViewer(member.toObject ? member.toObject() : member, req.user),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

function formatSalesMember(memberObj, userId, role) {
    attachCurrentPackage(memberObj);
    if (memberObj.assignedSales) {
        memberObj.salesRep = memberObj.assignedSales;
    }
    memberObj.Type = memberObj.source;
    memberObj.isAssignedToMe = isAssignedToRep(memberObj, userId);
    return redactMemberForViewer(memberObj, { id: userId, role });
}

function formatCoachMember(memberObj, userId, role) {
    attachCurrentPackage(memberObj);
    memberObj.Type = memberObj.source;
    const coachId = memberObj.current_couch?._id
        ? memberObj.current_couch._id.toString()
        : memberObj.current_couch?.toString();
    memberObj.isAssignedToMe = Boolean(coachId && coachId === userId.toString());
    if (role === "Coach" && !memberObj.isAssignedToMe) {
        memberObj.phones = null;
    }
    return memberObj;
}

const salesMemberQuery = () =>
    Member.find()
        .populate("assignedSales", "name email")
        .populate("current_couch", "name email")
        .populate("subscriptions.package", "name price duration activityType");

const getMembers = async (req, res) => {
    try {
        if (req.user.role === "Coach") {
            const coachFilter = {
                current_couch: req.user.id,
                ...(req.locationFilter || {}),
            };
            const members = await Member.find(coachFilter)
                .select(MEMBER_LIST_SELECT)
                .populate("current_couch", "name email")
                .populate("subscriptions.package", "name price duration activityType");

            const formatted = members.map((member) =>
                formatCoachMember(member.toObject(), req.user.id, req.user.role)
            );
            return res.status(200).json({ count: formatted.length, members: formatted });
        }

        // Sales reps see their own book. A sales manager's scope is the whole gym
        // (tenant plugin), including members held by the primary sales manager.
        const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 10, maxLimit: 500 });
        const showAllMembers = req.query.allMembers === "true" || req.query.showAll === "true";
        const filter = buildMemberListFilter({
            status: req.query.status,
            search: req.query.search,
            assignedSales: showAllMembers ? undefined : (req.user.role === "Sales" ? req.user.id : req.query.assignedSales),
            subscribedToday: req.query.subscribedToday,
            transferred: req.query.transferred,
            recent: req.query.recent,
            expiringSoon: req.query.expiringSoon,
            currentCouch: req.query.currentCouch,
            locationFilter: req.locationFilter,
        });

        const statsFilter = statsFilterFromListFilter(filter);

        const [total, members] = await Promise.all([
            Member.countDocuments(filter),
            Member.find(filter)
                .select(MEMBER_LIST_SELECT)
                .populate("assignedSales", "name email role")
                .populate("current_couch", "name role")
                .populate("subscriptions.package", "name price duration activityType")
                .populate("subscriptions.salesManager", "name role")
                .sort(memberListSort(req.query))
                .skip(skip)
                .limit(limit)
                .lean(),
        ]);

        const formatted = members.map((member) =>
            formatSalesMember(member, req.user.id, req.user.role)
        );

        const stats = await getMemberStatusStats(Member, statsFilter);

        res.status(200).json({
            count: total,
            members: formatted,
            pagination: buildPagination(page, limit, total),
            stats,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

const getMemberById = async (req, res) => {
    try {
        const identifier = req.params.memberId || req.params.id;
        const query = buildMemberFilter(identifier);
        if (!query) {
            return res.status(400).json({ message: "Invalid member ID" });
        }
        const member = await Member.findOne(query).lean();
        if (!member) {
            return res.status(404).json({ message: "Member not found" });
        }

        const byIdForbidden = forbidIfOutOfLocationScope(req, member);
        if (byIdForbidden) {
            return sendMemberScopeError(res, byIdForbidden);
        }

        await hydrateMemberRefs(member, { summary: true });

        const memberObj = redactMemberForViewer(member, req.user);
        if (["Sales", "Sales Manager"].includes(req.user.role)) {
            return res.json(formatSalesMember(memberObj, req.user.id, req.user.role));
        }

        res.json(memberObj);
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

////////////// add note /////////////////////////
const addNote = async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) {
            return res.status(400).json({ message: "Note text is required" });
        }

        if ((req.user.role === "Sales" || hasExplicitGrant(req.user, "comments")) && !hasAccess(req.user, "comments")) {
            return res.status(403).json({ message: "You are not allowed to comment on members" });
        }

        const identifier = req.params.memberId || req.params.id;
        const scoped = await findScopedMember(req, identifier);
        if (scoped.error) return sendMemberScopeError(res, scoped.error);
        const member = scoped.member;

        member.notes.push({ text: sanitizePlainText(text), createdBy: req.user.id });
        await member.save();
        res.status(201).json({ message: "Note added successfully", member });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

///////////////// add alert ///////////////

const addAlert = async (req, res) => {
    try {
        const { text } = req.body;

        if (!text) {
            return res.status(400).json({
                message: "Alert text is required"
            });
        }

        const identifier = req.params.memberId || req.params.id;

        const scoped = await findScopedMember(req, identifier);
        if (scoped.error) return sendMemberScopeError(res, scoped.error);
        const member = scoped.member;

        member.alert.push({
            text: sanitizePlainText(text),
            createdBy: req.user.id
        });

        await member.save();

        res.status(201).json({
            message: "Alert added successfully",
            member
        });

    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
};




const switchSalesRep = async (req, res) => {
    try {
        const { newSalesRepId } = req.body;
        if (!newSalesRepId) {
            return res.status(400).json({ message: "New Sales Rep ID is required" });
        }

        const salesUser = await validateSalesAssignee(newSalesRepId);
        if (!salesUser) {
            return res.status(400).json({
                message: "Invalid salesman — user not found or not a sales role"
            });
        }

        const identifier = req.params.memberId || req.params.id;
        const scoped = await findScopedMember(req, identifier);
        if (scoped.error) return sendMemberScopeError(res, scoped.error);
        const member = scoped.member;

        member.assignedSales = newSalesRepId;
        member.userlog.push({
            type: "assign",
            text: `Transferred to ${salesUser.name}`,
            createdBy: req.user.id,
        });
        await member.save();

        const isTask = Boolean(req.body.isTask || req.body.source === "tasks");
        let taskId = null;
        if (isTask) {
            const task = await Task.create({
                createdBy: req.user.id,
                assignedTo: newSalesRepId,
                targetRole: salesUser.role,
                transferType: "quick",
                title: "Quick Transfer (1 member)",
                members: [{
                    member: member._id,
                    name: member.name,
                    systemId: member.systemId,
                    phone: member.phones,
                    status: "pending",
                }],
                totalCount: 1,
                completedCount: 0,
                status: "pending",
            });
            taskId = task._id;
            await notifyTaskAssigned({
                recipientId: newSalesRepId,
                members: [member],
                actorId: req.user.id,
                taskId: task._id,
            });
        } else {
            await notifyMemberAssigned({
                recipientId: newSalesRepId,
                member,
                actorId: req.user.id,
            });
        }

        res.json({ message: "Sales representative updated successfully", member });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

const bulkTransferSalesReps = async (req, res) => {
    try {
        const { fromSalesRepId, toSalesRepId, memberIds } = req.body;

        if (!toSalesRepId) {
            return res.status(400).json({ message: "toSalesRepId is required" });
        }

        const toUser = await validateSalesAssignee(toSalesRepId);
        if (!toUser) {
            return res.status(400).json({ message: "Invalid destination sales rep" });
        }

        if (fromSalesRepId && fromSalesRepId === toSalesRepId) {
            return res.status(400).json({ message: "Source and destination sales reps must differ" });
        }

        let fromUser = null;
        if (fromSalesRepId) {
            fromUser = await User.findById(fromSalesRepId);
            if (!fromUser || !["Sales", "Sales Manager"].includes(fromUser.role)) {
                return res.status(400).json({ message: "Invalid source sales rep" });
            }
        }

        let members;

        if (memberIds?.length > 0) {
            members = await Member.find({ _id: { $in: memberIds } });
            if (members.length !== memberIds.length) {
                const found = new Set(members.map((m) => m._id.toString()));
                const missing = memberIds.filter((id) => !found.has(String(id)));
                return res.status(400).json({
                    message: "One or more members not found",
                    invalidMemberIds: missing,
                });
            }
            if (fromSalesRepId) {
                const invalid = members.filter(
                    (m) => !m.assignedSales || m.assignedSales.toString() !== fromSalesRepId
                );
                if (invalid.length > 0) {
                    return res.status(400).json({
                        message: "Some members are not assigned to the source sales rep",
                        invalidMemberIds: invalid.map((m) => m._id),
                    });
                }
            }
        } else if (fromSalesRepId) {
            members = await Member.find({ assignedSales: fromSalesRepId });
        } else {
            return res.status(400).json({ message: "Provide memberIds or fromSalesRepId" });
        }

        members = members.filter(
            (m) => !m.assignedSales || m.assignedSales.toString() !== toSalesRepId
        );

        if (!members.length) {
            return res.status(400).json({ message: "No members to transfer" });
        }

        await Member.populate(members, { path: "assignedSales", select: "name" });

        const transferredIds = [];
        const taskMemberItems = [];
        for (const member of members) {
            const prevName = member.assignedSales?.name ?? null;
            member.assignedSales = toSalesRepId;
            const logText = fromUser && prevName
                ? `Bulk transferred from ${prevName} to ${toUser.name}`
                : prevName
                    ? `Transferred from ${prevName} to ${toUser.name}`
                    : `Assigned to ${toUser.name}`;
            member.userlog.push({
                type: "assign",
                text: logText,
                createdBy: req.user.id,
            });
            await member.save();
            transferredIds.push(member._id);
            taskMemberItems.push({
                member: member._id,
                name: member.name,
                systemId: member.systemId,
                phone: member.phones,
                status: "pending",
            });
        }

        const task = await Task.create({
            createdBy: req.user.id,
            assignedTo: toSalesRepId,
            targetRole: toUser.role,
            transferType: "bulk",
            title: `Bulk Transfer (${transferredIds.length} members)`,
            members: taskMemberItems,
            totalCount: transferredIds.length,
            completedCount: 0,
            status: "pending",
        });

        await notifyTaskAssigned({
            recipientId: toSalesRepId,
            members,
            actorId: req.user.id,
            taskId: task._id,
        });

        res.json({
            message: "Members transferred successfully",
            transferredCount: transferredIds.length,
            memberIds: transferredIds,
            taskId: task._id,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// ─── 8. Add Invitation ────────────────────────────────────────────────────────
const addInvitation = async (req, res) => {
    try {
        const { memberId } = req.params;
        const { invitedName, invitedPhone } = req.body;

        if (!invitedName || !invitedName.trim()) {
            if (req.file?.path) fs.unlink(req.file.path, () => {});
            return res.status(400).json({ message: "Invited person name is required" });
        }

        const memberDoc = await findMember(memberId);
        if (!memberDoc) {
            if (req.file?.path) fs.unlink(req.file.path, () => {});
            return res.status(404).json({ message: "Member not found" });
        }
        const inviteForbidden = forbidIfOutOfLocationScope(req, memberDoc);
        if (inviteForbidden) {
            if (req.file?.path) fs.unlink(req.file.path, () => {});
            return sendMemberScopeError(res, inviteForbidden);
        }
        const member = memberDoc;

        // Must have an active subscription with invitation slots
        const currentPkg = getCurrentPackage(member);
        if (!currentPkg) {
            if (req.file?.path) fs.unlink(req.file.path, () => {});
            return res.status(400).json({ message: "No active package found" });
        }

        const allowedInvitations = currentPkg.invitationLimit || 0;
        if (member.invitationsUsed >= allowedInvitations) {
            if (req.file?.path) fs.unlink(req.file.path, () => {});
            return res.status(400).json({
                message: `Invitation limit reached. Allowed: ${allowedInvitations}`
            });
        }

        // Store basename only; magic-byte check rejects spoofed MIME/extension
        let idFileName = null;
        if (req.file) {
            try {
                await assertAllowedUpload(req.file);
                await storageService.persistUpload(member.tenantId || req.user.tenantId, req.file);
                idFileName = path.basename(req.file.filename);
            } catch (err) {
                if (req.file?.path) fs.unlink(req.file.path, () => {});
                return res.status(err.statusCode || 400).json({ message: err.message });
            }
        }

        member.invitations.push({
            invitedName:  invitedName.trim(),
            invitedPhone: invitedPhone || null,
            idFile:       idFileName,
            usedAt:       new Date(),
            createdBy:    req.user.id
        });
        member.invitationsUsed += 1;

        await member.save();
        await member.populate("invitations.createdBy", "name role");
        const newInvitation = member.invitations[member.invitations.length - 1];

        res.status(201).json({ message: "Invitation added", invitation: newInvitation });
    } catch (error) {
        if (req.file?.path) fs.unlink(req.file.path, () => {});
        res.status(500).json({ message: error.message });
    }
};

// ─── 10. Get today's check-ins ────────────────────────────────────────────────
const getTodayCheckIns = async (req, res) => {
    try {
        const { start: today, end: tomorrow } = cairoDayBounds();
        const { checkInLocationElemMatch, memberLocationFilter } = require("../utils/locationScope");
        const elem = checkInLocationElemMatch(req.locationScope, { start: today, end: tomorrow });
        const homeFilter = memberLocationFilter(req.locationScope);

        // Prefer stamped check-in locationId; legacy logs without locationId match via member home branch.
        const dateElem = {
            type: "check-in",
            createdAt: { $gte: today, $lt: tomorrow },
        };
        let match;
        if (homeFilter.locationId) {
            const stamped = { ...dateElem, locationId: homeFilter.locationId };
            const legacy = {
                ...dateElem,
                $or: [{ locationId: null }, { locationId: { $exists: false } }],
            };
            match = {
                $or: [
                    { userlog: { $elemMatch: stamped } },
                    { ...homeFilter, userlog: { $elemMatch: legacy } },
                ],
            };
        } else {
            match = { userlog: { $elemMatch: elem } };
        }

        // Project today's log entries only. Populating userlog.createdBy loaded
        // every historical author for each member who checked in.
        const members = await Member.aggregate([
            { $match: Object.keys(match).length ? match : { userlog: { $elemMatch: elem } } },
            {
                $project: {
                    name: 1,
                    systemId: 1,
                    memberId: 1,
                    phones: 1,
                    status: 1,
                    photo: 1,
                    assignedSales: 1,
                    package: {
                        $let: {
                            vars: { last: { $arrayElemAt: ["$subscriptions", -1] } },
                            in: "$$last.package",
                        },
                    },
                    checkIns: {
                        $filter: {
                            input: "$userlog",
                            as: "log",
                            cond: {
                                $and: [
                                    { $eq: ["$$log.type", "check-in"] },
                                    { $gte: ["$$log.createdAt", today] },
                                    { $lt: ["$$log.createdAt", tomorrow] },
                                ],
                            },
                        },
                    },
                },
            },
            {
                $lookup: {
                    from: "users",
                    let: { salesId: "$assignedSales", authorIds: "$checkIns.createdBy" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $or: [
                                        { $eq: ["$_id", "$$salesId"] },
                                        { $in: ["$_id", { $ifNull: ["$$authorIds", []] }] },
                                    ],
                                },
                            },
                        },
                        { $project: { name: 1, role: 1 } },
                    ],
                    as: "staff",
                },
            },
            {
                $lookup: {
                    from: "packages",
                    localField: "package",
                    foreignField: "_id",
                    pipeline: [{ $project: { name: 1, activityType: 1, duration: 1 } }],
                    as: "packageDoc",
                },
            },
        ]);

        const checkIns = [];
        for (const member of members) {
            const staffById = new Map((member.staff || []).map((user) => [String(user._id), user]));
            const pkg = member.packageDoc?.[0] || member.package || null;
            for (const log of member.checkIns || []) {
                checkIns.push({
                    _id: log._id,
                    time: log.createdAt,
                    checkedInBy: staffById.get(refId(log.createdBy)) || log.createdBy,
                    member: {
                        _id: member._id,
                        name: member.name,
                        systemId: member.systemId,
                        memberId: member.memberId,
                        phones: member.phones,
                        status: member.status,
                        photo: member.photo,
                        package: pkg,
                        assignedSales: staffById.get(refId(member.assignedSales)) || member.assignedSales,
                    },
                });
            }
        }

        // Sort newest first
        checkIns.sort((a, b) => new Date(b.time) - new Date(a.time));

        res.json({ count: checkIns.length, checkIns });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── 9. Get All Notes (for Call Center page — Sales Manager / Owner) ──────────
const getAllNotes = async (req, res) => {
    try {
        const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 10 });
        const match = {
            "notes.0": { $exists: true },
            ...(req.locationFilter || {}),
        };

        // Sales reps are always scoped to their own notes — ignore any createdBy param they pass
        const createdBy = req.user.role === "Sales"
            ? req.user.id
            : req.query.createdBy || null;

        if (createdBy) {
            match["notes.createdBy"] = new mongoose.Types.ObjectId(createdBy);
        }

        // Date range filter on note createdAt
        if (req.query.dateFrom || req.query.dateTo) {
            const dateFilter = {};
            if (req.query.dateFrom) {
                const from = new Date(req.query.dateFrom);
                if (!isNaN(from.getTime())) {
                    from.setHours(0, 0, 0, 0);
                    dateFilter.$gte = from;
                }
            }
            if (req.query.dateTo) {
                const to = new Date(req.query.dateTo);
                if (!isNaN(to.getTime())) {
                    to.setHours(23, 59, 59, 999);
                    dateFilter.$lte = to;
                }
            }
            if (Object.keys(dateFilter).length > 0) {
                match["notes.createdAt"] = dateFilter;
            }
        }

        const search = req.query.search?.trim();
        let searchMatch = null;
        if (search) {
            const safe = escapeRegex(search);
            const or = [
                { name: { $regex: safe, $options: "i" } },
                { phones: { $regex: safe, $options: "i" } },
                { "notes.text": { $regex: safe, $options: "i" } },
                { "noteAuthor.name": { $regex: safe, $options: "i" } },
                { "salesRep.name": { $regex: safe, $options: "i" } },
            ];
            const num = numericId(search);
            if (num != null) {
                or.push({ systemId: num }, { memberId: num });
            }
            searchMatch = { $or: or };
        }

        const pipeline = [
            { $match: match },
            { $unwind: "$notes" },
            ...(createdBy ? [{ $match: { "notes.createdBy": new mongoose.Types.ObjectId(createdBy) } }] : []),
            // Re-apply date filter after unwind (match.notes.createdAt filters docs, this filters individual notes)
            ...((req.query.dateFrom || req.query.dateTo) ? [{
                $match: {
                    "notes.createdAt": {
                        ...(req.query.dateFrom ? (() => { const d = new Date(req.query.dateFrom); if (isNaN(d.getTime())) return {}; d.setHours(0, 0, 0, 0); return { $gte: d }; })() : {}),
                        ...(req.query.dateTo ? (() => { const d = new Date(req.query.dateTo); if (isNaN(d.getTime())) return {}; d.setHours(23, 59, 59, 999); return { $lte: d }; })() : {}),
                    }
                }
            }] : []),
            {
                $lookup: {
                    from: "users",
                    let: { authorId: "$notes.createdBy" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$_id", "$$authorId"] },
                                        ...(req.user?.tenantId ? [{ $eq: ["$tenantId", new mongoose.Types.ObjectId(req.user.tenantId)] }] : []),
                                    ],
                                },
                            },
                        },
                    ],
                    as: "noteAuthor",
                },
            },
            { $unwind: { path: "$noteAuthor", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "users",
                    let: { salesId: "$assignedSales" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$_id", "$$salesId"] },
                                        ...(req.user?.tenantId ? [{ $eq: ["$tenantId", new mongoose.Types.ObjectId(req.user.tenantId)] }] : []),
                                    ],
                                },
                            },
                        },
                    ],
                    as: "salesRep",
                },
            },
            { $unwind: { path: "$salesRep", preserveNullAndEmptyArrays: true } },
            ...(searchMatch ? [{ $match: searchMatch }] : []),
            { $sort: { "notes.createdAt": -1 } },
            {
                $facet: {
                    data: [
                        { $skip: skip },
                        { $limit: limit },
                        {
                            $project: {
                                _id: "$notes._id",
                                text: "$notes.text",
                                createdAt: "$notes.createdAt",
                                createdBy: {
                                    _id: "$noteAuthor._id",
                                    name: "$noteAuthor.name",
                                    role: "$noteAuthor.role",
                                },
                                member: {
                                    _id: "$_id",
                                    name: "$name",
                                    systemId: "$systemId",
                                    memberId: "$memberId",
                                    phones: "$phones",
                                    status: "$status",
                                    assignedSales: {
                                        _id: "$salesRep._id",
                                        name: "$salesRep.name",
                                        role: "$salesRep.role",
                                    },
                                },
                            },
                        },
                    ],
                    total: [{ $count: "count" }],
                },
            },
        ];

        const result = await Member.aggregate(pipeline);
        const notes = result[0]?.data ?? [];
        const total = result[0]?.total[0]?.count ?? 0;

        res.status(200).json({
            count: total,
            notes,
            pagination: buildPagination(page, limit, total),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const packageTermsDiffer = (basePkg, terms) => {
    const num = (v, def = 0) => (v != null && v !== "" ? Number(v) : def);
    return (
        terms.name !== basePkg.name ||
        terms.activityType !== basePkg.activityType ||
        terms.duration !== basePkg.duration ||
        num(terms.price) !== basePkg.price ||
        num(terms.freezeLimitDays) !== (basePkg.freezeLimitDays ?? 0) ||
        num(terms.invitationLimit) !== (basePkg.invitationLimit ?? 0) ||
        num(terms.renewalDiscountPercent) !== (basePkg.renewalDiscountPercent ?? 0)
    );
};

// ─── Assign package directly (Accountant only — no approval) ───────────────
const assignPackage = async (req, res) => {
    try {
        const {
            packageId,
            name,
            activityType,
            duration,
            price,
            freezeLimitDays,
            invitationLimit,
            renewalDiscountPercent,
            pricePaid,
            discountPercent,
            startDate,
            ptSessionsExpDate,
        } = req.body;

        if (!packageId) {
            return res.status(400).json({ message: "Package ID is required" });
        }
        if (!name?.trim()) {
            return res.status(400).json({ message: "Package name is required" });
        }
        if (!duration) {
            return res.status(400).json({ message: "Duration is required" });
        }
        if (pricePaid == null || pricePaid === "") {
            return res.status(400).json({ message: "Price paid is required" });
        }
        if (Number(pricePaid) <= 0) {
            return res.status(400).json({ message: "Price paid must be greater than zero" });
        }

        const memberDoc = await findMember(req.params.memberId);
        if (!memberDoc) {
            return res.status(404).json({ message: "Member not found" });
        }
        const memberForbidden = forbidIfOutOfLocationScope(req, memberDoc);
        if (memberForbidden) return sendMemberScopeError(res, memberForbidden);
        const member = memberDoc;

        if (member.isBlocked) {
            return res.status(403).json({ message: "Cannot assign package — member is blocked" });
        }

        const PackageExceptionRequest = require("../models/PackageExceptionRequest");
        const pending = await PackageExceptionRequest.findOne({ member: member._id, status: "pending" });
        if (pending) {
            return res.status(400).json({ message: "This member has a pending package exception awaiting approval" });
        }

        const basePkg = await Package.findById(packageId);
        if (!basePkg || !basePkg.isActive || basePkg.hasException) {
            return res.status(400).json({ message: "Package not found or unavailable" });
        }

        const { packageEligibleForLocation } = require("../utils/packageLocationEligibility");
        if (!packageEligibleForLocation(basePkg, member.locationId)) {
            return res.status(400).json({
                code: "PACKAGE_NOT_ELIGIBLE_FOR_BRANCH",
                message: "This package is not eligible for the member's branch",
            });
        }

        const terms = {
            name: name.trim(),
            activityType: activityType ?? basePkg.activityType,
            duration,
            price: price != null && price !== "" ? Number(price) : basePkg.price,
            freezeLimitDays: Number(freezeLimitDays) || 0,
            invitationLimit: Number(invitationLimit) || 0,
            renewalDiscountPercent: Number(renewalDiscountPercent) || 0,
        };

        let packageToAssign = basePkg._id;
        let packageName = basePkg.name;
        let snapshotSource = {
            ...terms,
            hasException: false,
            free_pt_sessions: basePkg.free_pt_sessions || 0,
            description: basePkg.description ?? null,
            locationScope: basePkg.locationScope || "all",
            eligibleLocationIds: basePkg.eligibleLocationIds || [],
        };

        if (packageTermsDiffer(basePkg, terms)) {
            const exceptionPkg = await Package.create({
                name: terms.name,
                activityType: terms.activityType,
                duration: terms.duration,
                price: terms.price,
                freezeLimitDays: terms.freezeLimitDays,
                invitationLimit: terms.invitationLimit,
                renewalDiscountPercent: terms.renewalDiscountPercent,
                locationScope: basePkg.locationScope || "all",
                eligibleLocationIds: basePkg.eligibleLocationIds || [],
                isActive: true,
                hasException: true,
                basedOn: basePkg._id,
                forMember: member._id,
                createdBy: req.user.id,
            });
            packageToAssign = exceptionPkg._id;
            packageName = exceptionPkg.name;
            snapshotSource = exceptionPkg;
        }

        const currentSub = member.subscriptions?.at(-1);
        const currentEndDate = currentSub?.endDate ? new Date(currentSub.endDate) : null;
        const now = new Date();

        // Start date logic:
        let start;
        if (startDate) {
            start = new Date(startDate);
            // Compare dates only (ignore time) — start date must be on or after end date
            if (currentEndDate && currentEndDate > now) {
                const startDay = new Date(start); startDay.setHours(0,0,0,0);
                const endDay = new Date(currentEndDate); endDay.setHours(0,0,0,0);
                if (startDay < endDay) {
                    return res.status(400).json({
                        message: `Start date must be on or after the current package end date (${currentEndDate.toISOString().slice(0, 10)})`
                    });
                }
            }
        } else {
            start = (currentEndDate && currentEndDate > now) ? currentEndDate : now;
        }

        const overlapError = validateNoOverlappingSubscription(member.subscriptions, start, now);
        if (overlapError) {
            return res.status(400).json({ message: overlapError });
        }

        const endDate = calcEndDate(start, terms.duration);
        const subscriptionId = await generateSubscriptionId();
        const hadSubscription = member.subscriptions?.length > 0;

        if (!member.memberId) {
            member.memberId = await generateMemberId();
            member.barcode = generateBarcode(member.memberId);
        }
        if (!member.barcode && member.memberId) {
            member.barcode = generateBarcode(member.memberId);
        }

        member.isMember = true;
        // Only set status to active if the new package starts today or in the past
        if (start <= new Date()) {
            member.status = "active";
        }
        member.subscriptions.push({
            subscriptionId,
            package: packageToAssign,
            packageSnapshot: buildPackageSnapshot(snapshotSource),
            startDate: start,
            endDate,
            pricePaid: Number(pricePaid),
            discountPercent: Number(discountPercent) || 0,
            isRenewal: hadSubscription,
            createdBy: req.user.id,
            approvedBy: req.user.id,
            salesManager: null,
        });
        // Only reset counters if new package starts now (not for future-scheduled packages)
        if (start <= new Date()) {
            member.freezeDaysUsed = 0;
            member.invitationsUsed = 0;
        }
        member.userlog.push({
            type: hadSubscription ? "renewal" : "other",
            text: packageTermsDiffer(basePkg, terms)
                ? `Package assigned (exception): ${packageName}`
                : `Package assigned: ${packageName}`,
            createdBy: req.user.id,
        });

        member.PT_sessions=(member.PT_sessions||0)+(basePkg.free_pt_sessions||0);

        if (ptSessionsExpDate) {
            const ptExpDate = new Date(ptSessionsExpDate);

            // Compare dates only (ignore time)
            const startDay = new Date(start);
            startDay.setHours(0, 0, 0, 0);

            const expDay = new Date(ptExpDate);
            expDay.setHours(0, 0, 0, 0);

            if (expDay < startDay) {
                return res.status(400).json({
                    message: "PT sessions expiration date must be on or after the package start date",
                });
            }

            member.PT_sessions_expDate = ptExpDate;
        }

        await member.save();

        publishLive(req.user.tenantId, {
            type: "member",
            message: `${member.name} is now on ${name.trim()} · ${member.status}`,
            systemId: member.systemId,
            memberName: member.name,
            status: member.status,
            packageName: name.trim(),
        });

        await writeAudit({
            action: "package_assigned",
            actor: req.user.id,
            actorRole: req.user.role,
            targetType: "member",
            targetId: member._id,
            meta: { packageName, packageId: packageToAssign },
            req,
        });

        res.status(200).json({ message: "Package assigned successfully", member });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── Upload National ID (Accountant only) ─────────────────────────────────────
const uploadNationalId = async (req, res) => {
    try {
        if (!["Accountant", "Owner", "General Manager"].includes(req.user.role)) {
            return res.status(403).json({ message: "Only accountants, general managers, and owners can upload national IDs" });
        }

        const identifier = req.params.memberId;
        const scoped = await findScopedMember(req, identifier);
        if (scoped.error) return sendMemberScopeError(res, scoped.error);
        const member = scoped.member;

        if (!req.file) {
            return res.status(400).json({ message: "National ID file is required" });
        }

        let idFileName;
        try {
            await assertAllowedUpload(req.file);
            await storageService.persistUpload(member.tenantId || req.user.tenantId, req.file);
            idFileName = path.basename(req.file.filename);
        } catch (err) {
            if (req.file?.path) fs.unlink(req.file.path, () => {});
            return res.status(err.statusCode || 400).json({ message: err.message });
        }

        if (member.nationalId) {
            await storageService.deleteFile(member.tenantId || req.user.tenantId, member.nationalId);
        }

        member.nationalId = idFileName;
        await member.save();

        res.json({ message: "National ID uploaded", nationalId: member.nationalId });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const uploadProfilePhoto = async (req, res) => {
    try {
        if (!["Receptionist", "Accountant", "Owner", "General Manager"].includes(req.user.role)) {
            return res.status(403).json({ message: "Only receptionists, accountants, general managers, and owners can upload profile photos" });
        }

        const identifier = req.params.memberId;
        const scoped = await findScopedMember(req, identifier);
        if (scoped.error) return sendMemberScopeError(res, scoped.error);
        const member = scoped.member;

        if (!req.file) {
            return res.status(400).json({ message: "Profile photo is required" });
        }

        let photoFileName;
        try {
            await assertAllowedImage(req.file);
            await storageService.persistUpload(member.tenantId || req.user.tenantId, req.file);
            photoFileName = path.basename(req.file.filename);
        } catch (err) {
            if (req.file?.path) fs.unlink(req.file.path, () => {});
            return res.status(err.statusCode || 400).json({ message: err.message });
        }

        // Remove previous photo file if present
        if (member.photo) {
            await storageService.deleteFile(member.tenantId || req.user.tenantId, member.photo);
        }

        member.photo = photoFileName;
        await member.save();

        await writeAudit({
            action: "member_photo_uploaded",
            actor: req.user.id,
            actorRole: req.user.role,
            targetType: "member",
            targetId: member._id,
            meta: { photo: photoFileName },
            req,
        });

        res.json({ message: "Profile photo uploaded", photo: member.photo });
    } catch (error) {
        if (req.file?.path) fs.unlink(req.file.path, () => {});
        res.status(500).json({ message: error.message });
    }
};

const deleteProfilePhoto = async (req, res) => {
    try {
        if (!["Receptionist", "Accountant", "Owner", "General Manager"].includes(req.user.role)) {
            return res.status(403).json({ message: "Only receptionists, accountants, general managers, and owners can delete profile photos" });
        }

        const scoped = await findScopedMember(req, req.params.memberId);
        if (scoped.error) return sendMemberScopeError(res, scoped.error);
        const member = scoped.member;
        if (!member.photo) {
            return res.status(404).json({ message: "Member does not have a profile photo" });
        }

        const photoName = path.basename(member.photo);
        member.photo = null;
        await member.save();

        await storageService.deleteFile(member.tenantId || req.user.tenantId, photoName);

        await writeAudit({
            action: "member_photo_deleted",
            actor: req.user.id,
            actorRole: req.user.role,
            targetType: "member",
            targetId: member._id,
            req,
        });

        res.json({ message: "Profile photo deleted", photo: null });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
////////////////// deactivate alert////////////////////
const deactivateAlert = async (req, res) => {
    try {
        const identifier = req.params.memberId;
        const alertId = req.params.alertId;

        const scoped = await findScopedMember(req, identifier);
        if (scoped.error) return sendMemberScopeError(res, scoped.error);
        const member = scoped.member;

        const alert = member.alert.id(alertId);
        if (!alert) {
            return res.status(404).json({ message: "Alert not found" });
        }

        alert.active = false;
        await member.save();

        res.json({ message: "Alert deactivated", alert });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// ─── Block Member ─────────────────────────────────────────────────────────────//
const blockMember = async (req, res) => {
    try {
        const identifier = req.params.memberId;
        const { reason } = req.body;

        const scoped = await findScopedMember(req, identifier);
        if (scoped.error) return sendMemberScopeError(res, scoped.error);
        const member = scoped.member;

        if (member.isBlocked) {
            return res.status(400).json({ message: "Member is already blocked" });
        }

        member.isBlocked = true;
        member.blockedReason = reason || null;
        member.blockedBy = req.user.id;
        member.blockedAt = new Date();

        member.userlog.push({
            type: "other",
            text: `Member blocked${reason ? `: ${reason}` : ''}`,
            createdBy: req.user.id,
        });

        await member.save();
        publishLive(req.user.tenantId, {
            type: "member",
            message: `${member.name} was blocked`,
            systemId: member.systemId,
            memberName: member.name,
            status: "blocked",
        });
        res.json({ message: "Member blocked", member });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── Unblock Member ───────────────────────────────────────────────────────────//
const unblockMember = async (req, res) => {
    try {
        const identifier = req.params.memberId;

        const scoped = await findScopedMember(req, identifier);
        if (scoped.error) return sendMemberScopeError(res, scoped.error);
        const member = scoped.member;

        if (!member.isBlocked) {
            return res.status(400).json({ message: "Member is not blocked" });
        }

        member.isBlocked = false;
        member.blockedReason = null;
        member.blockedBy = null;
        member.blockedAt = null;

        member.userlog.push({
            type: "other",
            text: "Member unblocked",
            createdBy: req.user.id,
        });

        await member.save();
        publishLive(req.user.tenantId, {
            type: "member",
            message: `${member.name} was unblocked`,
            systemId: member.systemId,
            memberName: member.name,
            status: member.status,
        });
        res.json({ message: "Member unblocked", member });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const sessionCheckIn_for_couch = async (req, res) => {
    try {
        if(req.user.role==="Coach"){
            const { memberId } = req.body;
            const scoped = await findScopedMember(req, memberId);
        if (scoped.error) return sendMemberScopeError(res, scoped.error);
        const member = scoped.member;
            if (member.couch_subscription_status !== "active") {
                return res.status(400).json({ message: "Member is not active" });
            }

            // Check if coach already checked in this member today
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const alreadyCheckedIn = member.userlog.some(log =>
                log.type === "pt-session" && new Date(log.createdAt) >= today
            );
            if (alreadyCheckedIn) {
                return res.status(400).json({ message: "This member already has a session check-in today" });
            }

            if(member.PT_sessions > member.used_PT_sessions) {
                member.used_PT_sessions++;
                member.userlog.push({
                    type: "pt-session",
                    text: "Private session check-in (1 session)",
                    createdBy: req.user.id,
                });
                await member.save();
                return res.status(200).json({ message: "Session checked in" });
            } else {
                return res.status(400).json({ message: "Member has no free PT sessions" });
            }

        }else if (req.user.role==="Head Coach"){
            const { memberId ,numberOfSessions} = req.body;
            const scoped = await findScopedMember(req, memberId);
        if (scoped.error) return sendMemberScopeError(res, scoped.error);
        const member = scoped.member;
            if (member.couch_subscription_status !== "active") {
                return res.status(400).json({ message: "Member is not active" });
            }
            if((member.PT_sessions-member.used_PT_sessions) >= numberOfSessions) {

                member.used_PT_sessions=member.used_PT_sessions+numberOfSessions;
                member.userlog.push({
                    type: "pt-session",
                    text: `Private session check-in (${numberOfSessions} session${numberOfSessions > 1 ? 's' : ''})`,
                    createdBy: req.user.id,
                });
                await member.save();
                return res.status(200).json({ message: "Session checked in" });
            } else {
                return res.status(400).json({ message: "Member doesn't have enough PT sessions" });
            }
        }
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};


const assignCoach = async (req, res) => {
    try {
        const { memberId } = req.params;
        const { coachId } = req.body;

        const coachUser = await User.findById(coachId);
        if (!coachUser || !["Coach", "Head Coach"].includes(coachUser.role)) {
            return res.status(404).json({ message: "Invalid Coach — user not found or not a Coach role" });
        }

        const memberDoc = await findMember(memberId);
        if (!memberDoc) {
            return res.status(404).json({ message: "Member not found" });
        }
        const memberForbidden = forbidIfOutOfLocationScope(req, memberDoc);
        if (memberForbidden) return sendMemberScopeError(res, memberForbidden);
        const member = memberDoc;

        member.current_couch = coachId;
        member.userlog.push({
            type: "assign",
            text: `Assigned to ${coachUser.name}`,
            createdBy: req.user.id,
        });

        member.couch_subscription_status="active";

        await member.save();
        await member.populate("current_couch", "name role");

        await notifyMemberAssigned({
            recipientId: coachId,
            member,
            actorId: req.user.id,
        });

        res.status(200).json({ message: "Coach assigned", member });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const addCouch_notes = async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) {
            return res.status(400).json({ message: "Note text is required" });
        }

        if (!hasAccess(req.user, "coach_notes")) {
            return res.status(403).json({ message: "You are not allowed to comment on members" });
        }

        const identifier = req.params.memberId || req.params.id;
        const scoped = await findScopedMember(req, identifier);
        if (scoped.error) return sendMemberScopeError(res, scoped.error);
        const member = scoped.member;

        member.couch_notes.push({ text: sanitizePlainText(text), createdBy: req.user.id });
        await member.save();
        res.status(201).json({ message: "Note added successfully", member });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

const switchCoach = async (req, res) => {
    try {
        const { newCoachId } = req.body;
        if (!newCoachId) {
            return res.status(400).json({ message: "New Coach Rep ID is required" });
        }

        const coachUser = await validateCoachAssignee(newCoachId);
        if (!coachUser) {
            return res.status(400).json({
                message: "Invalid coach — user not found or not a coach role"
            });
        }

        const identifier = req.params.memberId || req.params.id;
        const scoped = await findScopedMember(req, identifier);
        if (scoped.error) return sendMemberScopeError(res, scoped.error);
        const member = scoped.member;

        member.current_couch = newCoachId;
        member.userlog.push({
            type: "assign",
            text: `Transferred to ${coachUser.name}`,
            createdBy: req.user.id,
        });
        await member.save();

        const isTask = Boolean(req.body.isTask || req.body.source === "tasks");
        let taskId = null;
        if (isTask) {
            const task = await Task.create({
                createdBy: req.user.id,
                assignedTo: newCoachId,
                targetRole: coachUser.role,
                transferType: "quick",
                title: "Quick Transfer (1 member)",
                members: [{
                    member: member._id,
                    name: member.name,
                    systemId: member.systemId,
                    phone: member.phones,
                    status: "pending",
                }],
                totalCount: 1,
                completedCount: 0,
                status: "pending",
            });
            taskId = task._id;
            await notifyTaskAssigned({
                recipientId: newCoachId,
                members: [member],
                actorId: req.user.id,
                taskId: task._id,
            });
        } else {
            await notifyMemberAssigned({
                recipientId: newCoachId,
                member,
                actorId: req.user.id,
            });
        }

        res.json({ message: "Coach updated successfully", member });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};


const addPT_sessions = async (req, res) => {
    try {
        const { memberId } = req.params;
        const { numberOfSessions, startDate, durationMonths, pricePaid } = req.body;

        const memberDoc = await findMember(memberId);
        if (!memberDoc) {
            return res.status(404).json({ message: "Member not found" });
        }
        const memberForbidden = forbidIfOutOfLocationScope(req, memberDoc);
        if (memberForbidden) return sendMemberScopeError(res, memberForbidden);
        const member = memberDoc;

        const sessions = Number(numberOfSessions);
        if (sessions <= 0 || Number.isNaN(sessions)) {
            return res.status(400).json({
                message: "Number of sessions must be greater than zero"
            });
        }

        const months = Number(durationMonths);
        if (months <= 0 || Number.isNaN(months)) {
            return res.status(400).json({
                message: "Duration (months) must be greater than zero"
            });
        }

        const start = startDate ? new Date(startDate) : new Date();
        // Convert months to days: full months (30 days each) + half month (15 days)
        const fullMonths = Math.floor(months);
        const hasHalf = months - fullMonths >= 0.5;
        const end = new Date(start);
        end.setMonth(end.getMonth() + fullMonths);
        if (hasHalf) end.setDate(end.getDate() + 15);

        member.PT_sessions = (member.PT_sessions || 0) + sessions;
        member.PT_sessions_startDate = start;
        member.PT_sessions_expDate = end;

        // Add to history
        member.pt_subscriptions.push({
            sessions,
            startDate: start,
            endDate: end,
            durationMonths: months,
            pricePaid: Number(pricePaid) || 0,
            createdBy: req.user.id,
        });

        await member.save();

        res.json({
            message: "PT sessions updated successfully",
            member
        });
    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
};

const bulkTransferCoach = async (req, res) => {
    try {
        // Tasks UI historically sent newCoachId; Coach Transfer sends coachId.
        const coachId = req.body.coachId || req.body.newCoachId;
        const { memberIds } = req.body;

        if (!coachId) {
            return res.status(400).json({ message: "coachId is required" });
        }
        if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
            return res.status(400).json({ message: "memberIds array is required" });
        }

        const coachUser = await User.findById(coachId);
        if (!coachUser || !["Coach", "Head Coach"].includes(coachUser.role)) {
            return res.status(400).json({ message: "Invalid coach — user not found or not a Coach role" });
        }

        // Use bulkWrite for speed instead of saving one by one — explicitly scope each op to tenant
        const tenantFilter = req.user?.tenantId ? { tenantId: req.user.tenantId } : {};
        const bulkOps = memberIds.map(id => ({
            updateOne: {
                filter: { _id: id, ...tenantFilter },
                update: {
                    $set: { current_couch: coachId, couch_subscription_status: "active" },
                    $push: {
                        userlog: {
                            type: "assign",
                            text: `Bulk assigned to ${coachUser.name}`,
                            createdBy: req.user.id,
                            createdAt: new Date(),
                        },
                    },
                },
            },
        }));

        const result = await Member.bulkWrite(bulkOps);
        const transferredCount = result.modifiedCount || 0;

        let createdTaskId = null;
        if (transferredCount > 0) {
            const transferredMembers = await Member.find({ _id: { $in: memberIds } })
                .select("name systemId phones");

            const taskMemberItems = transferredMembers.map((m) => ({
                member: m._id,
                name: m.name,
                systemId: m.systemId,
                phone: m.phones,
                status: "pending",
            }));

            const task = await Task.create({
                createdBy: req.user.id,
                assignedTo: coachId,
                targetRole: coachUser.role,
                transferType: "bulk",
                title: `Bulk Transfer (${transferredCount} members)`,
                members: taskMemberItems,
                totalCount: transferredCount,
                completedCount: 0,
                status: "pending",
            });
            createdTaskId = task._id;

            await notifyTaskAssigned({
                recipientId: coachId,
                members: transferredMembers,
                actorId: req.user.id,
                taskId: task._id,
            }).catch(() => {});
        }

        res.json({
            message: "Members transferred successfully",
            transferredCount,
            taskId: createdTaskId,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

const getTodayCoachTransfers = async (req, res) => {
    try {
        const { start: today, end: tomorrow } = cairoDayBounds();

        // Find members with coach-assign userlog entries today
        const filter = {
            "userlog": {
                $elemMatch: {
                    type: "assign",
                    createdAt: { $gte: today, $lte: tomorrow },
                },
            },
            ...(req.locationFilter || {}),
        };

        // Coach only sees members currently assigned to them
        if (req.user.role === "Coach") {
            const mongoose = require("mongoose");
            filter.current_couch = new mongoose.Types.ObjectId(req.user.id);
        }

        const members = await Member.find(filter)
            .populate("current_couch", "name role")
            .populate("userlog.createdBy", "name role")
            .select("name systemId memberId phones status couch_subscription_status current_couch userlog");

        const transfers = [];
        members.forEach(m => {
            (m.userlog || []).forEach(log => {
                if (log.type === "assign" && new Date(log.createdAt) >= today && new Date(log.createdAt) < tomorrow) {
                    transfers.push({
                        _id: log._id,
                        member: {
                            _id: m._id,
                            name: m.name,
                            systemId: m.systemId,
                            memberId: m.memberId,
                            status: m.status,
                            couch_subscription_status: m.couch_subscription_status,
                            current_couch: m.current_couch,
                        },
                        text: log.text,
                        time: log.createdAt,
                        by: log.createdBy?.name || "Unknown",
                        byRole: log.createdBy?.role || null,
                    });
                }
            });
        });

        transfers.sort((a, b) => new Date(b.time) - new Date(a.time));
        res.json({ transfers, count: transfers.length });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};


const refund = async (req, res) => {
    try {
        const memberID = req.params?.memberId || req.body.memberID;
        const { refund_amount, reason } = req.body;

        if (!memberID) {
            return res.status(400).json({
                message: "Please enter the member ID"
            });
        }

        if (refund_amount == null || refund_amount <= 0) {
            return res.status(400).json({
                message: "Please enter a valid refund amount"
            });
        }

        const member = await Member.findById(memberID);

        if (!member) {
            return res.status(404).json({
                message: "Invalid member ID"
            });
        }

        const refundForbidden = forbidIfOutOfLocationScope(req, member);
        if (refundForbidden) return sendMemberScopeError(res, refundForbidden);

        if (member.subscriptions.length === 0) {
            return res.status(400).json({
                message: "Member has no subscriptions"
            });
        }

        const lastSubscription = member.subscriptions[member.subscriptions.length - 1];
        const alreadyRefunded = lastSubscription.refundAmount || 0;
        const maxRefundable = lastSubscription.pricePaid - alreadyRefunded;
        const currency = req.tenant?.settings?.locale?.currency || "EGP";

        if (refund_amount <= 0 || refund_amount > maxRefundable) {
            return res.status(400).json({
                message: `Refund amount exceeds the refundable amount. Max refundable: ${maxRefundable} ${currency}`
            });
        }

        // Store refund on the subscription — subscriptionSalePrice() subtracts it automatically
        // so all revenue calculations (getSalesManagerRevenue, getSalesRevenue, etc.) reflect the deduction
        const newRefundTotal = alreadyRefunded + Number(refund_amount);
        lastSubscription.refundAmount = newRefundTotal;
        lastSubscription.refundReason = reason || null;
        lastSubscription.refundedBy   = req.user.id;
        lastSubscription.refundedAt   = new Date();
        lastSubscription.refunded     = true;

        lastSubscription.cancelled = true;
        lastSubscription.cancelledAt = new Date();
        lastSubscription.cancelledBy = req.user.id;
        lastSubscription.subscriptionStatus = "cancelled";

        // Determine new member status
        const priorValidSubs = member.subscriptions
            .slice(0, -1)
            .filter(s => !s.refunded && !s.cancelled && s.subscriptionStatus !== "cancelled");

        if (priorValidSubs.length === 0) {
            member.status = "guest";
            member.isMember = false;
        } else {
            member.status = "expired";
            // isMember stays true
        }

        // Reclaim unused free PT sessions
        const freePt = lastSubscription.packageSnapshot?.free_pt_sessions || 0;
        if (freePt > 0) {
            member.PT_sessions = Math.max(0, (member.PT_sessions || 0) - freePt);
        }

        // Log the refund+cancellation
        const pkgName = lastSubscription.packageSnapshot?.name || "Package";
        member.userlog.push({
            type: "other",
            text: `Package refunded and cancelled: ${pkgName}`,
            createdBy: req.user.id,
        });

        await member.save();

        res.status(200).json({
            message: "Amount refunded successfully",
            refundAmount: lastSubscription.refundAmount,
            member,
        });

    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
};

const refundPT_Sessions = async (req, res) => {
    try {
        const memberID = req.params?.memberId || req.body.memberID;
        const { refund_amount, reason } = req.body;

        if (!memberID) {
            return res.status(400).json({ message: "Please enter the member ID" });
        }

        if (refund_amount == null || refund_amount <= 0) {
            return res.status(400).json({ message: "Please enter a valid refund amount" });
        }

        const member = await Member.findById(memberID);
        if (!member) {
            return res.status(404).json({ message: "Invalid member ID" });
        }

        const ptRefundForbidden = forbidIfOutOfLocationScope(req, member);
        if (ptRefundForbidden) return sendMemberScopeError(res, ptRefundForbidden);

        if (member.pt_subscriptions.length === 0) {
            return res.status(400).json({ message: "Member has no PT subscriptions" });
        }

        const lastSub = member.pt_subscriptions[member.pt_subscriptions.length - 1];
        const alreadyRefunded = lastSub.refundAmount || 0;
        const maxRefundable   = lastSub.pricePaid - alreadyRefunded;
        const currency        = req.tenant?.settings?.locale?.currency || "EGP";

        if (refund_amount > maxRefundable) {
            return res.status(400).json({
                message: `Refund amount exceeds the refundable amount. Max refundable: ${maxRefundable} ${currency}`
            });
        }

        lastSub.refundAmount = alreadyRefunded + Number(refund_amount);
        lastSub.refundReason = reason || null;
        lastSub.refundedBy   = req.user.id;
        lastSub.refundedAt   = new Date();
        lastSub.refunded     = true;
        // member.userlog.push({
        //     type: "other",
        //     text: `PT sessions refund of ${refund_amount} EGP issued${reason ? `: ${reason}` : ""}`,
        //     createdBy: req.user.id,
        // });

        await member.save();

        res.status(200).json({
            message: "PT sessions refund issued successfully",
            refundAmount: lastSub.refundAmount,
            member,
        });

    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// ─── Bulk Import Members from Excel ──────────────────────────────────────────
const bulkImportMembers = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded" });
        }
        if (!req.user?.tenantId) {
            return res.status(400).json({ message: "Gym context is missing for this import" });
        }

        const job = await startMemberImport({
            buffer: req.file.buffer,
            fileName: req.file.originalname,
            userId: req.user.id,
            tenantId: req.user.tenantId,
            tenantSlug: req.user.tenantSlug,
        });
        res.status(202).json(job);
    } catch (error) {
        const status = Number(error.statusCode) || 500;
        if (status >= 500) {
            res.status(500).json({ message: "Server error", error: error.message });
            return;
        }
        res.status(status).json({ message: error.message });
    }
};

const updateMember = async (req, res) => {
    try {
        const memberDoc = await findMember(req.params.memberId);
        if (!memberDoc) {
            return res.status(404).json({ message: "Member not found" });
        }
        const memberForbidden = forbidIfOutOfLocationScope(req, memberDoc);
        if (memberForbidden) return sendMemberScopeError(res, memberForbidden);
        const member = memberDoc;

        const visible = redactMemberForViewer(member.toObject(), req.user);
        const canEditPhone = Boolean(visible.phones && visible.phones !== "hidden");
        const { name, phones, gender, birthdate, source, locationId } = req.body;

        member.name = name;
        if (canEditPhone && phones !== undefined) {
            const phoneKey = await assertPhoneAvailable(phones, { excludeMemberId: member._id });
            member.phones = String(phones).trim();
            member.phoneKey = phoneKey;
        }
        member.gender = gender || null;
        member.birthdate = birthdate || null;
        member.source = source || null;

        if (locationId !== undefined && locationId !== null && locationId !== "") {
            const loc = await resolveMemberLocationId(req, locationId);
            if (loc.error) {
                return res.status(loc.status || 400).json({ message: loc.error });
            }
            member.locationId = loc.locationId;
        }

        member.userlog.push({
            type: "other",
            text: "Personal information updated",
            createdBy: req.user.id,
        });
        await member.save();

        res.json({ message: "Member updated" });
    } catch (error) {
        if (replyIfConflict(res, error)) return;
        res.status(500).json({ message: error.message });
    }
};

const getMemberImportJob = async (req, res) => {
    try {
        const job = await getMemberImport(req.params.jobId);
        if (!job) return res.status(404).json({ message: "Import not found" });
        res.json(job);
    } catch (error) {
        const status = Number(error.statusCode) || 500;
        res.status(status).json({ message: error.message || "Server error" });
    }
};

module.exports = {
    createMember,
    updateMember,
    getAllMembers,
    getMemberProfile,
    checkInMember,
    assignSalesman,
    freezeMember,
    getMembers,
    getMemberById,
    addNote,
    addAlert,
    deactivateAlert,
    switchSalesRep,
    bulkTransferSalesReps,
    addInvitation,
    getAllNotes,
    assignPackage,
    getTodayCheckIns,
    uploadNationalId,
    uploadProfilePhoto,
    deleteProfilePhoto,
    blockMember,
    unblockMember,
    sessionCheckIn_for_couch,
    bulkImportMembers,
    getMemberImportJob,
    assignCoach,
    addCouch_notes,
    switchCoach,
    bulkTransferCoach,
    getTodayCoachTransfers,
    addPT_sessions,
    refund,
    refundPT_Sessions
};
