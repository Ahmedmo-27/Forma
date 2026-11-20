/**
 * Single source of truth for every plan feature key.
 *
 * Each entry is a tenant-facing module. Super admin can add or remove a module
 * on a plan (Plan.features) or for one gym (Tenant.featureOverrides). The
 * `pages` list is shown in the super admin panel so operators can see what a
 * toggle controls.
 *
 * - `backfill: "all"`  new in this release. On first sync the key is added to
 *   every existing plan (and lifetime snapshot) so current gyms keep what they
 *   had. Super admin can remove it afterwards.
 * - `backfill: null`   shipped earlier. Sync only registers the catalog entry.
 */

const FEATURES = [
    {
        key: "members",
        name: "Members Management",
        category: "members",
        description: "Full membership directory, profiles, barcodes, and statuses",
        isCore: true,
        backfill: null,
        pages: ["Members", "Member profile", "Analytics home"],
    },
    {
        key: "checkin",
        name: "Access & Check-in",
        category: "core",
        description: "Front desk barcode scanning, access gates, and attendance tracking",
        isCore: true,
        backfill: null,
        pages: ["Check In"],
    },
    {
        key: "packages",
        name: "Packages & Subscriptions",
        category: "finance",
        description: "Gym membership packages, durations, session tracking, and renewals",
        isCore: true,
        backfill: null,
        pages: ["Manage packages", "Assign package"],
    },
    {
        key: "pt_tracking",
        name: "Personal Training (PT)",
        category: "coaching",
        description: "PT assignment, coach session balances, and coach commissions",
        isCore: false,
        backfill: null,
        pages: ["Coach check-in", "PT tab on member profile", "PT sessions"],
    },
    {
        key: "accounting",
        name: "Ledger & Accounting",
        category: "finance",
        description: "Income, expense transactions, cash drawer tracking, and financial statements",
        isCore: false,
        backfill: null,
        pages: ["Accounting dashboard", "Contract history", "Sales targets", "Refunds and package transfers"],
    },
    {
        key: "exception_approvals",
        name: "Exception Approvals",
        category: "finance",
        description: "Discount, freeze, refund, and package exception approval workflows",
        isCore: false,
        backfill: null,
        pages: ["Package requests"],
    },
    {
        key: "sales_crm",
        name: "Sales Pipeline & CRM",
        category: "sales",
        description: "Lead tracking, pipeline stages, sales rep assignment, and conversion reports",
        isCore: false,
        backfill: null,
        pages: ["Sales dashboard", "Sales members", "Requests", "Sales team", "Call center", "Sales subscriptions"],
    },
    {
        key: "whatsapp",
        name: "WhatsApp Automation",
        category: "communication",
        description: "Automated WhatsApp notifications, payment receipts, and expiring reminders",
        isCore: false,
        backfill: null,
        pages: ["Connect WhatsApp", "WhatsApp templates"],
    },
    {
        key: "excel_import",
        name: "Excel Import & Export",
        category: "integrations",
        description: "Bulk member import from spreadsheet and CSV financial export",
        isCore: false,
        backfill: null,
        pages: ["Import members"],
    },
    {
        key: "exec_analytics",
        name: "Executive Analytics",
        category: "analytics",
        description: "Churn analytics, revenue forecasting, retention cohorts, and attendance heatmaps",
        isCore: false,
        backfill: null,
        pages: ["Churn report", "Forecast report", "Cohort report", "Attendance report"],
    },
    {
        key: "funnels",
        name: "Sales Conversion Funnels",
        category: "analytics",
        description: "Lead-to-member conversion tracking, drop-off analysis, and marketing ROI",
        isCore: false,
        backfill: null,
        pages: ["Funnel report"],
    },
    {
        key: "business_intelligence",
        name: "Business Intelligence",
        category: "analytics",
        description: "Custom KPI dashboards, executive summaries, and multi-branch rollups",
        isCore: false,
        backfill: null,
        pages: ["Executive summary"],
    },
    {
        key: "multi_branches",
        name: "Multi-Branch Locations",
        category: "core",
        description: "Link multiple gym branches, switch location data in the navbar, and grant staff per-location access",
        isCore: false,
        backfill: null,
        pages: ["Branch switcher", "Per-branch staff access"],
    },
    {
        key: "inbox",
        name: "Shared Inbox",
        category: "communication",
        description: "One shared WhatsApp inbox for the gym with assignment and member linking",
        isCore: false,
        backfill: null,
        pages: ["Inbox", "Connect channels"],
    },

    // ── Module-level keys added so every tenant page can be switched per plan / gym ──
    {
        key: "retail",
        name: "Bar & Shop (Retail POS)",
        category: "operations",
        description: "Point of sale, products, stock, vendors, and retail revenue reports",
        isCore: false,
        backfill: "all",
        pages: ["POS", "Retail sales", "Products", "Vendors", "Retail reports"],
    },
    {
        key: "maintenance",
        name: "Facility Maintenance",
        category: "operations",
        description: "Maintenance checklists, recurring items, and completion history",
        isCore: false,
        backfill: "all",
        pages: ["Maintenance"],
    },
    {
        key: "tasks",
        name: "Tasks & Transfers",
        category: "operations",
        description: "Assigning members to staff, task filters, assigned tasks, and quick transfer",
        isCore: false,
        backfill: "all",
        pages: ["Tasks", "Assign tasks", "Task filter", "Assigned tasks", "Quick transfer"],
    },
    {
        key: "coaching",
        name: "Coaching Workspace",
        category: "coaching",
        description: "Coach dashboard, trainees, transfers, team, targets, and coach team profiles",
        isCore: false,
        backfill: "all",
        pages: ["Coach dashboard", "Trainees", "My transfers", "Coach team", "Coach targets", "Coach staff"],
    },
    {
        key: "reports_basic",
        name: "Basic Reports",
        category: "analytics",
        description: "Reports hub plus guest, expired, and imported member reports",
        isCore: false,
        backfill: "all",
        pages: ["Reports hub", "Guest members", "Expired members", "Imported members"],
    },
    {
        key: "contacts",
        name: "Contacts Directory",
        category: "operations",
        description: "Staff and reception contact directory",
        isCore: false,
        backfill: "all",
        pages: ["Contacts"],
    },
    {
        key: "staff_management",
        name: "Staff Management",
        category: "management",
        description: "Staff accounts, teams overview, role changes, and password resets",
        isCore: false,
        backfill: "all",
        pages: ["Management hub", "Manage staff", "Teams overview"],
    },
    {
        key: "access_control",
        name: "Access Control",
        category: "management",
        description: "Per-role and per-user access checklists for gym staff",
        isCore: false,
        backfill: "all",
        pages: ["Role access", "Management access"],
    },
    {
        key: "locations",
        name: "Branch Settings",
        category: "management",
        description: "Create, edit, and remove branches from gym settings",
        isCore: false,
        backfill: "all",
        pages: ["Branches in gym settings"],
    },
    {
        key: "notifications",
        name: "Notifications & Announcements",
        category: "communication",
        description: "In-app notification bell and platform announcements",
        isCore: false,
        backfill: "all",
        pages: ["Notification bell", "Announcement banners"],
    },
];

