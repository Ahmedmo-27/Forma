/**
 * Bootstrap Initial Platform Super Admin
 * Usage:
 *   node src/scripts/createFirstSuperAdmin.js
 * Or with arguments:
 *   node src/scripts/createFirstSuperAdmin.js --name "Admin" --email "super@leapgym.com" --password "SecurePass123!"
 */

const readline = require("readline");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const connectDB = require("../config/db");
const PlatformUser = require("../models/PlatformUser");
const { hashPassword, normalizeEmail } = require("../utils/passwordUtils");

function prompt(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) =>
        rl.question(query, (ans) => {
            rl.close();
            resolve(ans.trim());
        })
    );
}

function getCliArg(flag) {
    const idx = process.argv.indexOf(flag);
    if (idx !== -1 && process.argv[idx + 1]) {
        return process.argv[idx + 1];
    }
    return null;
}

async function run() {
    await connectDB();
    console.log("\n=== Create First Platform Super Admin ===\n");

    const existingSuperAdmin = await PlatformUser.findOne({ role: "super_admin" });
    if (existingSuperAdmin) {
        console.log(`Notice: Super admin already exists (${existingSuperAdmin.email}).`);
        const cont = await prompt("Do you want to create an additional super_admin? (y/N): ");
        if (cont.toLowerCase() !== "y") {
            console.log("Exiting without changes.");
            process.exit(0);
        }
    }

    const name = getCliArg("--name") || (await prompt("Enter Super Admin Full Name: "));
    const email = getCliArg("--email") || (await prompt("Enter Super Admin Email: "));
    const password = getCliArg("--password") || (await prompt("Enter Super Admin Password (min 8 chars): "));

    if (!name || !email || !password || password.length < 8) {
        console.error("Error: All fields are required and password must be at least 8 characters.");
        process.exit(1);
    }

    const normalized = normalizeEmail(email);
    const existing = await PlatformUser.findOne({ email: normalized });
    if (existing) {
        console.error(`Error: User with email ${normalized} already exists.`);
        process.exit(1);
    }

    const hashedPassword = await hashPassword(password);
    const superAdmin = await PlatformUser.create({
        name,
        email: normalized,
        password: hashedPassword,
        role: "super_admin",
        status: "active",
        mfa: { enabled: false },
    });

    console.log(`\n🎉 Super Admin created successfully!`);
    console.log(`ID:    ${superAdmin._id}`);
    console.log(`Email: ${superAdmin.email}`);
    console.log(`Role:  ${superAdmin.role}`);
    console.log(`\nNext Step: Sign in at /platform/login\n`);

    process.exit(0);
}

if (require.main === module) {
    run().catch((err) => {
        console.error("Bootstrap script failed:", err);
        process.exit(1);
    });
}

module.exports = { run };
