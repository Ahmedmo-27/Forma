const User = require("../models/User");
const Tenant = require("../models/Tenant");
const { getEffectiveFeatures } = require("../models/Tenant");
const jwt = require("jsonwebtoken");
const { formatUserResponse } = require("../utils/userAbilities");
const logger = require("../utils/logger");
const { hashPassword, verifyPassword, normalizeEmail, MIN_PASSWORD_LENGTH, bumpTokenVersion } = require("../utils/passwordUtils");
const passwordSetup = require("../services/passwordSetupService");
const { invalidateAuthContext } = require("../middleware/authContextCache");
const { normalizeUsername, uniqueUsername, escapeRegex } = require("../utils/username");
const { runWithTenant, runAsPlatform } = require("../context/tenantContext");
const {
    getLockState,
    recordLoginFailure,
    clearLoginFailures,
} = require("../middleware/loginLockout");
const { writeAudit } = require("../utils/audit");
const { setFeatureEnabled, featureKeyForAbility, canAssignRole, syncLegacyFields } = require("../utils/accessControl");
const {
    monthKey,
    dayKey,
    isSameDay,
    buildMonthlyMap,
    cairoDayBounds,
    memberPrice,
    getCurrentSubscription,
    subscriptionSalePrice,
} = require("../utils/revenueUtils");
const { resolveSubscriptionPackage } = require("../utils/packageSnapshot");
const {
    filterUsersByLocationScope,
    userVisibleInLocationScope,
    resolveAllowedLocationIds,
} = require("../utils/locationScope");

const FINANCE_ROLES = ["Sales Manager", "Owner", "General Manager", "Accountant"];
const STAFF_CREATOR_ROLES = ["Sales Manager", "Owner", "Head Coach", "General Manager"];

function accessContextFor(tenant) {
    if (!tenant) return null;
    const plan = tenant.planId && Array.isArray(tenant.planId.features) ? tenant.planId : null;
    return {
        roleAccess: tenant.roleAccess || null,
        planFeatures: plan ? getEffectiveFeatures(tenant, plan) : null,
    };
}
const GENERIC_LOGIN_FAILURE = "Invalid username or password";
const GYM_ROLES = ["Owner", "General Manager", "Receptionist", "Coach", "Head Coach", "Accountant", "Sales", "Sales Manager"];

function respondAfterLoginFailure(res, fail, req) {
    if (fail.lockedUntil) {
        const retryAfter = Math.max(1, Math.ceil((fail.lockedUntil - Date.now()) / 1000));
        const message = "Account temporarily locked due to failed login attempts";
        return res.status(429).json({
            error: {
                code: "AUTH_ACCOUNT_LOCKED",
                message,
                status: 429,
                requestId: req?.requestId,
                retryAfter,
                details: { lockedUntil: new Date(fail.lockedUntil).toISOString() },
            },
            code: "AUTH_ACCOUNT_LOCKED",
            message,
            lockedUntil: new Date(fail.lockedUntil).toISOString(),
            retryAfter,
        });
    }
    const message = GENERIC_LOGIN_FAILURE;
    return res.status(400).json({
        error: {
            code: "AUTH_INVALID_CREDENTIALS",
            message,
            status: 400,
            requestId: req?.requestId,
        },
        code: "AUTH_INVALID_CREDENTIALS",
        message,
    });
}

