const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const connectDB = require('../config/db');
const mongoose = require('mongoose');
const { runAsPlatform } = require('../context/tenantContext');
const Tenant = require('../models/Tenant');
const Plan = require('../models/Plan');
const User = require('../models/User');

const COLLECTIONS_TO_CHECK = [
    "users",
    "members",
    "packages",
    "packageexceptionrequests",
    "auditlogs",
    "notifications",
    "coachreprequests",
    "salesreprequests",
    "profileviews",
    "whatsapptemplates",
];

async function verify() {
    await connectDB();
    await runAsPlatform(async () => {
        const leapTenant = await Tenant.findOne({ slug: "leap" }).populate("planId").lean();

        if (!leapTenant) {
            console.error("❌ ERROR: 'Leap Gym' tenant (slug: 'leap') NOT found in database!");
            return;
        }

        console.log("✅ Leap Gym Tenant is registered:");
        console.log({
            _id: leapTenant._id.toString(),
            name: leapTenant.name,
            slug: leapTenant.slug,
            status: leapTenant.status,
            plan: leapTenant.planId ? {
                key: leapTenant.planId.key,
                name: leapTenant.planId.name,
            } : null,
            billingCycle: leapTenant.billing?.cycle,
            isSoftDeleted: leapTenant.isSoftDeleted,
            createdAt: leapTenant.createdAt,
            updatedAt: leapTenant.updatedAt,
        });

        console.log("\nChecking collections for tenant scoping:");
        const db = mongoose.connection.db;
        for (const collName of COLLECTIONS_TO_CHECK) {
            const coll = db.collection(collName);
            const total = await coll.countDocuments({});
            const withLeap = await coll.countDocuments({ tenantId: leapTenant._id });
            const withoutTenant = await coll.countDocuments({
                $or: [{ tenantId: { $exists: false } }, { tenantId: null }],
            });
            console.log(` - ${collName}: total=${total}, leapTenant=${withLeap}, missingTenant=${withoutTenant}`);
        }

        const usersCount = await User.countDocuments({ tenantId: leapTenant._id });
        console.log(`\nTotal users associated with Leap Gym: ${usersCount}`);
    }, { reason: "verification" });

    process.exit(0);
}

verify().catch(err => {
    console.error(err);
    process.exit(1);
});
