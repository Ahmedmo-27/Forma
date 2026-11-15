/**
 * Forma navy and cream, mapped onto the gym workspace palette keys.
 * Marketing and the platform console keep these colors; showcase tenants
 * use the same palette inside the gym workspace.
 */
const SHOWCASE_PALETTE = Object.freeze({
    navbar: "#142843",
    primary: "#142843",
    secondary: "#1E3A5F",
    accent: "#1E3A5F",
    background: "#FCF3E2",
    text: "#142843",
    icon: "#142843",
});

const PALETTE_KEYS = Object.keys(SHOWCASE_PALETTE);

const LEAP_STARTER = new Set([
    "#44298c",
    "#1e1535",
    "#5b38ba",
    "#6d47cc",
    "#160f2a",
    "#f4f5f7",
]);

function isLeapStarterPalette(palette) {
    if (!palette || typeof palette !== "object") return true;
    const src = palette.toObject?.() || palette;
    const primary = String(src.primary || "").trim().toLowerCase();
    const navbar = String(src.navbar || "").trim().toLowerCase();
    if (!primary && !navbar) return true;
    return LEAP_STARTER.has(primary) || LEAP_STARTER.has(navbar);
}

function isShowcaseTenant(tenant) {
    return tenant?.purpose === "showcase";
}

function paletteSnapshot(palette) {
    const src = palette?.toObject?.() || palette || {};
    const next = {};
    for (const key of PALETTE_KEYS) {
        if (typeof src[key] === "string" && src[key]) next[key] = src[key];
    }
    return Object.keys(next).length ? next : null;
}

function plainBranding(branding) {
    if (!branding) return {};
    const raw = typeof branding.toObject === "function"
        ? branding.toObject()
        : { ...branding };
    const rest = { ...raw };
    delete rest.savedPalette;
    return rest;
}

/**
 * Branding returned to gym clients. Showcase tenants always receive Forma's palette.
 */
function publicBranding(tenant) {
    const branding = plainBranding(tenant?.settings?.branding);
    if (isShowcaseTenant(tenant) || isLeapStarterPalette(branding.palette)) {
        return {
            ...branding,
            palette: { ...SHOWCASE_PALETTE },
        };
    }
    return branding;
}

/**
 * Switch a tenant between a normal gym and a locked showcase workspace.
 * Enabling stores the current palette and writes Forma's colors.
 * Disabling restores that stored palette.
 */
function applyShowcasePurpose(tenant, purpose) {
    const next = purpose === "showcase" ? "showcase" : "customer";
    if (!tenant.settings) tenant.settings = {};
    if (!tenant.settings.branding) tenant.settings.branding = {};
    const branding = tenant.settings.branding;

    if (next === "showcase" && tenant.purpose !== "showcase") {
        const current = paletteSnapshot(branding.palette);
        if (current) branding.savedPalette = current;
        branding.palette = { ...SHOWCASE_PALETTE };
    }

    if (next === "customer" && tenant.purpose === "showcase") {
        const saved = paletteSnapshot(branding.savedPalette);
        if (saved) branding.palette = saved;
        branding.savedPalette = null;
    }

    tenant.purpose = next;
    if (typeof tenant.markModified === "function") {
        tenant.markModified("settings.branding");
        tenant.markModified("settings");
    }
    return tenant;
}

module.exports = {
    SHOWCASE_PALETTE,
    isShowcaseTenant,
    isLeapStarterPalette,
    paletteSnapshot,
    publicBranding,
    applyShowcasePurpose,
};
