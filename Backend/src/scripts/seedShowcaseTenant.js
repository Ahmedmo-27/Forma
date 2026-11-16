/**
 * Showcase gym for prospect walkthroughs.
 * Platinum plan, Forma navy and cream, one login per role, and sample operations.
 *
 * Usage:
 *   node src/scripts/seedShowcaseTenant.js
 *
 * Gym sign-in (username or email): password123
 * Platform sign-in is separate: node src/scripts/seedSuperAdminUser.js
 */

const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const { runAsPlatform, runWithTenant } = require("../context/tenantContext");
const { hashPassword, normalizeEmail } = require("../utils/passwordUtils");
const { normalizePhone } = require("../utils/identityUniqueness");
const { applyShowcasePurpose, SHOWCASE_PALETTE, clientPalette } = require("../utils/showcasePalette");
const { seedPlans } = require("./seedPlans");

const SLUG = "forma-showcase";
const PASSWORD = "password123";
const PACKAGE_NAMES = ["Showcase Monthly", "Showcase Quarterly"];

const STAFF = [
    { role: "Owner", name: "Forma Owner", email: "owner@forma-showcase.test", username: "showcase.owner", allLocations: true },
    { role: "General Manager", name: "Forma General Manager", email: "gm@forma-showcase.test", username: "showcase.gm", allLocations: true },
    { role: "Receptionist", name: "Forma Reception", email: "reception@forma-showcase.test", username: "showcase.reception" },
    { role: "Head Coach", name: "Forma Head Coach", email: "headcoach@forma-showcase.test", username: "showcase.headcoach", monthlyTarget: 20 },
    { role: "Coach", name: "Forma Coach", email: "coach@forma-showcase.test", username: "showcase.coach", monthlyTarget: 12 },
    { role: "Accountant", name: "Forma Accountant", email: "accountant@forma-showcase.test", username: "showcase.accountant" },
    { role: "Sales Manager", name: "Forma Sales Manager", email: "sales.manager@forma-showcase.test", username: "showcase.salesmanager", monthlyTarget: 80000 },
    { role: "Sales", name: "Forma Sales", email: "sales@forma-showcase.test", username: "showcase.sales", monthlyTarget: 40000 },
];

function addMonths(date, months) {
    const next = new Date(date);
    next.setMonth(next.getMonth() + months);
    return next;
}

function daysFromNow(days) {
    const next = new Date();
    next.setDate(next.getDate() + days);
    next.setHours(10, 0, 0, 0);
    return next;
}

function snapshot(pkg) {
    return {
        name: pkg.name,
        activityType: pkg.activityType,
        duration: pkg.duration,
        price: pkg.price,
        freezeLimitDays: pkg.freezeLimitDays || 0,
        invitationLimit: pkg.invitationLimit || 0,
        renewalDiscountPercent: pkg.renewalDiscountPercent || 0,
        description: pkg.description || null,
        hasException: false,
        free_pt_sessions: pkg.free_pt_sessions || 0,
        locationScope: "all",
    };
}

async function upsertStaff(def, passwordHash, tenantId, mainId) {
    const email = normalizeEmail(def.email);
    const existing = await runAsPlatform(() => {
        const User = require("../models/User");
        return User.findOne({ email });
    });
    if (existing && String(existing.tenantId) !== String(tenantId)) {
        throw new Error(`${email} already belongs to another gym. Refusing to move that account.`);
    }
    const usernameOwner = await runAsPlatform(() => {
        const User = require("../models/User");
        return User.findOne({ username: def.username });
    });
    if (usernameOwner && String(usernameOwner.tenantId) !== String(tenantId)) {
        throw new Error(`Username ${def.username} is already used by another gym.`);
    }

    const User = require("../models/User");
    let user = existing
        ? await User.findOne({ email })
        : new User({ email, tenantId });
    user.name = def.name;
    user.email = email;
    user.username = def.username;
    user.role = def.role;
    user.password = passwordHash;
    user.tenantId = tenantId;
    user.canViewPhones = true;
    user.monthlyTarget = def.monthlyTarget || 0;
    user.canAccessAllLocations = Boolean(def.allLocations);
    user.allowedLocationIds = def.allLocations ? [] : [mainId];
    user.abilities = {
        canCommentOnMembers: true,
        canRequestAssignment: true,
        canRequestTakeover: true,
        canSendWhatsAppTemplates: true,
    };
    await user.save();
    return user;
}

