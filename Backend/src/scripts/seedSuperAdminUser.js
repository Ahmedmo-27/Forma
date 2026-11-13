const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const connectDB = require("../config/db");
const PlatformUser = require("../models/PlatformUser");
const { hashPassword, normalizeEmail } = require("../utils/passwordUtils");

async function seed() {
    try {
        console.log("Connecting to database...");
        await connectDB();

        const email = normalizeEmail("fouda@test.com");
        const rawPassword = "password123";
        const hashedPassword = await hashPassword(rawPassword);

        let user = await PlatformUser.findOne({ email });

        if (user) {
            console.log(`User ${email} already exists. Updating to super_admin...`);
            user.password = hashedPassword;
            user.role = "super_admin";
            user.status = "active";
            user.failedLoginCount = 0;
            user.lockedUntil = null;
            await user.save();
            console.log(`✅ Platform user ${email} successfully updated as super_admin.`);
        } else {
            console.log(`Creating new super_admin account for ${email}...`);
            user = await PlatformUser.create({
                name: "Fouda Admin",
                email,
                password: hashedPassword,
                role: "super_admin",
                status: "active",
            });
            console.log(`✅ Platform user ${email} created as super_admin (ID: ${user._id}).`);
        }

        console.log("\nAccount Details:");
        console.log("----------------");
        console.log(`Email:    ${email}`);
        console.log(`Password: ${rawPassword}`);
        console.log(`Role:     ${user.role}`);
        console.log(`Status:   ${user.status}`);
        console.log("\nYou can now sign in at /platform/login\n");

        process.exit(0);
    } catch (err) {
        console.error("❌ Failed to seed super admin:", err);
        process.exit(1);
    }
}

seed();
