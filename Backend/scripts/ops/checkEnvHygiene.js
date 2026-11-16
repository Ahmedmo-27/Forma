/**
 * Local/ops hygiene for SECURITY_PENTEST_CHECKLIST §0.2 / §15.3 / §15.7.
 * Does not contact production — operators must still attest prod diffs.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");
const examplePath = path.join(root, ".env.example");
const envPath = path.join(root, ".env");
const gitignorePath = path.resolve(root, "../.gitignore");

function parseEnv(text) {
    const out = {};
    for (const line of String(text || "").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq < 1) continue;
        out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
    }
    return out;
}

const failures = [];
const notes = [];

if (!fs.existsSync(examplePath)) {
    failures.push(".env.example missing");
} else {
    const example = parseEnv(fs.readFileSync(examplePath, "utf8"));
    if (!example.JWT_SECRET || !example.PLATFORM_JWT_SECRET) {
        failures.push(".env.example must define JWT_SECRET and PLATFORM_JWT_SECRET");
    } else if (example.JWT_SECRET === example.PLATFORM_JWT_SECRET) {
        failures.push(".env.example JWT_SECRET must differ from PLATFORM_JWT_SECRET");
    } else {
        notes.push("§15.7 example placeholders are distinct");
    }
    if (!example.R2_BUCKET_NAME) {
        failures.push(".env.example should document R2_BUCKET_NAME");
    } else {
        notes.push(`§15.3 example documents R2_BUCKET_NAME=${example.R2_BUCKET_NAME}`);
    }
}

if (fs.existsSync(gitignorePath)) {
    const gi = fs.readFileSync(gitignorePath, "utf8");
    if (!/(^|\n)\.env(\n|$)/.test(gi) && !gi.includes(".env")) {
        failures.push("root .gitignore should ignore .env");
    } else {
        notes.push("§0.2 .env is gitignored");
    }
}

if (fs.existsSync(envPath)) {
    const local = parseEnv(fs.readFileSync(envPath, "utf8"));
    if (local.JWT_SECRET && local.PLATFORM_JWT_SECRET && local.JWT_SECRET === local.PLATFORM_JWT_SECRET) {
        failures.push("local .env JWT_SECRET equals PLATFORM_JWT_SECRET");
    }
    const placeholders = [
        "your-secure-jwt-secret-for-tenant-users-minimum-32-chars",
        "your-secure-jwt-secret-for-platform-admins-minimum-32-chars",
    ];
    if (local.NODE_ENV === "production") {
        if (placeholders.includes(local.JWT_SECRET) || placeholders.includes(local.PLATFORM_JWT_SECRET)) {
            failures.push("production NODE_ENV still using .env.example placeholder secrets");
        }
    }
    notes.push("local .env present — confirm it is not shared with prod (manual §0.2)");
} else {
    notes.push("no local .env — using process env / hosting console");
}

for (const n of notes) console.log(`OK  ${n}`);
if (failures.length) {
    for (const f of failures) console.error(`FAIL ${f}`);
    console.error("\nSee docs/SECURITY_OPS_ATTESTATION.md for prod diffs.");
    process.exit(1);
}

console.log("\nHygiene checks passed. Complete SECURITY_OPS_ATTESTATION.md for prod/test uniqueness.");
process.exit(0);