const registerUser = async (req, res) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
        logger.auth("info", "Register attempt", {
            requestId,
            ip: req.ip,
            actorId: req.user?.id,
            hasJwtSecret: Boolean(process.env.JWT_SECRET),
        });

        if (!process.env.JWT_SECRET) {
            logger.auth("error", "Register blocked: JWT_SECRET missing", { requestId });
            return res.status(500).json({ message: "Server misconfigured: JWT_SECRET is missing" });
        }

        const { name, password } = req.body;
        const email = normalizeEmail(req.body.email);

        if (!email || !password) {
            logger.auth("warn", "Register validation failed", { requestId, reason: "missing_fields" });
            return res.status(400).json({ message: "Email and password are required" });
        }

        const userExists = await User.findOne({ email });
        if (userExists) {
            logger.auth("warn", "Register rejected: user exists", { requestId });
            return res.status(400).json({ message: "User already exists" });
        }

        const hashedPassword = await hashPassword(password);
        const username = await uniqueUsername(User, email);
        const user = await User.create({ name, email, username, password: hashedPassword, role: "Receptionist" });

        logger.auth("info", "Register success", {
            requestId,
            userId: user._id.toString(),
            role: user.role,
            createdBy: req.user?.id,
        });

        res.status(201).json({
            message: "User created",
            user: { _id: user._id, name: user.name, email: user.email, role: user.role },
        });
    } catch (error) {
        logger.auth("error", "Register error", { requestId, error: error.message });
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

const loginUser = async (req, res) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
        const loginId = normalizeUsername(req.body?.username || req.body?.email);

        logger.auth("info", "Login attempt", {
            requestId,
            ip: req.ip,
            userAgent: req.get("user-agent"),
            hasEmail: Boolean(loginId),
            hasJwtSecret: Boolean(process.env.JWT_SECRET),
            apiBaseHint: req.get("origin") || req.get("referer") || null,
        });

        if (!process.env.JWT_SECRET) {
            logger.auth("error", "Login blocked: JWT_SECRET missing", { requestId });
            return res.status(500).json({ message: "Server misconfigured: JWT_SECRET is missing" });
        }

        if (!loginId || !req.body?.password) {
            logger.auth("warn", "Login validation failed", { requestId, reason: "missing_fields" });
            return res.status(400).json({ message: "Username and password are required" });
        }

        const lock = getLockState(loginId);
        if (lock.locked) {
            logger.auth("warn", "Login blocked: account locked", { requestId });
            const retryAfter = Math.max(1, Math.ceil((lock.lockedUntil - Date.now()) / 1000));
            const message = "Account temporarily locked due to failed login attempts";
            return res.status(429).json({
                error: {
                    code: "AUTH_ACCOUNT_LOCKED",
                    message,
                    status: 429,
                    requestId: req.requestId,
                    retryAfter,
                    details: { lockedUntil: new Date(lock.lockedUntil).toISOString() },
                },
                code: "AUTH_ACCOUNT_LOCKED",
                message,
                lockedUntil: new Date(lock.lockedUntil).toISOString(),
                retryAfter,
            });
        }

        // Username first. Accounts that only have an email still match the
        // local-part or the full address so existing staff are not locked out.
        const candidateUsers = await runAsPlatform(async () => {
            const byUsername = await User.find({ username: loginId });
            if (byUsername.length) return byUsername;
            if (loginId.includes("@")) {
                return User.find({ email: normalizeEmail(loginId) });
            }
            return User.find({
                $or: [
                    { username: loginId },
                    { email: new RegExp(`^${escapeRegex(loginId)}@`, "i") },
                ],
            });
        });

        if (!candidateUsers || candidateUsers.length === 0) {
            const fail = recordLoginFailure(loginId);
            logger.auth("warn", "Login failed: invalid credentials", {
                requestId,
                failureCount: fail.count,
                locked: Boolean(fail.lockedUntil),
            });
            return respondAfterLoginFailure(res, fail, req);
        }

        let user = null;
        let verifiedNeedsRehash = false;

        // Optional gym hint (subdomain / legacy header / body) if available
        let gymHint = req.body?.gymCode || req.body?.gymSlug || req.get("x-tenant-slug") || req.get("x-gym-code");
        if (!gymHint) {
            const host = req.get("host") || "";
            const hostNoPort = host.split(":")[0];
            const isPlatformHost = /\.(onrender\.com|render\.com|railway\.app|vercel\.app|herokuapp\.com|netlify\.app|elasticbeanstalk\.com|azurewebsites\.net)$/i.test(hostNoPort);
            if (!isPlatformHost) {
                const parts = hostNoPort.split(".");
                if (parts.length > 2 && !["www", "api", "app", "localhost"].includes(parts[0])) {
                    gymHint = parts[0];
                }
            }
        }

        let sortedCandidates = candidateUsers;
        if (gymHint && candidateUsers.length > 1) {
            const hintTenant = await runAsPlatform(async () => {
                return await Tenant.findOne({ slug: String(gymHint).toLowerCase().trim() });
            });
            if (hintTenant) {
                sortedCandidates = [...candidateUsers].sort((a, b) => {
                    const aMatch = String(a.tenantId) === String(hintTenant._id);
                    const bMatch = String(b.tenantId) === String(hintTenant._id);
                    return bMatch - aMatch;
                });
            }
        }

        for (const candidate of sortedCandidates) {
            const { match, compareSkipped, needsRehash } = await verifyPassword(
                req.body.password,
                candidate.password,
                { requestId, userId: candidate._id.toString() }
            );
            if (!compareSkipped && match) {
                user = candidate;
                verifiedNeedsRehash = needsRehash;
                break;
            }
        }

        if (!user) {
            const fail = recordLoginFailure(loginId);
            logger.auth("warn", "Login failed: invalid credentials", {
                requestId,
                failureCount: fail.count,
                locked: Boolean(fail.lockedUntil),
            });
            return respondAfterLoginFailure(res, fail, req);
        }

        clearLoginFailures(loginId);

        if (!user.username && typeof user.save === "function") {
            try {
                user.username = await runAsPlatform(() => uniqueUsername(User, user.email, { excludeId: user._id }));
                await runAsPlatform(async () => {
                    await user.save();
                });
            } catch (error) {
                logger.auth("warn", "Username backfill skipped", { requestId, error: error.message });
            }
        }

        if (verifiedNeedsRehash) {
            user.password = await hashPassword(req.body.password);
            await runAsPlatform(async () => {
                await user.save();
            });
            logger.auth("info", "Password rehashed to current cost factor", {
                requestId,
                userId: user._id.toString(),
            });
        }

        if (!user.tenantId) {
            logger.auth("warn", "Login rejected: user is not assigned to a gym", {
                requestId,
                userId: user._id.toString(),
            });
            return res.status(401).json({
                code: "AUTH_NO_TENANT",
                message: "This account is not associated with an active gym.",
            });
        }

        const tenant = await runAsPlatform(async () => {
            return await Tenant.findById(user.tenantId);
        });

        if (!tenant) {
            logger.auth("warn", "Login rejected: tenant not found", {
                requestId,
                userId: user._id.toString(),
                tenantId: user.tenantId.toString(),
            });
            return res.status(401).json({
                code: "AUTH_NO_TENANT",
                message: "This account's gym was not found.",
            });
        }

        if (tenant.status === "suspended" || tenant.status === "cancelled") {
            return res.status(403).json({
                code: "TENANT_SUSPENDED",
                message: "This gym's subscription is suspended or cancelled. Please contact your administrator.",
            });
        }

        const effectiveTenantId = tenant._id.toString();
        const effectiveTenantSlug = tenant.slug || null;

        const token = jwt.sign(
            {
                id: user.id,
                role: user.role,
                tenantId: effectiveTenantId,
                tenantSlug: effectiveTenantSlug,
                version: user.tokenVersion || 0,
            },
            process.env.JWT_SECRET,
            { expiresIn: "8h" }
        );

        logger.auth("info", "Login success", {
            requestId,
            userId: user._id.toString(),
            role: user.role,
            tenantSlug: effectiveTenantSlug,
        });

        const formattedUser = formatUserResponse(user, {
            includeAccess: true,
            accessContext: accessContextFor(tenant),
        });
        if (effectiveTenantSlug) {
            formattedUser.tenantSlug = effectiveTenantSlug;
        }
        if (effectiveTenantId) {
            formattedUser.tenantId = effectiveTenantId;
        }

        res.json({
            message: "Login successful",
            token,
            user: formattedUser,
        });
    } catch (error) {
        logger.auth("error", "Login error", { requestId, error: error.message });
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

const getSalesUsers = async (req, res) => {
    try {
        const salesUsers = await User.find(
            { role: { $in: ["Sales", "Sales Manager"] } },
            "name role _id allowedLocationIds canAccessAllLocations"
        ).sort({ name: 1 }).lean();

        res.status(200).json({
            salesUsers: filterUsersByLocationScope(salesUsers, req.tenant, req.locationScope)
                .map(({ _id, name, role }) => ({ _id, name, role })),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getReceptionists = async (req, res) => {
    try {
        // Staff directory for Contacts — scoped by navbar branch (access grants).
        // Owner / GM included so managers appear under All and on branches they can access.
        const staff = await User.find(
            {
                role: {
                    $in: [
                        "Receptionist",
                        "Sales",
                        "Sales Manager",
                        "Coach",
                        "Head Coach",
                        "Accountant",
                        "General Manager",
                        "Owner",
                    ],
                },
            },
            "name mobile_number role _id email createdAt allowedLocationIds canAccessAllLocations"
        ).sort({ role: 1, name: 1 }).lean();

        res.json({
            receptionists: filterUsersByLocationScope(staff, req.tenant, req.locationScope)
                .map(({ allowedLocationIds, canAccessAllLocations, ...rest }) => rest),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getSalesRevenue = async (req, res) => {
    try {
        if (req.user.role !== "Sales") {
            return res.status(403).json({ message: "Only sales representatives can access this" });
        }

        const Member = require("../models/Member");
        require("../models/Package");

        const members = await Member.find({ assignedSales: req.user.id })
            .select("subscriptions status createdAt")
            .populate("subscriptions.package", "name price duration")
            .lean();

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        const lastMonthDate = new Date(currentYear, currentMonth - 1, 1);
        const lastMonthYear = lastMonthDate.getFullYear();
        const lastMonth = lastMonthDate.getMonth();

        const isInMonth = (date, year, month) => {
            const d = new Date(date);
            return d.getFullYear() === year && d.getMonth() === month;
        };

        const monthlyMap = buildMonthlyMap(6, now);

        let currentMonthRevenue = 0;
        let lastMonthRevenue = 0;
        let totalRevenue = 0;

        members.forEach((member) => {
            const price = memberPrice(member);
            if (!price) return;

            const sub = getCurrentSubscription(member);
            const saleDate = sub?.createdAt || member.createdAt;

            totalRevenue += price;
            const key = monthKey(saleDate);

            if (monthlyMap[key]) {
                monthlyMap[key].revenue += price;
                monthlyMap[key].salesCount += 1;
            }

            if (isInMonth(saleDate, currentYear, currentMonth)) {
                currentMonthRevenue += price;
            }
            if (isInMonth(saleDate, lastMonthYear, lastMonth)) {
                lastMonthRevenue += price;
            }
        });

        const currency = req.tenant?.settings?.locale?.currency || "EGP";
        const timeZone = req.tenant?.settings?.locale?.timezone || "Africa/Cairo";

        res.json({
            currency,
            currentMonth: monthKey(now, timeZone),
            currentMonthRevenue,
            lastMonthRevenue,
            totalRevenue,
            monthlyBreakdown: Object.values(monthlyMap),
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

const getSalesManagerRevenue = async (req, res) => {
    try {
        if (!FINANCE_ROLES.includes(req.user.role)) {
            return res.status(403).json({ message: "Not authorized" });
        }

        const Member = require("../models/Member");
        require("../models/Package");

        const now          = new Date();
        const selectedDate = req.query.date  || null; // YYYY-MM-DD  – specific day filter
        const currentYear  = Number(dayKey(now).slice(0, 4));

        const memberQuery = { ...(req.locationFilter || {}) };
        const [members, reps] = await Promise.all([
            Member.find(memberQuery)
                .select("subscriptions assignedSales status locationId")
                .populate("subscriptions.package", "name price")
                .lean(),
            User.find({ role: "Sales" }).select("name email _id monthlyTarget").lean(),
        ]);
        // Build monthly map for the past 12 months
        const monthlyMap = buildMonthlyMap(12, now);

        let todayRevenue         = 0;
        let selectedDateRevenue  = 0;
        let currentYearRevenue   = 0;

        // Iterate every subscription of every member for accurate per-date attribution
        members.forEach((member) => {
            if (!member.subscriptions?.length) return;

            member.subscriptions.forEach((sub) => {
                const price = subscriptionSalePrice(sub);
                if (!price) return;

                // startDate is the actual sale date — never use createdAt for revenue
                const saleDate = sub.startDate;
                if (!saleDate) return;

                const key = monthKey(saleDate);

                if (monthlyMap[key]) {
                    monthlyMap[key].revenue    += price;
                    monthlyMap[key].salesCount += 1;
                }

                if (isSameDay(saleDate, now)) todayRevenue += price;

                const saleYear = Number(dayKey(saleDate).slice(0, 4));
                if (saleYear === currentYear) {
                    currentYearRevenue += price;
                }

                if (selectedDate && dayKey(saleDate) === selectedDate) {
                    selectedDateRevenue += price;
                }
            });
        });

        // Monthly totals sorted newest → oldest for the 12-month window
        const monthlyBreakdown = Object.values(monthlyMap).reverse();

        const currency = req.tenant?.settings?.locale?.currency || "EGP";
        const timeZone = req.tenant?.settings?.locale?.timezone || "Africa/Cairo";

        res.json({
            currency,
            today:              dayKey(now, timeZone),
            todayRevenue,
            currentYear,
            currentYearRevenue,
            selectedDate,
            selectedDateRevenue,
            monthlyBreakdown,   // [{month, revenue, salesCount}]
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

const getSalesReps = async (req, res) => {
    try {
        if (!["Sales Manager", "Owner", "General Manager"].includes(req.user.role)) {
            return res.status(403).json({ message: "Not authorized" });
        }

        const reps = await User.find({ role: "Sales" }).select("name email _id abilities monthlyTarget createdAt");
        res.json(reps.map(formatUserResponse));
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

const getMyProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        let accessContext = null;
        if (req.user?.tenantId) {
            const tenant = (req.tenant && req.tenant.planId?.features) ? req.tenant : await runAsPlatform(async () => {
                return await Tenant.findById(req.user.tenantId).populate("planId");
            });
            accessContext = accessContextFor(tenant);
        }
        const tenantForLoc = accessContext
            ? (req.tenant || null)
            : null;
        const formatted = formatUserResponse(user, {
            includeAccess: true,
            accessContext,
            tenant: tenantForLoc || req.tenant || null,
        });
        if (req.user?.tenantSlug) formatted.tenantSlug = req.user.tenantSlug;
        if (req.user?.tenantId) formatted.tenantId = req.user.tenantId;

        res.json(formatted);
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

const getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const isSelf = req.user.id === user._id.toString();
        const isManager = ["Sales Manager", "Owner", "Head Coach"].includes(req.user.role);

        if (!isSelf && !isManager) {
            return res.status(403).json({ message: "Not authorized" });
        }

        res.json(formatUserResponse(user));
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

const STATUS_STAT_KEYS = { active: "active", frozen: "frozen", expired: "expired", guest: "guests" };

function buildRepStats(members, repId, now = new Date()) {
    const stats = { total: 0, active: 0, frozen: 0, expired: 0, guests: 0, monthlyRevenue: 0 };
    const repKey = repId.toString();
    const currentMonthKey = monthKey(now);

    members.forEach((member) => {
        const assignedId = member.assignedSales?._id?.toString() || member.assignedSales?.toString();
        if (assignedId !== repKey) return;

        stats.total += 1;
        const statKey = STATUS_STAT_KEYS[member.status];
        if (statKey) stats[statKey] += 1;

        const price = memberPrice(member);
        if (!price) return;

        const sub = getCurrentSubscription(member);
        const saleDate = sub?.createdAt || member.createdAt;
        if (monthKey(saleDate) === currentMonthKey) {
            stats.monthlyRevenue += price;
        }
    });

    return stats;
}

const getSalesTeam = async (req, res) => {
    try {
        const Member = require("../models/Member");
        require("../models/Package");

        const [team, members] = await Promise.all([
            User.find({ role: { $in: ["Sales", "Sales Manager"] } })
                .select("name email role monthlyTarget abilities createdAt allowedLocationIds canAccessAllLocations")
                .sort({ name: 1 })
                .lean(),
            Member.find({ ...(req.locationFilter || {}) })
                .select("assignedSales status subscriptions createdAt")
                .populate("subscriptions.package", "name price duration")
                .lean(),
        ]);

        const now = new Date();
        const teamWithStats = team
            .map((user) => {
                const stats = buildRepStats(members, user._id, now);
                return {
                    user,
                    row: {
                        ...formatUserResponse(user),
                        stats,
                    },
                };
            })
            .filter(({ user, row }) => (
                userVisibleInLocationScope(user, req.tenant, req.locationScope)
                || (row.stats?.total > 0)
            ))
            .map(({ row }) => row);

        res.json({ team: teamWithStats });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

const getSalesProfile = async (req, res) => {
    try {
        const Member = require("../models/Member");
        require("../models/Package");

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (!["Sales", "Sales Manager"].includes(user.role)) {
            return res.status(400).json({ message: "Profile is only available for sales team members" });
        }

        const members = await Member.find({
            assignedSales: user._id,
            ...(req.locationFilter || {}),
        })
            .select("systemId memberId name phones photo status isMember subscriptions assignedSales source createdAt")
            .populate("subscriptions.package", "name price duration activityType");

        res.json({
            user: formatUserResponse(user),
            stats: buildRepStats(members, user._id),
            members: members.map((m) => m.toObject()),
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

const updateSalesRepTarget = async (req, res) => {
    try {
        const targetEditors = ["Sales Manager", "Owner", "Accountant", "General Manager"];
        if (!targetEditors.includes(req.user.role)) {
            return res.status(403).json({ message: "You do not have access to this feature" });
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (user.role !== "Sales") {
            return res.status(400).json({ message: "Targets can only be set for sales representatives" });
        }

        const { monthlyTarget } = req.body;
        if (monthlyTarget === undefined || monthlyTarget === null) {
            return res.status(400).json({ message: "monthlyTarget is required" });
        }

        const target = Number(monthlyTarget);
        if (isNaN(target) || target < 0) {
            return res.status(400).json({ message: "monthlyTarget must be a number >= 0" });
        }

        user.monthlyTarget = target;
        await user.save();
        res.json({ message: "Target updated", user: formatUserResponse(user) });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

const createStaffUser = async (req, res) => {
    try {
        if (!STAFF_CREATOR_ROLES.includes(req.user.role)) {
            return res.status(403).json({ message: "Not authorized" });
        }

        const {
            name,
            email,
            password,
            role,
            mobile_number,
            canAccessAllLocations,
            allowedLocationIds,
        } = req.body;

        if (!name || !email || !password || !role || !mobile_number) {
            return res.status(400).json({ message: "name, email, password, mobile_number and role are required" });
        }

        let creatable = [];
        if (req.user.role === "Owner") {
            creatable = GYM_ROLES.filter((roleName) => roleName !== "Owner");
        } else if (req.user.role === "General Manager") {
            creatable = ["Sales Manager", "Head Coach", "Accountant", "Sales", "Coach", "Receptionist"];
        } else if (req.user.role === "Sales Manager") {
            creatable = ["Sales", "Receptionist"];
        } else if (req.user.role === "Head Coach") {
            creatable = ["Coach"];
        }
        if (!creatable.includes(role)) {
            return res.status(400).json({ message: "You cannot create that role" });
        }

        const userExists = await User.findOne({ email: normalizeEmail(email) });
        if (userExists) {
            return res.status(400).json({ message: "User already exists" });
        }

        const normalizedEmail = normalizeEmail(email);
        const hashedPassword = await hashPassword(password);
        const username = await uniqueUsername(User, normalizedEmail);

        const {
            applyLocationAccessToUser,
            defaultLocationFieldsForRole,
        } = require("../utils/userLocationAccess");

        const maySetLocations = ["Owner", "General Manager"].includes(req.user.role);
        const locationDefaults = defaultLocationFieldsForRole(role);
        const explicitLocation =
            maySetLocations
            && (canAccessAllLocations !== undefined || allowedLocationIds !== undefined);

        let locationPayload = explicitLocation
            ? {
                canAccessAllLocations: canAccessAllLocations !== undefined
                    ? Boolean(canAccessAllLocations)
                    : false,
                allowedLocationIds: Array.isArray(allowedLocationIds) ? allowedLocationIds : [],
            }
            : { ...locationDefaults };

        // When creator didn't send grants: stamp the selected navbar branch, else inherit creator grants
        if (!explicitLocation && role !== "General Manager" && role !== "Owner") {
            if (req.locationScope?.mode === "one" && req.locationScope.locationId) {
                locationPayload = {
                    canAccessAllLocations: false,
                    allowedLocationIds: [String(req.locationScope.locationId)],
                };
            } else {
                const creatorAllowed = resolveAllowedLocationIds(req.user, req.tenant);
                if (Array.isArray(creatorAllowed) && creatorAllowed.length) {
                    locationPayload = {
                        canAccessAllLocations: false,
                        allowedLocationIds: creatorAllowed,
                    };
                }
            }
        }

        if (explicitLocation) {
            const probe = {
                role,
                canAccessAllLocations: false,
                allowedLocationIds: [],
                markModified() {},
            };
            const grant = await applyLocationAccessToUser(
                req.user,
                probe,
                locationPayload,
                { requireBranches: true }
            );
            if (grant?.error) {
                return res.status(grant.status || 400).json({ message: grant.error });
            }
            locationPayload.canAccessAllLocations = probe.canAccessAllLocations;
            locationPayload.allowedLocationIds = probe.allowedLocationIds;
        }

        const user = await User.create({
            name,
            email: normalizedEmail,
            username,
            password: hashedPassword,
            role,
            mobile_number,
            canAccessAllLocations: Boolean(locationPayload.canAccessAllLocations),
            allowedLocationIds: locationPayload.canAccessAllLocations
                ? []
                : (locationPayload.allowedLocationIds || []),
        });

        logger.auth("info", "Staff user created", {
            createdBy: req.user.id,
            userId: user._id.toString(),
            role: user.role,
        });

        await writeAudit({
            action: "staff_created",
            actor: req.user.id,
            actorRole: req.user.role,
            targetType: "user",
            targetId: user._id,
            meta: { role: user.role },
            req,
        });

        res.status(201).json({
            message: "Staff user created",
            user: formatUserResponse(user),
        });
    } catch (error) {
        logger.auth("error", "Staff user create error", { error: error.message });
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

const updateSalesRepAbilities = async (req, res) => {
    try {
        if (!["Sales Manager", "Owner", "General Manager"].includes(req.user.role)) {
            return res.status(403).json({ message: "Only sales managers can update representative permissions" });
        }
        if (req.user.role === "General Manager") {
            const targetRole = (await User.findById(req.params.id).select("role"))?.role;
            if (targetRole === "Owner" || targetRole === "General Manager") {
                return res.status(403).json({ message: "You cannot edit this user" });
            }
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (user.role !== "Sales") {
            return res.status(400).json({ message: "Abilities can only be updated for sales representatives" });
        }

        const { abilities } = req.body;
        if (!abilities || typeof abilities !== "object") {
            return res.status(400).json({ message: "Abilities object is required" });
        }

        const allowedKeys = ["canCommentOnMembers", "canRequestAssignment", "canRequestTakeover", "canSendWhatsAppTemplates"];
        for (const key of allowedKeys) {
            if (abilities[key] !== undefined) {
                const enabled = Boolean(abilities[key]);
                user.abilities[key] = enabled;
                const featureKey = featureKeyForAbility(user.role, key);
                if (featureKey) setFeatureEnabled(user, featureKey, enabled);
            }
        }
        user.markModified("abilities");

        await user.save();

        await writeAudit({
            action: "sales_abilities_updated",
            actor: req.user.id,
            actorRole: req.user.role,
            targetType: "user",
            targetId: user._id,
            meta: { abilities: user.abilities },
            req,
        });

        res.json({ message: "Abilities updated", user: formatUserResponse(user) });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Returns all subscriptions (with member info) whose startDate falls within a date range
// Query params: dateFrom (YYYY-MM-DD), dateTo (YYYY-MM-DD), salesRepId (optional)
// Defaults: dateFrom = today, dateTo = today
const getSubscriptionsByDate = async (req, res) => {
    try {
        if (!FINANCE_ROLES.includes(req.user.role)) {
            return res.status(403).json({ message: "Not authorized" });
        }

        const Member = require("../models/Member");

        const timeZone = req.tenant?.settings?.locale?.timezone || "Africa/Cairo";
        const { start: dayStart, end: dayEnd, from: dateFrom, to: dateTo } = cairoDayBounds(
            req.query.dateFrom || req.query.date,
            req.query.dateTo || req.query.date,
            timeZone
        );
        const salesRepId = req.query.salesRepId || null;

        if (dayEnd < dayStart) {
            return res.status(400).json({ message: "dateTo must be on or after dateFrom" });
        }

        const filter = {
            "subscriptions.startDate": { $gte: dayStart, $lte: dayEnd },
            ...(req.locationFilter || {}),
        };
        if (salesRepId) {
            filter.assignedSales = salesRepId;
        }

        const members = await Member.find(filter)
            .populate("subscriptions.package", "name price duration activityType")
            .populate("assignedSales", "name role")
            .populate("createdBy", "name role")
            .lean();

        // Flatten to one entry per matching subscription
        const entries = [];
        members.forEach((member) => {
            member.subscriptions.forEach((sub) => {
                const sd = new Date(sub.startDate);
                if (sd >= dayStart && sd <= dayEnd) {
                    entries.push({
                        member: {
                            _id:           member._id,
                            name:          member.name,
                            systemId:      member.systemId,
                            memberId:      member.memberId,
                            phones:        member.phones,
                            status:        member.status,
                            assignedSales: member.assignedSales,
                        },
                        subscription: {
                            _id:             sub._id,
                            subscriptionId:  sub.subscriptionId,
                            package:         resolveSubscriptionPackage(sub),
                            packageSnapshot: sub.packageSnapshot || null,
                            startDate:       sub.startDate,
                            endDate:         sub.endDate,
                            pricePaid:       sub.pricePaid,
                            discountPercent: sub.discountPercent,
                            isRenewal:       sub.isRenewal,
                        },
                    });
                }
            });
        });

        entries.sort((a, b) => new Date(b.subscription.startDate) - new Date(a.subscription.startDate));

        const totalRevenue = entries.reduce((s, e) => s + (e.subscription.pricePaid || 0), 0);

        res.json({
            dateFrom,
            dateTo,
            salesRepId,
            count: entries.length,
            totalRevenue,
            entries,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Sales rep version — same logic but scoped to req.user.id automatically
const getSalesMySubscriptions = async (req, res) => {
    try {
        if (req.user.role !== "Sales") {
            return res.status(403).json({ message: "Only sales representatives can access this" });
        }

        const Member = require("../models/Member");

        const timeZone = req.tenant?.settings?.locale?.timezone || "Africa/Cairo";
        const { start: dayStart, end: dayEnd, from: dateFrom, to: dateTo } = cairoDayBounds(
            req.query.dateFrom,
            req.query.dateTo,
            timeZone
        );

        if (dayEnd < dayStart) {
            return res.status(400).json({ message: "dateTo must be on or after dateFrom" });
        }

        const members = await Member.find({
            assignedSales: req.user.id,
            "subscriptions.startDate": { $gte: dayStart, $lte: dayEnd },
            ...(req.locationFilter || {}),
        })
            .populate("subscriptions.package", "name price duration activityType")
            .populate("assignedSales", "name role");

        const entries = [];
        members.forEach((member) => {
            member.subscriptions.forEach((sub) => {
                const sd = new Date(sub.startDate);
                if (sd >= dayStart && sd <= dayEnd) {
                    entries.push({
                        member: {
                            _id:           member._id,
                            name:          member.name,
                            systemId:      member.systemId,
                            phones:        member.phones,
                            status:        member.status,
                        },
                        subscription: {
                            _id:             sub._id,
                            subscriptionId:  sub.subscriptionId,
                            package:         resolveSubscriptionPackage(sub),
                            packageSnapshot: sub.packageSnapshot || null,
                            startDate:       sub.startDate,
                            endDate:         sub.endDate,
                            pricePaid:       sub.pricePaid,
                            discountPercent: sub.discountPercent,
                            isRenewal:       sub.isRenewal,
                        },
                    });
                }
            });
        });

        entries.sort((a, b) => new Date(b.subscription.startDate) - new Date(a.subscription.startDate));

        res.json({
            dateFrom,
            dateTo,
            count: entries.length,
            totalRevenue: entries.reduce((s, e) => s + (e.subscription.pricePaid || 0), 0),
            entries,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};
// ─── Helper: build coach stats from members assigned to a coach ───────────────
const COACH_STATUS_KEYS = {
    active:           "active",
    transferred:      "transferred",
    expired:          "expired",
    interested:       "interested",
    "not interested": "notInterested",
};

function buildCoachStats(members, coachId) {
    const stats = {
        total:          0,
        active:         0,
        transferred:    0,
        expired:        0,
        interested:     0,
        notInterested:  0,
        totalPTSessions: 0,
        usedPTSessions:  0,
    };
    const coachKey = coachId.toString();

    members.forEach((member) => {
        const assignedId = member.current_couch?._id?.toString() || member.current_couch?.toString();
        if (assignedId !== coachKey) return;

        stats.total += 1;
        const statKey = COACH_STATUS_KEYS[member.couch_subscription_status];
        if (statKey) stats[statKey] += 1;

        stats.totalPTSessions += member.PT_sessions   || 0;
        stats.usedPTSessions  += member.used_PT_sessions || 0;
    });

    return stats;
}

// GET /api/users/coach-team  —  Head Coach / Owner
const getCoachTeam = async (req, res) => {
    try {
        const Member = require("../models/Member");

        const [team, members] = await Promise.all([
            User.find({ role: { $in: ["Coach", "Head Coach"] } })
                .select("name email role abilities createdAt allowedLocationIds canAccessAllLocations")
                .sort({ name: 1 })
                .lean(),
            Member.find({
                current_couch: { $ne: null },
                ...(req.locationFilter || {}),
            })
                .select("current_couch couch_subscription_status PT_sessions used_PT_sessions")
                .lean(),
        ]);

        const teamWithStats = team
            .map((user) => {
                const stats = buildCoachStats(members, user._id);
                return {
                    user,
                    row: {
                        ...formatUserResponse(user),
                        stats,
                    },
                };
            })
            .filter(({ user, row }) => (
                userVisibleInLocationScope(user, req.tenant, req.locationScope)
                || (row.stats?.total > 0)
            ))
            .map(({ row }) => row);

        res.json({ team: teamWithStats });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// GET /api/users/coach-team/:id  —  Head Coach / Owner
const getCoachProfile = async (req, res) => {
    try {
        const Member = require("../models/Member");

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (!["Coach", "Head Coach"].includes(user.role)) {
            return res.status(400).json({ message: "Profile is only available for coach team members" });
        }

        const members = await Member.find({
            current_couch: user._id,
            ...(req.locationFilter || {}),
        })
            .select("name systemId memberId phones couch_subscription_status PT_sessions used_PT_sessions current_couch");

        res.json({
            user:    formatUserResponse(user),
            stats:   buildCoachStats(members, user._id),
            members: members.map((m) => m.toObject()),
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

const change_Role = async (req, res) => {
    try {
        const { id, new_role } = req.params;
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const decision = canAssignRole(req.user, user, new_role);
        if (!decision.ok) {
            return res.status(decision.status).json({ message: decision.message });
        }

        if (user.role === new_role) {
            return res.json({ message: "Role unchanged", user: formatUserResponse(user) });
        }

        const previousRole = user.role;
        user.role = new_role;
        user.featureAccess = { grants: [], revokes: [] };
        user.accessOverrides = { add: [], remove: [] };
        user.markModified("featureAccess");
        user.markModified("accessOverrides");
        syncLegacyFields(user);
        await user.save();

        await writeAudit({
            action: "role_changed",
            actor: req.user.id,
            actorRole: req.user.role,
            targetType: "user",
            targetId: user._id,
            meta: { previousRole, newRole: new_role },
            req,
        });

        res.json({ message: "Role updated", user: formatUserResponse(user) });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

const updateCoachRepAbilities = async (req, res) => {
    try {
        if (!["Head Coach", "Owner", "General Manager"].includes(req.user.role)) {
            return res.status(403).json({ message: "Only Head Coaches can update coach permissions" });
        }
        if (req.user.role === "General Manager") {
            const targetRole = (await User.findById(req.params.id).select("role"))?.role;
            if (targetRole === "Owner" || targetRole === "General Manager") {
                return res.status(403).json({ message: "You cannot edit this user" });
            }
        }
 
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
 
        if (user.role !== "Coach") {
            return res.status(400).json({ message: "Abilities can only be updated for coaches" });
        }
 
        const { abilities } = req.body;
        if (!abilities || typeof abilities !== "object") {
            return res.status(400).json({ message: "Abilities object is required" });
        }
 
        const allowedKeys = ["canCommentOnMembers", "canRequestAssignment", "canRequestTakeover"];
        for (const key of allowedKeys) {
            if (abilities[key] !== undefined) {
                const enabled = Boolean(abilities[key]);
                user.abilities[key] = enabled;
                const featureKey = featureKeyForAbility(user.role, key);
                if (featureKey) setFeatureEnabled(user, featureKey, enabled);
            }
        }
        user.markModified("abilities");

        await user.save();
        res.json({ message: "Coach abilities updated", user: formatUserResponse(user) });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

const updateStaffMobile = async (req, res) => {
    try {
        if (!["Sales Manager", "Owner", "General Manager", "Head Coach"].includes(req.user.role)) {
            return res.status(403).json({ message: "Only managers can update staff mobile numbers" });
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        if (user.role === "Owner" && req.user.role !== "Owner") {
            return res.status(403).json({ message: "You cannot edit this user" });
        }
        if (req.user.role === "General Manager" && (user.role === "Owner" || user.role === "General Manager")) {
            return res.status(403).json({ message: "You cannot edit this user" });
        }
        if (req.user.role === "Sales Manager" && !["Sales", "Receptionist"].includes(user.role)) {
            return res.status(403).json({ message: "Sales managers can only update mobile numbers for their own team" });
        }
        if (req.user.role === "Head Coach" && user.role !== "Coach") {
            return res.status(403).json({ message: "Head Coaches can only update mobile numbers for their own team" });
        }

        const { mobile_number } = req.body;
        if (!mobile_number || typeof mobile_number !== "string" || !mobile_number.trim()) {
            return res.status(400).json({ message: "mobile_number (string) is required" });
        }

        const previousValue = user.mobile_number;
        user.mobile_number = mobile_number.trim();
        await user.save();

        await writeAudit({
            action: "staff_mobile_updated",
            actor: req.user.id,
            actorRole: req.user.role,
            targetType: "user",
            targetId: user._id,
            meta: { previousValue, newValue: mobile_number.trim() },
            req,
        });

        res.json({ message: "Mobile number updated", user: formatUserResponse(user) });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

const getReceptionistTeam = async (req, res) => {
    try {
        const team = await User.find({ role: "Receptionist" })
            .select("name email role mobile_number canViewPhones abilities createdAt allowedLocationIds canAccessAllLocations")
            .sort({ name: 1 })
            .lean();

        res.json({
            team: filterUsersByLocationScope(team, req.tenant, req.locationScope)
                .map(formatUserResponse),
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

const updatePhonePrivacy = async (req, res) => {
    try {
        if (!["Sales Manager", "Owner", "General Manager"].includes(req.user.role)) {
            return res.status(403).json({ message: "Only sales managers can update phone privacy settings" });
        }
        if (req.user.role === "General Manager") {
            const targetRole = (await User.findById(req.params.id).select("role"))?.role;
            if (targetRole === "Owner" || targetRole === "General Manager") {
                return res.status(403).json({ message: "You cannot edit this user" });
            }
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (user.role !== "Sales" && user.role !== "Receptionist") {
            return res.status(400).json({ message: "Phone privacy can only be updated for Sales Representatives and Receptionists." });
        }

        const { canViewPhones } = req.body;
        if (typeof canViewPhones !== "boolean") {
            return res.status(400).json({ message: "canViewPhones (boolean) is required" });
        }

        const previousValue = user.canViewPhones ?? true;
        user.canViewPhones = canViewPhones;
        setFeatureEnabled(user, "view_phones", canViewPhones);
        await user.save();

        await writeAudit({
            action: "phone_privacy_updated",
            actor: req.user.id,
            actorRole: req.user.role,
            targetType: "user",
            targetId: user._id,
            meta: { previousValue, newValue: canViewPhones },
            req,
        });

        res.json({ message: "Phone privacy updated", user: formatUserResponse(user) });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};


const getTeamsPage = async (req, res) => {
    try {
        if (!["Owner", "General Manager"].includes(req.user.role)) {
            return res.status(403).json({
                message: "Only the owner or general manager can view this page"
            });
        }

        const users = await User.find()
            .select("name email role mobile_number canViewPhones abilities createdAt allowedLocationIds canAccessAllLocations")
            .sort({ name: 1 })
            .lean();

        const formatted = filterUsersByLocationScope(users, req.tenant, req.locationScope)
            .map((u) => formatUserResponse(u));

        const sales = formatted.filter(
            (user) => user.role === "Sales Manager" || user.role === "Sales"
        );

        const coach = formatted.filter(
            (user) => user.role === "Head Coach" || user.role === "Coach"
        );

        const acc = formatted.filter(
            (user) => user.role === "Accountant"
        );

        const rece = formatted.filter(
            (user) => user.role === "Receptionist"
        );

        const managers = formatted.filter(
            (user) => user.role === "General Manager" || user.role === "Owner"
        );

        res.status(200).json({
            sales,
            coach,
            acc,
            rece,
            managers,
        });

    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
};


const changeAuthorities=async (req,res)=>{

};

function resetPasswordDenied(actorRole, targetRole) {
    if (actorRole === "Owner") return null;
    if (actorRole === "General Manager") {
        if (targetRole === "Owner" || targetRole === "General Manager") {
            return "You cannot edit this user";
        }
        return null;
    }
    if (actorRole === "Sales Manager") {
        if (!["Sales", "Receptionist"].includes(targetRole)) {
            return "Sales managers can only reset passwords for their own team";
        }
        return null;
    }
    if (actorRole === "Head Coach") {
        if (targetRole !== "Coach") {
            return "Head Coaches can only reset passwords for their own team";
        }
        return null;
    }
    return "You cannot reset this password";
}

// ─── Reset another user's password (Sales Manager / Owner only) ──────────────
const resetUserPassword = async (req, res) => {
    try {
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
            return res.status(400).json({ message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
        }

        const target = await User.findById(req.params.id);
        if (!target) return res.status(404).json({ message: "User not found" });

        const denied = resetPasswordDenied(req.user.role, target.role);
        if (denied) {
            return res.status(403).json({ message: denied });
        }

        target.password = await hashPassword(newPassword);
        bumpTokenVersion(target);
        await target.save();
        invalidateAuthContext({ userId: target._id, tenantId: target.tenantId });
        await passwordSetup.revokeUnusedTokens(target._id);

        logger.auth("info", "Password reset by manager", {
            actorId: req.user.id,
            actorRole: req.user.role,
            targetId: target._id.toString(),
            targetRole: target.role,
        });

        res.json({ message: `Password reset successfully for ${target.name}` });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};


const updateMyProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: "User not found" });

        const { name, currentPassword, newPassword } = req.body;

        // Update name
        if (name && name.trim()) {
            user.name = name.trim();
        }

        // Update password — require current password first
        let passwordChanged = false;
        if (newPassword) {
            if (!currentPassword) {
                return res.status(400).json({ message: "Current password is required to set a new password" });
            }
            if (newPassword.length < MIN_PASSWORD_LENGTH) {
                return res.status(400).json({ message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
            }
            const { match } = await verifyPassword(currentPassword, user.password, { requestId: req.requestId });
            if (!match) {
                return res.status(400).json({ message: "Current password is incorrect" });
            }
            user.password = await hashPassword(newPassword);
            bumpTokenVersion(user);
            passwordChanged = true;
        }

        await user.save();

        if (passwordChanged) {
            invalidateAuthContext({ userId: user._id, tenantId: user.tenantId });
            await passwordSetup.revokeUnusedTokens(user._id);
        }

        logger.auth("info", "Profile updated", {
            userId: user._id.toString(),
            nameChanged: Boolean(name),
            passwordChanged,
        });

        res.json({ message: "Profile updated successfully", user: formatUserResponse(user, { includeAccess: true }) });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

module.exports = {
    registerUser,
    loginUser,
    getSalesUsers,
    getReceptionists,
    getSalesRevenue,
    getSalesManagerRevenue,
    getSalesReps,
    getMyProfile,
    getUserById,
    updateSalesRepTarget,
    createStaffUser,
    updateSalesRepAbilities,
    updatePhonePrivacy,
    updateStaffMobile,
    getReceptionistTeam,
    getSalesTeam,
    getSalesProfile,
    getSubscriptionsByDate,
    getSalesMySubscriptions,
    change_Role,
    updateCoachRepAbilities,
    getCoachTeam,
    getCoachProfile,
    getTeamsPage,
    updateMyProfile,
    resetUserPassword,
};
