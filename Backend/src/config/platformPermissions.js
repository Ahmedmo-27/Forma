/**
 * Platform Console Role-to-Permission Matrix
 * Enforces least-privilege security across all platform endpoints.
 */

const ROLES = {
    SUPER_ADMIN: "super_admin",
    BILLING: "billing",
    SUPPORT: "support",
    ANALYST: "analyst",
};

const PERMISSIONS = {
    PLATFORM_USERS_MANAGE: "platform_users.manage",
    PLATFORM_USERS_REVOKE: "platform_users.revoke",
    TENANTS_READ: "tenants.read",
    TENANTS_WRITE: "tenants.write",
    TENANTS_LIFECYCLE: "tenants.lifecycle",
    TENANTS_OVERRIDE: "tenants.override",
    TENANTS_NOTES: "tenants.notes",
    TENANTS_PURGE: "tenants.purge",
    PLANS_MANAGE: "plans.manage",
    FEATURES_MANAGE: "features.manage",
    PRICING_MANAGE: "pricing.manage",
    BILLING_PAYMENTS: "billing.payments",
    BILLING_INVOICES: "billing.invoices",
    BILLING_REFUNDS: "billing.refunds",
    BILLING_GRANTS: "billing.grants",
    BILLING_LEDGER: "billing.ledger",
    ANALYTICS_VIEW: "analytics.view",
    SUPPORT_IMPERSONATE_READ: "support.impersonate_read",
    SUPPORT_IMPERSONATE_WRITE: "support.impersonate_write",
    SUPPORT_EXPORT_DATA: "support.export_data",
    ANNOUNCEMENTS_MANAGE: "announcements.manage",
    CAMPAIGNS_MANAGE: "campaigns.manage",
    AUDIT_VIEW: "audit.view",
    SYSTEM_HEALTH: "system.health",
};

const ROLE_PERMISSIONS = {
    [ROLES.SUPER_ADMIN]: Object.values(PERMISSIONS),

    [ROLES.BILLING]: [
        PERMISSIONS.TENANTS_READ,
        PERMISSIONS.TENANTS_NOTES,
        PERMISSIONS.PRICING_MANAGE,
        PERMISSIONS.BILLING_PAYMENTS,
        PERMISSIONS.BILLING_INVOICES,
        PERMISSIONS.BILLING_REFUNDS,
        PERMISSIONS.BILLING_GRANTS,
        PERMISSIONS.BILLING_LEDGER,
        PERMISSIONS.ANALYTICS_VIEW,
        PERMISSIONS.AUDIT_VIEW,
    ],

    [ROLES.SUPPORT]: [
        PERMISSIONS.TENANTS_READ,
        PERMISSIONS.TENANTS_NOTES,
        PERMISSIONS.SUPPORT_IMPERSONATE_READ,
        PERMISSIONS.SUPPORT_EXPORT_DATA,
        PERMISSIONS.AUDIT_VIEW,
    ],

    [ROLES.ANALYST]: [
        PERMISSIONS.TENANTS_READ,
        PERMISSIONS.BILLING_LEDGER,
        PERMISSIONS.ANALYTICS_VIEW,
    ],
};

function hasPermission(role, permission) {
    if (!role || !permission) return false;
    const allowed = ROLE_PERMISSIONS[role] || [];
    return allowed.includes(permission);
}

function getPermissionsForRole(role) {
    return ROLE_PERMISSIONS[role] || [];
}

module.exports = {
    ROLES,
    PERMISSIONS,
    ROLE_PERMISSIONS,
    hasPermission,
    getPermissionsForRole,
};
