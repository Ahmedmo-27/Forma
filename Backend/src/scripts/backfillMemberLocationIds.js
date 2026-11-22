require("dotenv").config();
const mongoose = require("mongoose");
const Member = require("../models/Member");

/**
 * One-time backfill: copy locationId into locationIds when the array is empty/missing.
 * Run: node src/scripts/backfillMemberLocationIds.js
 */
async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    const result = await Member.updateMany(
        {
            locationId: { $ne: null },
            $or: [
                { locationIds: { $exists: false } },
                { locationIds: null },
                { locationIds: { $size: 0 } },
            ],
        },
        [
            {
                $set: {
                    locationIds: ["$locationId"],
                },
            },
        ]
    );

    console.log(`Matched ${result.matchedCount}, modified ${result.modifiedCount}`);
    await mongoose.disconnect();
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