async function seedShowcase() {
    await connectDB();
    await seedPlans();

    const Plan = require("../models/Plan");
    const Tenant = require("../models/Tenant");
    const plan = await runAsPlatform(() => Plan.findOne({ key: "platinum" }));
    if (!plan) throw new Error("Platinum plan was not created");

    const periodEnd = daysFromNow(400);
    let tenant = await runAsPlatform(() => Tenant.findOne({ slug: SLUG }));
    if (!tenant) {
        tenant = await runAsPlatform(() => Tenant.create({
            name: "Forma Showcase",
            slug: SLUG,
            status: "active",
            purpose: "customer",
            planId: plan._id,
            currentPeriodEnd: periodEnd,
            billing: { cycle: "monthly", intervalCount: 1 },
            settings: {
                branding: {
                    displayName: "Forma Showcase",
                    palette: { ...SHOWCASE_PALETTE },
                },
                locale: { currency: "EGP", countryCode: "20", timezone: "Africa/Cairo", language: "en" },
            },
        }));
    }

    await runAsPlatform(async () => {
        tenant.name = "Forma Showcase";
        tenant.status = "active";
        tenant.planId = plan._id;
        tenant.currentPeriodEnd = periodEnd;
        tenant.trialEndsAt = null;
        if (!tenant.billing) tenant.billing = {};
        tenant.billing.cycle = "monthly";
        tenant.billing.intervalCount = 1;
        applyShowcasePurpose(tenant, "showcase");
        if (!tenant.settings.branding) tenant.settings.branding = {};
        tenant.settings.branding.displayName = "Forma Showcase";
        if (!clientPalette(tenant.settings.branding.palette)) {
            tenant.settings.branding.palette = { ...SHOWCASE_PALETTE };
        }
        tenant.markModified("settings");
        tenant.markModified("settings.branding");
        await tenant.save();
    });

    const passwordHash = await hashPassword(PASSWORD);

    await runWithTenant({ tenantId: String(tenant._id), tenantSlug: tenant.slug }, async () => {
        const Location = require("../models/Location");
        const { ensureMainLocation } = require("../controllers/locationController");
        const Package = require("../models/Package");
        const Member = require("../models/Member");
        const SalesRepRequest = require("../models/SalesRepRequest");
        const CoachRepRequest = require("../models/CoachRepRequest");
        const Task = require("../models/Task");
        const PackageExceptionRequest = require("../models/PackageExceptionRequest");

        const main = await ensureMainLocation(tenant._id);
        let second = await Location.findOne({ locationId: "LOC-002" });
        if (!second) {
            second = await Location.create({
                name: "Nasr City",
                locationId: "LOC-002",
                branch_location: "",
                tenantId: tenant._id,
            });
        }

        const staff = {};
        for (const def of STAFF) {
            staff[def.role] = await upsertStaff(def, passwordHash, tenant._id, main._id);
            console.log(`✓ ${def.role}: ${def.username}`);
        }

        await runAsPlatform(async () => {
            tenant.ownerUserId = staff.Owner._id;
            await tenant.save();
        });

        const phones = ["01090001001", "01090001002", "01090001003", "01090001004", "01090001005", "01090001006"];
        const existingMembers = await Member.find({ phones: { $in: phones } }).select("_id");
        const existingIds = existingMembers.map((member) => member._id);
        await SalesRepRequest.deleteMany({ member: { $in: existingIds } });
        await CoachRepRequest.deleteMany({ member: { $in: existingIds } });
        await PackageExceptionRequest.deleteMany({ name: "Showcase courtesy month" });
        await Task.deleteMany({ title: "Showcase follow-up" });
        await Member.deleteMany({ phones: { $in: phones } });
        await Package.deleteMany({ name: { $in: PACKAGE_NAMES } });

        const owner = staff.Owner;
        const monthly = await Package.create({
            name: "Showcase Monthly",
            activityType: "gym",
            duration: "1 month",
            price: 1800,
            freezeLimitDays: 7,
            invitationLimit: 2,
            renewalDiscountPercent: 10,
            description: "Single-club monthly membership used in the showcase.",
            isActive: true,
            free_pt_sessions: 0,
            createdBy: owner._id,
            tenantId: tenant._id,
        });
        const quarterly = await Package.create({
            name: "Showcase Quarterly",
            activityType: "gym",
            duration: "3 months",
            price: 4800,
            freezeLimitDays: 14,
            invitationLimit: 4,
            renewalDiscountPercent: 15,
            description: "Three-month membership with personal training sessions.",
            isActive: true,
            free_pt_sessions: 8,
            createdBy: owner._id,
            tenantId: tenant._id,
        });

        const sales = staff.Sales;
        const manager = staff["Sales Manager"];
        const coach = staff.Coach;
        const headCoach = staff["Head Coach"];
        const reception = staff.Receptionist;

        function membership(pkg, id, start, end, createdBy) {
            return {
                subscriptionId: id,
                package: pkg._id,
                packageSnapshot: snapshot(pkg),
                startDate: start,
                endDate: end,
                pricePaid: pkg.price,
                discountPercent: 0,
                isRenewal: false,
                createdBy: createdBy._id,
                salesManager: manager._id,
            };
        }

        const activeStart = daysFromNow(-12);
        const activeEnd = addMonths(activeStart, 1);
        const quarterStart = daysFromNow(-20);
        const quarterEnd = addMonths(quarterStart, 3);

        const karim = await Member.create({
            name: "Karim Hassan",
            systemId: 9001,
            memberId: 9001,
            barcode: "MBR-9001",
            phones: "01090001001",
            phoneKey: normalizePhone("01090001001"),
            gender: "male",
            status: "active",
            isMember: true,
            source: "Walk in",
            locationId: main._id,
            assignedSales: sales._id,
            createdBy: sales._id,
            subscriptions: [membership(monthly, 9001, activeStart, activeEnd, sales)],
            notes: [{ text: "Prefers morning sessions before work.", createdBy: sales._id }],
            alert: [{ text: "Ask about the quarterly upgrade at the desk.", active: true, createdBy: reception._id }],
            userlog: [{
                type: "check-in",
                text: "Checked in at Main",
                createdBy: reception._id,
                locationId: main._id,
            }],
            tenantId: tenant._id,
        });

        await Member.create({
            name: "Mona Ali",
            systemId: 9002,
            memberId: 9002,
            barcode: "MBR-9002",
            phones: "01090001002",
            phoneKey: normalizePhone("01090001002"),
            gender: "female",
            status: "active",
            isMember: true,
            source: "Social media",
            locationId: second._id,
            assignedSales: sales._id,
            current_couch: headCoach._id,
            couch_subscription_status: "active",
            PT_sessions: 8,
            used_PT_sessions: 3,
            PT_sessions_startDate: quarterStart,
            PT_sessions_expDate: quarterEnd,
            createdBy: manager._id,
            subscriptions: [membership(quarterly, 9002, quarterStart, quarterEnd, manager)],
            couch_notes: [{ text: "Working on squat depth. Two sessions left this week.", createdBy: headCoach._id }],
            tenantId: tenant._id,
        });

        const youssef = await Member.create({
            name: "Youssef Ibrahim",
            systemId: 9003,
            phones: "01090001003",
            phoneKey: normalizePhone("01090001003"),
            gender: "male",
            status: "guest",
            isMember: false,
            source: "sales call",
            locationId: main._id,
            assignedSales: null,
            createdBy: manager._id,
            notes: [{ text: "Called about evening classes. Not subscribed yet.", createdBy: sales._id }],
            tenantId: tenant._id,
        });

        const nourStart = daysFromNow(-40);
        await Member.create({
            name: "Nour Mahmoud",
            systemId: 9004,
            memberId: 9004,
            barcode: "MBR-9004",
            phones: "01090001004",
            phoneKey: normalizePhone("01090001004"),
            gender: "female",
            status: "frozen",
            isMember: true,
            source: "referral",
            locationId: main._id,
            assignedSales: sales._id,
            freezeDaysUsed: 5,
            createdBy: sales._id,
            subscriptions: [membership(monthly, 9004, nourStart, addMonths(nourStart, 1), sales)],
            freeze: [{
                startDate: daysFromNow(-2),
                endDate: daysFromNow(5),
                note: "Travel freeze",
                createdBy: reception._id,
            }],
            tenantId: tenant._id,
        });

        const expiredStart = daysFromNow(-70);
        const expiredEnd = daysFromNow(-5);
        await Member.create({
            name: "Hana Farid",
            systemId: 9005,
            memberId: 9005,
            barcode: "MBR-9005",
            phones: "01090001005",
            phoneKey: normalizePhone("01090001005"),
            gender: "female",
            status: "expired",
            isMember: true,
            source: "Word of mouth",
            locationId: second._id,
            assignedSales: manager._id,
            createdBy: manager._id,
            subscriptions: [{
                ...membership(monthly, 9005, expiredStart, expiredEnd, manager),
                subscriptionStatus: "expired",
            }],
            tenantId: tenant._id,
        });

        const omar = await Member.create({
            name: "Omar Salah",
            systemId: 9006,
            memberId: 9006,
            barcode: "MBR-9006",
            phones: "01090001006",
            phoneKey: normalizePhone("01090001006"),
            gender: "male",
            status: "active",
            isMember: true,
            source: "Walk in",
            locationId: main._id,
            assignedSales: sales._id,
            current_couch: coach._id,
            couch_subscription_status: "active",
            PT_sessions: 12,
            used_PT_sessions: 4,
            PT_sessions_startDate: activeStart,
            PT_sessions_expDate: addMonths(activeStart, 1),
            createdBy: sales._id,
            subscriptions: [membership(quarterly, 9006, quarterStart, quarterEnd, sales)],
            userlog: [{
                type: "check-in",
                text: "Checked in at Main",
                createdBy: reception._id,
                locationId: main._id,
            }],
            tenantId: tenant._id,
        });

        await SalesRepRequest.create({
            member: youssef._id,
            requestedBy: sales._id,
            status: "pending",
            tenantId: tenant._id,
        });
        await CoachRepRequest.create({
            member: karim._id,
            requestedBy: coach._id,
            status: "pending",
            tenantId: tenant._id,
        });
        await Task.create({
            createdBy: manager._id,
            assignedTo: sales._id,
            targetRole: "Sales",
            title: "Showcase follow-up",
            status: "pending",
            members: [{
                member: youssef._id,
                name: youssef.name,
                systemId: youssef.systemId,
                phone: youssef.phones,
                status: "pending",
            }],
            totalCount: 1,
            completedCount: 0,
            tenantId: tenant._id,
        });
        await PackageExceptionRequest.create({
            member: omar._id,
            basePackage: quarterly._id,
            proposedBy: manager._id,
            status: "pending",
            name: "Showcase courtesy month",
            activityType: "gym",
            duration: "1 month",
            price: 0,
            pricePaid: 0,
            discountPercent: 100,
            reason: "Courtesy extension after a coaching transfer.",
            tenantId: tenant._id,
        });

        console.log("✓ Members, packages, check-in, freeze, tasks, and pending requests");
    });

    console.log("\nForma Showcase gym");
    console.log("Sign in on the gym screen. Password for every account: password123\n");
    console.log("Role               Username                  Email");
    for (const def of STAFF) {
        console.log(`${def.role.padEnd(18)} ${def.username.padEnd(25)} ${def.email}`);
    }
    console.log("\nWhat each role can open:");
    console.log("- Owner and General Manager: every area, both Main and Nasr City");
    console.log("- Reception: today's check-in on Karim and Omar, Nour's freeze, desk alert");
    console.log("- Sales: Karim, Mona, Nour, and Omar are assigned; Youssef is an open guest with a pending claim");
    console.log("- Sales Manager: Hana's expired membership, the follow-up task, and a pending package exception");
    console.log("- Coach: Omar's sessions, plus a pending request to coach Karim");
    console.log("- Head Coach: Mona's personal training at Nasr City");
    console.log("- Accountant: membership payments on the active and expired profiles");
    console.log("");

    await mongoose.disconnect();
}

if (require.main === module) {
    seedShowcase().catch((err) => {
        console.error("Showcase seed failed:", err);
        process.exit(1);
    });
}

module.exports = { seedShowcase, STAFF, PASSWORD, SLUG };
