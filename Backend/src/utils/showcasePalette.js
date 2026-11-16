/**
 * Default workspace theme: Forma navy and cream, mapped onto palette keys.
 * Marketing and the platform console keep these colors in CSS.
 * A gym — including a showcase tenant — replaces them only after it saves
 * its own colors. An empty or untouched palette leaves the theme in place.
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

function paletteColors(palette) {
    const src = palette?.toObject?.() || palette || {};
    const colors = [];
    for (const key of PALETTE_KEYS) {
        const value = String(src[key] || "").trim().toLowerCase();
        if (value) colors.push(value);
    }
    return colors;
}

function isLeapStarterPalette(palette) {
    const colors = paletteColors(palette);
    if (!colors.length) return true;
    return colors.every((color) => LEAP_STARTER.has(color));
}

/**
 * Saved colors replace Forma defaults. Missing keys keep the default.
 * A palette that is still entirely the old Leap starter stays on Forma.
 */
function paletteOverDefaults(palette) {
    if (isLeapStarterPalette(palette)) return { ...SHOWCASE_PALETTE };
    const saved = paletteSnapshot(palette) || {};
    return { ...SHOWCASE_PALETTE, ...saved };
}

/**
 * Palette sent to the workspace. Null means "no palette set" — the client
 * keeps the theme. A saved color that differs from the theme is returned.
 */
function clientPalette(palette) {
    const resolved = paletteOverDefaults(palette);
    const matchesTheme = PALETTE_KEYS.every((key) => (
        String(resolved[key] || "").trim().toLowerCase() === SHOWCASE_PALETTE[key].toLowerCase()
    ));
    return matchesTheme ? null : resolved;
}

/**
 * Palette written on save. Incoming colors override both the stored palette
 * and the Forma defaults. A leftover Leap starter palette is not kept underneath.
 */
function resolveSavedPalette(current, incoming) {
    const nextColors = paletteSnapshot(incoming);
    if (!nextColors) return paletteOverDefaults(current);
    const base = isLeapStarterPalette(current)
        ? { ...SHOWCASE_PALETTE }
        : paletteOverDefaults(current);
    return { ...base, ...nextColors };
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
 * Branding returned to gym clients. Every tenant, including showcase,
 * gets the colors it saved. No saved colors means the theme.
 */
function publicBranding(tenant) {
    const branding = plainBranding(tenant?.settings?.branding);
    return {
        ...branding,
        palette: clientPalette(branding.palette),
    };
}

/**
 * Switch a tenant between a customer gym and a showcase workspace.
 * Purpose does not replace the palette. Colors stay with the tenant
 * and can be changed from gym settings either way.
 * A palette stashed by the old showcase lock is restored once, when
 * that tenant is switched back to a customer gym.
 */
function applyShowcasePurpose(tenant, purpose) {
    const next = purpose === "showcase" ? "showcase" : "customer";
    if (!tenant.settings) tenant.settings = {};
    if (!tenant.settings.branding) tenant.settings.branding = {};
    const branding = tenant.settings.branding;

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
    paletteOverDefaults,
    clientPalette,
    resolveSavedPalette,
    publicBranding,
    applyShowcasePurpose,
};
