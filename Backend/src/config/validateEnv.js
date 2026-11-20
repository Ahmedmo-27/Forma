/**
 * Boot-time environment checks.
 *
 * `errors` stop the server from starting. `warnings` are logged and the server
 * keeps going, so a deploy never crashes over a soft issue.
 *
 * The placeholder values below are the ones shipped in Backend/.env.example.
 * Copying that file to production unchanged would make every session token
 * and encrypted secret forgeable, so those are always fatal.
 */

const EXAMPLE_VALUES = {
    JWT_SECRET: ["your-secure-jwt-secret-for-tenant-users-minimum-32-chars"],
    PLATFORM_JWT_SECRET: ["your-secure-jwt-secret-for-platform-admins-minimum-32-chars"],
    TENANT_SECRET_KEY: ["0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"],
};

const REQUIRED_SECRETS = ["JWT_SECRET", "PLATFORM_JWT_SECRET", "TENANT_SECRET_KEY"];
const MIN_SECRET_LENGTH = 32;

function validateEnv(env = process.env) {
    const errors = [];
    const warnings = [];
    const isProduction = env.NODE_ENV === "production";

    const missing = REQUIRED_SECRETS.filter((key) => !env[key]);
    if (missing.length) errors.push(`Missing required secrets: ${missing.join(", ")}`);

    if (!isProduction) return { errors, warnings };

    for (const [key, examples] of Object.entries(EXAMPLE_VALUES)) {
        if (env[key] && examples.includes(env[key])) {
            errors.push(`${key} is still the placeholder from .env.example. Set a unique secret.`);
        }
    }

    if (env.MONGO_URI && /<(user|password)>/i.test(env.MONGO_URI)) {
        errors.push("MONGO_URI still contains the <user>/<password> placeholders from .env.example.");
    }
    if (!env.MONGO_URI) {
        errors.push("MONGO_URI is required in production.");
    }

    for (const key of ["JWT_SECRET", "PLATFORM_JWT_SECRET"]) {
        if (env[key] && env[key].length < MIN_SECRET_LENGTH) {
            warnings.push(`${key} is shorter than ${MIN_SECRET_LENGTH} characters.`);
        }
    }
    if (env.JWT_SECRET && env.JWT_SECRET === env.PLATFORM_JWT_SECRET) {
        warnings.push("JWT_SECRET and PLATFORM_JWT_SECRET are identical. Tenant and platform secrets must differ.");
    }
    if (!env.FRONTEND_ORIGIN) {
        warnings.push("FRONTEND_ORIGIN is not set. CORS, invite links and password-reset links will point at localhost.");
    }
    if (env.PLATFORM_JWT_SECRET && env.BASE_DOMAIN && /localhost/i.test(env.FRONTEND_ORIGIN || "")) {
        warnings.push("FRONTEND_ORIGIN contains localhost while BASE_DOMAIN is set.");
    }

    return { errors, warnings };
}

module.exports = { validateEnv, EXAMPLE_VALUES, REQUIRED_SECRETS, MIN_SECRET_LENGTH };