/** Feature keys that no longer gate anything. Sync removes them from the catalog and plans. */
const RETIRED_FEATURES = ["audit"];

const FEATURE_KEYS = FEATURES.map((feature) => feature.key);
const FEATURE_KEY_SET = new Set(FEATURE_KEYS);
const FEATURE_BY_KEY = new Map(FEATURES.map((feature) => [feature.key, feature]));

const CATEGORIES = [
    "core",
    "members",
    "sales",
    "coaching",
    "finance",
    "communication",
    "analytics",
    "integrations",
    "operations",
    "management",
];

/** Keys introduced with backfill "all"; the default for freshly seeded plans. */
const MODULE_KEYS = FEATURES.filter((feature) => feature.backfill === "all").map((feature) => feature.key);

function isKnownFeature(key) {
    return FEATURE_KEY_SET.has(key);
}

/** Catalog fields only (what gets stored on the Feature document). */
function catalogEntry(feature) {
    const { key, name, category, description, isCore } = feature;
    return { key, name, category, description, isCore };
}

module.exports = {
    FEATURES,
    FEATURE_KEYS,
    FEATURE_BY_KEY,
    RETIRED_FEATURES,
    CATEGORIES,
    MODULE_KEYS,
    isKnownFeature,
    catalogEntry,
};
