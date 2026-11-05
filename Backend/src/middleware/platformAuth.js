const jwt = require("jsonwebtoken");
const PlatformAdmin = require("../models/PlatformAdmin");
const { runAsPlatform } = require("../context/tenantContext");

const PLATFORM_AUDIENCE = "leap-platform-admin";

/**
 * Protect middleware strictly for Platform Admins.
 * Enforces JWT audience: leap-platform-admin.
 * Automatically wraps downstream execution in runAsPlatform().
 */
async function protectPlatform(req, res, next) {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
        token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
        return res.status(401).json({ message: "Platform authentication required: no token provided" });
    }

    try {
        const decoded = jwt.verify(token, process.env.PLATFORM_JWT_SECRET || process.env.JWT_SECRET, {
            audience: PLATFORM_AUDIENCE,
        });

        const admin = await PlatformAdmin.findById(decoded.id).select("-password");
        if (!admin || !admin.isActive) {
            return res.status(401).json({ message: "Platform admin account not found or disabled" });
        }

        req.platformAdmin = {
            id: admin._id.toString(),
            email: admin.email,
            name: admin.name,
        };

        // Wrap execution in platform context
        runAsPlatform(() => {
            next();
        }, { actorId: admin._id.toString(), reason: `platform_api_${req.method}_${req.baseUrl}${req.path}` });
    } catch {
        return res.status(401).json({ message: "Invalid or expired platform administration token" });
    }
}

module.exports = {
    protectPlatform,
    PLATFORM_AUDIENCE,
};
