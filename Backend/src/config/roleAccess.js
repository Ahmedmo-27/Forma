/**
 * Coarse areas the owner (and a General Manager) can turn on or off per role.
 * Fine-grained feature keys in accessCatalog map onto these areas.
 * Settings is intentionally absent: only the owner can change gym settings.
 */

const AREAS = [
    { key: "members", label: "Members", description: "Member directory and profiles", planFeature: "members" },
    { key: "checkin", label: "Check-in", description: "Front desk check-in", planFeature: "checkin" },
    { key: "sales", label: "Sales", description: "Sales pipeline, call center, and rep tools", planFeature: null },
    { key: "coaching", label: "Coaching", description: "Coach schedules, sessions, and transfers", planFeature: null },
    { key: "accounting", label: "Accounting", description: "Ledger, contracts, targets, and refunds", planFeature: "accounting" },
    { key: "reports", label: "Reports", description: "Guest, expired, and performance reports", planFeature: null },
    { key: "packages", label: "Packages", description: "Membership packages", planFeature: "packages" },
    { key: "whatsapp", label: "WhatsApp", description: "WhatsApp templates and sending", planFeature: "whatsapp" },
    { key: "excel_import", label: "Excel import", description: "Import members from a spreadsheet", planFeature: "excel_import" },
    { key: "exception_approvals", label: "Exception approvals", description: "Discounts, freezes, and package exceptions", planFeature: "exception_approvals" },
    { key: "staff", label: "Staff management", description: "Staff accounts, teams, roles, and access", planFeature: null },
];

const AREA_KEYS = AREAS.map((area) => area.key);
const AREA_SET = new Set(AREA_KEYS);
const AREA_BY_KEY = new Map(AREAS.map((area) => [area.key, area]));

/** Feature key from accessCatalog -> area key. Unlisted features are not area-gated. */
const FEATURE_AREA = {
    check_in: "checkin",
    members: "members",
    member_profile: "members",
    sales_dashboard: "sales",
    sales_members: "sales",
    my_call_center: "sales",
    comments: "sales",
    request_assignment: "sales",
    request_takeover: "sales",
    view_phones: "sales",
    manager_call_center: "sales",
    approve_requests: "sales",
    sales_team: "sales",
    transfer: "sales",
    whatsapp_send: "whatsapp",
    whatsapp_templates: "whatsapp",
    packages: "packages",
    import_members: "excel_import",
    targets: "accounting",
    accounting_dashboard: "accounting",
    contracts: "accounting",
    refunds: "accounting",
    package_approvals: "exception_approvals",
    reports: "reports",
    coach_dashboard: "coaching",
    coach_members: "coaching",
    coach_checkin: "coaching",
    my_transfers: "coaching",
    coach_notes: "coaching",
    coach_team: "coaching",
    coach_transfer: "coaching",
    coach_targets: "coaching",
    management: "staff",
    staff: "staff",
    coach_staff: "staff",
    owner_dashboard: "staff",
    teams_overview: "staff",
    change_role: "staff",
    access_control: "staff",
};

const CHECKLIST_ROLES = [
    "General Manager",
    "Receptionist",
    "Coach",
    "Coach Manager",
    "Accountant",
    "Sales",
    "Sales Manager",
];

function featureArea(featureKey) {
    return FEATURE_AREA[featureKey] || null;
}

function plainRoleAccess(roleAccess) {
    if (!roleAccess) return null;
    if (typeof roleAccess.toObject === "function") {
        const plain = roleAccess.toObject();
        return plain && typeof plain === "object" ? plain : null;
    }
    if (roleAccess instanceof Map) return Object.fromEntries(roleAccess.entries());
    if (typeof roleAccess === "object") return roleAccess;
    return null;
}

/**
 * Saved checklist for a role, or null when the gym has not customized that role.
 */
function savedAreasFor(roleAccess, role) {
    const plain = plainRoleAccess(roleAccess);
    if (!plain || !Object.prototype.hasOwnProperty.call(plain, role)) return null;
    const list = plain[role];
    if (!Array.isArray(list)) return null;
    return list.filter((key) => AREA_SET.has(key));
}

