const jwt = require("jsonwebtoken");
const PlatformSetting = require("../models/PlatformSetting");
const PlatformUser = require("../models/PlatformUser");
const {
    PLATFORM_AUDIENCE,
    PLATFORM_ISSUER,
    getPlatformSecret,
} = require("../middleware/platformAuth");
const { runAsPlatform } = require("../context/tenantContext");

const PUBLIC_SITE_KEY = "public_site";

const DEFAULT_PUBLIC_SITE = {
    published: false,
    message: "Forma’s public site is under development. Check back soon.",
};

async function getPublicSiteSetting() {
    return runAsPlatform(async () => {
        const doc = await PlatformSetting.findOne({ key: PUBLIC_SITE_KEY }).lean();
        if (!doc?.value || typeof doc.value !== "object") {
            return { ...DEFAULT_PUBLIC_SITE };
        }
        return {
            published: Boolean(doc.value.published),
            message:
                typeof doc.value.message === "string" && doc.value.message.trim()
                    ? doc.value.message.trim()
                    : DEFAULT_PUBLIC_SITE.message,
            updatedAt: doc.value.updatedAt || doc.updatedAt || null,
            updatedBy: doc.value.updatedBy || null,
        };
    });
}

async function setPublicSiteSetting({ published, message, actor }) {
    return runAsPlatform(async () => {
        const value = {
            published: Boolean(published),
            message:
                (typeof message === "string" && message.trim()) ||
                DEFAULT_PUBLIC_SITE.message,
            updatedAt: new Date(),
            updatedBy: actor?.email || null,
        };

        await PlatformSetting.findOneAndUpdate(
            { key: PUBLIC_SITE_KEY },
            {
                $set: {
                    value,
                    description:
                        "Controls whether www marketing is visible to guests. When unpublished, only platform super_admin may preview.",
                    updatedBy: actor?.id || null,
                },
            },
            { upsert: true, new: true }
        );

        return value;
    });
}

/**
 * Optional Bearer platform JWT → canPreview if active super_admin.
 */
async function resolveCanPreview(authorizationHeader) {
    if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
        return { canPreview: false, previewAs: null };
    }
    const token = authorizationHeader.slice(7).trim();
    if (!token) return { canPreview: false, previewAs: null };

    try {
        const decoded = jwt.verify(token, getPlatformSecret(), {
            audience: PLATFORM_AUDIENCE,
            issuer: PLATFORM_ISSUER,
        });
        return runAsPlatform(async () => {
            const user = await PlatformUser.findById(decoded.id).select("email role status tokenVersion");
            if (!user || user.status !== "active" || user.role !== "super_admin") {
                return { canPreview: false, previewAs: null };
            }
            if (
                decoded.version != null &&
                user.tokenVersion != null &&
                decoded.version < user.tokenVersion
            ) {
                return { canPreview: false, previewAs: null };
            }
            return {
                canPreview: true,
                previewAs: { email: user.email, role: user.role },
            };
        });
    } catch {
        return { canPreview: false, previewAs: null };
    }
}

module.exports = {
    PUBLIC_SITE_KEY,
    DEFAULT_PUBLIC_SITE,
    getPublicSiteSetting,
    setPublicSiteSetting,
    resolveCanPreview,
};