function filterByPlan(areas, planFeatures) {
    if (!Array.isArray(planFeatures)) return areas;
    return areas.filter((key) => {
        const area = AREA_BY_KEY.get(key);
        if (!area?.planFeature) return true;
        return planFeatures.includes(area.planFeature);
    });
}

function defaultAreasFor(role, defaultRolesInclude) {
    if (role === "Owner" || role === "General Manager") return [...AREA_KEYS];
    if (typeof defaultRolesInclude !== "function") return [];
    const seen = new Set();
    const areas = [];
    for (const [featureKey, area] of Object.entries(FEATURE_AREA)) {
        if (!defaultRolesInclude(featureKey, role)) continue;
        if (seen.has(area)) continue;
        seen.add(area);
        areas.push(area);
    }
    return areas;
}

function resolveEffectiveAreas({ role, roleAccess, accessOverrides, planFeatures, defaultAreas }) {
    if (role === "Owner") return filterByPlan([...AREA_KEYS], planFeatures);

    const saved = savedAreasFor(roleAccess, role);
    const base = saved || defaultAreas || (role === "General Manager" ? [...AREA_KEYS] : []);
    const areas = [...base];
    const add = Array.isArray(accessOverrides?.add) ? accessOverrides.add : [];
    const remove = new Set(Array.isArray(accessOverrides?.remove) ? accessOverrides.remove : []);
    for (const key of add) {
        if (AREA_SET.has(key) && !areas.includes(key)) areas.push(key);
    }
    return filterByPlan(areas.filter((key) => AREA_SET.has(key) && !remove.has(key)), planFeatures);
}

function hasAreaOverrides(accessOverrides) {
    const add = accessOverrides?.add || [];
    const remove = accessOverrides?.remove || [];
    return add.length > 0 || remove.length > 0;
}

/**
 * No saved checklist and no per-user area overrides.
 * General Manager always uses the checklist (defaults to every area).
 */
function isLegacyAccess({ role, roleAccess, accessOverrides }) {
    if (role === "Owner" || role === "General Manager") return false;
    if (savedAreasFor(roleAccess, role)) return false;
    if (hasAreaOverrides(accessOverrides)) return false;
    return true;
}

function normalizeAreas(areas) {
    if (!Array.isArray(areas) || areas.some((key) => typeof key !== "string")) {
        return { error: "areas must be an array of area keys" };
    }
    const unknown = areas.find((key) => !AREA_SET.has(key));
    if (unknown) return { error: `Unknown area: ${unknown}` };
    return { areas: [...new Set(areas)] };
}

function canEditRoleChecklist(actor, targetRole) {
    const actorRole = typeof actor === "string" ? actor : actor?.role;
    if (targetRole === "Owner" || !CHECKLIST_ROLES.includes(targetRole)) return false;
    if (actorRole === "Owner") return true;
    if (actorRole === "General Manager") return targetRole !== "General Manager";
    if (actorRole === "Sales Manager") return ["Sales", "Receptionist"].includes(targetRole);
    if (actorRole === "Coach Manager") return targetRole === "Coach";
    if (typeof actor === "object" && actor !== null) {
        const hasStaff = (Array.isArray(actor.areas) && actor.areas.includes("staff"))
            || (actor.accessOverrides?.add || []).includes("staff")
            || (Array.isArray(actor.access) && actor.access.includes("access_control"))
            || Boolean(actor.hasStaffAccess || actor.hasAccessControlDelegation);
        if (hasStaff) return targetRole !== "General Manager";
    }
    return false;
}

function areasWithinActor(areas, actorAreas) {
    const allowed = new Set(actorAreas || []);
    const extra = areas.filter((key) => !allowed.has(key));
    if (extra.length) return { error: "You can only assign areas you still have" };
    return { areas };
}

module.exports = {
    AREAS,
    AREA_KEYS,
    CHECKLIST_ROLES,
    FEATURE_AREA,
    featureArea,
    plainRoleAccess,
    savedAreasFor,
    filterByPlan,
    defaultAreasFor,
    resolveEffectiveAreas,
    isLegacyAccess,
    normalizeAreas,
    canEditRoleChecklist,
    areasWithinActor,
};
